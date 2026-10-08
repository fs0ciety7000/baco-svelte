import { z } from "zod";

import { contentDisposition } from "@/lib/orders/eml";
import { isValidDay, PERIODS } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { b201Data, entriesByPeriod, SERVICE_LABEL } from "@/server/data/b201";
import { b201Pdf } from "@/server/pdf/order-pdf";

// PDF de la remise B201 d'un jour (lecture seule, données lues avec le jeton de l'agent).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request, { params }: { params: Promise<{ day: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401, headers: HEADERS });
  const day = z
    .string()
    .refine(isValidDay)
    .safeParse((await params).day);
  if (!day.success || !can(user, "b201:read"))
    return new Response("Introuvable", { status: 404, headers: HEADERS });
  const d = new URL(request.url).searchParams.get("district") ?? "";
  const district = ["Sud-Ouest", "Sud-Est", "Centre"].includes(d) ? d : "";
  const data = await b201Data(day.data, district || undefined, user);
  const groups = entriesByPeriod(data);
  const pdf = await b201Pdf(
    {
      day: day.data,
      district,
      periods: PERIODS.map((p) => ({
        label: p.label,
        range: p.range,
        note: data.notes[p.id],
        entries: groups[p.id].map((e) => ({
          service: SERVICE_LABEL[e.service],
          time: e.time,
          company: e.company,
          route: `${e.origin || "?"} → ${e.destination || "?"}`,
          ref: e.number ? `n° ${e.number}${e.ref ? ` · ${e.ref}` : ""}` : e.ref,
          manual: !e.orderId,
        })),
      })),
      next: data.notes.suivant,
    },
    { agentName: user.name || user.username },
  );
  return new Response(new Blob([pdf as Uint8Array<ArrayBuffer>]), {
    headers: {
      ...HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(
        "inline",
        `${day.data} · Remise B201${district ? ` · ${district}` : ""}.pdf`,
      ),
    },
  });
}
