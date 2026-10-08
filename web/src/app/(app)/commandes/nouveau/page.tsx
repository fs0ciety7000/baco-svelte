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
  searchParams: Promise<{ modele?: string; id?: string }>;
}) {
  const user = await requirePermission("otto:write");
  const { modele, id } = await searchParams;
  // Brouillon déjà créé sur cette page (URL remplacée après le 1er enregistrement) : même route, même fiche.
  if (id && /^[a-z0-9-]{15,36}$/.test(id)) return <BusOrderView id={id} user={user} />;
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
  // Même structure que la fiche (div > formulaire clé « brouillon ») : après le 1er enregistrement, le
  // rafraîchissement rend la fiche sans remonter le formulaire.
  return (
    <div className="flex flex-col gap-6">
      <BusForm
        key="brouillon"
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
