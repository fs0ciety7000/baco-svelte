// Service worker : seul composant autorisé à faire l'appel CROSS-ORIGIN vers CSM (host_permissions accordées).
// Il reçoit les dossiers (v1.1) ou missions bruts du content script et les POSTe à l'endpoint d'ingestion CSM, avec le jeton de
// connecteur (en-tête x-dicos-token). Il ne voit jamais le Bearer DICOS. Aucune donnée n'est conservée ici.

async function config() {
  const v = await chrome.storage.local.get(["csmUrl", "token"]);
  const csmUrl = String(v.csmUrl || "https://test-csm.fs0ciety.org").replace(/\/+$/, "");
  return { csmUrl, token: String(v.token || "") };
}

async function push(day, payload) {
  const { csmUrl, token } = await config();
  if (!csmUrl || !token) return { ok: false, error: "Configure l'URL CSM et le jeton de connecteur." };
  let res;
  try {
    res = await fetch(`${csmUrl}/api/pmr/missions/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-dicos-token": token },
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

async function syncAtms(trains) {
  const list = (Array.isArray(trains) ? trains : [])
    .filter((t) => t && /^\d{1,6}$/.test(String(t.train)) && /^\d{4}-\d{2}-\d{2}$/.test(String(t.day)))
    .slice(0, 60);
  const out = { requested: list.length, fetched: 0, stored: 0, failed: 0 };
  if (!list.length) return out;
  const tab = await atmsTab();
  if (!tab) return { ...out, error: "Ouvre un onglet ATMS connecté pour les temps d'arrêt (sinon iRail)." };
  const { csmUrl, token } = await config();
  if (!csmUrl || !token) return { ...out, error: "Configure l'URL CSM et le jeton de connecteur." };
  const schedules = [];
  for (let i = 0; i < list.length; i++) {
    if (i > 0) await sleep(300); // ~3 requêtes par seconde vers ATMS
    let r;
    try {
      r = await chrome.tabs.sendMessage(tab.id, { cmd: "atms-train", train: String(list[i].train), day: list[i].day });
    } catch (_) {
      return { ...out, error: "Onglet ATMS injoignable : recharge-le (F5) puis réessaie." };
    }
    if (r && r.error === "expired") return { ...out, error: "Session ATMS expirée : reconnecte-toi dans l'onglet ATMS." };
    if (r && r.data) {
      out.fetched++;
      schedules.push({ day: list[i].day, train: String(list[i].train), data: r.data });
    } else out.failed++;
  }
  for (let i = 0; i < schedules.length; i += 20) {
    try {
      const res = await fetch(`${csmUrl}/api/pmr/schedules/ingest`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-dicos-token": token },
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
    push(msg.day, payload).then(reply);
    return true; // réponse asynchrone
  }
});
