const DEFAULT_CSM_URL = "https://test-csm.fs0ciety.org";
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
  // r.days > 1 : synchro de plusieurs jours (totaux cumulés).
  return `<span class="ok">✓ ${escapeHtml(String(r.day || ""))}${escapeHtml(when)}</span><br>${found} mission(s)${r.dossiers ? ` · ${num(r.dossiers)} dossier(s), ${num(r.received)} trajet(s)` : ""} · <b>${num(r.created)}</b> créée(s), <b>${num(r.updated)}</b> maj, ${num(r.skipped)} ignorée(s)${fmtMode(r)}`;
}
// Mode de lecture : dossiers complets (trip-details) ou repli sur l'ancien format, avec les chemins essayés.
function fmtMode(r) {
  if (r.mode !== "missions") return "";
  const tries = Array.isArray(r.tripDiag) ? r.tripDiag.slice(0, 12) : [];
  const list = tries
    .map((t) => `${escapeHtml(String((t && t.path) || ""))} → ${escapeHtml(String((t && t.why) || ""))}`)
    .join("<br>");
  return `<br><span class="err">⚠ Dossiers complets indisponibles : ancien format utilisé.</span>${list ? `<br><small>${list}</small>` : ""}`;
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
  // Adresse CSM pré-remplie (le texte gris n'était qu'un exemple, le champ restait vide).
  $("csmUrl").value = v.csmUrl || DEFAULT_CSM_URL;
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
    const r = await chrome.tabs.sendMessage(tab.id, {
      cmd: "sync",
      day: $("day").value || today(),
      days: Number($("days").value) || 1,
    });
    if (r && r.busy) {
      // Une synchro (manuelle ou automatique) tourne déjà : on affiche son avancement plutôt qu'une erreur.
      const v = await chrome.storage.local.get(["progress"]);
      setStatus(v.progress ? fmtProgress(v.progress) : "Synchronisation déjà en cours…");
    } else setStatus(fmtResult(r), r && r.error ? "" : "");
  } catch (_) {
    setStatus('<span class="err">Content script indisponible : recharge l\'onglet DICOS.</span>');
  } finally {
    $("sync").disabled = false;
    refreshStatus();
  }
});

load();

// Version installée (pour vérifier que la mise à jour a bien été chargée).
try {
  document.getElementById("ver").textContent = "v" + chrome.runtime.getManifest().version;
} catch (_) {}

// Avancement en direct de la synchro (écrit par le content script).
function fmtProgress(p) {
  const n = (v) => Number(v) || 0;
  const secs = p.startedAt ? Math.max(0, Math.round((Date.now() - n(p.startedAt)) / 1000)) : 0;
  const count = n(p.total) ? ` : <b>${n(p.done)}</b> / ${n(p.total)}` : "…";
  const pct = n(p.total) ? Math.round((100 * n(p.done)) / n(p.total)) : 0;
  return `⏳ ${escapeHtml(String(p.day || ""))} · ${escapeHtml(String(p.phase || ""))}${count}${secs ? ` · ${secs} s` : ""}` +
    (n(p.total) ? `<br><progress max="100" value="${pct}" style="width:100%"></progress>` : "");
}
try {
  chrome.storage.local.get(["progress"]).then((v) => {
    if (v.progress) setStatus(fmtProgress(v.progress));
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "local") return;
    if (ch.progress && ch.progress.newValue) setStatus(fmtProgress(ch.progress.newValue));
    else if (ch.last && ch.last.newValue) setStatus(fmtResult(ch.last.newValue));
  });
} catch (_) {}
