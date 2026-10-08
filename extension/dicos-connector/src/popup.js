// Popup : réglages (URL CSM, jeton de connecteur, auto + période), choix du jour, bouton de synchro manuelle.
// Il parle au content script de l'onglet DICOS actif (statut + synchro) ; l'envoi vers CSM passe par le service worker.
const $ = (id) => document.getElementById(id);
const DICOS = /^https:\/\/dicos\.intern-belgiantrain\.be\//;

function today() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Brussels",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch (_) {
    const d = new Date();
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
}

function setStatus(html, cls) {
  $("status").className = "status" + (cls ? " " + cls : "");
  $("status").innerHTML = html;
}
function setHint(text, cls) {
  $("hint").className = "hint" + (cls ? " " + cls : "");
  $("hint").textContent = text || "";
}

async function activeDicosTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab && DICOS.test(tab.url || "") ? tab : null;
}

function fmtResult(r) {
  if (!r) return "Aucune synchro récente.";
  if (r.error) return `<span class="err">${escapeHtml(String(r.error))}</span>`;
  // Les valeurs viennent d'une réponse réseau : tout est coercé/échappé avant innerHTML (jamais de HTML injecté).
  const num = (v) => Number(v) || 0;
  const when = r.at ? ` · ${new Date(r.at).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}` : "";
  const found = num(r.found ?? r.received);
  return `<span class="ok">✓ ${escapeHtml(String(r.day || ""))}${escapeHtml(when)}</span><br>${found} mission(s) · <b>${num(r.created)}</b> créée(s), <b>${num(r.updated)}</b> maj, ${num(r.skipped)} ignorée(s)`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

async function refreshStatus() {
  const tab = await activeDicosTab();
  if (!tab) {
    $("dot").classList.remove("on");
    setHint("Ouvre l'onglet DICOS (dicos.intern-belgiantrain.be) pour synchroniser.", "err");
    $("sync").disabled = true;
    return;
  }
  $("sync").disabled = false;
  try {
    const s = await chrome.tabs.sendMessage(tab.id, { cmd: "status" });
    if (s && s.hasToken) {
      $("dot").classList.add("on");
      setHint(`Session DICOS détectée · ${s.stationCount} gare(s) au périmètre.`);
    } else {
      $("dot").classList.remove("on");
      setHint("Session pas encore détectée : navigue dans les missions DICOS une fois.", "err");
    }
  } catch (_) {
    $("dot").classList.remove("on");
    setHint("Recharge l'onglet DICOS après avoir installé l'extension.", "err");
  }
}

async function load() {
  const v = await chrome.storage.local.get(["csmUrl", "token", "auto", "last"]);
  $("csmUrl").value = v.csmUrl || "";
  $("token").value = v.token || "";
  $("auto").checked = !!(v.auto && v.auto.enabled);
  $("minutes").value = (v.auto && v.auto.minutes) || 10;
  $("day").value = today();
  setStatus(fmtResult(v.last));
  refreshStatus();
}

$("save").addEventListener("click", async () => {
  let csmUrl = $("csmUrl").value.trim().replace(/\/+$/, "");
  // Tolérant : si l'URL est saisie sans schéma (ex. « test-csm.fs0ciety.org »), on préfixe https:// .
  if (csmUrl && !/^https?:\/\//i.test(csmUrl)) csmUrl = "https://" + csmUrl;
  $("csmUrl").value = csmUrl;
  const token = $("token").value.trim();
  const auto = { enabled: $("auto").checked, minutes: Math.max(2, Math.min(120, Number($("minutes").value) || 10)) };
  if (!csmUrl || !token) {
    setHint("Renseigne l'URL CSM ET le jeton avant d'enregistrer.", "err");
    return;
  }
  if (csmUrl) {
    let origin;
    try {
      origin = new URL(csmUrl).origin + "/*";
    } catch (_) {
      setHint("URL CSM invalide.", "err");
      return;
    }
    // Permission d'hôte pour l'appel cross-origin vers CSM (demandée sur geste utilisateur).
    try {
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) {
        setHint("Permission refusée pour l'URL CSM : la synchro ne pourra pas envoyer.", "err");
      }
    } catch (_) {}
  }
  await chrome.storage.local.set({ csmUrl, token, auto });
  setHint("Réglages enregistrés.", "ok");
});

$("sync").addEventListener("click", async () => {
  const tab = await activeDicosTab();
  if (!tab) return;
  // Pré-contrôle : sans URL + jeton enregistrés, l'envoi vers CSM échouera → message clair plutôt que « Configure… ».
  const cfg = await chrome.storage.local.get(["csmUrl", "token"]);
  if (!cfg.csmUrl || !cfg.token) {
    setStatus('<span class="err">Enregistre d\'abord l\'URL CSM et le jeton (bouton « Enregistrer les réglages »).</span>');
    return;
  }
  $("sync").disabled = true;
  setStatus("Synchronisation en cours…");
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { cmd: "sync", day: $("day").value || today() });
    setStatus(fmtResult(r), r && r.error ? "" : "");
  } catch (_) {
    setStatus('<span class="err">Content script indisponible : recharge l\'onglet DICOS.</span>');
  } finally {
    $("sync").disabled = false;
    refreshStatus();
  }
});

load();
