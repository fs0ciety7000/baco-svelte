import { ClientResponseError } from "pocketbase";
import { z } from "zod";

import { contentDisposition } from "@/lib/orders/eml";
import { busFilename, taxiFilename } from "@/lib/orders/mail";
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

// Bon de commande PDF (affiché dans le navigateur). Lecture seule : le statut n'est jamais modifié ici.

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

  try {
    let pdf: Uint8Array;
    let filename: string;
    if (kind === "bus") {
      const [order, ref] = await Promise.all([getBusOrder(id), busReference()]);
      pdf = await busOrderPdf(order, { agentName: orderAgent(order.meta), drivers: ref.drivers });
      filename = busFilename(order.draft);
    } else {
      const order = await getTaxiOrder(id).then((o) => (can(user, "pmr:read") ? o : redactPmr(o)));
      pdf = await taxiOrderPdf(order, { agentName: orderAgent(order.meta) });
      filename = taxiFilename(order.draft);
    }
    return new Response(new Blob([pdf as Uint8Array<ArrayBuffer>]), {
      headers: {
        ...HEADERS,
        "Content-Type": "application/pdf",
        // `?download=1` : téléchargement (envoi sans e-mail) ; sinon aperçu dans le navigateur.
        "Content-Disposition": contentDisposition(
          new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline",
          filename,
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
