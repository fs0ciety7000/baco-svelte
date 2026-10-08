import { z } from "zod";

import { isValidDay } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { ASSIST_STATUS, DIRECTION_IO, DIRECTION_LABEL } from "@/lib/pmr/model";
import { getCurrentUser } from "@/server/auth";
import { listAssists } from "@/server/data/pmr";

// Export CSV des prestations filtrées, SANS nom de client ni remarque (décision du 8 octobre 2026 : exports sans nom).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cell = (v: string | number) => {
  const s = String(v);
  // Neutralise les formules (=, +, -, @) à l'ouverture dans un tableur.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401 });
  if (!can(user, "deplacements:read")) return new Response("Introuvable", { status: 404 });
  const sp = new URL(request.url).searchParams;
  const du = z.string().refine(isValidDay).safeParse(sp.get("du"));
  const au = z.string().refine(isValidDay).safeParse(sp.get("au"));
  if (!du.success || !au.success) return new Response("Dates invalides", { status: 400 });
  const { rows } = await listAssists(
    {
      from: du.data,
      to: au.data,
      district: sp.get("district") ?? undefined,
      status: sp.get("statut") ?? undefined,
      q: sp.get("q") ?? undefined,
    },
    // Droit réel pour la recherche (même résultat que l'historique) ; le CSV ne contient jamais de nom.
    { canPmr: can(user, "pmr:read"), order: "asc", all: true },
  );
  const head = [
    "Date",
    "Heure",
    "Gare",
    "Autre gare",
    "District",
    "Sens",
    "IN/OUT",
    "Train",
    "Nombre",
    "Type",
    "Réf. DICOS",
    "Statut",
    "Voyageur lié",
  ];
  const lines = rows.map((a) =>
    [
      a.day,
      a.time,
      a.station,
      a.otherStation,
      a.district,
      DIRECTION_LABEL[a.direction] ?? "",
      DIRECTION_IO[a.direction]?.io ?? "",
      a.train,
      a.pax,
      a.pmrType,
      a.dicosRef,
      ASSIST_STATUS[a.status].label,
      a.clientId || a.clientName ? "oui" : "non",
    ]
      .map(cell)
      .join(";"),
  );
  // BOM UTF-8 : accents corrects à l'ouverture dans Excel.
  const body = `\uFEFF${[head.join(";"), ...lines].join("\r\n")}\r\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prestations-pmr-${du.data}-${au.data}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
