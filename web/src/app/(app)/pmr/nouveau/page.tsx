import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AssistForm } from "@/components/pmr/assist-form";
import { can } from "@/lib/permissions";
import { brusselsDay, isValidDay } from "@/lib/orders/time";
import { requirePermission } from "@/server/auth";
import { getAssist, listZones } from "@/server/data/pmr";

export const metadata: Metadata = { title: "Prestation PMR · CSM" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; jour?: string }>;
}) {
  const user = await requirePermission("deplacements:write");
  const { id, jour } = await searchParams;
  const canPmr = can(user, "pmr:read");
  const zones = await listZones();
  const day = isValidDay(jour) ? jour : brusselsDay();
  if (id) {
    const a = await getAssist(id, canPmr).catch(() => null);
    if (!a || a.anonymized) notFound();
    return (
      <AssistForm
        mode="edit"
        assistId={a.id}
        defaultDay={a.day}
        zones={zones}
        canPmr={canPmr}
        initialClient={
          canPmr && a.clientId
            ? {
                id: a.clientId,
                lastName: a.clientName,
                firstName: "",
                phone: a.clientPhone,
                type: a.pmrType,
              }
            : null
        }
        initial={[
          {
            day: a.day,
            time: a.time,
            direction: (a.direction as "arrivee" | "depart" | "") || "",
            train: a.train,
            station: a.station,
            zone: a.zone,
            dicos_ref: a.dicosRef,
            pax: a.pax,
            pmr_type: (a.pmrType as never) || "",
            client: a.clientId,
            note: a.note,
          },
        ]}
      />
    );
  }
  return (
    <AssistForm
      mode="create"
      defaultDay={day}
      zones={zones}
      canPmr={canPmr}
      initialClient={null}
      initial={[
        {
          day,
          time: "",
          direction: "",
          train: "",
          station: "",
          zone: "",
          dicos_ref: "",
          pax: 1,
          pmr_type: "",
          client: "",
          note: "",
        },
      ]}
    />
  );
}
