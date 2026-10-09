import { parseEmails, PMR_TYPES, type BusDraft, type TaxiDraft } from "./schemas";
import { formatLongDay, formatShortDay } from "./time";

// Composition des e-mails de commande (bus C3 et taxi). Le corps reprend tout l'essentiel du bon : le
// fournisseur ne doit pas dépendre du PDF joint. Tout texte saisi passe par `escapeHtml`.

export type PacoOffice = {
  district: "Sud-Ouest" | "Sud-Est" | "Centre";
  name: string;
  street: string;
  city: string;
  phone: string;
  email: string;
};

/** Bureaux PACO par district (adresses de la v1 ; Centre : adresse et téléphone de Mons, à confirmer). */
export const PACO_OFFICES: Record<PacoOffice["district"], PacoOffice> = {
  "Sud-Ouest": {
    district: "Sud-Ouest",
    name: "PACO Mons",
    street: "Rue du Musée François Duesberg 1",
    city: "7000 Mons",
    phone: "+32(0)2 436 0460",
    email: "paco.mons@belgiantrain.be",
  },
  "Sud-Est": {
    district: "Sud-Est",
    name: "PACO Namur",
    street: "Place de la Station 1",
    city: "5000 Namur",
    phone: "+32 2 436 05 60",
    email: "paco.namur@belgiantrain.be",
  },
  Centre: {
    district: "Centre",
    name: "PACO Centre",
    street: "Rue du Musée François Duesberg 1",
    city: "7000 Mons",
    phone: "+32(0)2 436 0460",
    email: "paco.brussels@belgiantrain.be",
  },
};

/** Bureau PACO d'un district (Sud-Ouest par défaut). */
export function officeFor(district: string | null | undefined): PacoOffice {
  return PACO_OFFICES[district as PacoOffice["district"]] ?? PACO_OFFICES["Sud-Ouest"];
}

export const C3_LABEL: Record<number, string> = {
  1: "Évacuation",
  2: "Remplacement",
  3: "Modification service planifié",
};
export const c3Label = (type: number) => C3_LABEL[type] ?? C3_LABEL[2]!;

export const pmrTypeLabel = (code: string) =>
  PMR_TYPES.find((t) => t.value === code)?.label ?? code;

/** Arrêts intermédiaires effectifs (liste calculée, ou saisie manuelle découpée). */
export function busStops(d: BusDraft): string[] {
  const list = d.stops_mode === "manuel" ? d.stops_manual.split(/\r?\n|;|,/) : d.stops;
  // Sans le numéro de ligne « (L.125) » (demande du 9 oct. 2026) : le fournisseur n'en a pas besoin.
  return list.map((s) => s.replace(/\s*\(L\.\s*[\w./-]+\)\s*$/i, "").trim()).filter(Boolean);
}

/** Échappe un texte pour HTML (contenu et attributs). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Morceau de nom de fichier : caractères interdits (Windows, contrôle) retirés, longueur bornée. */
function filePart(s: string, fallback: string): string {
  const clean = s
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 60)
    .trim();
  return clean || fallback;
}

// ---------------------------------------------------------------------------------------------------
// Rendu commun

type Row = [label: string, value: string];

export type OrderMail = {
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  text: string;
  filename: string;
};

export type MailOptions = { agentName: string };

function signature(agentName: string, office: PacoOffice): string[] {
  return [
    agentName.trim() || "Client Solutions",
    "SNCB – Client Solutions",
    office.name,
    `${office.street}, ${office.city}`,
    `Tél. ${office.phone}`,
    office.email,
  ];
}

const CELL = "padding:4px 12px 4px 0;vertical-align:top;border-bottom:1px solid #e5e5e5";

function render(intro: string, rows: Row[], sign: string[]) {
  const outro = [
    "Le bon de commande est joint en PDF.",
    "Merci de nous confirmer la prise en charge par retour d'e-mail.",
  ];
  const text = [
    "Bonjour,",
    "",
    intro,
    "",
    ...rows.map(([l, v]) => `${l} : ${v}`),
    "",
    ...outro,
    "",
    "Cordialement,",
    "",
    ...sign,
  ].join("\n");
  const multi = (v: string) => escapeHtml(v).replace(/\r?\n/g, "<br>");
  const html = [
    "<!doctype html>",
    '<html lang="fr"><head><meta charset="utf-8"></head>',
    '<body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#111">',
    "<p>Bonjour,</p>",
    `<p>${escapeHtml(intro)}</p>`,
    '<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:8px 0 16px">',
    ...rows.map(
      ([l, v]) =>
        `<tr><th scope="row" style="${CELL};text-align:left;font-weight:bold;white-space:nowrap">${escapeHtml(l)}</th>` +
        `<td style="${CELL}">${multi(v)}</td></tr>`,
    ),
    "</table>",
    ...outro.map((p) => `<p>${escapeHtml(p)}</p>`),
    "<p>Cordialement,</p>",
    `<p style="margin-top:16px"><strong>${escapeHtml(sign[0] ?? "")}</strong><br>` +
      `${sign.slice(1).map(escapeHtml).join("<br>")}</p>`,
    "</body></html>",
  ].join("\n");
  return { text, html };
}

/** Copie : boîte du bureau PACO, sauf si elle figure déjà parmi les destinataires. */
const ccFor = (office: PacoOffice, to: string[]) =>
  to.some((a) => a.toLowerCase() === office.email) ? [] : [office.email];

// ---------------------------------------------------------------------------------------------------
// Bus

export type BusMailDetail = {
  meta: { number: number };
  draft: BusDraft;
  company: { name: string; email: string } | null;
};

/** « 2026-10-08 · C3-2 · Mons → Tournai.pdf » */
export function busFilename(d: BusDraft): string {
  return `${filePart(d.order_date, "sans date")} · C3-${d.c3_type} · ${filePart(d.origin, "origine")} → ${filePart(d.destination, "destination")}.pdf`;
}

export function busMail(detail: BusMailDetail, opts: MailOptions): OrderMail {
  const d = detail.draft;
  const office = officeFor(d.district);
  const to = parseEmails([detail.company?.email ?? "", d.company_email]);
  const relation = d.relation ? ` – relation ${d.relation}` : "";
  const subject = `Réquisitoire bus C3 n° ${detail.meta.number} – ${formatShortDay(d.order_date)} – ${d.origin || "?"} → ${d.destination || "?"}${relation}`;

  const active = d.buses.map((b, i) => ({ ...b, n: i + 1 })).filter((b) => !b.cancelled);
  const schedule = active.map((b) => {
    const route =
      b.specific_route && (b.origin || b.destination)
        ? ` (trajet : ${b.origin || "?"} → ${b.destination || "?"})`
        : "";
    return `Bus ${b.n} : ${b.planned || "heure à convenir"}${route}`;
  });
  const stops = busStops(d);

  const rows: Row[] = [
    ["Date de circulation", formatLongDay(d.order_date)],
    ["Type", `C3-${d.c3_type} – ${c3Label(d.c3_type)}`],
    ["Motif", d.reason || "—"],
    ...(d.relation
      ? [[d.c3_type === 3 ? "N° de commande / BNX" : "Relation", d.relation] as Row]
      : []),
    ...(d.call_time ? [["Heure d'appel", d.call_time] as Row] : []),
    ["Origine", d.origin || "—"],
    ["Arrêts", d.direct ? "Direct (sans arrêt)" : stops.length ? stops.join(" – ") : "—"],
    ["Destination", d.destination || "—"],
    ["Trajet", d.round_trip ? "Aller-retour (deux sens)" : "Aller simple"],
    ...(d.lines.length ? [["Lignes concernées", d.lines.join(", ")] as Row] : []),
    ["Nombre de bus", String(active.length)],
    ["Capacité par bus", `${d.bus_capacity} places`],
    ...(d.passengers ? [["Voyageurs estimés", String(d.passengers)] as Row] : []),
    ...(d.pmr_count ? [["Dont PMR", String(d.pmr_count)] as Row] : []),
    ["Horaires prévus", schedule.length ? schedule.join("\n") : "—"],
  ];
  const intro = `Veuillez trouver ci-dessous notre demande de bus de remplacement (réquisitoire C3 n° ${detail.meta.number}).`;
  return {
    to,
    cc: ccFor(office, to),
    subject,
    ...render(intro, rows, signature(opts.agentName, office)),
    filename: busFilename(d),
  };
}

// ---------------------------------------------------------------------------------------------------
// Taxi

export type TaxiMailDetail = {
  meta: { number: number };
  draft: TaxiDraft;
  company: { name: string; emails: string[] } | null;
  client?: { type: string } | null;
};

/** « 2026-10-08 · Taxi · Mons → Tournai.pdf » */
export function taxiFilename(d: TaxiDraft): string {
  return `${filePart(d.trip_day, "sans date")} · Taxi · ${filePart(d.from_station, "départ")} → ${filePart(d.to_station, "arrivée")}.pdf`;
}

const at = (day: string, time: string) => `${formatLongDay(day)}${time ? ` à ${time}` : ""}`;

export function taxiMail(detail: TaxiMailDetail, opts: MailOptions): OrderMail {
  const d = detail.draft;
  const office = officeFor(d.district);
  const to = parseEmails([...(detail.company?.emails ?? []), d.taxi_email]);
  const subject = `Commande taxi n° ${detail.meta.number} – ${formatShortDay(d.trip_day)}${d.trip_time ? ` ${d.trip_time}` : ""} – ${d.from_station || "?"} → ${d.to_station || "?"}`;
  const pmrType = pmrTypeLabel(detail.client?.type || d.pmr_type);

  const rows: Row[] = [
    ["Date et heure", at(d.trip_day, d.trip_time)],
    ["Départ", d.from_station || "—"],
    ...(d.via_station ? [["Via", d.via_station] as Row] : []),
    ["Arrivée", d.to_station || "—"],
    [
      "Retour",
      d.round_trip
        ? `Oui – ${at(d.return_day, d.return_time)}, ${d.return_from || d.to_station || "?"} → ${d.return_to || d.from_station || "?"}`
        : "Non (aller simple)",
    ],
    ["Passagers", String(d.passengers)],
    ["Véhicules", String(d.vehicles)],
    [
      "PMR",
      d.is_pmr
        ? `Oui${pmrType ? ` – ${pmrType}` : ""}${d.pmr_count ? ` (${d.pmr_count} PMR)` : ""}`
        : "Non",
    ],
    ...(d.relation_number ? [["Référence", d.relation_number] as Row] : []),
    ...(d.reason ? [["Motif", d.reason] as Row] : []),
    ["Facturation", `À charge de ${d.billing || "SNCB"}`],
  ];
  const intro = `Veuillez trouver ci-dessous notre commande de taxi n° ${detail.meta.number}.`;
  return {
    to,
    cc: ccFor(office, to),
    subject,
    ...render(intro, rows, signature(opts.agentName, office)),
    filename: taxiFilename(d),
  };
}
