import { ClientResponseError } from "pocketbase";
import { z } from "zod";

import { buildEml, contentDisposition } from "@/lib/orders/eml";
import { busMail, taxiMail, type OrderMail } from "@/lib/orders/mail";
import { brusselsDay, pbDate } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import {
  busReference,
  getBusOrder,
  getTaxiOrder,
  orderAgent,
  redactPmr,
} from "@/server/data/orders";
import { busOrderPdf, taxiOrderPdf } from "@/server/pdf/order-pdf";

// Brouillon d'e-mail `.eml` (X-Unsent) avec le bon PDF joint : Outlook l'ouvre, l'agent vérifie
// l'expéditeur et envoie lui-même. Lecture seule : le statut n'est jamais modifié ici (l'agent confirme
// l'envoi ensuite dans CSM).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  kind: z.enum(["bus", "taxi"]),
  id: z.string().regex(/^[a-z0-9-]{15,36}$/),
});

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const plain = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return plain("Non connecté", 401);
  const p = paramsSchema.safeParse(await params);
  if (!p.success) return plain("Introuvable", 404);
  const { kind, id } = p.data;
  if (!can(user, kind === "bus" ? "otto:read" : "generate_taxi:read"))
    return plain("Introuvable", 404);

  const agentName = user.name || user.username;
  // `?relance=1` : brouillon de relance (bon envoyé non confirmé). La relance est notée dans l'historique par la
  // Server Action `remindSupplier`, jamais ici (GET sans effet).
  const reminder = new URL(request.url).searchParams.get("relance") === "1";
  const sentDayOf = (sentAt: string) => {
    const d = pbDate(sentAt);
    return d ? brusselsDay(d) : "";
  };
  try {
    let pdf: Uint8Array;
    let mail: OrderMail;
    if (kind === "bus") {
      const [order, ref] = await Promise.all([getBusOrder(id), busReference()]);
      pdf = await busOrderPdf(order, { agentName: orderAgent(order.meta), drivers: ref.drivers });
      mail = busMail(order, {
        agentName,
        reminder: reminder ? { sentDay: sentDayOf(order.meta.sentAt) } : undefined,
      });
    } else {
      const order = await getTaxiOrder(id).then((o) => (can(user, "pmr:read") ? o : redactPmr(o)));
      pdf = await taxiOrderPdf(order, { agentName: orderAgent(order.meta) });
      mail = taxiMail(order, {
        agentName,
        reminder: reminder ? { sentDay: sentDayOf(order.meta.sentAt) } : undefined,
      });
    }
    const eml = buildEml({
      ...mail,
      attachments: [{ filename: mail.filename, contentType: "application/pdf", content: pdf }],
    });
    return new Response(eml, {
      headers: {
        ...HEADERS,
        "Content-Type": "message/rfc822",
        "Content-Disposition": contentDisposition(
          "attachment",
          `${reminder ? "Relance · " : ""}${mail.filename.replace(/\.pdf$/, "")}.eml`,
        ),
      },
    });
  } catch (e) {
    // Règles PocketBase : commande inexistante ou non visible pour cet agent.
    if (e instanceof ClientResponseError && (e.status === 404 || e.status === 403))
      return plain("Introuvable", 404);
    throw e;
  }
}
