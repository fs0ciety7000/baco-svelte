import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";

// Export de Ressources › Gares (14 oct. 2026) : CSV pour les coordinateurs, `?format=json` pour reprendre les districts
// d'une instance comme référentiel par défaut (`src/data/station-districts.json`, voir `scripts/station-seed.mjs`).
// Données d'exploitation seulement (aucune donnée personnelle). Ni invité ni Écran (comme la page).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cell = (v: string | number | boolean) => {
  const s = String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401 });
  // Même droit que l'onglet Gares et la lecture de `stations` (rôles v3, lot L2).
  if (!can(user, "timetable:read")) return new Response("Introuvable", { status: 404 });
  const pb = await pbForRequest();
  const rows = await pb.collection("stations").getFullList({
    sort: "name",
    fields:
      "key,name,name_nl,abbr,uic,country,kind,district,district_manual,district_suggested,lines,lines_manual",
  });
  const json = new URL(request.url).searchParams.get("format") === "json";
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (json) {
    return Response.json(
      rows.map((r) => ({
        key: r.key,
        name: r.name,
        district: r.district,
        manual: !!r.district_manual,
        kind: r.kind,
        lines: Array.isArray(r.lines) ? r.lines : [],
        linesManual: !!r.lines_manual,
      })),
      { headers },
    );
  }
  const head = [
    "Gare",
    "Nom NL",
    "Abréviation",
    "UIC",
    "Pays",
    "Type",
    "District",
    "District saisi",
    "Proposition",
    "Lignes",
  ];
  const body = rows.map((r) =>
    [
      r.name,
      r.name_nl,
      r.abbr,
      r.uic,
      r.country,
      r.kind,
      r.district,
      r.district_manual ? "oui" : "non",
      r.district_suggested,
      (Array.isArray(r.lines) ? r.lines : []).join(", "),
    ]
      .map(cell)
      .join(";"),
  );
  return new Response(`﻿${[head.join(";"), ...body].join("\r\n")}\r\n`, {
    headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="csm-gares.csv"',
    },
  });
}
