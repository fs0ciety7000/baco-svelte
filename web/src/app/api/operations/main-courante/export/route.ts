import { z } from "zod";

import { CATEGORY } from "@/lib/ops/log";
import { addDays, brusselsTime, dayOf, isValidDay, pbDate } from "@/lib/orders/time";
import { can, isAdmin } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { listLog } from "@/server/data/ops";

// Export CSV de la main courante (un jour ou une période de 31 jours au plus), entrées actives seulement,
// sans pièce jointe. Formules neutralisées, BOM pour Excel.

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
  if (!can(user, "journal:read")) return new Response("Introuvable", { status: 404 });
  const sp = new URL(request.url).searchParams;
  const du = z.string().refine(isValidDay).safeParse(sp.get("du"));
  const au = z.string().refine(isValidDay).safeParse(sp.get("au"));
  if (!du.success || !au.success || au.data < du.data || au.data > addDays(du.data, 30))
    return new Response("Période invalide (31 jours au plus)", { status: 400 });
  const coordinator = isAdmin(user) || user.role === "moderator";
  const lines = [
    [
      "Date",
      "Heure",
      "Catégorie",
      "Urgent",
      "Auteur",
      "District",
      "Texte",
      "Train",
      "Liens",
      "Lu par",
    ].join(";"),
  ];
  for (let d = du.data; d <= au.data; d = addDays(d, 1)) {
    const { rows } = await listLog({ jour: d }, { coordinator });
    for (const r of [...rows].reverse()) {
      const at = pbDate(r.occurredAt);
      lines.push(
        [
          dayOf(r.occurredAt),
          at ? brusselsTime(at) : "",
          CATEGORY[r.category].label,
          r.urgent ? "oui" : "",
          r.authorName,
          r.district,
          r.body,
          r.train,
          r.links.map((l) => l.label).join(" | "),
          r.readers.length,
        ]
          .map(cell)
          .join(";"),
      );
    }
  }
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="main-courante-${du.data}${au.data !== du.data ? `-${au.data}` : ""}.csv"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
