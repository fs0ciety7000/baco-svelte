// Identifiants de connexion insensibles à la casse (retour du 4 nov. 2026 : « Nicolas.dessenius@… » refusé, la fiche est
// en minuscules ; PocketBase compare l'adresse telle quelle). On essaie la saisie telle quelle, puis en minuscules.

/** Variantes à essayer, sans doublon : saisie (espaces retirés), puis la même en minuscules. */
export function identityCandidates(raw: string): string[] {
  const typed = raw.trim();
  if (!typed) return [];
  const lower = typed.toLowerCase();
  return lower === typed ? [typed] : [typed, lower];
}
