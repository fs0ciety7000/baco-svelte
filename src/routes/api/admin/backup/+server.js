import { error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { gzipSync } from 'node:zlib';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

// Tables à exclure du dump
const EXCLUDED_TABLES = new Set([
    'schema_migrations',
    'spatial_ref_sys',
    'geography_columns',
    'geometry_columns',
]);

async function discoverTables() {
    // PostgREST expose son schéma OpenAPI sur /rest/v1/
    // C'est le seul moyen fiable de lister les tables sans migration DB
    const res = await fetch(`${PUBLIC_SUPABASE_URL}/rest/v1/`, {
        headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Accept': 'application/json',
        },
    });

    if (!res.ok) throw new Error(`Impossible de récupérer le schéma PostgREST (${res.status})`);

    const spec = await res.json();

    // PostgREST v10- : spec.definitions  |  v11+ : spec.paths
    let names = [];

    if (spec.definitions) {
        names = Object.keys(spec.definitions);
    } else if (spec.paths) {
        // Les chemins ressemblent à "/table_name" — on retire le "/"
        names = Object.keys(spec.paths)
            .filter(p => p.startsWith('/') && !p.includes('{'))
            .map(p => p.slice(1))
            .filter(Boolean);
    }

    return names
        .filter(n => !EXCLUDED_TABLES.has(n) && !n.includes('.'))
        .sort();
}

export async function GET({ request }) {
    // 1. Auth : le client browser stocke la session en localStorage (pas en cookies)
    // Le frontend doit passer le JWT dans le header Authorization
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) throw error(401, 'Non authentifié');

    const admin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // Vérification du token JWT via l'API admin
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) throw error(401, 'Non authentifié');

    const { data: profile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') throw error(403, 'Admin uniquement');

    // 3. Découverte des tables via l'OpenAPI PostgREST
    let tables;
    try {
        tables = await discoverTables();
    } catch (e) {
        throw error(500, 'Découverte des tables impossible : ' + e.message);
    }

    if (!tables.length) throw error(500, 'Aucune table trouvée dans le schéma public');

    // 4. Dump de chaque table avec pagination
    const dump = {};
    const stats = {};

    for (const table of tables) {
        const rows = [];
        const PAGE = 1000;
        let from = 0;
        let done = false;

        while (!done) {
            const { data, error: fetchErr } = await admin
                .from(table)
                .select('*')
                .range(from, from + PAGE - 1);

            if (fetchErr) {
                // Table inaccessible (vue, table système, etc.) — on saute
                console.warn(`[backup] table "${table}" ignorée : ${fetchErr.message}`);
                done = true;
                break;
            }

            rows.push(...(data || []));
            done = !data || data.length < PAGE;
            from += PAGE;
        }

        dump[table] = rows;
        stats[table] = rows.length;
    }

    // 5. Payload JSON final
    const totalRows = Object.values(stats).reduce((a, b) => a + b, 0);
    const timestamp = new Date().toISOString();

    const payload = JSON.stringify({
        meta: {
            app: 'BACO',
            version: '1.0',
            timestamp,
            supabase_url: PUBLIC_SUPABASE_URL,
            tables_count: tables.length,
            total_rows: totalRows,
            table_stats: stats,
        },
        tables: dump,
    });

    // 6. Compression gzip
    const compressed = gzipSync(Buffer.from(payload, 'utf-8'), { level: 9 });

    // 7. Nom de fichier horodaté : baco_backup_2026-05-17_143022.json.gz
    const dateStr = timestamp.slice(0, 19).replace('T', '_').replace(/:/g, '');
    const filename = `baco_backup_${dateStr}.json.gz`;

    return new Response(compressed, {
        headers: {
            'Content-Type': 'application/gzip',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': String(compressed.byteLength),
            'X-Backup-Tables': String(tables.length),
            'X-Backup-Rows': String(totalRows),
        },
    });
}
