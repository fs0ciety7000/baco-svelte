import type { Metadata } from "next";

import { RefAdminList } from "@/components/admin/referentiels/ref-admin-list";
import { ReferenceAdmin } from "@/components/admin/referentiels/reference-admin";
import { requirePermission } from "@/server/auth";
import { adminPtcar, PTCAR_ISSUES } from "@/server/data/admin-referentiels";

export const metadata: Metadata = { title: "PtCar · Référentiels · CSM" };

type Search = { q?: string; page?: string; anomalie?: string };

/** Administration › Référentiels › PtCar : abréviations des points du réseau (abréviation unique, noms FR / NL). */
export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("referentiels:manage");
  const sp = await searchParams;
  const res = await adminPtcar(sp);
  const anomalie = sp.anomalie && sp.anomalie in PTCAR_ISSUES ? sp.anomalie : "";
  return (
    <RefAdminList
      base="/admin/referentiels/ptcar"
      q={(sp.q ?? "").trim()}
      anomalie={anomalie}
      issues={PTCAR_ISSUES}
      page={res.page}
      totalPages={res.totalPages}
      total={res.total}
      placeholder="Abréviation, nom FR ou NL…"
    >
      <ReferenceAdmin
        kind="ptcar"
        noun={{ one: "un PtCar", the: "le PtCar" }}
        rows={res.rows}
        fields={[
          {
            name: "abbr",
            label: "Abréviation",
            required: true,
            max: 20,
            upper: true,
            placeholder: "FMS",
          },
          { name: "name_fr", label: "Nom (FR)", max: 200, placeholder: "Mons" },
          { name: "name_nl", label: "Nom (NL)", max: 200, placeholder: "Bergen" },
        ]}
        columns={[
          { name: "abbr", label: "Abréviation", mono: true },
          { name: "name_fr", label: "Nom (FR)" },
          { name: "name_nl", label: "Nom (NL)" },
        ]}
        titleFields={["abbr", "name_fr"]}
        metaFields={["name_nl"]}
        canCreate
        canUpdate
        canDelete
        deleteHint="Les écrans qui cherchent une gare par son abréviation ne la trouveront plus. Suppression tracée dans le journal d'audit."
      />
    </RefAdminList>
  );
}
