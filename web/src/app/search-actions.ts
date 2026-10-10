"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { plainText } from "@/lib/ops/chat-markdown";
import { can } from "@/lib/permissions";
import { addDays, brusselsDay, formatDay, isValidDay, pbDate } from "@/lib/orders/time";
import { requireUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import { allow } from "@/server/rate-limit";

export type SearchHit = {
  kind: "contact" | "bus" | "ptcar" | "train" | "journal" | "pmr" | "groupe";
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

    // Journal (10 oct. 2026) : messages actifs dont le texte contient la recherche, les plus récents d'abord.
    if (can(user, "journal:read"))
      tasks.push(
        pb
          .collection("ops_log")
          .getList(1, 5, {
            filter: pb.filter('status = "active" && (body ~ {:q} || train ~ {:q})', { q }),
            sort: "-created",
            expand: "author",
            fields: "id,body,created,source,expand.author.name",
            skipTotal: true,
          })
          .then((r) => {
            for (const m of r.items) {
              const at = pbDate(String(m.created ?? ""));
              const author =
                m.source === "irail"
                  ? "iRail"
                  : String(
                      (m.expand as { author?: { name?: string } } | undefined)?.author?.name ?? "",
                    );
              hits.push({
                kind: "journal",
                label:
                  plainText(String(m.body ?? ""))
                    .replace(/\s+/g, " ")
                    .slice(0, 90) || "Message",
                meta: ["Journal", at ? formatDay(brusselsDay(at)) : "", author]
                  .filter(Boolean)
                  .join(" · "),
                href: `/operations/journal?entree=${m.id}`,
              });
            }
          })
          .catch(() => undefined),
      );

    // Missions PMR et groupes (10 oct. 2026) : n° de dossier, gare ou train ; aucun nom de voyageur. 30 jours autour
    // d'aujourd'hui.
    const today = brusselsDay();
    const range = pb.filter("day >= {:a} && day <= {:b}", {
      a: addDays(today, -30),
      b: addDays(today, 30),
    });
    const missionQ = pb.filter(
      "(dicos_ref ~ {:q} || station ~ {:q} || other_station ~ {:q} || train ~ {:q})",
      {
        q,
      },
    );
    if (can(user, "deplacements:read"))
      tasks.push(
        pb
          .collection("pmr_assists")
          .getList(1, 5, {
            filter: `${range} && ${missionQ} && status != "annulee"`,
            sort: "-day,time",
            fields: "id,day,time,train,station,other_station,dicos_ref,pmr_type,pax",
            skipTotal: true,
          })
          .then((r) => {
            for (const m of r.items) {
              const day = String(m.day ?? "");
              hits.push({
                kind: "pmr",
                label: `${m.train || "?"} · ${m.station || "?"} → ${m.other_station || "?"}`,
                meta: [
                  "Mission PMR",
                  isValidDay(day) ? formatDay(day) : "",
                  m.time,
                  m.dicos_ref ? `dossier ${m.dicos_ref}` : "",
                ]
                  .filter(Boolean)
                  .join(" · "),
                href: `/pmr?du=${day}&au=${day}&q=${encodeURIComponent(String(m.dicos_ref || m.train || q))}`,
              });
            }
          })
          .catch(() => undefined),
      );
    if (can(user, "pmr:read"))
      tasks.push(
        pb
          .collection("group_missions")
          .getList(1, 3, {
            filter: `${range} && ${missionQ} && status != "annulee"`,
            sort: "-day,time",
            fields: "id,day,time,train,station,other_station,dicos_ref",
            skipTotal: true,
          })
          .then((r) => {
            for (const m of r.items) {
              const day = String(m.day ?? "");
              hits.push({
                kind: "groupe",
                label: `${m.train || "?"} · ${m.station || "?"} → ${m.other_station || "?"}`,
                meta: [
                  "Groupe",
                  isValidDay(day) ? formatDay(day) : "",
                  m.time,
                  m.dicos_ref ? `dossier ${m.dicos_ref}` : "",
                ]
                  .filter(Boolean)
                  .join(" · "),
                href: `/groupes?du=${day}&au=${day}&q=${encodeURIComponent(String(m.dicos_ref || m.train || q))}`,
              });
            }
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
