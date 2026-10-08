// Constantes partagées client / serveur (aucun secret ici).

export const APP_NAME = 'CSM';
export const APP_FULL_NAME = 'Client Solutions Management Tool';

/**
 * Nom du cookie de session Supabase, identique côté navigateur et serveur.
 * Le navigateur ne parle jamais directement à *.supabase.co (bloqué par le
 * pare-feu de l'entreprise) : il passe par /api-proxy sur le même domaine.
 */
export const AUTH_COOKIE = 'csm-auth';

/** Préfixe du proxy Supabase same-origin. */
export const SUPABASE_PROXY_PATH = '/api-proxy';
