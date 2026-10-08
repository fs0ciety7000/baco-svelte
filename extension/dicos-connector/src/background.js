// Service worker : seul composant autorisé à faire l'appel CROSS-ORIGIN vers CSM (host_permissions accordées).
// Il reçoit les dossiers (v1.1) ou missions bruts du content script et les POSTe à l'endpoint d'ingestion CSM, avec le jeton de
// connecteur (en-tête x-dicos-token). Il ne voit jamais le Bearer DICOS. Aucune donnée n'est conservée ici.

async function config() {
  const v = await chrome.storage.local.get(["csmUrl", "token"]);
  return { csmUrl: String(v.csmUrl || "").replace(/\/+$/, ""), token: String(v.token || "") };
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

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.cmd === "push") {
    const payload = Array.isArray(msg.dossiers)
      ? { dossiers: msg.dossiers }
      : { missions: Array.isArray(msg.missions) ? msg.missions : [] };
    push(msg.day, payload).then(reply);
    return true; // réponse asynchrone
  }
});
