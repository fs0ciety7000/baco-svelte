// Lien avec CSM (1.7.0, élargi en 1.10.0).
// - Page « Extension CSM » (/extension, /pmr/extension) : l'agent clique « Connecter l'extension », la page génère SON
//   jeton de connecteur personnel et le transmet ici par postMessage ; on l'enregistre avec l'adresse de la page comme
//   URL CSM. Seulement sur ces chemins.
// - Toute page CSM : le script annonce la version installée (la page signale une mise à jour) et, depuis la 1.10.0,
//   accepte « synchroniser ce jour » (export ALEA) : le service worker lit le jour dans un onglet DICOS ouvert et
//   l'envoie à CSM, seulement si l'extension est connectée à CETTE adresse CSM. La page ne reçoit qu'un résumé chiffré.
// Rien d'autre n'est lu.
(() => {
  if (window.__csmLink) return;
  window.__csmLink = true;
  const TOKEN = /^csmc_[A-Za-z0-9_-]{43}$/;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const ID = /^[A-Za-z0-9_-]{1,40}$/;
  const version = chrome.runtime.getManifest().version;
  const linkPage = () => /^\/(pmr\/)?extension(\/|$)/.test(location.pathname);
  let syncing = false;

  const post = (msg) => window.postMessage({ source: "csm-dicos-connector", ...msg }, location.origin);

  async function hello() {
    let configured = false;
    let permission = false;
    let prefix = "";
    try {
      const v = await chrome.storage.local.get(["csmUrl", "token"]);
      configured = Boolean(v.token) && String(v.csmUrl || "").replace(/\/+$/, "") === location.origin;
      // Début du jeton (10 caractères, déjà affiché dans CSM) : CSM révoque l'ancien jeton à la reconnexion.
      if (configured && TOKEN.test(String(v.token)) && linkPage()) prefix = String(v.token).slice(0, 10);
      permission = await chrome.runtime.sendMessage({ cmd: "csm-permission", origin: location.origin });
    } catch (_) {}
    post({ type: "hello", version, configured, prefix, permission: permission === true, sync: true });
  }

  async function syncDay(day, id) {
    if (syncing) return post({ type: "sync-result", id, ok: false, code: "busy", error: "Synchro déjà en cours." });
    syncing = true;
    post({ type: "sync-started", id, day });
    let r;
    try {
      r = await chrome.runtime.sendMessage({ cmd: "dicos-sync", day });
    } catch (_) {
      r = { ok: false, error: "Extension injoignable : recharge la page." };
    } finally {
      syncing = false;
    }
    const n = (x) => Number(x) || 0;
    post({
      type: "sync-result",
      id,
      day,
      ok: Boolean(r && r.ok),
      code: r && typeof r.code === "string" ? r.code.slice(0, 20) : "",
      error: r && r.error ? String(r.error).slice(0, 200) : "",
      missions: n(r && r.missions),
      groups: n(r && r.groups),
      created: n(r && r.created),
      updated: n(r && r.updated),
    });
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== "csm-page") return;
    if (data.type === "ping") return void hello();
    if (data.type === "sync") {
      if (typeof data.day !== "string" || !DAY.test(data.day) || typeof data.id !== "string" || !ID.test(data.id)) return;
      return void syncDay(data.day, data.id);
    }
    if (data.type !== "configure" || !linkPage() || typeof data.token !== "string" || !TOKEN.test(data.token)) return;
    let ok = false;
    try {
      await chrome.storage.local.set({ csmUrl: location.origin, token: data.token });
      ok = true;
    } catch (_) {}
    post({ type: "configured", ok });
    hello();
  });

  hello();
})();
