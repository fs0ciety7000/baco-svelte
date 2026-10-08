// Appel de Server Action protégé : réseau coupé ou serveur redéployé (« Failed to find Server Action »)
// donnent un résultat d'erreur au lieu de faire planter la page (et perdre la saisie).
export async function safeCall<T>(p: Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await p;
  } catch {
    return {
      ok: false,
      error: "Serveur injoignable (réseau ou mise à jour en cours) : réessayez.",
    };
  }
}
