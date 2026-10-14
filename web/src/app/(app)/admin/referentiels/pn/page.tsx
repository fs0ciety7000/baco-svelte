import type { Metadata } from "next";
import Link from "next/link";

import { RefAdminList } from "@/components/admin/referentiels/ref-admin-list";
import { ReferenceAdmin } from "@/components/admin/referentiels/reference-admin";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { adminCrossings, PN_ISSUES } from "@/server/data/admin-referentiels";

export const metadata: Metadata = { title: "Passages à niveau · Référentiels · CSM" };

type Search = { q?: string; page?: string; anomalie?: string };

/**
 * Administration › Référentiels › Passages à niveau : vue tableau des PN. Les droits restent ceux de la Carte PN
 * (`carte_pn:write` / `update` / `delete`, décision du 14 oct. 2026) ; « Désactiver » retire un PN de la carte et de ⌘K
 * sans le supprimer (les messages du Journal qui le citent gardent leur lien). Placer un point : Réseau › Carte PN.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("referentiels:manage");
  const sp = await searchParams;
  const res = await adminCrossings(sp);
  const anomalie = sp.anomalie && sp.anomalie in PN_ISSUES ? sp.anomalie : "";
  return (
    <RefAdminList
      base="/admin/referentiels/pn"
      q={(sp.q ?? "").trim()}
      anomalie={anomalie}
      issues={PN_ISSUES}
      page={res.page}
      totalPages={res.totalPages}
      total={res.total}
      placeholder="Ligne, numéro, adresse, zone…"
    >
      <p className="text-small text-fg-muted">
        Pour placer un PN sur la carte, ouvre{" "}
        <Link href="/reseau/pn" className="link">
          Réseau › Carte PN
        </Link>{" "}
        ; ici, les coordonnées se saisissent en degrés décimaux (latitude 49 à 52, longitude 2 à 7).
      </p>
      <ReferenceAdmin
        kind="pn"
        noun={{ one: "un passage à niveau", the: "le PN" }}
        rows={res.rows}
        fields={[
          {
            name: "line",
            label: "Ligne",
            required: true,
            max: 20,
            upper: true,
            placeholder: "L.96",
          },
          { name: "number", label: "Numéro", required: true, max: 20, placeholder: "12 ou 12 bis" },
          { name: "bk", label: "Borne kilométrique", type: "number", placeholder: "34.5" },
          { name: "address", label: "Adresse", max: 500 },
          { name: "lat", label: "Latitude", type: "number", placeholder: "50.45" },
          { name: "lon", label: "Longitude", type: "number", placeholder: "3.95" },
          { name: "zone", label: "Zone", max: 10, upper: true, placeholder: "MS" },
          { name: "notes", label: "Remarques", max: 1000, type: "textarea" },
        ]}
        columns={[
          { name: "line", label: "Ligne", mono: true },
          { name: "number", label: "N°", mono: true },
          { name: "address", label: "Adresse" },
          { name: "zone", label: "Zone", mono: true },
        ]}
        titleFields={["line", "number"]}
        metaFields={["address", "zone"]}
        canCreate={can(user, "carte_pn:write")}
        canUpdate={can(user, "carte_pn:update")}
        canDelete={can(user, "carte_pn:delete")}
        deleteHint="Préfère « Désactiver » : un PN supprimé disparaît des messages du Journal qui le citent. Suppression tracée dans le journal d'audit."
      />
    </RefAdminList>
  );
}
