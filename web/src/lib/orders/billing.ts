// Fichier « Transports alternatifs » envoyé à la facturation (4 nov. 2026) : un classeur par mois (ou par semaine) et par
// district, mis en page comme le fichier tenu jusqu'ici à la main (feuilles BUS, TAXI, TAXI PMR, Données). Les colonnes
// que CSM ne connaît pas (disponibilité, reçu, n° de facture…) restent vides pour l'équipe de facturation. Mise en forme
// relevée sur le classeur de référence (polices Arial, fonds, bordures, largeurs, hauteurs, fusions, dates en vraies dates
// Excel « jj/mm/aaaa », totaux par formules SUM des colonnes « Nbr de bus » et « Nbr de personnes »).
// Colonne « C3 » des bus : une coche verte « ✔ » (demande de l'utilisateur du 4 nov. 2026, le fichier tenu à la main y
// mettait « V »), jamais le n° de commande. CMD-… dans « N°PACO » pour les taxis et en tête de « Référence » pour les taxis
// PMR. Jamais de nom de voyageur. Pur, testé.

import { colName, excelDate, type XlsxCell, type XlsxSheet, type XlsxStyle } from "@/lib/xlsx";

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
  "Dispo Kim Cars / Degrève", // société appelée d'abord : Kim Cars partout, Degrève pour Ath et Tournai
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

/**
 * Bus fournis d'un bon : lignes non annulées, plus une ligne annulée qui porte une plaque ou une heure d'arrivée réelle
 * (le bus est venu puis a été démobilisé : « démob. annulation » des bons repris de BACO). Un bon annulé garde ses bus
 * (le classeur de référence compte aussi les bons annulés, avec « Annulé » en remarque).
 */
export function providedBuses(o: BillingBus): BillingBusLine[] {
  return o.buses.filter((b) => !b.cancelled || !!b.plate || !!b.actual);
}

/** Ligne de la feuille BUS (colonnes `BUS_HEADER`). */
export function busRow(o: BillingBus): XlsxCell[] {
  const provided = providedBuses(o);
  const requested = o.buses.length;
  const first = (k: "planned" | "actual") =>
    provided
      .map((b) => b[k])
      .filter(Boolean)
      .sort()[0] ?? "";
  const ends = provided
    .map((b) => b.demob)
    .filter(Boolean)
    .sort();
  const dropped = requested - provided.length;
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
    requested || null,
    requested ? Math.round((provided.length / requested) * 100) / 100 : null,
    remark,
    o.callTime,
    first("planned"),
    first("actual"),
    ends[ends.length - 1] ?? "",
    provided.length,
    composition(o.capacity),
    o.company,
    provided
      .map((b) => b.plate)
      .filter(Boolean)
      .join(", "),
    o.passengers || null,
    o.roundTrip ? "A/R" : "Aller",
    o.origin,
    o.destination,
    provided.length * legs,
    o.direct ? "Direct" : "Omnibus",
    o.lines.join(", "),
    o.reason,
    "",
    "✔",
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

// --- Mise en forme (relevée sur le classeur de référence) ---

const ARIAL = "Arial";
const MED = "medium" as const;
const BOX = { left: MED, right: MED, top: MED, bottom: MED };
const GRID = { left: "thin", right: "thin", top: "thin", bottom: "thin" } as const;
const CENTER = { h: "center", v: "center", wrap: true } as const;
const DATE_FMT = "dd/mm/yyyy";

export const BILLING_STYLE = {
  sentLabel: {
    font: { name: ARIAL, size: 11, bold: true, color: "C00000" },
    fill: "FFBDBD",
    border: BOX,
    align: CENTER,
  },
  sentDate: {
    font: { name: ARIAL, size: 14, bold: true, color: "000000" },
    fill: "D6DCE4",
    border: BOX,
    align: CENTER,
    numFmt: DATE_FMT,
  },
  busTitle: {
    font: { name: ARIAL, size: 24, bold: true, color: "000000" },
    fill: "BDD7EE",
    border: BOX,
    align: CENTER,
  },
  taxiTitle: {
    font: { name: ARIAL, size: 24, bold: true, color: "000000" },
    fill: "FFE699",
    border: BOX,
    align: CENTER,
  },
  pmrTitle: {
    font: { name: ARIAL, size: 24, bold: true, color: "000000" },
    fill: "C6E0B4",
    border: BOX,
    align: CENTER,
  },
  busPeriod: {
    font: { name: ARIAL, size: 16, bold: true, color: "C00000" },
    fill: "FFE699",
    border: BOX,
    align: CENTER,
  },
  taxiPeriod: {
    font: { name: ARIAL, size: 16, bold: true, color: "C00000" },
    fill: "FBE4D5",
    border: BOX,
    align: CENTER,
  },
  section: {
    font: { name: ARIAL, size: 20, bold: true },
    fill: "C6E0B4",
    border: BOX,
    align: CENTER,
  },
  sectionOther: {
    font: { name: ARIAL, size: 20, bold: true },
    fill: "FFE699",
    border: BOX,
    align: CENTER,
  },
  header: {
    font: { name: ARIAL, size: 10, bold: true },
    fill: "D9D9D9",
    border: BOX,
    align: CENTER,
  },
  data: { font: { name: ARIAL, size: 10 }, border: GRID, align: CENTER },
  total: { font: { name: ARIAL, size: 10, bold: true }, border: BOX, align: CENTER },
} satisfies Record<string, XlsxStyle>;

const withFont = (s: XlsxStyle, font: NonNullable<XlsxStyle["font"]>): XlsxStyle => ({
  ...s,
  font: { ...s.font, ...font },
});

const plain = (v: XlsxCell) => (typeof v === "object" && v !== null ? v.v : v);

/** Ligne de données mise en forme ; les colonnes de date (`dates`, texte « jj/mm/aaaa ») deviennent des dates Excel. */
function styledRow(
  values: XlsxCell[],
  special: Record<number, XlsxStyle>,
  dates: number[],
): XlsxCell[] {
  return values.map((v, c) => {
    const s = special[c] ?? BILLING_STYLE.data;
    const raw = plain(v);
    if (dates.includes(c) && typeof raw === "string") {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
      const serial = m ? excelDate(`${m[3]}-${m[2]}-${m[1]}`) : null;
      return { v: serial ?? raw, s: { ...s, numFmt: DATE_FMT } };
    }
    return { v: raw, s };
  });
}

/** Cellules vides portant un style (fond et bordures d'une zone fusionnée). */
const filled = (n: number, s: XlsxStyle): XlsxCell[] => Array.from({ length: n }, () => ({ s }));

const BUS_SPECIAL: Record<number, XlsxStyle> = {
  0: withFont(BILLING_STYLE.data, { bold: true }),
  1: withFont(BILLING_STYLE.data, { bold: true, color: "FF0000" }),
  5: { ...BILLING_STYLE.data, numFmt: "0%" },
  13: withFont(BILLING_STYLE.data, { bold: true, color: "0000FF" }),
  24: {
    ...withFont(BILLING_STYLE.data, { bold: true, color: "00B050" }),
    align: { h: "center", v: "center" },
  },
};

/**
 * Feuille BUS : en-tête (date d'envoi, titre, période), puis une section par société (la plus utilisée d'abord ;
 * « AUTRE SOCIETE » pour les bons sans société) avec son en-tête de colonnes et une ligne de total (formules SUM des
 * colonnes « Nbr de bus » et « Nbr de personnes », comme le classeur de référence).
 */
export function busSheet(orders: BillingBus[], scope: BillingScope): XlsxSheet {
  const n = BUS_HEADER.length;
  const last = colName(n - 3); // X : titre et période jusqu'à « A charge de »
  const span = colName(n - 2); // Y : sections jusqu'à « C3 »
  const sent = excelDate(scope.sentOn);
  const row1 = filled(n - 2, BILLING_STYLE.busTitle);
  row1[0] = { v: "DATE D'ENVOI :", s: BILLING_STYLE.sentLabel };
  row1[1] = { s: BILLING_STYLE.sentLabel };
  row1[2] = { v: sent ?? frDay(scope.sentOn), s: BILLING_STYLE.sentDate };
  row1[3] = { v: `Transports alternatifs BUS ${scope.district}`, s: BILLING_STYLE.busTitle };
  const row2 = filled(n - 2, BILLING_STYLE.busTitle);
  row2[0] = { v: " (du fichier à la facturation)", s: BILLING_STYLE.sentLabel };
  row2[1] = { s: BILLING_STYLE.sentLabel };
  row2[2] = { s: BILLING_STYLE.sentDate };
  const row3 = filled(n - 2, BILLING_STYLE.busPeriod);
  row3[0] = { v: scope.period, s: BILLING_STYLE.busPeriod };
  const rows: XlsxCell[][] = [row1, row2, row3];
  const merges = ["A1:B1", "A2:B2", "C1:C2", `D1:${last}2`, `A3:${last}3`];
  const heights: Record<number, number> = { 0: 21.75, 1: 30, 2: 30.75 };
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
  for (const [title, list] of sections) {
    rows.push([]);
    const style = title === "AUTRE SOCIETE" ? BILLING_STYLE.sectionOther : BILLING_STYLE.section;
    const head = filled(n - 1, style);
    head[0] = { v: title, s: style };
    rows.push(head);
    heights[rows.length - 1] = 27;
    merges.push(`A${rows.length}:${span}${rows.length}`);
    rows.push(
      BUS_HEADER.map((h, c) => ({
        v: h,
        s:
          c === 24
            ? {
                ...BILLING_STYLE.header,
                font: { name: ARIAL, size: 11, bold: true, color: "0070C0" },
                fill: "E2EFDA",
              }
            : c === 19
              ? withFont(BILLING_STYLE.header, { size: 9 })
              : BILLING_STYLE.header,
      })),
    );
    heights[rows.length - 1] = 48;
    const firstData = rows.length + 1;
    const sorted = [...list].sort(byDay);
    const values = sorted.map(busRow);
    for (const v of values) {
      rows.push(styledRow(v, BUS_SPECIAL, [0]));
      heights[rows.length - 1] = 25.5;
    }
    const lastData = rows.length;
    const total: XlsxCell[] = Array.from({ length: n }, () => null);
    total[0] = { v: "TOTAL", s: BILLING_STYLE.total };
    for (const c of [11, 15]) {
      const L = colName(c);
      const sum = values.reduce(
        (acc, v) => acc + (typeof v[c] === "number" ? (v[c] as number) : 0),
        0,
      );
      total[c] = { f: `SUM(${L}${firstData}:${L}${lastData})`, v: sum, s: BILLING_STYLE.total };
    }
    rows.push(total);
    heights[rows.length - 1] = 21;
  }
  if (!sections.length) {
    rows.push([]);
    rows.push([
      { v: "Aucun bon bus sur la période.", s: { font: { name: ARIAL, size: 10, italic: true } } },
    ]);
  }
  return {
    name: "BUS",
    rows,
    merges,
    heights,
    landscape: true,
    fitWidth: true,
    defaultFont: { name: ARIAL, size: 10 },
    widths: [
      11.29, 20, 13.71, 10, 10, 8.5, 32.86, 8.29, 10.5, 10.5, 9.5, 8.14, 12.57, 13.29, 13.57, 8.29,
      13.57, 14.57, 14.57, 7.29, 13, 9.86, 23.71, 13.57, 12, 17.14,
    ],
  };
}

type TaxiLikeStyles = {
  title: XlsxStyle;
  period: XlsxStyle;
  header: XlsxStyle;
  headerHeight: number;
};

function taxiLike(
  name: string,
  styles: TaxiLikeStyles,
  title: string,
  header: string[],
  rowsOf: XlsxCell[][],
  scope: BillingScope,
  opts: {
    /** Dernière colonne des zones fusionnées du titre et de la période (index). */
    span: number;
    widths: number[];
    special: Record<number, XlsxStyle>;
    dates: number[];
    small: number[];
  },
): XlsxSheet {
  const last = colName(opts.span);
  const r1 = filled(opts.span + 1, styles.title);
  r1[0] = { v: title, s: styles.title };
  const r2 = filled(opts.span + 1, styles.period);
  r2[0] = { v: scope.period, s: styles.period };
  const head = header.map((h, c) => ({
    v: h,
    s: opts.small.includes(c) ? withFont(styles.header, { size: 9 }) : styles.header,
  }));
  const heights: Record<number, number> = { 0: 30.75, 1: 20.25, 2: styles.headerHeight };
  const data = rowsOf.map((r, i) => {
    heights[i + 3] = 25.5;
    return styledRow(r, opts.special, opts.dates);
  });
  return {
    name,
    rows: [r1, r2, head, ...data],
    merges: [`A1:${last}1`, `A2:${last}2`],
    heights,
    freeze: "A4",
    landscape: true,
    fitWidth: true,
    defaultFont: { name: ARIAL, size: 10 },
    widths: opts.widths,
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
  const listHead: XlsxStyle = { ...BILLING_STYLE.header, align: { h: "left", v: "center" } };
  const listCell: XlsxStyle = { font: { name: ARIAL, size: 10 } };
  return [
    busSheet(data.bus, scope),
    taxiLike(
      "TAXI",
      {
        title: BILLING_STYLE.taxiTitle,
        period: BILLING_STYLE.taxiPeriod,
        header: {
          ...BILLING_STYLE.header,
          font: { name: ARIAL, size: 10, color: "000000" },
          fill: "D6DCE4",
        },
        headerHeight: 52.5,
      },
      `Transports alternatifs TAXI ${scope.district}`,
      TAXI_HEADER,
      std.map(taxiRow),
      scope,
      {
        span: 12,
        widths: [
          12.71, 13.29, 12.86, 12.43, 9.5, 19.14, 12.14, 14, 15.29, 16, 55.14, 20, 17.14, 11.57,
          11.86,
        ],
        special: {
          1: withFont(BILLING_STYLE.data, { bold: true, color: "008080" }),
          5: withFont(BILLING_STYLE.data, { bold: true, color: "183CC9" }),
          12: withFont(BILLING_STYLE.data, { bold: true, color: "FF0000" }),
        },
        dates: [0],
        small: [6, 7, 8],
      },
    ),
    taxiLike(
      "TAXI PMR",
      {
        title: BILLING_STYLE.pmrTitle,
        period: BILLING_STYLE.taxiPeriod,
        header: BILLING_STYLE.header,
        headerHeight: 36.75,
      },
      `Transports alternatifs TAXI PMR ${scope.district}`,
      TAXI_PMR_HEADER,
      pmr.map(taxiPmrRow),
      scope,
      {
        span: 14,
        widths: [
          11.29, 11.57, 13, 13.29, 15.57, 17.71, 9.71, 12.29, 11.43, 16, 36, 38.29, 14.14, 25.14,
          21.71, 17.29, 40,
        ],
        special: { 5: withFont(BILLING_STYLE.data, { bold: true, color: "1F3864" }) },
        dates: [0, 1],
        small: [6, 7, 8],
      },
    ),
    {
      name: "Données",
      rows: lists.map((r, i) => r.map((v) => ({ v: plain(v), s: i === 0 ? listHead : listCell }))),
      defaultFont: { name: ARIAL, size: 10 },
      heights: { 0: 21 },
      widths: [22, 2, 24, 2, 80, 2, 24, 2, 24],
    },
  ];
}
