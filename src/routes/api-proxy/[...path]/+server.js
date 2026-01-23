import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

async function proxy(method, params, url, request) {
    // 1. URL Cible
    const baseUrl = PUBLIC_SUPABASE_URL.replace(/\/$/, '');
    const targetUrl = `${baseUrl}/${params.path}${url.search}`;

    // 2. HEADERS MANUELS (C'est ici que ça bloquait)
    // On crée un objet propre au lieu de copier les headers "sales" du navigateur
    const headers = new Headers();

    // A. L'API KEY (OBLIGATOIRE)
    headers.set('apikey', PUBLIC_SUPABASE_ANON_KEY);

    // B. Authorization (Bearer Token)
    // Si l'utilisateur envoie un token (ex: logged in), on le passe.
    // Sinon, on met la Anon Key par défaut pour que Supabase accepte la connexion.
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
        headers.set('Authorization', authHeader);
    } else {
        headers.set('Authorization', `Bearer ${PUBLIC_SUPABASE_ANON_KEY}`);
    }

    // C. Content-Type (Important pour le login JSON)
    const contentType = request.headers.get('Content-Type');
    if (contentType) {
        headers.set('Content-Type', contentType);
    }

    // 3. Gestion du Body
    let body = undefined;
    if (method !== 'GET' && method !== 'HEAD') {
        body = await request.blob();
    }

    try {
        const response = await fetch(targetUrl, {
            method: method,
            headers: headers, // On envoie nos headers propres
            body: body,
            duplex: 'half' // Nécessaire sur Vercel
        });

        // 4. Renvoi de la réponse
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });

    } catch (error) {
        console.error(`[PROXY ERROR]`, error);
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