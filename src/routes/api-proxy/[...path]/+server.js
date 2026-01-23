import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

async function proxy(method, params, url, request) {
    // 1. Reconstruction de l'URL cible
    // params.path contient tout ce qu'il y a après /api-proxy/ (ex: rest/v1/users)
    const targetUrl = `${PUBLIC_SUPABASE_URL}/${params.path}${url.search}`;

    // 2. Copie des headers + Ajout de la clé API
    const headers = new Headers(request.headers);
    headers.set('apikey', PUBLIC_SUPABASE_ANON_KEY);
    
    // Nettoyage des headers conflictuels
    headers.delete('host');
    headers.delete('connection');
    headers.delete('origin'); // Important pour éviter les erreurs CORS Supabase
    headers.delete('referer');

    const options = {
        method: method,
        headers: headers,
        // On ne passe le body que si ce n'est pas un GET/HEAD
        body: (method !== 'GET' && method !== 'HEAD') ? await request.blob() : undefined,
        duplex: 'half' // Nécessaire pour certains environnements Node récents avec fetch
    };

    try {
        const response = await fetch(targetUrl, options);

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: "Proxy Error", details: error.message }), { status: 500 });
    }
}

// On exporte toutes les méthodes HTTP possibles
export const GET = ({ params, url, request }) => proxy('GET', params, url, request);
export const POST = ({ params, url, request }) => proxy('POST', params, url, request);
export const PUT = ({ params, url, request }) => proxy('PUT', params, url, request);
export const PATCH = ({ params, url, request }) => proxy('PATCH', params, url, request);
export const DELETE = ({ params, url, request }) => proxy('DELETE', params, url, request);