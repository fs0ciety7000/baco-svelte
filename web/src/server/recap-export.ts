import "server-only";

import { billingWorkbook, monthPeriod } from "@/lib/orders/billing";
import {
  recapCounts,
  recapCsv,
  recapItems,
  recapKind,
  recapPdfName,
  recapRef,
  recapStatus,
  recapWeeks,
  type RecapItem,
} from "@/lib/orders/recap";
import { addDays, brusselsDay } from "@/lib/orders/time";
import { frDay } from "@/lib/orders/billing";
import {
  monthBounds,
  monthLabelFr,
  parseWeekKey,
  rangeLabel,
  weekBounds,
  weekLabel,
} from "@/lib/orders/week";
import { xlsxWorkbook, zipStore } from "@/lib/xlsx";
import type { SessionUser } from "@/server/auth";
import {
  busReference,
  getBusOrder,
  getTaxiOrder,
  orderAgent,
  pbForRequest,
  redactPmr,
} from "@/server/data/orders";
import { companyNames, recapOrders } from "@/server/data/recap";
import { env } from "@/server/env";
import { busOrderPdf, recapMonthPdf, taxiOrderPdf } from "@/server/pdf/order-pdf";

// Exports des récapitulatifs de bons (Commandes › Archives, 4 nov. 2026) : zip d'une semaine (PDF + recap.csv), PDF
// mensuel, fichier « Transports alternatifs » pour la facturation (mois ou semaine, par district). Lecture avec le jeton
// de l'agent ; les routes vérifient `archives:read` (et le middleware les bloque en « voir en tant que »).

/** Bornes : bons par zip, taille totale du zip. */
export const ZIP_MAX_ORDERS = 250;
export const ZIP_MAX_BYTES = 200 * 1024 * 1024;

const enc = new TextEncoder();
export const DISTRICT_CODES = ["DSO", "DSE", "DCE"] as const;

/** Période d'un fichier : « 2026-11 » (mois) ou « 2026-W45 » (semaine) ; null si mal formée. */
export function periodOf(
  key: string,
): { from: string; to: string; title: string; label: string; file: string; week?: boolean } | null {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) {
    const b = monthBounds(key);
    return { ...b, title: monthPeriod(key), label: monthLabelFr(key), file: key };
  }
  const w = parseWeekKey(key);
  if (!w) return null;
  const b = weekBounds(w);
  return {
    ...b,
    title: `SEMAINE ${w.week} · ${rangeLabel(b.from, b.to)}`,
    label: weekLabel(w),
    file: key,
    week: true,
  };
}

async function archivedPdf(
  pb: Awaited<ReturnType<typeof pbForRequest>>,
  rec: { id: string; file: string },
  token: string,
): Promise<Uint8Array | null> {
  const res = await fetch(
    `${env.PB_URL.replace(/\/$/, "")}/api/files/order_pdfs/${rec.id}/${encodeURIComponent(rec.file)}?token=${encodeURIComponent(token)}`,
    { cache: "no-store" },
  ).catch(() => null);
  if (!res?.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

async function freshPdf(item: RecapItem): Promise<Uint8Array | null> {
  try {
    if (item.kind === "bus") {
      const [order, ref] = await Promise.all([getBusOrder(item.id), busReference()]);
      return await busOrderPdf(order, { agentName: orderAgent(order.meta), drivers: ref.drivers });
    }
    // Comme l'archive : jamais de nominatif PMR dans un export qui sort de l'outil.
    const order = redactPmr(await getTaxiOrder(item.id));
    return await taxiOrderPdf(order, { agentName: orderAgent(order.meta) });
  } catch {
    return null;
  }
}

/** Zip d'une semaine : PDF de chaque bon (archivé, sinon produit à la volée) dans `bus/` et `taxi/`, et `recap.csv`. */
export async function weekZip(user: SessionUser, key: string): Promise<Uint8Array | null> {
  const p = periodOf(key);
  if (!p?.week) return null;
  const items = recapItems(await recapOrders(user, { from: p.from, to: p.to })).slice(
    0,
    ZIP_MAX_ORDERS,
  );
  const pb = await pbForRequest();
  const archived = new Map<string, { id: string; file: string }>();
  if (items.length) {
    const rows = await pb
      .collection("order_pdfs")
      .getFullList({
        // Jour de service de l'archive = celui du bon : une fenêtre d'un jour de marge suffit.
        filter: pb.filter("service_day >= {:a} && service_day <= {:b}", {
          a: addDays(p.from, -1),
          b: addDays(p.to, 1),
        }),
        fields: "id,kind,order_id,file",
        batch: 500,
      })
      .catch(() => []);
    for (const r of rows)
      if (typeof r.file === "string" && r.file)
        archived.set(`${String(r.kind)}-${String(r.order_id)}`, { id: r.id, file: r.file });
  }
  const token = archived.size ? await pb.files.getToken().catch(() => "") : "";
  const files: [string, Uint8Array][] = [];
  const state: Record<string, string> = {};
  const used = new Set<string>();
  let size = 0;
  for (const item of items) {
    const k = `${item.kind}-${item.id}`;
    if (size > ZIP_MAX_BYTES) {
      state[k] = "non inclus (zip trop volumineux)";
      continue;
    }
    const arch = archived.get(k);
    let bytes = arch && token ? await archivedPdf(pb, arch, token) : null;
    state[k] = bytes ? "PDF archivé" : "";
    if (!bytes) {
      bytes = await freshPdf(item);
      state[k] = bytes ? "PDF produit à l'export" : "PDF indisponible";
    }
    if (!bytes) continue;
    let name = recapPdfName(item);
    for (let n = 2; used.has(name); n++) name = recapPdfName(item).replace(/\.pdf$/, `-${n}.pdf`);
    used.add(name);
    files.push([name, bytes]);
    size += bytes.length;
  }
  files.push(["recap.csv", enc.encode(recapCsv(items, state))]);
  return zipStore(files);
}

/** PDF mensuel : bons du mois regroupés par semaine, totaux par semaine et du mois. */
export async function monthPdf(
  user: SessionUser,
  month: string,
  districts: string[],
): Promise<Uint8Array | null> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const b = monthBounds(month);
  const items = recapItems(await recapOrders(user, { ...b, districts }));
  const weeks = recapWeeks(items);
  return recapMonthPdf(
    {
      period: monthLabelFr(month),
      scope: districts.length ? `District ${districts.join(", ")}` : "Tous les districts",
      totals: recapCounts(items),
      weeks: weeks.map((w) => ({
        label: w.label,
        counts: w.counts,
        rows: w.items.map((i) => ({
          cancelled: i.status === "annule",
          cells: [
            [recapRef(i), recapKind(i)],
            [i.relation || "—"],
            [frDay(i.day), i.time],
            [i.route],
            [i.company || "—"],
            [String(i.vehicles)],
            [recapStatus(i.status)],
          ],
        })),
      })),
    },
    { agentName: String(user.name || user.username || "") },
  );
}

/** Fichier « Transports alternatifs » d'un district pour la facturation (mois « 2026-11 » ou semaine « 2026-W45 »). */
export async function billingXlsx(
  user: SessionUser,
  key: string,
  district: string,
): Promise<{ bytes: Uint8Array; name: string } | null> {
  const p = periodOf(key);
  if (!p || !(DISTRICT_CODES as readonly string[]).includes(district)) return null;
  const [data, companies] = await Promise.all([
    recapOrders(user, { from: p.from, to: p.to, districts: [district] }),
    companyNames(user),
  ]);
  const sheets = billingWorkbook(
    data,
    { district, period: p.title, sentOn: brusselsDay() },
    companies,
  );
  return {
    bytes: xlsxWorkbook(sheets),
    name: `Transports alternatifs ${district} ${p.file}.xlsx`,
  };
}
