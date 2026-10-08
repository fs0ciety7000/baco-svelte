import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { loadStats } from "@/server/data/stats";

// Export CSV des agrégats affichés (aucune donnée nominative). Formules neutralisées, BOM pour Excel.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cell = (v: string | number) => {
  const s = String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401 });
  if (!can(user, "stats:read")) return new Response("Introuvable", { status: 404 });
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const { from, to, stats } = await loadStats(sp, {
    canTaxi: can(user, "taxi:read"),
    canPmr: can(user, "deplacements:read"),
  });
  const rows: (string | number)[][] = [["Section", "Libellé", "Valeur", "Détail"]];
  const t = stats.totals;
  rows.push(["Période", `${from} → ${to}`, "", ""]);
  rows.push(
    ["Totaux", "Commandes bus", t.bus, ""],
    ["Totaux", "Bus mobilisés", t.buses, ""],
    ["Totaux", "Taxis", t.taxi, ""],
  );
  rows.push([
    "Totaux",
    "Confirmation médiane (min)",
    t.medianConfirm === null ? "" : Math.round(t.medianConfirm),
    "",
  ]);
  rows.push(["Totaux", "Annulations", t.cancelled, `${Math.round(t.cancelRate * 100)} %`]);
  if (t.assists !== null) rows.push(["Totaux", "Prestations PMR", t.assists, ""]);
  for (const s of stats.series)
    rows.push([
      `Volume par ${stats.granularity}`,
      s.label,
      s.bus + s.taxi,
      `${s.bus} bus · ${s.taxi} taxis`,
    ]);
  for (const [name, list] of [
    ["Type C3", stats.byType],
    ["District", stats.byDistrict],
    ["Motif", stats.byReason],
    ["Ligne", stats.byLine],
    ["Trajet", stats.routes],
  ] as const)
    for (const i of list) rows.push([name, i.label, i.value, ""]);
  for (const s of stats.suppliers)
    rows.push([
      "Fournisseur",
      s.name,
      s.orders,
      `${s.buses} bus · ${s.cancelled} annulée(s) · confirmation ${s.medianConfirm === null ? "—" : `${Math.round(s.medianConfirm)} min`}`,
    ]);
  if (stats.pmr) {
    for (const i of stats.pmr.byStation) rows.push(["PMR par gare", i.label, i.value, ""]);
    for (const i of stats.pmr.byType) rows.push(["PMR par type", i.label, i.value, ""]);
  }
  return new Response(`﻿${rows.map((r) => r.map(cell).join(";")).join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="statistiques-${from}-${to}.csv"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
