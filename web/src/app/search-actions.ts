"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { can } from "@/lib/permissions";
import { formatDay, isValidDay } from "@/lib/orders/time";
import { requireUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import { allow } from "@/server/rate-limit";

export type SearchHit = {
  kind: "contact" | "bus" | "ptcar" | "train";
  label: string;
  meta: string;
  href: string;
};

const querySchema = z.string().trim().min(2).max(60);

/**
 * Recherche dans les données depuis la palette ⌘K (audit UX du 9 oct. 2026 : « Rechercher » ne cherchait aucune
 * donnée). Avec le jeton de l'agent : les règles PocketBase et ses droits s'appliquent. 5 résultats par type.
 */
export async function paletteSearch(input: string): Promise<SearchHit[]> {
  try {
    const user = await requireUser();
    const parsed = querySchema.safeParse(input);
    if (!parsed.success) return [];
    // Appelée à la frappe (après 250 ms) : 120 recherches par minute et par agent au plus.
    if (!allow(`palette:${user.id}`, 120, 60_000)) return [];
    const q = parsed.data;
    const pb = await pbForRequest();
    const hits: SearchHit[] = [];
    const tasks: Promise<void>[] = [];

    if (/^\d{2,6}$/.test(q) && can(user, "live:read"))
      hits.push({
        kind: "train",
        label: `Train ${q}`,
        meta: "Trains en direct",
        href: `/operations?train=${q}`,
      });

    if (can(user, "repertoire:read"))
      tasks.push(
        pb
          .collection("directory_contacts")
          .getList(1, 5, {
            filter: pb.filter("(name ~ {:q} || phone ~ {:q} || group ~ {:q})", { q }),
            sort: "name",
            fields: "id,name,phone,group",
            skipTotal: true,
          })
          .then((r) => {
            for (const c of r.items)
              hits.push({
                kind: "contact",
                label: String(c.name ?? ""),
                meta: [c.group, c.phone].filter(Boolean).join(" · ") || "Annuaire",
                href: `/referentiels?q=${encodeURIComponent(String(c.name ?? q))}`,
              });
          })
          .catch(() => undefined),
      );

    if (can(user, "otto:read")) {
      const n = Number(q);
      const byNumber =
        Number.isInteger(n) && String(n) === q ? pb.filter("number = {:n} || ", { n }) : "";
      tasks.push(
        pb
          .collection("bus_orders")
          .getList(1, 5, {
            filter: `${byNumber}${pb.filter("(relation ~ {:q} || origin ~ {:q} || destination ~ {:q})", { q })}`,
            sort: "-order_date,-created",
            fields: "id,number,origin,destination,order_date,relation",
            skipTotal: true,
          })
          .then((r) => {
            for (const o of r.items) {
              const day = String(o.order_date ?? "").slice(0, 10);
              hits.push({
                kind: "bus",
                label: `Bon ${o.number ?? ""} · ${o.origin || "?"} → ${o.destination || "?"}`,
                meta: [isValidDay(day) ? formatDay(day) : "", o.relation]
                  .filter(Boolean)
                  .join(" · "),
                href: `/commandes/bus/${o.id}`,
              });
            }
          })
          .catch(() => undefined),
      );
    }

    if (can(user, "ptcar:read"))
      tasks.push(
        pb
          .collection("ptcar")
          .getList(1, 5, {
            filter: pb.filter("(abbr ~ {:q} || name_fr ~ {:q} || name_nl ~ {:q})", { q }),
            sort: "name_fr",
            fields: "abbr,name_fr",
            skipTotal: true,
          })
          .then((r) => {
            for (const p of r.items)
              hits.push({
                kind: "ptcar",
                label: String(p.name_fr || p.abbr),
                meta: `PtCar ${p.abbr}`,
                href: `/referentiels/ptcar?q=${encodeURIComponent(String(p.abbr))}`,
              });
          })
          .catch(() => undefined),
      );

    await Promise.all(tasks);
    return hits;
  } catch (e) {
    unstable_rethrow(e);
    return [];
  }
}
