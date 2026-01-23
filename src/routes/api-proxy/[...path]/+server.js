import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

/**
 * Fonction centrale qui gère le transfert de la requête
 */
async function proxy(method, params, url, request) {
    // 1. Nettoyage de l'URL de base (au cas où il y a un slash à la fin)
    const baseUrl = PUBLIC_SUPABASE_URL.replace(/\/$/, '');
    const path = params.path;
    const targetUrl = `${baseUrl}/${path}${url.search}`;

    // 2. Préparation des Headers
    const headers = new Headers(request.headers);
    headers.set('apikey', PUBLIC_SUPABASE_ANON_KEY);
    
    // On retire les headers qui causent des conflits CORS ou Host
    headers.delete('host');
    headers.delete('connection');
    headers.delete('origin');
    headers.delete('referer');
    headers.delete('content-length');

    try {
        // 3. Gestion du Body (Corps de la requête)
        // On ne lit le body que si ce n'est pas un GET/HEAD
        let body = undefined;
        if (method !== 'GET' && method !== 'HEAD') {
            body = await request.arrayBuffer();
        }

        // 4. Envoi de la requête à Supabase (depuis le serveur Vercel)
        const response = await fetch(targetUrl, {
            method: method,
            headers: headers,
            body: body,
            duplex: 'half' // Important pour Node/Vercel
        });

        // 5. Retour de la réponse au navigateur
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });

    } catch (error) {
        console.error(`[PROXY ERROR] ${method} ${targetUrl}:`, error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}

// --- EXPORTS AUTORISÉS UNIQUEMENT ---

export const GET = ({ params, url, request }) => proxy('GET', params, url, request);
export const POST = ({ params, url, request }) => proxy('POST', params, url, request);
export const PUT = ({ params, url, request }) => proxy('PUT', params, url, request);
export const PATCH = ({ params, url, request }) => proxy('PATCH', params, url, request);
export const DELETE = ({ params, url, request }) => proxy('DELETE', params, url, request);