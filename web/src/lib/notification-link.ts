import { dayOf } from "./orders/time";
import { LEGACY_REDIRECTS } from "./redirects";

// Liens des notifications (4 nov. 2026, retour : « les liens des notifications groupe etc. ne renvoient pas vers la bonne
// page »). Les hooks PocketBase écrivent désormais le bon lien ; les notifications déjà en base (gardées jusqu'à 90 jours)
// sont corrigées ici, à l'affichage, sans migration. Source unique pour la cloche, les widgets, les notifications du
// navigateur et le service worker (tous lisent `listNotifications`).

type Context = {
  /** Date de création PocketBase (« 2026-11-04 10:00:00.000Z ») : jour de la ligne visée si le lien n'en porte pas. */
  created?: string;
  title?: string;
  body?: string;
};

/** Ancienne route → nouvelle (liste unique `redirects.ts`), avec les segments `:id`. */
function redirectPath(path: string): string {
  for (const r of LEGACY_REDIRECTS) {
    const names: string[] = [];
    const pattern = r.source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:(\w+)/g, (_, n) => {
      names.push(n);
      return "([^/]+)";
    });
    const m = new RegExp(`^${pattern}/?$`).exec(path);
    if (!m) continue;
    return names.reduce((dest, n, i) => dest.replace(`:${n}`, m[i + 1] ?? ""), r.destination);
  }
  return path;
}

/**
 * Lien d'une notification, corrigé : pages déplacées, onglet Perturbations du Journal pour iRail, Groupes pour un train
 * qui ne touche que des groupes, jour / district / train posés pour que la ligne soit dans la liste filtrée. Lien externe
 * ou invalide → chaîne vide. Idempotent (un lien déjà correct est rendu tel quel).
 */
export function normalizeNotificationLink(link: string, kind: string, ctx: Context = {}): string {
  if (!/^\/(?!\/)/.test(link)) return "";
  let url: URL;
  try {
    url = new URL(link, "http://csm.local");
  } catch {
    return "";
  }
  if (url.origin !== "http://csm.local") return "";
  let path = redirectPath(url.pathname);
  const sp = url.searchParams;
  const day = dayOf(ctx.created);
  const setDefault = (k: string, v: string) => {
    if (v && !sp.has(k)) sp.set(k, v);
  };

  // Journal : les messages iRail sont dans l'onglet Perturbations, ceux des agents dans Infos.
  if (path === "/operations/journal" && kind === "perturbation") path = "/operations/perturbations";
  else if (path === "/operations/perturbations" && (kind === "mention" || kind === "urgent"))
    path = "/operations/journal";

  // Train suivi : le jour du train (la page ouvre sinon le jour courant).
  if (path === "/reseau" && sp.has("train") && kind === "train") setDefault("jour", day);

  // Retard d'un train de mission ou changement DICOS : liste du bon module, du bon jour, filtre de district levé.
  if ((path === "/pmr" || path === "/groupes") && (kind === "train" || kind === "dicos")) {
    const body = ctx.body ?? "";
    // Retard : « 2 groupes concernés (iRail). » sans mission PMR → Groupes (ancien lien toujours vers /pmr).
    if (kind === "train" && path === "/pmr" && /groupe/i.test(body) && !/mission/i.test(body))
      path = "/groupes";
    setDefault("du", day);
    setDefault("au", sp.get("du") ?? "");
    setDefault("district", "tous");
    if (kind === "dicos") {
      // « Embarquement · train 4569 · 2 × CRF » → recherche du train.
      const train = /\btrain\s+[A-Z]*\s*(\d{1,6})\b/i.exec(body)?.[1];
      setDefault("q", train ?? "");
      if (/annul/i.test(ctx.title ?? "")) setDefault("statut", "annulee");
    }
  }

  const query = sp.toString();
  return query ? `${path}?${query}` : path;
}
