"use server";

import { impactSeenKey, readTodoSeen } from "@/lib/dashboard/todo-seen";
import { addDays, brusselsDay, brusselsToUtc } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { impactedMissions } from "@/server/data/impacts";
import { pbForRequest, toPbInstant } from "@/server/data/orders";
import { irailHealth, type IrailHealth } from "@/server/irail";
import { dicosSyncState } from "@/server/data/pmr";
import { allow } from "@/server/rate-limit";

// Barre latérale (évolution « poste d'exploitation » du 11 oct. 2026) : un compteur par module (ce qui attend l'agent)
// et l'état des flux (DICOS). Lu avec le jeton de l'agent : chaque compteur suit ses droits. Aucun nom.

export type ShellStatus = {
  /** Bons envoyés non confirmés (Commandes), missions impactées par un retard (PMR), messages non lus 24 h (Opérations). */
  counts: { commandes?: number; pmr?: number; journal?: number };
  /** Dernière synchro DICOS (missions) reçue ; null = jamais ou sans droit. */
  dicosAt: string | null;
  /** État d'iRail vu par le serveur (dernier appel réel) ; null = aucun appel depuis 30 min. */
  irail: IrailHealth | null;
};

/** null = débit dépassé (le client garde les valeurs précédentes). */
export async function shellStatus(): Promise<ShellStatus | null> {
  const user = await requireUser();
  const out: ShellStatus = { counts: {}, dicosAt: null, irail: irailHealth() };
  // Relu à chaque changement en direct et toutes les 60 s : borne par agent (plusieurs onglets).
  if (!allow(`shell:${user.id}`, 40, 60_000)) return null;
  const pb = await pbForRequest();
  const count = async (collection: string, filter: string) =>
    (await pb.collection(collection).getList(1, 1, { filter, fields: "id" })).totalItems;

  const tasks: Promise<void>[] = [];
  const bus = can(user, "otto:read");
  const taxi = can(user, "generate_taxi:read");
  if (bus || taxi)
    tasks.push(
      Promise.all([
        bus ? count("bus_orders", 'status = "termine"') : 0,
        taxi ? count("taxi_orders", 'status = "termine"') : 0,
      ]).then(([a, b]) => void (out.counts.commandes = a + b)),
    );
  if (can(user, "deplacements:read"))
    tasks.push(
      // Compteur d'alerte : les impacts que l'agent a marqués « Vu » à l'accueil ne comptent plus (même clé, état compris).
      impactedMissions(user).then((l) => {
        const seen = readTodoSeen(user.preferences);
        const day = brusselsDay();
        out.counts.pmr = (l ?? []).filter((m) => !(impactSeenKey(m, day) in seen)).length;
      }),
      dicosSyncState("missions", brusselsDay(), brusselsDay()).then(
        (s) => void (out.dicosAt = s?.lastAt ?? null),
      ),
    );
  if (can(user, "journal:read"))
    tasks.push(
      (async () => {
        const since = toPbInstant(brusselsToUtc(addDays(brusselsDay(), -1)));
        const recent = await pb.collection("ops_log").getList(1, 200, {
          // Non-lus de l'onglet Infos seulement (4 nov. 2026) : les messages iRail vont dans Perturbations.
          filter: pb.filter(
            'status = "active" && source != "irail" && created >= {:s} && author != {:me}',
            {
              s: since,
              me: user.id,
            },
          ),
          fields: "id",
          skipTotal: true,
        });
        const ids = recent.items.map((r) => r.id);
        if (!ids.length) return void (out.counts.journal = 0);
        const read = new Set<string>();
        for (let i = 0; i < ids.length; i += 50) {
          const params: Record<string, string> = { me: user.id };
          const or = ids
            .slice(i, i + 50)
            .map((id, k) => ((params[`e${k}`] = id), `entry = {:e${k}}`))
            .join(" || ");
          const rows = await pb.collection("ops_log_reads").getFullList({
            filter: pb.filter(`user = {:me} && (${or})`, params),
            fields: "entry",
          });
          for (const r of rows) read.add(String(r.entry));
        }
        out.counts.journal = ids.filter((id) => !read.has(id)).length;
      })(),
    );
  // Un compteur en échec (collection absente, réseau) n'empêche pas les autres.
  await Promise.allSettled(tasks);
  return out;
}
