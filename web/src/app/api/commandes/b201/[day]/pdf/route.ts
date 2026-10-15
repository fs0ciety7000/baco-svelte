import { DISTRICTS } from "@/lib/orders/schemas";
import { z } from "zod";

import { parseDistricts } from "@/lib/district-param";
import { handoverText } from "@/lib/ops/handover";
import { markdownToPdfLines, noteSections } from "@/lib/ops/b201";
import { contentDisposition } from "@/lib/orders/eml";
import { brusselsDay, brusselsTime, isValidDay, PERIODS } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { b201Data, entriesByPeriod, SERVICE_LABEL } from "@/server/data/b201";
import { buildHandover, handoverDistricts } from "@/server/data/handover";
import { b201Pdf } from "@/server/pdf/order-pdf";

// PDF de la B201 d'un jour (lecture seule, données lues avec le jeton de l'agent) : notes de chaque district demandé
// (Markdown aplati, un titre par district, notes communes d'avant le 15 oct. en tête),
// synthèse de la relève (jour même, avec `journal:read`) et transports par période. Districts : codes ou noms, répétés ;
// aucun = tous (lien de la page : districts affichés).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

const fmt = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels",
  hour: "2-digit",
  minute: "2-digit",
});

export async function GET(request: Request, { params }: { params: Promise<{ day: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401, headers: HEADERS });
  const day = z
    .string()
    .refine(isValidDay)
    .safeParse((await params).day);
  if (!day.success || !can(user, "b201:read"))
    return new Response("Introuvable", { status: 404, headers: HEADERS });
  // Un ou plusieurs districts (paramètre répété, codes ou noms) ; vide = tous.
  const raw = new URL(request.url).searchParams.getAll("district");
  const districts = parseDistricts(raw, DISTRICTS);
  const district = districts.join(" + ");
  // Codes des districts demandés (notes par district) ; aucun = les trois de l'équipe.
  const codes = handoverDistricts(user, raw.length ? raw : "tous");
  const data = await b201Data(day.data, districts, user, codes);
  const groups = entriesByPeriod(data);
  const meta = (updated: string | null, by: string) => {
    const d = updated ? new Date(updated.replace(" ", "T")) : null;
    return d && !Number.isNaN(d.getTime())
      ? `Dernière modification à ${fmt.format(d)}${by ? ` par ${by}` : ""}.`
      : undefined;
  };
  const sections = noteSections(
    data.common,
    data.notes.map((n) => ({
      district: n.district,
      content: n.content,
      meta: meta(n.updated, n.updatedByName),
    })),
  );
  // Synthèse de la relève : instantané « maintenant », donc seulement pour la B201 du jour.
  let handover: ReturnType<typeof markdownToPdfLines> | undefined;
  if (day.data === brusselsDay() && can(user, "journal:read")) {
    const h = await buildHandover(user, codes).catch(() => null);
    if (h)
      handover = markdownToPdfLines(
        handoverText(h, {
          author: user.name || user.username || user.email,
          at: brusselsTime(new Date(h.generatedAt)),
          scope: codes.length ? codes.join(" · ") : "tous districts",
        }),
      );
  }
  const pdf = await b201Pdf(
    {
      day: day.data,
      district,
      notes: sections.map((s) => ({
        title: s.title,
        lines: markdownToPdfLines(s.markdown),
        meta: s.meta,
      })),
      handover,
      periods: PERIODS.map((p) => ({
        label: p.label,
        range: p.range,
        entries: groups[p.id].map((e) => ({
          service: SERVICE_LABEL[e.service],
          time: e.time,
          company: e.company,
          route: `${e.origin || "?"} → ${e.destination || "?"}`,
          ref: e.number ? `n° ${e.number}${e.ref ? ` · ${e.ref}` : ""}` : e.ref,
          manual: !e.orderId,
        })),
      })),
    },
    { agentName: user.name || user.username },
  );
  return new Response(new Blob([pdf as Uint8Array<ArrayBuffer>]), {
    headers: {
      ...HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(
        "inline",
        `${day.data} · B201${district ? ` · ${district}` : ""}.pdf`,
      ),
    },
  });
}
