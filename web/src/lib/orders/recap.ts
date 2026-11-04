// Récapitulatif des bons par semaine (Commandes › Archives, 4 nov. 2026) : lignes communes bus / taxi, compteurs, CSV du
// zip de la semaine. Pur, testé. Jamais de nom de voyageur (les données d'entrée n'en portent pas).

import type { BillingBus, BillingTaxi } from "./billing";
import { frDay } from "./billing";
import { orderRefLabel } from "./order-ref";
import { STATUS_LABEL } from "./status";
import { groupByWeek, weekLabel, type IsoWeek } from "./week";

export type RecapItem = {
  kind: "bus" | "taxi";
  id: string;
  orderRef: string;
  number: number;
  status: string;
  day: string;
  time: string;
  /** N° TC (bus) ou référence / relation (taxi). */
  relation: string;
  route: string;
  company: string;
  /** Bus actifs, ou véhicules du taxi. */
  vehicles: number;
  isPmr: boolean;
};

export type RecapCounts = { bus: number; taxi: number; cancelled: number; vehicles: number };

export type RecapWeek = {
  key: string;
  week: IsoWeek;
  label: string;
  items: RecapItem[];
  counts: RecapCounts;
};

type WithId = { id: string };

export function recapItems(data: {
  bus: (BillingBus & WithId)[];
  taxi: (BillingTaxi & WithId)[];
}): RecapItem[] {
  const out: RecapItem[] = [
    ...data.bus.map((o): RecapItem => {
      const active = o.buses.filter((b) => !b.cancelled);
      return {
        kind: "bus",
        id: o.id,
        orderRef: o.orderRef,
        number: o.number,
        status: o.status,
        day: o.day,
        time:
          active
            .map((b) => b.planned)
            .filter(Boolean)
            .sort()[0] ??
          o.callTime ??
          "",
        relation: o.relation,
        route: `${o.origin || "?"} → ${o.destination || "?"}`,
        company: o.company,
        vehicles: o.status === "annule" ? 0 : active.length,
        isPmr: false,
      };
    }),
    ...data.taxi.map((o): RecapItem => ({
      kind: "taxi",
      id: o.id,
      orderRef: o.orderRef,
      number: o.number,
      status: o.status,
      day: o.day,
      time: o.time,
      relation: o.relation,
      route: [o.from || "?", ...o.vias, o.to || "?"].join(" → "),
      company: o.company,
      vehicles: o.status === "annule" ? 0 : o.vehicles,
      isPmr: o.isPmr,
    })),
  ];
  return out.sort(
    (a, b) =>
      `${a.day}T${a.time || "99:99"}`.localeCompare(`${b.day}T${b.time || "99:99"}`) ||
      a.orderRef.localeCompare(b.orderRef),
  );
}

export function recapCounts(items: RecapItem[]): RecapCounts {
  return {
    bus: items.filter((i) => i.kind === "bus").length,
    taxi: items.filter((i) => i.kind === "taxi").length,
    cancelled: items.filter((i) => i.status === "annule").length,
    vehicles: items.reduce((s, i) => s + i.vehicles, 0),
  };
}

/** Semaines ISO (la plus récente d'abord) des bons. */
export function recapWeeks(items: RecapItem[]): RecapWeek[] {
  return groupByWeek(items, (i) => i.day).map((g) => ({
    key: g.key,
    week: g.week,
    label: weekLabel(g.week),
    items: g.rows,
    counts: recapCounts(g.rows),
  }));
}

/** Désignation et statut affichés. */
export const recapRef = (i: RecapItem) => orderRefLabel(i.orderRef, i.number);
export const recapStatus = (s: string) => (STATUS_LABEL as Record<string, string>)[s] ?? s;
export const recapKind = (i: RecapItem) =>
  i.kind === "bus" ? "Bus" : i.isPmr ? "Taxi PMR" : "Taxi";

/** Nom de fichier du PDF d'un bon dans le zip : « bus/CMD-7K4P2M.pdf » (repli sur l'identifiant). */
export function recapPdfName(i: RecapItem): string {
  const base = (i.orderRef || `bon-${i.number || i.id}`).replace(/[^A-Za-z0-9_-]/g, "_");
  return `${i.kind}/${base}.pdf`;
}

/** Cellule CSV neutralisée (formules) et échappée. */
function cell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** `recap.csv` du zip de la semaine (BOM, « ; »). `pdf` : état du PDF de chaque bon (clé `kind-id`). */
export function recapCsv(items: RecapItem[], pdf: Record<string, string> = {}): string {
  const head = [
    "Type",
    "N° de commande",
    "N° TC / référence",
    "Date",
    "Heure",
    "Trajet",
    "Société",
    "Véhicules",
    "Statut",
    "PDF",
  ];
  const lines = items.map((i) =>
    [
      recapKind(i),
      recapRef(i),
      i.relation,
      frDay(i.day),
      i.time,
      i.route,
      i.company,
      i.vehicles,
      recapStatus(i.status),
      pdf[`${i.kind}-${i.id}`] ?? "",
    ]
      .map(cell)
      .join(";"),
  );
  return `﻿${[head.join(";"), ...lines].join("\r\n")}\r\n`;
}
