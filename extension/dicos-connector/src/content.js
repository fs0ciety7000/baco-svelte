// Content script DICOS (monde isolé, même origine que la SPA). Il :
//  1. reçoit du capteur `inject.js` (déclaré en monde MAIN, voir manifest) le Bearer et les stationIds que la SPA émet ;
//  2. appelle l'API DICOS /api/missions (liste du jour) EN MÊME ORIGINE, avec ce Bearer, en déduit les dossiers
//     (n° AAAA-MM-JJ-NNNN + type) puis lit chaque dossier COMPLET (trip-details : tous les trajets, départ ET arrivée,
//     client, type PMR) — v1.1 ; repli sur /api/missions/{id} (détail par mission, format v1.0) si trip-details échoue ;
//  3. envoie les données BRUTES au service worker, qui les pousse vers CSM
//     (le mapping et la validation sont faits par le serveur CSM : source unique de vérité).
// Aucun jeton n'est persisté ; les stationIds (périmètre de gares, non personnels) sont mémorisés pour confort.
(() => {
  "use strict";
  const TAG = "csm-dicos";
  const API = location.origin + "/api/missions";

  let bearer = ""; // en mémoire uniquement
  let stationIds = [];
  const detailCache = new Map(); // id -> { sig, mission }
  const dossierCache = new Map(); // "n°/type" -> dossier brut (purgé à la synchro manuelle)
  let tripPaths = []; // gabarits relevés sur la SPA (requêtes portant un n° de dossier), 8 au plus
  let tripPathOk = ""; // gabarit qui a répondu un dossier
  let tripDiag = []; // derniers essais trip-details en échec (chemin + code), affichés dans le popup
  let auto = { enabled: false, minutes: 10 };
  let timer = null;
  let syncing = false;
  let syncAt = 0; // garde-fou : une synchro bloquée (> 4 min) n'empêche plus les suivantes
  let autoTicks = 0;

  // Capteur injecté en monde MAIN (manifest) : on n'accepte que les messages de CETTE fenêtre et de CETTE origine.
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin || !e.data || e.data.source !== TAG) return;
    if (e.data.kind === "auth" && typeof e.data.token === "string") {
      bearer = e.data.token; // « Bearer … »
    } else if (e.data.kind === "tripPath" && typeof e.data.path === "string" && e.data.path.startsWith("/")) {
      const path = e.data.path.slice(0, 200);
      if (!tripPaths.includes(path)) {
        tripPaths = [path, ...tripPaths].slice(0, 8);
        try {
          chrome.storage.local.set({ tripPaths });
        } catch (_) {}
      }
    } else if (e.data.kind === "filter" && Array.isArray(e.data.stationIds)) {
      stationIds = e.data.stationIds;
      try {
        chrome.storage.local.set({ stationIds });
      } catch (_) {}
    }
  });

  // Reprise des stationIds mémorisés.
  try {
    chrome.storage.local.get(["stationIds", "auto", "tripPaths"], (v) => {
      if (Array.isArray(v.stationIds) && !stationIds.length) stationIds = v.stationIds;
      if (Array.isArray(v.tripPaths) && !tripPaths.length)
        tripPaths = v.tripPaths.filter((x) => typeof x === "string" && x.startsWith("/")).slice(0, 8);
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

  // Jour « aujourd'hui » en Europe/Brussels (le poste peut être sur un autre fuseau).
  function localDay(d = new Date()) {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Brussels",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    } catch (_) {
      const p = (x) => String(x).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Gate de débit GLOBAL : au plus un départ de requête toutes les 250 ms (~4 req/s), quelle que soit la concurrence.
  let nextAt = 0;
  async function gate() {
    const now = Date.now();
    const wait = Math.max(0, nextAt - now);
    nextAt = Math.max(now, nextAt) + 250;
    if (wait) await sleep(wait);
  }

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

  // Appels de détail, débit limité (~4 req/s globalement, 3 en vol au plus pour masquer la latence).
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
        if (id) {
          await gate();
          // reservationType si connu (certaines missions de liste ne le portent pas → on tente sans).
          const q = type ? `?reservationType=${encodeURIComponent(type)}` : "";
          try {
            const detail = await dicos(`${API}/${encodeURIComponent(id)}${q}`);
            merged = { ...item, ...detail };
          } catch (err) {
            if (err && err.code === "expired") throw err;
            // détail indisponible : on garde l'item de liste (le serveur upsert quand même la base)
          }
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

  const DOSSIER_RE = /^\d{4}-\d{2}-\d{2}-\d{4}$/;
  const dossierOf = (m) => {
    const ref = [m.reservationDisplayId, m.reservationId, m.reservation && m.reservation.displayId].find(
      (x) => typeof x === "string" && DOSSIER_RE.test(x),
    );
    const type = String(m.reservationType || (m.reservation && m.reservation.type) || "Disabled");
    return ref ? { ref, type } : null;
  };

  // Lit un dossier complet. Gabarits essayés : celui relevé sur la SPA, puis les chemins connus. Le premier qui
  // renvoie un objet avec `travels` est retenu pour la suite. null si aucun ne répond (repli v1.0).
  function note(path, why) {
    if (tripDiag.length < 12 && !tripDiag.some((x) => x.path === path)) tripDiag.push({ path, why });
  }
  async function fetchDossier(ref, type) {
    const key = `${ref}/${type}`;
    if (dossierCache.has(key)) return dossierCache.get(key);
    const paths = [
      ...new Set(
        [
          tripPathOk,
          ...tripPaths,
          "/api/trip-details/{id}/{type}",
          "/trip-details/{id}/{type}",
          "/api/reservations/trip-details/{id}/{type}",
        ].filter(Boolean),
      ),
    ];
    for (const p of paths) {
      await gate();
      const url =
        location.origin + p.replace("{id}", encodeURIComponent(ref)).replace(/\{type\}/g, encodeURIComponent(type));
      try {
        const d = await dicos(url);
        if (d && typeof d === "object" && Array.isArray(d.travels)) {
          tripPathOk = p;
          tripDiag = [];
          dossierCache.set(key, d);
          return d;
        }
        note(p, "réponse sans trajets");
      } catch (err) {
        // 401/403 sur un chemin candidat ≠ session expirée (la liste vient de répondre) : on essaie le suivant.
        note(p, err && err.status ? `HTTP ${err.status}` : err && err.code === "expired" ? "HTTP 401/403" : "pas du JSON");
      }
      if (tripPathOk) break; // gabarit connu : inutile d'essayer les autres
    }
    return null;
  }

  // Dossiers distincts des missions du jour (détail par mission seulement si la liste ne porte pas le n°).
  async function fetchDossiers(items) {
    const seen = new Map();
    const missing = [];
    for (const m of items) {
      const d = dossierOf(m);
      if (d) seen.set(`${d.ref}/${d.type}`, d);
      else missing.push(m);
    }
    if (missing.length) {
      for (const m of await fetchDetails(missing, (d, t) => progress("Numéros de dossier", d, t))) {
        const d = dossierOf(m);
        if (d) seen.set(`${d.ref}/${d.type}`, d);
      }
    }
    const dossiers = [];
    let failed = 0;
    const all = [...seen.values()];
    progress("Dossiers complets", 0, all.length, true);
    for (const [i, { ref, type }] of all.entries()) {
      const d = await fetchDossier(ref, type);
      progress("Dossiers complets", i + 1, all.length);
      if (d) dossiers.push(d);
      else failed++;
      if (!tripPathOk && failed >= 3) return null; // trip-details indisponible : repli v1.0
    }
    return dossiers;
  }

  async function pushAll(day, payloadKey, list) {
    const total = { received: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, detailErrors: 0 };
    for (let i = 0; i < list.length || i === 0; i += 100) {
      progress("Envoi vers CSM", Math.min(i, list.length), list.length, true);
      const res = await chrome.runtime.sendMessage({
        cmd: "push",
        day,
        [payloadKey]: list.slice(i, i + 100),
        final: i + 100 >= list.length,
      });
      if (!res || !res.ok) return { error: (res && res.error) || "Échec de l'envoi vers CSM." };
      for (const k of Object.keys(total)) total[k] += Number(res.result && res.result[k]) || 0;
      if (!list.length) break;
    }
    return total;
  }

  async function syncGroups(day, groupItems) {
    const seen = new Set();
    const firsts = groupItems.filter((m) => {
      const k = String((m.journey && m.journey.id) || m.id || "");
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const detailed = await fetchDetails(firsts, (d, t) => progress("Groupes : détail", d, t));
    const others = groupItems.filter((m) => !firsts.includes(m));
    const list = [...detailed, ...others];
    const total = { received: 0, created: 0, updated: 0, unchanged: 0, skipped: 0 };
    for (let i = 0; i < list.length; i += 300) {
      progress("Groupes : envoi vers CSM", i, list.length, true);
      const res = await chrome.runtime.sendMessage({
        cmd: "push",
        day,
        groups: list.slice(i, i + 300),
        final: i + 300 >= list.length,
      });
      if (!res || !res.ok) return { error: (res && res.error) || "Échec de l'envoi des groupes vers CSM." };
      const g = (res.result && res.result.groups) || {};
      for (const k of Object.keys(total)) total[k] += Number(g[k]) || 0;
    }
    return total;
  }

  // Temps d'arrêt ATMS (9 oct. 2026) : trains des missions PMR et groupes du jour, lus dans l'onglet ATMS par le service
  // worker et envoyés à CSM. Jamais bloquant pour la synchro DICOS.
  async function syncAtms(day, missions) {
    const seen = new Set();
    const trains = [];
    for (const m of missions) {
      const n = Number(m && m.journey && m.journey.trainNumber);
      if (!(n > 0) || seen.has(n)) continue;
      seen.add(n);
      trains.push({ train: String(n), day });
    }
    if (!trains.length) return null;
    progress("Temps d'arrêt ATMS", 0, trains.length, true);
    // Le service worker peut être en cours de (re)démarrage après la longue lecture DICOS : jusqu'à 3 essais.
    let last = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await sleep(attempt * 1500);
      try {
        const r = await chrome.runtime.sendMessage({ cmd: "atms", trains });
        if (r) return r;
        last = "réponse vide";
      } catch (err) {
        last = String((err && err.message) || err).slice(0, 120);
      }
    }
    return {
      requested: trains.length,
      fetched: 0,
      stored: 0,
      error: `Service de l'extension injoignable (${last}) : recharge l'extension puis l'onglet DICOS.`,
    };
  }

  // `fresh` (bouton de synchro manuelle) = rafraîchir vraiment : on purge le cache de détail pour reprendre
  // toute mission même si son statut n'a pas changé (le cache ne capte pas les corrections de point de rencontre, etc.).
  async function doSync(day, { fresh = false } = {}) {
    if (syncing && Date.now() - syncAt < 4 * 60_000) return { busy: true };
    if (!stationIds.length)
      return { error: "Périmètre de gares inconnu : ouvre une fois la liste des missions dans DICOS." };
    if (!bearer)
      return { error: "Session DICOS non détectée : recharge l'onglet DICOS et navigue dans les missions." };
    if (fresh) {
      detailCache.clear();
      dossierCache.clear();
    }
    syncing = true;
    syncAt = Date.now();
    try {
      currentDay = day;
      progress("Liste des missions du jour", 0, 0, true);
      const list = await dicos(API, { method: "POST", body: JSON.stringify({ stationIds, date: day }) });
      const all = Array.isArray(list) ? list : Array.isArray(list && list.missions) ? list.missions : [];
      // Seulement les missions PMR : pas les réservations de groupe (écoles…) ni les tâches « Stickering »
      // (absentes de la vue PMR de DICOS ; le serveur les écarte aussi).
      const items = all.filter(
        (m) =>
          m &&
          (m.reservationType === "Disabled" || !m.reservationType) &&
          (m.missionType === "Departure" || m.missionType === "Arrival"),
      );
      // Groupes (réservations « Group », 9 oct. 2026) : une mission par trajet suffit pour le détail (contact,
      // n° de dossier) ; le serveur regroupe départ et arrivée par trajet.
      const groupItems = all.filter(
        (m) => m && m.reservationType === "Group" && (m.missionType === "Departure" || m.missionType === "Arrival"),
      );
      const groupStats = groupItems.length ? await syncGroups(day, groupItems) : null;
      if (groupStats && groupStats.error) {
        setLast(groupStats);
        return groupStats;
      }
      if (!items.length) {
        // Jour sans mission PMR : un envoi vide marque quand même le jour comme synchronisé dans CSM.
        const empty = await pushAll(day, "missions", []);
        if (empty.error) {
          setLast(empty);
          return empty;
        }
        const atms = await syncAtms(day, groupItems);
        const r = { day, found: 0, received: 0, created: 0, updated: 0, skipped: 0, groups: groupStats, atms };
        setLast(r);
        return r;
      }
      // Dossiers complets seulement si un gabarit trip-details a été relevé sur DICOS (sinon : liste + détail,
      // regroupés en trajets par le serveur — même résultat, sans essais inutiles).
      const dossiers = tripPathOk || tripPaths.length ? await fetchDossiers(items) : null;
      const sent = dossiers
        ? await pushAll(day, "dossiers", dossiers)
        : await pushAll(
            day,
            "missions",
            await fetchDetails(items, (d, t) => progress("Détail des missions (ancien format)", d, t)),
          );
      const atms = sent.error ? null : await syncAtms(day, items.concat(groupItems));
      const r = sent.error
        ? sent
        : {
            day,
            found: items.length,
            mode: dossiers ? "dossiers" : "missions",
            dossiers: dossiers ? dossiers.length : 0,
            tripDiag: dossiers ? [] : tripDiag.slice(0, 12),
            ...sent,
            groups: groupStats,
            atms,
          };
      setLast(r);
      return r;
    } catch (err) {
      const r =
        err && err.code === "expired"
          ? { error: "Session DICOS expirée : recharge DICOS puis réessaie." }
          : err && err.code === "no-token"
            ? { error: "Jeton DICOS non capté : navigue dans les missions puis réessaie." }
            : err && err.code === "http"
              ? { error: `Erreur DICOS (HTTP ${err.status}).` }
              : {
                  // Erreur interne (souvent « Extension context invalidated » après une mise à jour de l'extension).
                  error:
                    "Erreur de l'extension : " +
                    String((err && err.message) || err || "inconnue").slice(0, 160) +
                    " — recharge l'onglet DICOS (F5) puis réessaie.",
                };
      setLast(r);
      return r;
    } finally {
      syncing = false;
      try {
        chrome.storage.local.remove("progress");
      } catch (_) {}
    }
  }

  // Avancement lu par le popup (storage.onChanged) : phase + compteur, throttlé à ~4 écritures/s.
  let progAt = 0;
  function progress(phase, done = 0, total = 0, force = false) {
    const now = Date.now();
    if (!force && now - progAt < 250 && done < total) return;
    progAt = now;
    try {
      chrome.storage.local.set({
        progress: { phase: rangeLabel + phase, done, total, day: currentDay, at: now, startedAt: syncAt },
      });
    } catch (_) {}
  }
  let currentDay = "";
  let rangeLabel = ""; // « Jour 2/3 · » pendant une synchro de plusieurs jours

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
      // En auto, on purge le cache tous les ~6 cycles pour reprendre d'éventuelles corrections DICOS sans surcharge.
      autoTicks = (autoTicks + 1) % 6;
      doSync(localDay(), { fresh: autoTicks === 0 });
    }, ms);
  }

  // Plusieurs jours d'affilée (1 à 7) : un jour après l'autre ; le cache de dossiers est gardé d'un jour à l'autre
  // (un dossier aller-retour n'est lu qu'une fois), purgé seulement au début.
  const addDays = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
  async function doSyncRange(start, days, { fresh = true } = {}) {
    const n = Math.max(1, Math.min(7, Number(days) || 1));
    if (n === 1) return doSync(start, { fresh });
    const total = { day: `${start} → ${addDays(start, n - 1)}`, days: n, found: 0, dossiers: 0, received: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, groups: { received: 0, created: 0, updated: 0, unchanged: 0, skipped: 0 }, atms: { requested: 0, fetched: 0, stored: 0, failed: 0 } };
    try {
      for (let i = 0; i < n; i++) {
        rangeLabel = `Jour ${i + 1}/${n} · `;
        const r = await doSync(addDays(start, i), { fresh: fresh && i === 0 });
        if (r && r.busy) return r;
        if (r && r.error) return { ...r, error: `${addDays(start, i)} : ${r.error}` };
        for (const k of ["found", "dossiers", "received", "created", "updated", "unchanged", "skipped"])
          total[k] += Number(r && r[k]) || 0;
        for (const k of Object.keys(total.groups))
          total.groups[k] += Number(r && r.groups && r.groups[k]) || 0;
        for (const k of Object.keys(total.atms)) total.atms[k] += Number(r && r.atms && r.atms[k]) || 0;
        if (r && r.atms && r.atms.error) total.atms.error = r.atms.error;
        if (r && r.atms && r.atms.via) total.atms.via = r.atms.via;
        if (r && r.mode === "missions") Object.assign(total, { mode: "missions", tripDiag: r.tripDiag });
      }
    } finally {
      rangeLabel = "";
    }
    setLast(total);
    return total;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (!msg || typeof msg.cmd !== "string") return;
    if (msg.cmd === "status") {
      reply({ hasToken: !!bearer, stationCount: stationIds.length, auto });
      return;
    }
    if (msg.cmd === "sync") {
      doSyncRange(msg.day || localDay(), msg.days, { fresh: msg.fresh !== false }).then(reply);
      return true; // réponse asynchrone
    }
  });
})();
