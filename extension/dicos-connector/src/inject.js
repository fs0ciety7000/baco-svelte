// Injecté dans le CONTEXTE DE LA PAGE DICOS (world "MAIN") par le content script, au plus tôt.
// Seul rôle : observer les requêtes que la SPA DICOS émet déjà vers /api/* pour en relever, EN VOL :
//   - le jeton d'accès (en-tête Authorization: Bearer …) — jamais stocké, jamais persisté ;
//   - le corps du POST /api/missions (stationIds = périmètre de gares de l'agent).
// Ces valeurs sont transmises au content script par window.postMessage. Aucun appel réseau n'est émis ici,
// aucune donnée personnelle n'est lue : on ne regarde que l'en-tête d'autorisation et la liste des gares.
(() => {
  "use strict";
  const TAG = "csm-dicos";
  const isApi = (url) => typeof url === "string" && /\/api\/missions(\b|\?|$)/.test(url);

  function sendAuth(value) {
    if (typeof value !== "string" || !/^Bearer\s+\S+/i.test(value)) return;
    window.postMessage({ source: TAG, kind: "auth", token: value }, window.location.origin);
  }
  function sendFilter(body) {
    try {
      const o = typeof body === "string" ? JSON.parse(body) : body;
      if (o && Array.isArray(o.stationIds)) {
        const ids = o.stationIds.map(String).filter(Boolean).slice(0, 2000);
        if (ids.length)
          window.postMessage({ source: TAG, kind: "filter", stationIds: ids }, window.location.origin);
      }
    } catch (_) {
      /* corps non JSON : ignoré */
    }
  }

  // fetch
  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (input, init) {
      try {
        const url = typeof input === "string" ? input : input && input.url;
        const headers = new Headers((init && init.headers) || (input && input.headers) || {});
        const auth = headers.get("authorization");
        if (auth) sendAuth(auth);
        if (isApi(url) && init && typeof init.method === "string" && init.method.toUpperCase() === "POST")
          sendFilter(init.body);
      } catch (_) {
        /* observation uniquement, ne jamais casser la requête de la SPA */
      }
      return origFetch.apply(this, arguments);
    };
  }

  // XMLHttpRequest
  const XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    const open = XHR.prototype.open;
    const setHeader = XHR.prototype.setRequestHeader;
    const send = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      this.__csm = { method: String(method || "").toUpperCase(), url: String(url || "") };
      return open.apply(this, arguments);
    };
    XHR.prototype.setRequestHeader = function (name, value) {
      try {
        if (String(name).toLowerCase() === "authorization") sendAuth(value);
      } catch (_) {}
      return setHeader.apply(this, arguments);
    };
    XHR.prototype.send = function (body) {
      try {
        if (this.__csm && this.__csm.method === "POST" && isApi(this.__csm.url)) sendFilter(body);
      } catch (_) {}
      return send.apply(this, arguments);
    };
  }
})();
