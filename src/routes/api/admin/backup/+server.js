import { error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { gzipSync } from 'node:zlib';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

// Tables à exclure (tables système / internes Supabase)
const EXCLUDED_TABLES = new Set([
    'schema_migrations',
    'spatial_ref_sys',
    'geography_columns',
    'geometry_columns',
    'raster_columns',
    'raster_overviews',
]);

export async function GET({ locals }) {
    // 1. Auth : admin uniquement
    const user = locals.user;
    if (!user) throw error(401, 'Non authentifié');

    const { data: profile } = await locals.supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') throw error(403, 'Admin uniquement');

    // 2. Client admin (service_role)
    const admin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    // 3. Lister toutes les tables du schéma public
    const { data: tableList, error: tableErr } = await admin
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .eq('table_type', 'BASE TABLE');

    if (tableErr) throw error(500, 'Impossible de lister les tables : ' + tableErr.message);

    const tables = (tableList || [])
        .map(r => r.table_name)
        .filter(name => !EXCLUDED_TABLES.has(name))
        .sort();

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
                .range(from, from + PAGE - 1)
                .order('created_at', { ascending: true, nullsFirst: false })
                .throwOnError(false);

            if (fetchErr) {
                // Certaines tables n'ont pas created_at — on réessaie sans ordre
                const { data: data2 } = await admin
                    .from(table)
                    .select('*')
                    .range(from, from + PAGE - 1);

                if (data2) {
                    rows.push(...data2);
                    done = data2.length < PAGE;
                } else {
                    done = true;
                }
            } else {
                rows.push(...(data || []));
                done = !data || data.length < PAGE;
            }

            from += PAGE;
        }

        dump[table] = rows;
        stats[table] = rows.length;
    }

    // 5. Construire le payload JSON final
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

    // 7. Nom de fichier horodaté
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
