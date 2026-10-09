// Service worker : seul composant autorisé à faire l'appel CROSS-ORIGIN vers CSM (host_permissions accordées).
// Il reçoit les dossiers (v1.1) ou missions bruts du content script et les POSTe à l'endpoint d'ingestion CSM, avec le jeton de
// connecteur (en-tête x-dicos-token). Il ne voit jamais le Bearer DICOS. Aucune donnée n'est conservée ici.

async function config() {
  const v = await chrome.storage.local.get(["csmUrl", "token"]);
  const csmUrl = String(v.csmUrl || "https://test-csm.fs0ciety.org").replace(/\/+$/, "");
  return { csmUrl, token: String(v.token || "") };
}

const VERSION = chrome.runtime.getManifest().version;
const headers = (token) => ({ "content-type": "application/json", "x-dicos-token": token, "x-csm-extension": VERSION });

// Permission d'hôte vers CSM : accordée par le bouton « Autoriser CSM » du popup (geste de l'agent).
async function hasPermission(csmUrl) {
  try {
    return await chrome.permissions.contains({ origins: [new URL(csmUrl).origin + "/*"] });
  } catch (_) {
    return false;
  }
}
const NO_PERMISSION = "Envoi vers CSM pas encore autorisé : ouvre l'extension et clique « Autoriser CSM ».";

async function push(day, payload) {
  const { csmUrl, token } = await config();
  if (!csmUrl || !token) return { ok: false, error: "Configure l'URL CSM et le jeton de connecteur." };
  if (!(await hasPermission(csmUrl))) return { ok: false, error: NO_PERMISSION };
  let res;
  try {
    res = await fetch(`${csmUrl}/api/pmr/missions/ingest`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ day, ...payload }),
    });
  } catch (_) {
    return { ok: false, error: "CSM injoignable (URL ou réseau)." };
  }
  if (res.status === 401) return { ok: false, error: "Jeton de connecteur refusé par CSM." };
  if (res.status === 503) return { ok: false, error: "Ingestion DICOS désactivée côté CSM." };
  if (!res.ok) return { ok: false, error: `CSM a répondu HTTP ${res.status}.` };
  let result;
  try {
    result = await res.json();
  } catch (_) {
    return { ok: false, error: "Réponse CSM illisible." };
  }
  // Dernière version publiée sur CSM : le popup propose la mise à jour (1.7.0).
  const latest = result && result.extension && result.extension.latest;
  if (typeof latest === "string" && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(latest)) {
    try {
      await chrome.storage.local.set({ latest });
    } catch (_) {}
  }
  return { ok: true, result };
}

// --- Temps d'arrêt ATMS (export ALEA « Obligatoire », 9 oct. 2026) ---
// Pour chaque train des missions synchronisées : itinéraire lu dans un onglet ATMS connecté (content script atms.js,
// même origine, session de l'agent), puis envoyé à CSM qui calcule les temps d'arrêt prévus. Sans onglet ATMS ouvert,
// la synchro DICOS n'est pas bloquée : CSM se rabat sur l'horaire iRail.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function atmsTab() {
  const tabs = await chrome.tabs.query({ url: "https://atms.intern-belgiantrain.be/*" });
  return tabs.find((t) => !t.discarded) || tabs[0] || null;
}

// Champs utiles au calcul des temps d'arrêt (même tri que src/atms.js) : rien d'autre ne quitte le navigateur.
const pickPoint = (p) => ({
  ptcarSymbolicName: String(p.ptcarSymbolicName || "").slice(0, 20),
  ptcarName: String(p.ptcarName || "").slice(0, 80),
  orderNumber: Number(p.orderNumber) || 0,
  operationCode: String(p.operationCode || "").slice(0, 4),
  plannedFullArrivalTime: p.plannedFullArrivalTime ? String(p.plannedFullArrivalTime).slice(0, 40) : null,
  plannedFullDepartureTime: p.plannedFullDepartureTime ? String(p.plannedFullDepartureTime).slice(0, 40) : null,
  isCommercial: p.isCommercial === true,
});

// Repli sans onglet joignable (1.6.1) : lecture directe depuis l'extension (permission d'hôte ATMS), avec la session
// ATMS du navigateur. Aucun cookie lu ni conservé par l'extension.
async function atmsDirect(n, day) {
  let res;
  try {
    res = await fetch(`https://atms.intern-belgiantrain.be/api/v1/trains/${n}/${day}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch (_) {
    return { error: "network" };
  }
  if (res.status === 401 || res.status === 403) return { error: "expired" };
  if (res.status === 404) return { error: "not-found" };
  if (!res.ok) return { error: `http-${res.status}` };
  let body;
  try {
    body = await res.json();
  } catch (_) {
    return { error: "expired" }; // page de connexion (HTML) au lieu du JSON
  }
  const data = body && body.data;
  if (!data || !Array.isArray(data.itineraryPoints)) return { error: "not-found" };
  return {
    data: {
      trains: (Array.isArray(data.trains) ? data.trains : []).slice(0, 1).map((t) => ({
        trainNumber: Number(t.trainNumber) || 0,
        label: String(t.label || "").slice(0, 20),
        departureDay: String(t.departureDay || "").slice(0, 10),
      })),
      itineraryPoints: data.itineraryPoints.slice(0, 600).map(pickPoint),
    },
  };
}

// Onglet ATMS ouvert AVANT l'installation ou la mise à jour de l'extension : le content script n'y est pas → on
// l'injecte (permission « scripting ») au lieu d'échouer sur « Receiving end does not exist ».
async function reachTab(tab) {
  const ping = () => chrome.tabs.sendMessage(tab.id, { cmd: "atms-ping" });
  try {
    if (await ping()) return true;
  } catch (_) {}
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/atms.js"] });
    return Boolean(await ping());
  } catch (_) {
    return false;
  }
}

async function syncAtms(trains) {
  const list = (Array.isArray(trains) ? trains : [])
    .filter((t) => t && /^\d{1,6}$/.test(String(t.train)) && /^\d{4}-\d{2}-\d{2}$/.test(String(t.day)))
    .slice(0, 100);
  const out = { requested: list.length, fetched: 0, stored: 0, failed: 0, via: "" };
  if (!list.length) return out;
  const { csmUrl, token } = await config();
  if (!csmUrl || !token) return { ...out, error: "Configure l'URL CSM et le jeton de connecteur." };
  if (!(await hasPermission(csmUrl))) return { ...out, error: NO_PERMISSION };
  const tab = await atmsTab();
  let viaTab = tab ? await reachTab(tab) : false;
  out.via = viaTab ? "onglet" : "direct";
  const schedules = [];
  let expired = 0;
  for (let i = 0; i < list.length; i++) {
    if (i > 0) await sleep(300); // ~3 requêtes par seconde vers ATMS
    const n = String(list[i].train);
    let r = null;
    if (viaTab) {
      try {
        r = await chrome.tabs.sendMessage(tab.id, { cmd: "atms-train", train: n, day: list[i].day });
      } catch (_) {
        viaTab = false; // onglet fermé ou rechargé en cours de route : on continue en direct
        out.via = "direct";
      }
    }
    if (!r) r = await atmsDirect(n, list[i].day);
    if (r && r.error === "expired") {
      // Deux refus d'affilée = session absente : inutile d'insister sur les autres trains.
      if (++expired >= 2 && !out.fetched)
        return {
          ...out,
          error: tab
            ? "Session ATMS expirée : reconnecte-toi dans l'onglet ATMS (F5) puis resynchronise."
            : "Ouvre un onglet ATMS et connecte-toi, puis resynchronise (sinon CSM utilise iRail).",
        };
      out.failed++;
      continue;
    }
    if (r && r.data) {
      out.fetched++;
      schedules.push({ day: list[i].day, train: n, data: r.data });
    } else out.failed++;
  }
  for (let i = 0; i < schedules.length; i += 20) {
    try {
      const res = await fetch(`${csmUrl}/api/pmr/schedules/ingest`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({ schedules: schedules.slice(i, i + 20) }),
      });
      if (!res.ok) return { ...out, error: `CSM a refusé les horaires (HTTP ${res.status}).` };
      const j = await res.json();
      out.stored += Number(j.stored) || 0;
    } catch (_) {
      return { ...out, error: "CSM injoignable pour les horaires." };
    }
  }
  return out;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.cmd === "csm-permission") {
    hasPermission(String(msg.origin || "")).then(reply);
    return true;
  }
  if (msg && msg.cmd === "atms") {
    syncAtms(msg.trains).then(reply, (e) => reply({ error: String((e && e.message) || e).slice(0, 160) }));
    return true;
  }
  if (msg && msg.cmd === "push") {
    const payload = Array.isArray(msg.groups)
      ? { groups: msg.groups }
      : Array.isArray(msg.dossiers)
        ? { dossiers: msg.dossiers }
        : { missions: Array.isArray(msg.missions) ? msg.missions : [] };
    // Dernier lot du jour : CSM n'affiche « synchronisé » qu'une fois ce lot reçu (synchro interrompue = incomplète).
    push(msg.day, { ...payload, final: msg.final !== false }).then(reply);
    return true; // réponse asynchrone
  }
});
