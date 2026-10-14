// Content script Quinyx (onglet web.quinyx.com connecté, même origine) : lit le planning PUBLIÉ d'un groupe avec la
// session de l'agent (cookies du navigateur, jamais lus ni conservés) et n'en garde que le nécessaire (CSM, Équipe ›
// Planning, 14 oct. 2026) : prestations PACO / RCCA / EXTRA affectées, avec leur type, section, début et fin, et le
// prénom / nom des agents concernés. Repos, absences, compensations, visites médicales, commentaires, e-mails et
// téléphones ne quittent jamais la page. Le tri est refait par CSM (source unique : web/src/lib/quinyx/model.ts).
(() => {
  if (globalThis.__csmQuinyx) return;
  globalThis.__csmQuinyx = true;

  const CAPTURE = (name) => {
    const f = String(name || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
    return /^(PACO|RCCA) /.test(f) || /^EXTRA( |$)/.test(f);
  };
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const addDays = (day, n) => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const today = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  async function get(path, group) {
    const headers = { Accept: "application/json", "x-requested-with": "love", "x-current-group": String(group) };
    const v = document.documentElement.dataset.csmQxAppVersion;
    if (v) headers["x-app-version"] = v;
    let res;
    try {
      res = await fetch(path, { credentials: "include", headers });
    } catch (_) {
      throw new Error("Quinyx injoignable (réseau).");
    }
    if (res.status === 401) throw new Error("Session Quinyx expirée : reconnecte-toi dans l'onglet Quinyx.");
    if (res.status === 403) throw new Error(`Quinyx refuse l'accès au groupe ${group} (droits de ton compte Quinyx).`);
    if (!res.ok) throw new Error(`Quinyx a répondu HTTP ${res.status} (${path.split("?")[0].replace(/\d{3,}/g, "…")}).`);
    try {
      return await res.json();
    } catch (_) {
      throw new Error("Réponse Quinyx illisible (session expirée ?).");
    }
  }

  async function readGroup(group) {
    if (!/^\d{1,15}$/.test(String(group))) return { error: "Groupe Quinyx invalide." };
    try {
      const pub = await get(`/extapi/v1/schedule/publish-date/by-group/${group}`, group);
      const publishedUntil = String((pub && (pub.unitPublishDate || pub.publishDate)) || "").slice(0, 10);
      const from = addDays(today(), -7);
      if (!DAY.test(publishedUntil)) return { error: "Date de publication Quinyx introuvable." };
      // Période lue : de J-7 à la veille de la date de publication, 60 jours au plus.
      let to = addDays(publishedUntil, -1);
      if (to > addDays(from, 60)) to = addDays(from, 60);
      const base = { group: String(group), from, to: to < from ? from : to, publishedUntil };
      if (to < from) return { batch: { ...base, unit: "", sections: [], types: [], employees: [], shifts: [], complete: false } };
      const q = `startDate=${from}T00:00:00&endDate=${addDays(to, 1)}T00:00:00`;
      const [sections, types, shifts, workers] = await Promise.all([
        get(`/extapi/v1/organisation/group/${group}/sections`, group),
        get(`/extapi/v1/schedule/shifttypes/by-group/${group}/with-cross-scheduling-local-shifttypes?startDateTime=${from}T00:00:00&endDateTime=${addDays(to, 1)}T00:00:00`, group),
        get(`/extapi/v1/shifts/by-group/${group}?${q}`, group),
        get(`/extapi/v2/employee/workersof/by-group/${group}?${q}`, group).catch(() => []),
      ]);
      const typeName = new Map((Array.isArray(types) ? types : []).map((t) => [String(t.id), String(t.name || "")]));
      const kept = (Array.isArray(shifts) ? shifts : []).filter(
        (s) =>
          s &&
          String(s.status || "").toUpperCase() === "ASSIGNED" &&
          Number(s.employeeId) > 0 &&
          CAPTURE(typeName.get(String(s.shiftTypeId))) &&
          String(s.begin || "").slice(0, 10) < publishedUntil,
      );
      const people = new Set(kept.map((s) => String(s.employeeId)));
      const usedTypes = new Set(kept.map((s) => String(s.shiftTypeId)));
      const unit = (Array.isArray(sections) ? sections : []).find((s) => String(s.id) === String(group));
      return {
        batch: {
          ...base,
          unit: String((unit && unit.name) || "").slice(0, 160),
          sections: (Array.isArray(sections) ? sections : []).slice(0, 200).map((s) => ({ id: Number(s.id) || 0, name: String(s.name || "").slice(0, 120) })),
          types: [...usedTypes].map((id) => ({ id: Number(id) || 0, name: String(typeName.get(id) || "").slice(0, 120) })),
          employees: (Array.isArray(workers) ? workers : [])
            .filter((w) => w && people.has(String(w.id)))
            .map((w) => ({ id: Number(w.id) || 0, firstname: String(w.firstname || "").slice(0, 80), lastname: String(w.lastname || "").slice(0, 80) })),
          shifts: kept.slice(0, 5000).map((s) => ({
            id: Number(s.id) || 0,
            groupId: Number(s.groupId) || 0,
            begin: String(s.begin || "").slice(0, 19),
            end: String(s.end || "").slice(0, 19),
            shiftTypeId: Number(s.shiftTypeId) || 0,
            employeeId: Number(s.employeeId) || 0,
            status: "ASSIGNED",
          })),
          complete: true,
        },
      };
    } catch (e) {
      return { error: String((e && e.message) || e).slice(0, 200) };
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg && msg.cmd === "quinyx-ping") return void reply(true);
    if (!msg || msg.cmd !== "quinyx-read") return;
    readGroup(msg.group).then(reply);
    return true; // réponse asynchrone
  });

  // Synchro automatique : à l'ouverture d'une page de planning, au plus toutes les 3 h (le service worker décide).
  if (/^\/schedule\//.test(location.pathname)) {
    setTimeout(() => {
      try {
        chrome.runtime.sendMessage({ cmd: "quinyx-auto" });
      } catch (_) {}
    }, 4000);
  }
})();
