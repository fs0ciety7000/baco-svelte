// Lien avec la page CSM « PMR › Extension DICOS » (1.7.0) : l'agent clique « Connecter l'extension » dans CSM, la page
// génère SON jeton de connecteur personnel et le transmet ici par postMessage ; on l'enregistre avec l'adresse de la
// page comme URL CSM. Le script annonce aussi la version installée (la page signale une mise à jour disponible).
// Actif seulement sur la page /pmr/extension des domaines CSM déclarés dans le manifest. Rien d'autre n'est lu.
(() => {
  if (window.__csmLink) return;
  window.__csmLink = true;
  const TOKEN = /^csmc_[A-Za-z0-9_-]{43}$/;
  const version = chrome.runtime.getManifest().version;

  async function hello() {
    let configured = false;
    let permission = false;
    let prefix = "";
    try {
      const v = await chrome.storage.local.get(["csmUrl", "token"]);
      configured = Boolean(v.token) && String(v.csmUrl || "").replace(/\/+$/, "") === location.origin;
      // Début du jeton (10 caractères, déjà affiché dans CSM) : CSM révoque l'ancien jeton à la reconnexion.
      if (configured && TOKEN.test(String(v.token))) prefix = String(v.token).slice(0, 10);
      permission = await chrome.runtime.sendMessage({ cmd: "csm-permission", origin: location.origin });
    } catch (_) {}
    window.postMessage(
      { source: "csm-dicos-connector", type: "hello", version, configured, prefix, permission: permission === true },
      location.origin,
    );
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== "csm-page") return;
    if (data.type === "ping") return void hello();
    if (data.type !== "configure" || typeof data.token !== "string" || !TOKEN.test(data.token)) return;
    let ok = false;
    try {
      await chrome.storage.local.set({ csmUrl: location.origin, token: data.token });
      ok = true;
    } catch (_) {}
    window.postMessage({ source: "csm-dicos-connector", type: "configured", ok }, location.origin);
    hello();
  });

  hello();
})();
