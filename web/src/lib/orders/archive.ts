// Archivage des bons (demande du 14 oct. 2026) : un bon envoyé / finalisé depuis plus de 30 jours (ou annulé depuis plus
// de 30 jours) sort des listes courantes (Commandes › Bus, Taxi, Suivi) et ne se voit plus que dans Commandes ›
// Archives. Rien n'est supprimé ; la fiche reste ouverte par un lien direct ou par ⌘K (badge « Archivé »). Un bon rouvert
// (envoyé → terminé) n'est plus envoyé : il sort des archives de lui-même.
//
// Date de clôture : `sent_at` (envoyé) / `cancelled_at` (annulé) ; repli sur `ended_at` puis `updated` pour les bons
// repris de BACO qui n'ont pas cet horodatage (sinon ils resteraient toujours dans les listes). Le filtre PocketBase
// (`archiveFilter`, server/data/orders.ts) applique la même règle.

export const ORDER_ARCHIVE_DAYS = 30;
const DAY_MS = 86_400_000;

export type ArchivableOrder = {
  status: string;
  sent_at?: string;
  cancelled_at?: string;
  ended_at?: string;
  updated?: string;
};

const parse = (v: string | undefined) => {
  if (!v) return NaN;
  return Date.parse(v.includes("T") ? v : v.replace(" ", "T"));
};

/** Date de clôture d'un bon (ms) ; NaN s'il n'est ni envoyé ni annulé, ou sans aucun horodatage. */
export function orderClosedAt(o: ArchivableOrder): number {
  const chain =
    o.status === "envoye"
      ? [o.sent_at, o.ended_at, o.updated]
      : o.status === "annule"
        ? [o.cancelled_at, o.updated]
        : [];
  for (const v of chain) {
    const t = parse(v);
    if (Number.isFinite(t)) return t;
  }
  return NaN;
}

/** Bon archivé : envoyé / finalisé ou annulé depuis plus de 30 jours. */
export function isArchivedOrder(o: ArchivableOrder, now: number = Date.now()): boolean {
  const closed = orderClosedAt(o);
  return Number.isFinite(closed) && now - closed > ORDER_ARCHIVE_DAYS * DAY_MS;
}

/** Limite d'archivage au format PocketBase (« 2026-09-14 12:00:00.000Z ») : clôturé avant = archivé. */
export function archiveCutoff(now: number = Date.now()): string {
  return new Date(now - ORDER_ARCHIVE_DAYS * DAY_MS).toISOString().replace("T", " ");
}
