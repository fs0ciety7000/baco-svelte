import { brusselsDay } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { openPeriodLabel, parseOpenFilter } from "@/lib/quinyx/model";
import { openCsv, openFileName, openPdfRows, openTotals, openXlsx } from "@/lib/quinyx/open-export";
import { openFilterText } from "@/lib/quinyx/open-filter-text";
import { getCurrentUser } from "@/server/auth";
import { listOpenShifts, openZones } from "@/server/data/quinyx-open";
import { openShiftsPdf } from "@/server/pdf/order-pdf";

// Services Quinyx non pourvus (23 oct. 2026) : route de lecture et d'export, droit `quinyx_open:read` (admin / sysop par
// défaut). `?format=json` (défaut), `csv`, `xlsx` ou `pdf` ; filtres `annee`, `mois` (0 = année entière), `zone` (n° de
// groupe Quinyx, répétable), `fonction` (paco / rcca), `type` (am / pm / nuit). Aucune donnée personnelle.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Non connecté." }, { status: 401 });
  if (!can(user, "quinyx_open:read"))
    return Response.json({ error: "Introuvable." }, { status: 404 });
  const sp = new URL(request.url).searchParams;
  const filter = parseOpenFilter(sp, brusselsDay());
  const format = (sp.get("format") ?? "json").toLowerCase();
  let zones, shifts;
  try {
    zones = await openZones();
    shifts = await listOpenShifts(filter, zones);
  } catch {
    return Response.json({ error: "Lecture impossible." }, { status: 502 });
  }
  const name = openFileName(filter.year, filter.month);
  const headers = (type: string, ext: string) => ({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${name}.${ext}"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (format === "csv")
    return new Response(openCsv(shifts), { headers: headers("text/csv; charset=utf-8", "csv") });
  if (format === "xlsx")
    return new Response(
      Buffer.from(openXlsx(shifts, `Services non pourvus · ${openPeriodLabel(filter)}`)),
      {
        headers: headers(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "xlsx",
        ),
      },
    );
  if (format === "pdf") {
    const pdf = await openShiftsPdf(
      {
        period: openPeriodLabel(filter),
        filters: openFilterText(filter, zones),
        totals: openTotals(shifts),
        rows: openPdfRows(shifts),
      },
      { agentName: String(user.name || user.username || "") },
    );
    return new Response(Buffer.from(pdf), { headers: headers("application/pdf", "pdf") });
  }
  if (format !== "json") return Response.json({ error: "Format inconnu." }, { status: 400 });
  return Response.json(
    {
      period: { year: filter.year, month: filter.month, label: openPeriodLabel(filter) },
      filters: filter,
      totals: openTotals(shifts),
      shifts: shifts.map((s) => ({
        zone: s.zone,
        groupId: s.groupId,
        district: s.district,
        day: s.day,
        from: s.from,
        to: s.to,
        start: s.start,
        end: s.end,
        function: s.function,
        kind: s.kind,
        code: s.code,
        section: s.section,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
