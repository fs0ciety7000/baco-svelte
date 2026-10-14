// Monde MAIN de l'onglet Quinyx (web.quinyx.com) : relève la valeur de l'en-tête `x-app-version` que l'application
// Quinyx envoie à son API (numéro de version de l'application, rien de secret) pour que le script de synchro l'envoie
// aussi. Aucun cookie, aucun corps de requête ni de réponse n'est lu.
(() => {
  if (window.__csmQxInject) return;
  window.__csmQxInject = true;
  const note = (name, value) => {
    if (String(name).toLowerCase() !== "x-app-version") return;
    const v = String(value || "").slice(0, 20);
    if (/^[\w.-]+$/.test(v)) document.documentElement.dataset.csmQxAppVersion = v;
  };
  const setHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    try {
      note(name, value);
    } catch (_) {}
    return setHeader.apply(this, arguments);
  };
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const h = (init && init.headers) || (input && typeof input === "object" && input.headers);
      if (h) new Headers(h).forEach((v, k) => note(k, v));
    } catch (_) {}
    return origFetch.apply(this, arguments);
  };
})();
