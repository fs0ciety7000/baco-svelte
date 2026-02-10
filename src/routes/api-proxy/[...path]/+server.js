import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

/**
 * Fonction centrale qui gère le transfert de la requête
 */
async function proxy(method, params, url, request) {
    // 1. Nettoyage et construction de l'URL cible
    const baseUrl = PUBLIC_SUPABASE_URL.replace(/\/$/, '');
    const path = params.path;
    // url.search contient déjà les filtres comme ?ligne=in.(L.94)
    const targetUrl = `${baseUrl}/${path}${url.search}`;

    // 2. Préparation des Headers de la requête (Request)
    const headers = new Headers(request.headers);
    headers.set('apikey', PUBLIC_SUPABASE_ANON_KEY);
    
    // Indispensable pour que Cloudflare accepte la requête du serveur Coolify
    const targetHost = new URL(baseUrl).host;
    headers.set('host', targetHost);

    // On retire les headers qui causent des conflits
    headers.delete('connection');
    headers.delete('origin');
    headers.delete('referer');
    headers.delete('content-length');

    try {
        // 3. Gestion du Body
        let body = undefined;
        if (method !== 'GET' && method !== 'HEAD') {
            body = await request.arrayBuffer();
        }

        // 4. Envoi de la requête à Supabase
        const response = await fetch(targetUrl, {
            method: method,
            headers: headers,
            body: body,
            duplex: 'half' 
        });

        // 5. Nettoyage des Headers de la réponse (Response)
        const responseHeaders = new Headers(response.headers);
        
        // SUPPRESSION CRITIQUE : On enlève les cookies de Cloudflare/Supabase
        // qui causent l'erreur "domaine invalide" et bloquent le navigateur.
        responseHeaders.delete('set-cookie');
        
        // On s'assure que le CORS est autorisé pour votre domaine Coolify
        responseHeaders.set('Access-Control-Allow-Origin', url.origin);
        responseHeaders.set('Access-Control-Allow-Credentials', 'true');

        // 6. Retour de la réponse nettoyée
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
        });
    } catch (error) {
        console.error(`[PROXY ERROR] ${method} ${targetUrl}:`, error);
        return new Response(JSON.stringify({ error: error.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

export const GET = ({ params, url, request }) => proxy('GET', params, url, request);
export const POST = ({ params, url, request }) => proxy('POST', params, url, request);
export const PUT = ({ params, url, request }) => proxy('PUT', params, url, request);
export const PATCH = ({ params, url, request }) => proxy('PATCH', params, url, request);
export const DELETE = ({ params, url, request }) => proxy('DELETE', params, url, request);
export const OPTIONS = async () => {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Origin': '*',
        }
    });
};