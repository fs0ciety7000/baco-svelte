// Content script DICOS (monde isolé, même origine que la SPA). Il :
//  1. injecte inject.js dans le monde de la page pour relever le Bearer et les stationIds que la SPA émet déjà ;
//  2. appelle l'API DICOS /api/missions (liste) et /api/missions/{id} (détail) EN MÊME ORIGINE, avec ce Bearer ;
//  3. fusionne liste + détail et envoie les missions BRUTES au service worker, qui les pousse vers CSM
//     (le mapping et la validation sont faits par le serveur CSM : source unique de vérité).
// Aucun jeton n'est persisté ; les stationIds (périmètre de gares, non personnels) sont mémorisés pour confort.
(() => {
  "use strict";
  const TAG = "csm-dicos";
  const API = location.origin + "/api/missions";

  let bearer = ""; // en mémoire uniquement
  let stationIds = [];
  const detailCache = new Map(); // id -> { sig, mission }
  let auto = { enabled: false, minutes: 10 };
  let timer = null;
  let syncing = false;

  // 1) Injection du capteur dans le monde de la page.
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("src/inject.js");
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
    s.remove();
  } catch (_) {}

  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.source !== TAG) return;
    if (e.data.kind === "auth" && typeof e.data.token === "string") {
      bearer = e.data.token; // « Bearer … »
    } else if (e.data.kind === "filter" && Array.isArray(e.data.stationIds)) {
      stationIds = e.data.stationIds;
      try {
        chrome.storage.local.set({ stationIds });
      } catch (_) {}
    }
  });

  // Reprise des stationIds mémorisés.
  try {
    chrome.storage.local.get(["stationIds", "auto"], (v) => {
      if (Array.isArray(v.stationIds) && !stationIds.length) stationIds = v.stationIds;
      if (v.auto) auto = { enabled: !!v.auto.enabled, minutes: Number(v.auto.minutes) || 10 };
      scheduleAuto();
    });
  } catch (_) {}

  try {
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== "local") return;
      if (ch.auto) {
        const v = ch.auto.newValue || {};
        auto = { enabled: !!v.enabled, minutes: Number(v.minutes) || 10 };
        scheduleAuto();
      }
    });
  } catch (_) {}

  function localDay(d = new Date()) {
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function dicos(url, opts) {
    if (!bearer) throw { code: "no-token" };
    const res = await fetch(url, {
      ...opts,
      headers: { "content-type": "application/json", accept: "application/json", authorization: bearer, ...(opts && opts.headers) },
      credentials: "include",
    });
    if (res.status === 401 || res.status === 403) throw { code: "expired" };
    if (!res.ok) throw { code: "http", status: res.status };
    return res.json();
  }

  // Débit limité : ~4 req/s, 3 en vol au plus (voir cadrage DICOS).
  async function fetchDetails(items, onProgress) {
    const out = [];
    let i = 0;
    let done = 0;
    const next = async () => {
      while (i < items.length) {
        const item = items[i++];
        const id = String(item.id || "");
        const type = String(item.reservationType || "");
        const sig = `${item.status || ""}|${(item.journey && item.journey.time) || ""}|${type}`;
        if (id && detailCache.has(id) && detailCache.get(id).sig === sig) {
          out.push(detailCache.get(id).mission);
          done++;
          onProgress && onProgress(done, items.length);
          continue;
        }
        let merged = item;
        if (id && type) {
          try {
            const detail = await dicos(`${API}/${encodeURIComponent(id)}?reservationType=${encodeURIComponent(type)}`);
            merged = { ...item, ...detail };
          } catch (err) {
            if (err && err.code === "expired") throw err;
            // détail indisponible : on garde l'item de liste (le serveur upsert quand même la base)
          }
          await sleep(230);
        }
        if (id) detailCache.set(id, { sig, mission: merged });
        out.push(merged);
        done++;
        onProgress && onProgress(done, items.length);
      }
    };
    await Promise.all([next(), next(), next()]);
    return out;
  }

  async function doSync(day) {
    if (syncing) return { error: "Synchronisation déjà en cours." };
    if (!stationIds.length)
      return { error: "Périmètre de gares inconnu : ouvre une fois la liste des missions dans DICOS." };
    if (!bearer)
      return { error: "Session DICOS non détectée : recharge l'onglet DICOS et navigue dans les missions." };
    syncing = true;
    try {
      const list = await dicos(API, { method: "POST", body: JSON.stringify({ stationIds, date: day }) });
      const items = Array.isArray(list) ? list : Array.isArray(list && list.missions) ? list.missions : [];
      if (!items.length) {
        const r = { day, found: 0, received: 0, created: 0, updated: 0, skipped: 0 };
        setLast(r);
        return r;
      }
      const missions = await fetchDetails(items);
      const res = await chrome.runtime.sendMessage({ cmd: "push", day, missions });
      const r = res && res.ok ? { day, found: items.length, ...res.result } : { error: (res && res.error) || "Échec de l'envoi vers CSM." };
      setLast(r);
      return r;
    } catch (err) {
      const r =
        err && err.code === "expired"
          ? { error: "Session DICOS expirée : recharge DICOS puis réessaie." }
          : err && err.code === "no-token"
            ? { error: "Jeton DICOS non capté : navigue dans les missions puis réessaie." }
            : { error: "Erreur DICOS" + (err && err.status ? ` (HTTP ${err.status})` : "") + "." };
      setLast(r);
      return r;
    } finally {
      syncing = false;
    }
  }

  function setLast(result) {
    try {
      chrome.storage.local.set({ last: { ...result, at: Date.now() } });
    } catch (_) {}
  }

  function scheduleAuto() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (!auto.enabled) return;
    const ms = Math.max(2, auto.minutes) * 60_000;
    timer = setInterval(() => {
      if (document.hidden || syncing) return; // onglet caché : on ne sollicite pas DICOS
      doSync(localDay());
    }, ms);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (!msg || typeof msg.cmd !== "string") return;
    if (msg.cmd === "status") {
      reply({ hasToken: !!bearer, stationCount: stationIds.length, auto });
      return;
    }
    if (msg.cmd === "sync") {
      doSync(msg.day || localDay()).then(reply);
      return true; // réponse asynchrone
    }
  });
})();
