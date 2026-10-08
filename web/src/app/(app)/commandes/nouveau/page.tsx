import { randomUUID } from "node:crypto";

import type { Metadata } from "next";

import { BusOrderView } from "@/components/orders/bus-order-view";
import { BusForm } from "@/components/orders/bus-form";
import { officeFor } from "@/lib/orders/mail";
import { busDraftSchema } from "@/lib/orders/schemas";
import { brusselsDay, brusselsTime, formatShortDay } from "@/lib/orders/time";
import { requirePermission } from "@/server/auth";
import {
  busReference,
  getTemplateData,
  listTemplates,
  recentOwnOrders,
} from "@/server/data/orders";

export const metadata: Metadata = { title: "Nouveau bon de commande bus · CSM" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    modele?: string;
    id?: string;
    k?: string;
    origine?: string;
    destination?: string;
    relation?: string;
    motif?: string;
  }>;
}) {
  const user = await requirePermission("otto:write");
  const { modele, id, k, origine, destination, relation, motif } = await searchParams;
  const formKey = k && /^[a-z0-9]{8}$/.test(k) ? k : undefined;
  // Brouillon déjà créé sur cette page (URL remplacée après le 1er enregistrement) : même route, même fiche.
  if (id && /^[a-z0-9-]{15,36}$/.test(id))
    return <BusOrderView id={id} user={user} formKey={formKey} />;
  const [reference, templates, recent] = await Promise.all([
    busReference(),
    listTemplates("bus"),
    recentOwnOrders("bus", user.id),
  ]);
  const fromTemplate = modele ? await getTemplateData("bus", modele).catch(() => null) : null;
  const base = busDraftSchema.safeParse(fromTemplate ?? {});
  // Valeurs par défaut : date et heure à Bruxelles, district de l'agent (bug B6 de BACO corrigé).
  const initial = {
    ...(base.success ? base.data : busDraftSchema.parse({})),
    order_date: brusselsDay(),
    call_time: brusselsTime(),
    district: busDraftSchema.shape.district.catch("").parse(user.district),
  };
  // Pré-remplissage depuis les trains en direct (« Commander un bus de substitution »).
  const pre = (v: string | undefined, max: number) =>
    typeof v === "string"
      ? v
          .replace(/[\u0000-\u001f\u007f]/g, " ")
          .trim()
          .slice(0, max)
      : "";
  if (pre(origine, 200)) initial.origin = pre(origine, 200);
  if (pre(destination, 200)) initial.destination = pre(destination, 200);
  if (pre(relation, 200)) initial.relation = pre(relation, 200);
  if (pre(motif, 2000)) initial.reason = pre(motif, 2000);
  // Nouvel écran à chaque visite sans ?id : un 2e « Nouveau » ne reprend pas le brouillon précédent.
  const nonce = randomUUID().replace(/-/g, "").slice(0, 8);
  // Même structure que la fiche (div > formulaire, même clé) : après le 1er enregistrement, le
  // rafraîchissement rend la fiche sans remonter le formulaire.
  return (
    <div className="flex flex-col gap-6">
      <BusForm
        key={`nouveau-${nonce}-brouillon`}
        formKey={nonce}
        orderId={null}
        number={null}
        status="brouillon"
        statusBeforeCancel=""
        updated={null}
        initial={initial}
        canWrite
        coordinator={false}
        reference={reference}
        officeEmail={officeFor(initial.district).email}
        start={{
          recent: recent.map((r) => ({
            id: r.id,
            title: `${r.origin || "?"} → ${r.destination || "?"}`,
            meta: `${formatShortDay(r.day)} · ${r.company || "société ?"} · ${r.busCount} bus`,
          })),
          templates,
        }}
      />
    </div>
  );
}
