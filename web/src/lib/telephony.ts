// Téléphonie (14 oct. 2026) : l'équipe passe d'Etrali à Genesys Cloud. L'extension de navigateur Genesys Cloud (Chrome,
// Edge, Firefox ; réglage « Click-to-Dial ») compose les liens `tel:` ; Etrali gardait son protocole `etrali:`.
// Choix par navigateur (réglage « Affichage »), Genesys par défaut ; sur mobile, toujours `tel:` (téléphone).

export type Telephony = "genesys" | "etrali";
export const TELEPHONY_KEY = "csm-telephonie";

export function readTelephony(): Telephony {
  try {
    return window.localStorage.getItem(TELEPHONY_KEY) === "etrali" ? "etrali" : "genesys";
  } catch {
    return "genesys";
  }
}

/** Pose `data-telephony` sur <html> : le CSS montre le lien `etrali:` au lieu de `tel:` sur poste fixe. */
export function applyTelephony(t: Telephony = readTelephony()) {
  document.documentElement.dataset.telephony = t;
}

/**
 * Numéro composable : chiffres et « + » ; format international pour Genesys Cloud (0478… → +32478…, 0032… → +32…).
 * Les numéros courts (services, 4 à 6 chiffres) restent tels quels.
 */
export function e164(phone: string): string {
  const n = phone.replace(/[^\d+]/g, "");
  if (n.startsWith("+")) return n;
  if (n.startsWith("00")) return `+${n.slice(2)}`;
  if (n.startsWith("0") && n.length >= 9) return `+32${n.slice(1)}`;
  return n;
}
