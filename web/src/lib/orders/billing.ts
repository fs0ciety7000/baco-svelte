// Fichier « Transports alternatifs » envoyé à la facturation (4 nov. 2026) : un classeur par mois (ou par semaine) et par
// district, mis en page comme le fichier tenu jusqu'ici à la main (feuilles BUS, TAXI, TAXI PMR, Données). Les colonnes
// que CSM ne connaît pas (disponibilité, % fourni, reçu, n° de facture…) restent vides pour l'équipe de facturation.
// Choix : le n° de commande CMD-… va dans la colonne « C3 » (n° du réquisitoire C3, qu'il remplace) pour les bus, dans
// « N°PACO » pour les taxis et en tête de « Référence » pour les taxis PMR. Jamais de nom de voyageur. Pur, testé.

import { colName, type XlsxCell, type XlsxSheet } from "@/lib/xlsx";

export type BillingBusLine = {
  plate: string;
  planned: string;
  actual: string;
  demob: string;
  cancelled: boolean;
};

export type BillingBus = {
  orderRef: string;
  number: number;
  status: string;
  /** Jour de service « AAAA-MM-JJ ». */
  day: string;
  relation: string;
  /** Nom affiché du rédacteur (« Prénom Nom ») ou agent repris de BACO. */
  author: string;
  company: string;
  callTime: string;
  buses: BillingBusLine[];
  capacity: number;
  passengers: number;
  roundTrip: boolean;
  origin: string;
  destination: string;
  direct: boolean;
  lines: string[];
  reason: string;
  c3Type: number;
  cancelReason: string;
};

export type BillingTaxi = {
  orderRef: string;
  number: number;
  status: string;
  /** Jour de la demande (création du bon). */
  requestDay: string;
  day: string;
  time: string;
  author: string;
  vehicles: number;
  company: string;
  passengers: number;
  from: string;
  to: string;
  vias: string[];
  roundTrip: boolean;
  reason: string;
  billing: string;
  relation: string;
  isPmr: boolean;
  /** Cause PMR (lue avec `pmr:read` seulement, sinon vide). */
  pmrReason: string;
  /** N° de dossier DICOS (lu avec `pmr:read` seulement, sinon vide). Jamais de nom. */
  pmrFile: string;
  cancelReason: string;
  /** Instant d'annulation déjà mis en forme « jj/mm/aaaa HH:MM » (vide sinon). */
  cancelledAt: string;
};

export const BILLING_COMPOSITIONS = [
  "BUS (80pl)",
  "BUS articulé (120pl)",
  "CAR (40pl)",
  "Autre (a préciser)",
];
export const BILLING_CHARGES = [
  "INFRABEL",
  "SNCB",
  "TIERS",
  "B-PT1 (accompagnateur)",
  "B-TO1 (conduite)",
  "B-TC (matériel)",
  "B-PT5 (Emma)",
  "B-PT4 (planification)",
  "B-CS",
];
export const BILLING_PMR_MOTIFS = [
  "1. Pas de personnel pour la prise en charge",
  "2. Gare taxi PMR (17 gares)",
  "3. Travaux Infrabel planifiés (transport alternatif bus pour les autres voyageurs prévu par B-PT.4)",
  "4. Travaux B-Station planifiés (travaux dans la gare rendant l’assistance temporairement impossible)",
  "5. Défaut infrastructure gare B-Station (ex. :Ascenseurs)",
  "6. Défaut Infrabel (ex. : traversée de service pas/plus accessible)",
  "7. Défaut rampes-mobiles/plateformes-hydrauliques B-PT.2",
  "8. Problème lors du voyage de la PMR dû à l’assistance ou retard des trains ou suppression d’un train (ex. : correspondance manquée)",
  "9. Acte commercial suite erreur SNCB (remarque dans le dossier)",
  "10. Acte commercial suite erreur client (voyageur imprévu, chaise roulante trop grande)",
  "11. Autres (à justifier)",
];

export const BUS_HEADER = [
  "Date",
  "Relation",
  "Rédacteur C3",
  "Dispo société",
  "Nbr de bus demandé",
  "% fourni",
  "Remarque",
  "Heure d'appel",
  "Prévision sur place",
  "Heure sur place",
  "Heure de fin",
  "Nbr de bus",
  "Bus/Car",
  "Nom d'entreprise",
  "N° plaque",
  "Nbr de personnes",
  "Aller ou A/R",
  "De",
  "à",
  "Nbr de trajet simple",
  "Direct/Omnibus",
  "Ligne",
  "Motif",
  "A charge de",
  "C3",
  "N° facture",
];
export const TAXI_HEADER = [
  "Date",
  "N°PACO",
  "Heure de départ",
  "Rédacteur",
  "Nombre de taxi(s)",
  "Nom d'entreprise",
  "Nombre de personnes",
  "De",
  "Aller ou A/R",
  "à",
  "Motif",
  "A charge de",
  "Relation",
  "Reçu bon taxi",
  "N° facture",
];
export const TAXI_PMR_HEADER = [
  "Date de la demande",
  "Date du voyage",
  "Heure de départ",
  "Rédacteur",
  "Nombre de taxi(s)",
  "Nom d'entreprise",
  "Nombre de personnes",
  "De",
  "Aller ou A/R",
  "à",
  "Si annulation (date/heure + motif)",
  "Motif",
  "A charge de",
  "N° Dossier",
  "Référence",
  "N° facture",
  "Commentaire",
];

const MONTHS_UP = [
  "JANVIER",
  "FÉVRIER",
  "MARS",
  "AVRIL",
  "MAI",
  "JUIN",
  "JUILLET",
  "AOÛT",
  "SEPTEMBRE",
  "OCTOBRE",
  "NOVEMBRE",
  "DÉCEMBRE",
];

/** « AAAA-MM-JJ » → « jj/mm/aaaa ». */
export function frDay(day: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`
    : "";
}

/** Rédacteur au format du fichier (« Nom I. ») : « Léa Martin » → « Martin L. » ; un seul mot reste tel quel. */
export function redactorLabel(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  const first = parts[0]!;
  return `${parts.slice(1).join(" ")} ${first.charAt(0).toUpperCase()}.`;
}

/** Composition d'après la capacité d'un bus. */
export function composition(capacity: number): string {
  if (capacity === 80) return "BUS (80pl)";
  if (capacity === 120) return "BUS articulé (120pl)";
  if (capacity === 40) return "CAR (40pl)";
  return capacity > 0 ? `Autre (${capacity}pl)` : "";
}

const isCancelled = (status: string) => status === "annule";

/** Ligne de la feuille BUS (colonnes `BUS_HEADER`). */
export function busRow(o: BillingBus): XlsxCell[] {
  const active = o.buses.filter((b) => !b.cancelled);
  const first = (k: "planned" | "actual") =>
    active
      .map((b) => b[k])
      .filter(Boolean)
      .sort()[0] ?? "";
  const ends = active
    .map((b) => b.demob)
    .filter(Boolean)
    .sort();
  const dropped = o.buses.length - active.length;
  const remark = [
    isCancelled(o.status) ? `Annulé${o.cancelReason ? ` : ${o.cancelReason}` : ""}` : "",
    dropped > 0 ? `${dropped} bus annulé${dropped > 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const legs = o.roundTrip ? 2 : 1;
  return [
    frDay(o.day),
    o.relation,
    redactorLabel(o.author),
    "",
    o.buses.length || null,
    "",
    remark,
    o.callTime,
    first("planned"),
    first("actual"),
    ends[ends.length - 1] ?? "",
    isCancelled(o.status) ? 0 : active.length,
    composition(o.capacity),
    o.company,
    active
      .map((b) => b.plate)
      .filter(Boolean)
      .join(", "),
    o.passengers || null,
    o.roundTrip ? "A/R" : "Aller",
    o.origin,
    o.destination,
    isCancelled(o.status) ? 0 : active.length * legs,
    o.direct ? "Direct" : "Omnibus",
    o.lines.join(", "),
    o.reason,
    "",
    o.orderRef || (o.number ? `n° ${o.number}` : ""),
    "",
  ];
}

const withVias = (to: string, vias: string[]) =>
  vias.length ? `${to} (via ${vias.join(", ")})` : to;

/** Ligne de la feuille TAXI (colonnes `TAXI_HEADER`). */
export function taxiRow(o: BillingTaxi): XlsxCell[] {
  const cancelled = isCancelled(o.status)
    ? `ANNULÉ${o.cancelReason ? ` : ${o.cancelReason}` : ""}`
    : "";
  return [
    frDay(o.day),
    o.orderRef || (o.number ? `n° ${o.number}` : ""),
    o.time,
    redactorLabel(o.author),
    o.vehicles || null,
    o.company,
    o.passengers || null,
    o.from,
    o.roundTrip ? "A/R" : "Aller",
    withVias(o.to, o.vias),
    [cancelled, o.reason].filter(Boolean).join(" · "),
    o.billing,
    o.relation,
    "",
    "",
  ];
}

/** Ligne de la feuille TAXI PMR (colonnes `TAXI_PMR_HEADER`) : n° de dossier, jamais le nom du voyageur. */
export function taxiPmrRow(o: BillingTaxi): XlsxCell[] {
  const cancel = isCancelled(o.status)
    ? [o.cancelledAt, o.cancelReason].filter(Boolean).join(" · ") || "Annulé"
    : "";
  return [
    frDay(o.requestDay),
    frDay(o.day),
    o.time,
    redactorLabel(o.author),
    o.vehicles || null,
    o.company,
    o.passengers || null,
    o.from,
    o.roundTrip ? "A/R" : "Aller",
    withVias(o.to, o.vias),
    cancel,
    o.pmrReason,
    o.billing,
    o.pmrFile,
    [o.orderRef || (o.number ? `n° ${o.number}` : ""), o.relation].filter(Boolean).join(" · "),
    "",
    "",
  ];
}

export type BillingScope = {
  /** Code du district (« DSO »). */
  district: string;
  /** « MOIS de NOVEMBRE 2026 » ou « SEMAINE 45 · du 2 au 8 novembre 2026 ». */
  period: string;
  /** Jour d'envoi « AAAA-MM-JJ ». */
  sentOn: string;
};

/** « MOIS de NOVEMBRE 2026 ». */
export const monthPeriod = (month: string) =>
  `MOIS de ${MONTHS_UP[+month.slice(5, 7) - 1] ?? ""} ${month.slice(0, 4)}`;

const byDay = <T extends { day: string; orderRef: string }>(a: T, b: T) =>
  a.day.localeCompare(b.day) || a.orderRef.localeCompare(b.orderRef);

/**
 * Feuille BUS : en-tête (date d'envoi, titre, période), puis une section par société (la plus utilisée d'abord ;
 * « AUTRE SOCIETE » pour les bons sans société) avec son en-tête de colonnes et une ligne de total.
 */
export function busSheet(orders: BillingBus[], scope: BillingScope): XlsxSheet {
  const last = colName(BUS_HEADER.length - 2); // titre et période jusqu'à l'avant-dernière colonne (C3)
  const rows: XlsxCell[][] = [
    ["DATE D'ENVOI :", "", "", `Transports alternatifs BUS ${scope.district}`],
    [" (du fichier à la facturation)"],
    [scope.period],
  ];
  rows[0]![1] = frDay(scope.sentOn);
  const merges = [`A2:B2`, `D1:${last}2`, `A3:${last}3`];
  const bold = [0, 1, 2];
  const groups = new Map<string, BillingBus[]>();
  for (const o of orders) {
    const k = o.company.trim();
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const named = [...groups.entries()]
    .filter(([k]) => k)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "fr"));
  const sections: [string, BillingBus[]][] = [...named];
  if (groups.get("")?.length) sections.push(["AUTRE SOCIETE", groups.get("")!]);
  const span = colName(BUS_HEADER.length - 2);
  for (const [title, list] of sections) {
    rows.push([]);
    rows.push([title]);
    merges.push(`A${rows.length}:${span}${rows.length}`);
    bold.push(rows.length - 1);
    rows.push(BUS_HEADER.map((h) => (h === "Dispo société" ? `Dispo ${title}`.slice(0, 60) : h)));
    bold.push(rows.length - 1);
    const sorted = [...list].sort(byDay);
    for (const o of sorted) rows.push(busRow(o));
    const total = (i: number) =>
      sorted.reduce((s, o) => {
        const v = busRow(o)[i];
        return s + (typeof v === "number" ? v : 0);
      }, 0);
    const totalRow: XlsxCell[] = Array(BUS_HEADER.length).fill("");
    totalRow[0] = "Total";
    totalRow[11] = total(11);
    totalRow[15] = total(15);
    totalRow[19] = total(19);
    rows.push(totalRow);
    bold.push(rows.length - 1);
  }
  if (!sections.length) {
    rows.push([]);
    rows.push(["Aucun bon bus sur la période."]);
  }
  return {
    name: "BUS",
    rows,
    bold,
    merges,
    widths: [
      11, 20, 14, 10, 9, 8, 30, 9, 10, 10, 9, 8, 14, 18, 14, 9, 9, 18, 18, 9, 10, 12, 26, 12, 14,
      12,
    ],
  };
}

function taxiLike(
  name: string,
  title: string,
  header: string[],
  rowsOf: XlsxCell[][],
  scope: BillingScope,
  widths: number[],
): XlsxSheet {
  const last = colName(Math.min(header.length, 15) - 3);
  return {
    name,
    rows: [[title], [scope.period], header, ...rowsOf],
    bold: [0, 1, 2],
    merges: [`A1:${last}1`, `A2:${last}2`],
    widths,
  };
}

/** Classeur complet (BUS, TAXI, TAXI PMR, Données). `companies` : sociétés de bus et de taxi de CSM (listes). */
export function billingWorkbook(
  data: { bus: BillingBus[]; taxi: BillingTaxi[] },
  scope: BillingScope,
  companies: { bus: string[]; taxi: string[] } = { bus: [], taxi: [] },
): XlsxSheet[] {
  const byTaxiDay = (a: BillingTaxi, b: BillingTaxi) =>
    `${a.day}T${a.time}`.localeCompare(`${b.day}T${b.time}`) ||
    a.orderRef.localeCompare(b.orderRef);
  const std = data.taxi.filter((t) => !t.isPmr).sort(byTaxiDay);
  const pmr = data.taxi.filter((t) => t.isPmr).sort(byTaxiDay);
  const lists: XlsxCell[][] = [
    ["COMPOSITION", "", "A CHARGE DE", "", "MOTIF (TAXI PMR)", "", "SOCIETE (BUS)", "", "TAXI"],
  ];
  const n = Math.max(
    BILLING_COMPOSITIONS.length,
    BILLING_CHARGES.length,
    BILLING_PMR_MOTIFS.length,
    companies.bus.length,
    companies.taxi.length,
  );
  for (let i = 0; i < n; i++)
    lists.push([
      BILLING_COMPOSITIONS[i] ?? "",
      "",
      BILLING_CHARGES[i] ?? "",
      "",
      BILLING_PMR_MOTIFS[i] ?? "",
      "",
      companies.bus[i] ?? "",
      "",
      companies.taxi[i] ?? "",
    ]);
  return [
    busSheet(data.bus, scope),
    taxiLike(
      "TAXI",
      `Transports alternatifs TAXI ${scope.district}`,
      TAXI_HEADER,
      std.map(taxiRow),
      scope,
      [12, 13, 10, 14, 9, 19, 9, 16, 9, 22, 40, 14, 17, 11, 12],
    ),
    taxiLike(
      "TAXI PMR",
      `Transports alternatifs TAXI PMR ${scope.district}`,
      TAXI_PMR_HEADER,
      pmr.map(taxiPmrRow),
      scope,
      [11, 11, 10, 14, 9, 18, 9, 16, 9, 18, 30, 38, 14, 18, 22, 12, 30],
    ),
    { name: "Données", rows: lists, widths: [22, 2, 24, 2, 80, 2, 24, 2, 24] },
  ];
}
