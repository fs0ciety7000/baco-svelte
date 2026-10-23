import { formatShortDay } from "@/lib/orders/time";

import {
  ALIGN_LABEL,
  FUNCTION_LABEL,
  KIND_LABEL,
  type AlignStatus,
  type OpenFunction,
  type OpenKind,
} from "./model";
import { xlsxWorkbook, type XlsxCell } from "@/lib/xlsx";

// Export des services Quinyx non pourvus (23 oct. 2026) : mêmes colonnes en CSV, Excel et PDF. Pur, testé.

export type OpenRow = {
  zone: string;
  day: string;
  from: string;
  to: string;
  code: string;
  section: string;
  kind: OpenKind;
  function: OpenFunction;
  district: string;
  status: AlignStatus;
  /** Zone de l'agent qui a fait les deux postes (fusion). */
  coveredBy: string;
  /** « +SE » / « +SO ». */
  marker: string;
};

/** « Couvert par fusion (+SE, agent OCC Mons) » / « Sans agent ». */
export function coverText(r: Pick<OpenRow, "status" | "coveredBy" | "marker">): string {
  if (r.status !== "fusion") return ALIGN_LABEL.vide;
  const who = [r.marker, r.coveredBy ? `agent ${r.coveredBy}` : ""].filter(Boolean).join(", ");
  return who ? `${ALIGN_LABEL.fusion} (${who})` : ALIGN_LABEL.fusion;
}

export const OPEN_COLUMNS = [
  "Date",
  "Jour",
  "Zone",
  "District",
  "Fonction",
  "Service",
  "Début",
  "Fin",
  "Couverture",
  "Type Quinyx",
  "Section",
] as const;

const WEEKDAY = new Intl.DateTimeFormat("fr-BE", { weekday: "long", timeZone: "UTC" });

/** Jour de la semaine d'un jour « AAAA-MM-JJ » (« lundi »). */
export function weekday(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : WEEKDAY.format(d);
}

/** Une ligne d'export (textes) ; la date reste ISO dans le CSV / Excel pour trier, « jj/mm » au PDF. */
export function openCells(r: OpenRow): string[] {
  return [
    r.day,
    weekday(r.day),
    r.zone,
    r.district,
    FUNCTION_LABEL[r.function],
    KIND_LABEL[r.kind],
    r.from,
    r.to,
    coverText(r),
    r.code,
    r.section,
  ];
}

/** Totaux : par zone, par fonction, par service (AM / PM / Nuit). */
export function openTotals(rows: OpenRow[]) {
  const count = <K extends string>(key: (r: OpenRow) => K) => {
    const m = new Map<K, number>();
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"));
  };
  return {
    total: rows.length,
    fusion: rows.filter((r) => r.status === "fusion").length,
    empty: rows.filter((r) => r.status === "vide").length,
    /** « PACO AM », « PACO Nuit », « RCCA PM »… (la nuit n'existe qu'en PACO). */
    services: count((r) => `${FUNCTION_LABEL[r.function]} ${KIND_LABEL[r.kind]}`),
    zones: count((r) => r.zone),
    functions: count((r) => FUNCTION_LABEL[r.function]),
    kinds: count((r) => KIND_LABEL[r.kind]),
  };
}

const csvCell = (v: string) => {
  // Formules neutralisées (=, +, -, @) à l'ouverture dans un tableur.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** CSV « ; » avec BOM (Excel en français l'ouvre directement). */
export function openCsv(rows: OpenRow[]): string {
  const lines = [OPEN_COLUMNS.join(";"), ...rows.map((r) => openCells(r).map(csvCell).join(";"))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Classeur Excel : feuille « Non pourvus » (une ligne par service) + feuille « Totaux ». */
export function openXlsx(rows: OpenRow[], title: string): Uint8Array {
  const t = openTotals(rows);
  const totals: XlsxCell[][] = [
    [title],
    [],
    ["Postes non alignés", t.total],
    ["Couverts par fusion (+SE / +SO)", t.fusion],
    ["Sans agent", t.empty],
    [],
    ["Par prestation", "Services"],
    ...t.services.map(([k, n]): XlsxCell[] => [k, n]),
    [],
    ["Par zone", "Services"],
    ...t.zones.map(([k, n]): XlsxCell[] => [k, n]),
    [],
    ["Par fonction", "Services"],
    ...t.functions.map(([k, n]): XlsxCell[] => [k, n]),
    [],
    ["Par service", "Services"],
    ...t.kinds.map(([k, n]): XlsxCell[] => [k, n]),
  ];
  return xlsxWorkbook([
    {
      name: "Non pourvus",
      rows: [[...OPEN_COLUMNS], ...rows.map((r) => openCells(r))],
      widths: [12, 11, 18, 9, 9, 8, 7, 7, 34, 18, 18],
    },
    { name: "Totaux", rows: totals, widths: [32, 10] },
  ]);
}

/** Lignes du tableau PDF : date courte, zone, fonction, service, horaire, type Quinyx. */
export function openPdfRows(rows: OpenRow[]): string[][][] {
  return rows.map((r) => [
    [formatShortDay(r.day), weekday(r.day)],
    [r.zone, r.district],
    [FUNCTION_LABEL[r.function]],
    [KIND_LABEL[r.kind]],
    [`${r.from} – ${r.to}`],
    r.status === "fusion"
      ? [`Fusion ${r.marker}`.trim(), r.coveredBy ? `agent ${r.coveredBy}` : ""].filter(Boolean)
      : [ALIGN_LABEL.vide],
    [r.code, r.section].filter(Boolean),
  ]);
}

/** Nom de fichier : « services-non-alignes-2026-10 » / « services-non-alignes-2026 ». */
export function openFileName(year: number, month: number): string {
  return `services-non-alignes-${year}${month ? `-${String(month).padStart(2, "0")}` : ""}`;
}
