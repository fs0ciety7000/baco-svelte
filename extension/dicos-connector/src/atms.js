// Content script ATMS (onglet ATMS connecté, même origine) : lit l'itinéraire d'un train
// (`GET /api/v1/trains/{n°}/{AAAA-MM-JJ}`) avec la session de l'agent et n'en renvoie que les champs utiles au calcul des
// temps d'arrêt (abréviation PtCar, nom, ordre, heures planifiées). Aucun cookie ni jeton n'est lu ni conservé.
(() => {
  // Injecté aussi à la demande par le service worker (onglet ouvert avant l'installation) : une seule fois.
  if (globalThis.__csmAtms) return;
  globalThis.__csmAtms = true;
  const pick = (p) => ({
    ptcarSymbolicName: String(p.ptcarSymbolicName || "").slice(0, 20),
    ptcarName: String(p.ptcarName || "").slice(0, 80),
    orderNumber: Number(p.orderNumber) || 0,
    operationCode: String(p.operationCode || "").slice(0, 4),
    plannedFullArrivalTime: p.plannedFullArrivalTime ? String(p.plannedFullArrivalTime).slice(0, 40) : null,
    plannedFullDepartureTime: p.plannedFullDepartureTime ? String(p.plannedFullDepartureTime).slice(0, 40) : null,
    isCommercial: p.isCommercial === true,
  });

  async function train(n, day) {
    if (!/^\d{1,6}$/.test(String(n)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return { error: "bad-input" };
    let res;
    try {
      res = await fetch(`/api/v1/trains/${n}/${day}`, {
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
      // Session F5 expirée : ATMS renvoie la page de connexion (HTML) au lieu du JSON.
      return { error: "expired" };
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
        itineraryPoints: data.itineraryPoints.slice(0, 600).map(pick),
      },
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg && msg.cmd === "atms-ping") return void reply(true);
    if (!msg || msg.cmd !== "atms-train") return;
    train(msg.train, msg.day).then(reply);
    return true; // réponse asynchrone
  });
})();
