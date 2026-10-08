import { notFound } from "next/navigation";

import { OrderHistory } from "@/components/orders/order-history";
import { TaxiForm } from "@/components/orders/taxi-form";
import { can } from "@/lib/permissions";
import { officeFor } from "@/lib/orders/mail";
import { isCoordinator } from "@/lib/orders/status";
import type { SessionUser } from "@/server/auth";
import { getTaxiOrder, listEvents, redactPmr, taxiReference } from "@/server/data/orders";

/** Fiche d'une commande taxi, partagée par /commandes/taxi/[id] et /commandes/taxi/nouveau?id=. */
export async function TaxiOrderView({
  id,
  user,
  formKey,
}: {
  id: string;
  user: SessionUser;
  formKey?: string;
}) {
  const raw = await getTaxiOrder(id).catch(() => null);
  if (!raw) notFound();
  // Sans pmr:read, les données PMR copiées sur la commande ne sont pas transmises au navigateur.
  const order = can(user, "pmr:read") ? raw : redactPmr(raw);
  const [reference, events] = await Promise.all([taxiReference(), listEvents("taxi", id)]);
  const { meta } = order;
  // Commande reprise de BACO sans fiche liée : on montre la copie figée du client.
  const client =
    order.client ??
    (order.draft.is_pmr && order.snapshot.pmrLastName
      ? {
          id: "",
          lastName: order.snapshot.pmrLastName,
          firstName: order.snapshot.pmrFirstName,
          phone: order.snapshot.pmrPhone,
          type: order.draft.pmr_type,
        }
      : null);
  return (
    <div className="flex flex-col gap-6">
      <TaxiForm
        key={`${formKey ? `nouveau-${formKey}` : meta.id}-${meta.status}`}
        formKey={formKey}
        orderId={meta.id}
        number={meta.number}
        status={meta.status}
        statusBeforeCancel={meta.statusBeforeCancel}
        updated={meta.updated}
        initial={order.draft}
        canWrite={can(user, "generate_taxi:write")}
        canPmr={can(user, "pmr:read")}
        coordinator={isCoordinator(user.role)}
        client={client}
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
