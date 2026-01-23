import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

async function proxy(method, params, url, request) {
    // 1. URL Cible
    const baseUrl = PUBLIC_SUPABASE_URL.replace(/\/$/, '');
    const path = params.path;
    
    // On force la clé API dans l'URL aussi (Ceinture et Bretelles)
    const targetUrlObj = new URL(`${baseUrl}/${path}${url.search}`);
    targetUrlObj.searchParams.set('apikey', PUBLIC_SUPABASE_ANON_KEY);
    const targetUrl = targetUrlObj.toString();

    // 2. HEADERS
    const requestHeaders = new Headers();
    
    // A. La clé API (Toujours requise)
    requestHeaders.set('apikey', PUBLIC_SUPABASE_ANON_KEY);
    
    // B. L'Authentification (LE POINT CRITIQUE)
    // On récupère le header envoyé par le navigateur (qui contient le Token de l'utilisateur)
    const authHeader = request.headers.get('Authorization');
    
    if (authHeader && authHeader.includes('Bearer')) {
        // Si le navigateur envoie un token, ON LE GARDE ! (C'est votre identité Admin)
        requestHeaders.set('Authorization', authHeader);
    } else {
        // Sinon (Login ou page publique), on utilise la clé Anon par défaut
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

        // Nettoyage des headers de réponse
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
        console.error(`[PROXY ERROR]`, error);
        return new Response(JSON.stringify({ error: 'Proxy Error' }), { status: 500 });
    }
}

export const GET = ({ params, url, request }) => proxy('GET', params, url, request);
export const POST = ({ params, url, request }) => proxy('POST', params, url, request);
export const PUT = ({ params, url, request }) => proxy('PUT', params, url, request);
export const PATCH = ({ params, url, request }) => proxy('PATCH', params, url, request);
export const DELETE = ({ params, url, request }) => proxy('DELETE', params, url, request);