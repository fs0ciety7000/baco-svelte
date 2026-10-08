import { isAdmin } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { auditFilter, auditListSchema } from "@/server/data/admin";
import { pbForRequest } from "@/server/data/orders";

// Export CSV du journal d'audit filtré (admin/sysop). Formules neutralisées, BOM UTF-8, 5 000 lignes au plus.
// Le différentiel des collections nominatives (PMR, groupes, comptes) n'est pas exporté : un fichier local échapperait
// à la conservation de 12 mois (audit du 9 oct. 2026). Il reste consultable à l'écran.
const PERSONAL = /^(pmr_|group_missions$|users$|taxi_orders$)/;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return new Response("Introuvable", { status: 404 });
  const p = auditListSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!p.success) return new Response("Filtres invalides", { status: 400 });
  const pb = await pbForRequest();
  const filter = auditFilter(pb, p.data);
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await pb.collection("audit_log").getList(page, 500, { filter, sort: "-at" });
    rows.push(...res.items);
    if (page >= res.totalPages) break;
  }
  const head = ["date", "action", "collection", "fiche", "auteur", "reprise_baco", "changements"];
  const lines = rows.map((r) =>
    [
      r.at,
      r.action,
      r.collection,
      r.record,
      r.user,
      r.legacy ? "oui" : "",
      PERSONAL.test(String(r.collection)) ? "(données personnelles non exportées)" : r.changes,
    ]
      .map(cell)
      .join(";"),
  );
  const body = `﻿${[head.join(";"), ...lines].join("\r\n")}\r\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="journal-audit.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
