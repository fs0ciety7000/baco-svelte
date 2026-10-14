import type { Metadata } from "next";

import { RefAdminList } from "@/components/admin/referentiels/ref-admin-list";
import { ReferenceAdmin } from "@/components/admin/referentiels/reference-admin";
import { requirePermission } from "@/server/auth";
import { adminSpi, SPI_ISSUES } from "@/server/data/admin-referentiels";

export const metadata: Metadata = { title: "Points SPI · Référentiels · CSM" };

type Search = { q?: string; page?: string; anomalie?: string };

/**
 * Administration › Référentiels › Points SPI : zones SPI par ligne (lues dans la fiche d'une ligne, Réseau › Lignes). La
 * ligne s'écrit comme dans BACO (« L.96 » ou « 96 » : les deux formes sont retrouvées).
 */
export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("referentiels:manage");
  const sp = await searchParams;
  const res = await adminSpi(sp);
  const anomalie = sp.anomalie && sp.anomalie in SPI_ISSUES ? sp.anomalie : "";
  return (
    <RefAdminList
      base="/admin/referentiels/spi"
      q={(sp.q ?? "").trim()}
      anomalie={anomalie}
      issues={SPI_ISSUES}
      page={res.page}
      totalPages={res.totalPages}
      total={res.total}
      placeholder="Ligne, lieu, zone, adresse…"
    >
      <ReferenceAdmin
        kind="spi"
        noun={{ one: "un point SPI", the: "le point SPI" }}
        rows={res.rows}
        fields={[
          { name: "line", label: "Ligne", required: true, max: 20, placeholder: "L.96" },
          { name: "place", label: "Lieu", max: 200 },
          {
            name: "zone",
            label: "Zone",
            max: 10,
            upper: true,
            placeholder: "MS",
            hint: "Code de zone PMR (2 à 10 lettres ou chiffres).",
          },
          { name: "address", label: "Adresse", max: 500 },
          { name: "notes", label: "Remarques", max: 1000, type: "textarea" },
        ]}
        columns={[
          { name: "line", label: "Ligne", mono: true },
          { name: "place", label: "Lieu" },
          { name: "zone", label: "Zone", mono: true },
          { name: "address", label: "Adresse" },
        ]}
        titleFields={["line", "place"]}
        metaFields={["zone", "address"]}
        canCreate
        canUpdate
        canDelete
      />
    </RefAdminList>
  );
}
