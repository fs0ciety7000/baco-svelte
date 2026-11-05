import type { Metadata } from "next";

import { DirectoryBoard } from "@/components/referentiels/directory-board";
import { parseDistricts } from "@/lib/district-param";
import { brusselsDay } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { readDirectoryPrefs } from "@/lib/referentiels/directory";
import { parseZoneParam, zonesOfDistricts } from "@/lib/referentiels/directory-model";
import { userDistricts } from "@/lib/team";
import { requirePermission } from "@/server/auth";
import { listDirectory } from "@/server/data/referentiels";

export const metadata: Metadata = { title: "Contacts · CSM" };

type SP = Record<string, string | string[] | undefined>;

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const param = (v: unknown, max: number) => {
  const x = first(v);
  return typeof x === "string" ? x.trim().slice(0, max) : "";
};
const all = (v: unknown) =>
  (Array.isArray(v) ? v : v === undefined ? [] : [v])
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.slice(0, 60))
    .slice(0, 40);

/**
 * Annuaire (refonte du 14 oct. 2026, annuaire v2 du 5 nov. 2026) : toutes les fiches sont lues une fois avec le jeton de
 * l'agent, la recherche et les filtres tournent dans le navigateur (instantané, tolérant). Les paramètres d'URL (`q`,
 * `service`, `zone` répété — absent = « Mes zones », `tous` = toutes —, `vue`, `id`) donnent l'état initial : lien
 * partageable, et la recherche est déjà appliquée au rendu serveur.
 */
export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("repertoire:read");
  const f = await searchParams;
  const { entries, services, zones, updated } = await listDirectory();
  // Districts du jour (noms « Sud-Ouest » ou codes) → codes des zones SPI (« Mes zones »).
  const districts = parseDistricts(userDistricts(user, brusselsDay()), [
    "DSO",
    "DSE",
    "DCE",
    "DNO",
    "DNE",
  ]);
  const mine = zonesOfDistricts(zones, districts);
  const id = param(f.id, 15);
  const service = param(f.service, 30);
  return (
    <DirectoryBoard
      entries={entries}
      services={services}
      zones={zones}
      mine={mine}
      updated={updated}
      initial={{
        q: param(f.q, 80),
        service: service === "-" || services.some((s) => s.key === service) ? service : "",
        zone: parseZoneParam(all(f.zone), mine),
        view: param(f.vue, 10) === "service" ? "service" : "zone",
        id: /^[a-z0-9]{15}$/.test(id) ? id : "",
      }}
      prefs={readDirectoryPrefs(user.preferences)}
      canWrite={can(user, "repertoire:write")}
      canUpdate={can(user, "repertoire:update")}
      canDelete={can(user, "repertoire:delete")}
    />
  );
}
