import type { Metadata } from "next";

import { TaxiOrderView } from "@/components/orders/taxi-order-view";
import { TaxiForm } from "@/components/orders/taxi-form";
import { can } from "@/lib/permissions";
import { officeFor } from "@/lib/orders/mail";
import { DISTRICTS, taxiDraftSchema } from "@/lib/orders/schemas";
import { brusselsDay, brusselsTime, formatShortDay } from "@/lib/orders/time";
import { requirePermission } from "@/server/auth";
import {
  getTemplateData,
  listTemplates,
  recentOwnOrders,
  taxiReference,
} from "@/server/data/orders";

export const metadata: Metadata = { title: "Nouveau bon de commande taxi · CSM" };

// Gare de départ par défaut selon le district de l'agent (fin du « Mons » codé en dur de BACO).
const DEFAULT_STATION: Record<string, string> = {
  "Sud-Ouest": "Mons",
  "Sud-Est": "Namur",
  Centre: "Bruxelles-Midi",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ modele?: string; id?: string }>;
}) {
  const user = await requirePermission("generate_taxi:write");
  const { modele, id } = await searchParams;
  // Brouillon déjà créé sur cette page (URL remplacée après le 1er enregistrement) : même route, même fiche.
  if (id && /^[a-z0-9-]{15,36}$/.test(id)) return <TaxiOrderView id={id} user={user} />;
  const [reference, templates, recent] = await Promise.all([
    taxiReference(),
    listTemplates("taxi"),
    recentOwnOrders("taxi", user.id),
  ]);
  const fromTemplate = modele ? await getTemplateData("taxi", modele).catch(() => null) : null;
  const base = taxiDraftSchema.safeParse(fromTemplate ?? {});
  const district = (DISTRICTS as readonly string[]).includes(user.district) ? user.district : "";
  const draft = base.success ? base.data : taxiDraftSchema.parse({});
  const initial = {
    ...draft,
    trip_day: brusselsDay(),
    trip_time: brusselsTime(),
    from_station: draft.from_station || DEFAULT_STATION[district] || "",
    district: district as (typeof draft)["district"],
    // Un modèle ne lie pas de client PMR (données personnelles propres à chaque commande).
    pmr_client: "",
  };
  // Même structure que la fiche (div > formulaire clé « brouillon ») : après le 1er enregistrement, le
  // rafraîchissement rend la fiche sans remonter le formulaire.
  return (
    <div className="flex flex-col gap-6">
      <TaxiForm
        key="brouillon"
        orderId={null}
        number={null}
        status="brouillon"
        statusBeforeCancel=""
        updated={null}
        initial={initial}
        canWrite
        canPmr={can(user, "pmr:read")}
        coordinator={false}
        client={null}
        reference={reference}
        officeEmail={officeFor(district).email}
        start={{
          recent: recent.map((r) => ({
            id: r.id,
            title: `${r.origin || "?"} → ${r.destination || "?"}`,
            meta: `${formatShortDay(r.day)} ${r.time} · ${r.company || "taxi ?"}${r.isPmr ? " · PMR" : ""}`,
          })),
          templates,
        }}
      />
    </div>
  );
}
