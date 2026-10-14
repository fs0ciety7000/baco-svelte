import type { Metadata } from "next";

import { RefAdminList } from "@/components/admin/referentiels/ref-admin-list";
import { ReferenceAdmin } from "@/components/admin/referentiels/reference-admin";
import { requirePermission } from "@/server/auth";
import { adminEbp, EBP_ISSUES } from "@/server/data/admin-referentiels";

export const metadata: Metadata = { title: "EBP · Référentiels · CSM" };

type Search = { q?: string; page?: string; anomalie?: string };

/** Administration › Référentiels › EBP : correspondances ligne / PtCar / abréviation / vue EBP. */
export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("referentiels:manage");
  const sp = await searchParams;
  const res = await adminEbp(sp);
  const anomalie = sp.anomalie && sp.anomalie in EBP_ISSUES ? sp.anomalie : "";
  return (
    <RefAdminList
      base="/admin/referentiels/ebp"
      q={(sp.q ?? "").trim()}
      anomalie={anomalie}
      issues={EBP_ISSUES}
      page={res.page}
      totalPages={res.totalPages}
      total={res.total}
      placeholder="Ligne, PtCar, abréviation, vue EBP…"
    >
      <ReferenceAdmin
        kind="ebp"
        noun={{ one: "une correspondance EBP", the: "la correspondance" }}
        rows={res.rows}
        fields={[
          { name: "ptcar", label: "PtCar", required: true, max: 200, placeholder: "Mons" },
          { name: "abbr", label: "Abréviation", max: 20, upper: true, placeholder: "FMS" },
          {
            name: "line",
            label: "Lignes",
            max: 60,
            placeholder: "L.96, L.97",
            hint: "Une ou plusieurs lignes.",
          },
          { name: "ebp_view", label: "Vue EBP", max: 120 },
        ]}
        columns={[
          { name: "ptcar", label: "PtCar" },
          { name: "abbr", label: "Abréviation", mono: true },
          { name: "line", label: "Lignes" },
          { name: "ebp_view", label: "Vue EBP", mono: true },
        ]}
        titleFields={["ptcar", "abbr"]}
        metaFields={["line", "ebp_view"]}
        canCreate
        canUpdate
        canDelete
      />
    </RefAdminList>
  );
}
