import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

async function proxy(method, params, url, request) {
    // DIAGNOSTIC : Si ça s'affiche dans les logs Vercel, c'est que la variable est chargée
    if (!PUBLIC_SUPABASE_ANON_KEY) {
        console.error("CRITICAL: PUBLIC_SUPABASE_ANON_KEY is missing/undefined on server!");
        return new Response(JSON.stringify({ error: "Server Configuration Error: Missing API Key" }), { status: 500 });
    }

    // 1. Construction de l'URL cible
    const baseUrl = PUBLIC_SUPABASE_URL.replace(/\/$/, '');
    const path = params.path;
    
    // STRATÉGIE "CEINTURE ET BRETELLES" :
    // On ajoute la clé directement dans l'URL (?apikey=...) en plus du header.
    // Supabase accepte les deux méthodes.
    const targetUrlObj = new URL(`${baseUrl}/${path}${url.search}`);
    targetUrlObj.searchParams.set('apikey', PUBLIC_SUPABASE_ANON_KEY);
    
    const targetUrl = targetUrlObj.toString();

    // 2. Préparation des headers
    const requestHeaders = new Headers();
    requestHeaders.set('apikey', PUBLIC_SUPABASE_ANON_KEY);
    
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
        requestHeaders.set('Authorization', authHeader);
    } else {
        requestHeaders.set('Authorization', `Bearer ${PUBLIC_SUPABASE_ANON_KEY}`);
    }

    const contentType = request.headers.get('Content-Type');
    if (contentType) requestHeaders.set('Content-Type', contentType);

    try {
        let body = null;
        if (method !== 'GET' && method !== 'HEAD') {
            const blob = await request.blob();
            body = blob.size > 0 ? blob : null;
        }

        const upstreamResponse = await fetch(targetUrl, {
            method: method,
            headers: requestHeaders,
            body: body,
            duplex: 'half'
        });

        // Copie des headers de réponse (sans les headers bloquants)
        const responseHeaders = new Headers();
        upstreamResponse.headers.forEach((value, key) => {
            if (!['content-encoding', 'content-length', 'connection'].includes(key.toLowerCase())) {
                responseHeaders.append(key, value);
            }
        });

        return new Response(upstreamResponse.body, {
            status: upstreamResponse.status,
            statusText: upstreamResponse.statusText,
            headers: responseHeaders
        });

    } catch (error) {
        console.error(`[PROXY ERROR] ${method} ${targetUrl}`, error);
        return new Response(JSON.stringify({ error: 'Proxy Failed', details: error.message }), { status: 500 });
    }
}

export const GET = ({ params, url, request }) => proxy('GET', params, url, request);
export const POST = ({ params, url, request }) => proxy('POST', params, url, request);
export const PUT = ({ params, url, request }) => proxy('PUT', params, url, request);
export const PATCH = ({ params, url, request }) => proxy('PATCH', params, url, request);
export const DELETE = ({ params, url, request }) => proxy('DELETE', params, url, request);