import { notFound } from "next/navigation";

import { BusForm } from "@/components/orders/bus-form";
import { OrderHistory } from "@/components/orders/order-history";
import { can } from "@/lib/permissions";
import { officeFor } from "@/lib/orders/mail";
import { isCoordinator } from "@/lib/orders/status";
import type { SessionUser } from "@/server/auth";
import { busReference, getBusOrder, listEvents } from "@/server/data/orders";

/** Fiche d'une commande bus (formulaire + historique), partagée par /commandes/bus/[id] et /commandes/nouveau?id=. */
export async function BusOrderView({ id, user }: { id: string; user: SessionUser }) {
  const order = await getBusOrder(id).catch(() => null);
  if (!order) notFound();
  const [reference, events] = await Promise.all([busReference(), listEvents("bus", id)]);
  const { meta } = order;
  return (
    <div className="flex flex-col gap-6">
      <BusForm
        // Remonté après une transition (le statut change) : la saisie repart de la version serveur. Pas de clé
        // sur `updated`, sinon chaque rafraîchissement après un enregistrement automatique remonterait le formulaire.
        key={meta.status}
        orderId={meta.id}
        number={meta.number}
        status={meta.status}
        statusBeforeCancel={meta.statusBeforeCancel}
        updated={meta.updated}
        initial={order.draft}
        canWrite={can(user, "otto:write")}
        coordinator={isCoordinator(user.role)}
        reference={reference}
        officeEmail={officeFor(order.draft.district).email}
      />
      <section
        aria-labelledby="historique"
        className="flex max-w-[45rem] flex-col gap-3 border border-border bg-surface p-4"
      >
        <h2 id="historique" className="label-mono text-fg-muted">
          Historique
        </h2>
        {meta.status === "annule" && meta.cancelReason ? (
          <p className="text-body text-danger">Annulée : {meta.cancelReason}</p>
        ) : null}
        <OrderHistory events={events} />
      </section>
    </div>
  );
}
