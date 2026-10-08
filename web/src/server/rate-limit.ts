import "server-only";

// Limiteur de débit en mémoire (fenêtre glissante par clé) : protège les relais externes (iRail, tuiles) contre un
// agent ou un script qui réutiliserait son cookie. Mémoire d'une instance ; suffisant pour un seul conteneur web.

const hits = new Map<string, number[]>();

/** Vrai si l'appel est permis : au plus `max` appels par `windowMs` pour cette clé. */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 2000)
    for (const k of hits.keys()) if (!hits.get(k)?.some((t) => now - t < windowMs)) hits.delete(k);
  return true;
}
