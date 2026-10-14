import type { Metadata } from "next";

import { DirectoryBoard } from "@/components/referentiels/directory-board";
import { can } from "@/lib/permissions";
import { readDirectoryPrefs } from "@/lib/referentiels/directory";
import { requirePermission } from "@/server/auth";
import { listDirectory } from "@/server/data/referentiels";

export const metadata: Metadata = { title: "Annuaire · CSM" };

type SP = { q?: string; category?: string; zone?: string; group?: string; id?: string };

const param = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Annuaire (refonte du 14 oct. 2026) : toutes les fiches sont lues une fois avec le jeton de l'agent, la recherche et
 * les filtres tournent dans le navigateur (instantané, tolérant). Les paramètres d'URL (`q`, `category`, `zone`,
 * `group`, `id`) donnent l'état initial : lien partageable, et la recherche est déjà appliquée au rendu serveur.
 */
export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("repertoire:read");
  const f = await searchParams;
  const { entries, facets, updated } = await listDirectory();
  const id = param(f.id, 15);
  return (
    <DirectoryBoard
      entries={entries}
      facets={facets}
      updated={updated}
      initial={{
        q: param(f.q, 80),
        category: param(f.category, 60),
        zone: param(f.zone, 60),
        group: param(f.group, 120),
        id: /^[a-z0-9]{15}$/.test(id) ? id : "",
      }}
      prefs={readDirectoryPrefs(user.preferences)}
      canWrite={can(user, "repertoire:write")}
      canUpdate={can(user, "repertoire:update")}
      canDelete={can(user, "repertoire:delete")}
    />
  );
}
