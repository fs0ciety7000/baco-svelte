import { error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { gzipSync } from 'node:zlib';
import pg from 'pg';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } from '$env/static/private';

// Forcer Node.js runtime (pg n'est pas compatible Edge)
export const config = { runtime: 'nodejs' };

// Tables internes Supabase / PostgREST à ignorer
const EXCLUDED_TABLES = new Set([
    'schema_migrations',
    'spatial_ref_sys',
    'geography_columns',
    'geometry_columns',
    'pg_stat_statements',
]);

/**
 * Échappe une valeur JS en littéral SQL valide.
 * Gère : null, boolean, number, string, Date, Buffer, object (JSONB/arrays).
 */
function toSql(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
    if (val instanceof Date) return `'${val.toISOString().replace(/'/g, "''")}'`;
    if (Buffer.isBuffer(val)) return `'\\x${val.toString('hex')}'`;
    if (typeof val === 'object') {
        // JSONB, tableaux Postgres, etc.
        return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
    }
    // String : on double les apostrophes
    return `'${String(val).replace(/'/g, "''")}'`;
}

export async function GET({ request }) {
    // ── 1. Auth via JWT (le client browser stocke la session en localStorage) ──
    const token = request.headers.get('Authorization')?.slice(7) ?? null;
    if (!token) throw error(401, 'Non authentifié');

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) throw error(401, 'Non authentifié');

    const { data: profile } = await supabaseAdmin
        .from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') throw error(403, 'Admin uniquement');

    // ── 2. Connexion Postgres directe ──────────────────────────────────────────
    if (!DATABASE_URL) throw error(500, 'DATABASE_URL non configurée (voir doc)');

    const client = new pg.Client({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false }, // nécessaire sur Supabase
        connectionTimeoutMillis: 8000,
        statement_timeout: 25000,
    });

    await client.connect();

    try {
        // ── 3. Lister les tables du schéma public ──────────────────────────────
        const { rows: tableRows } = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);

        const tables = tableRows
            .map(r => r.table_name)
            .filter(n => !EXCLUDED_TABLES.has(n));

        // ── 4. Générer le SQL ──────────────────────────────────────────────────
        const now = new Date().toISOString();
        const lines = [];

        lines.push(`-- ============================================================`);
        lines.push(`-- BACO — Dump SQL (données uniquement)`);
        lines.push(`-- Généré le : ${now}`);
        lines.push(`-- Tables    : ${tables.length}`);
        lines.push(`-- ⚠  Ce fichier restaure les DONNÉES.`);
        lines.push(`--    Le schéma doit exister au préalable.`);
        lines.push(`--    Pour restaurer : psql <DATABASE_URL> < fichier.sql`);
        lines.push(`-- ============================================================`);
        lines.push('');
        lines.push('BEGIN;');
        lines.push('');
        // Désactive temporairement les FK checks pour éviter les erreurs d'ordre
        lines.push('SET session_replication_role = replica;');
        lines.push('');

        const stats = {};

        for (const table of tables) {
            const { rows } = await client.query(
                `SELECT * FROM "${table}" ORDER BY created_at ASC NULLS LAST`
            ).catch(() =>
                // Certaines tables n'ont pas created_at — on réessaie sans ordre
                client.query(`SELECT * FROM "${table}"`)
            );

            stats[table] = rows.length;
            if (!rows.length) continue;

            const cols = Object.keys(rows[0]).map(c => `"${c}"`).join(', ');

            lines.push(`-- ── ${table} (${rows.length} lignes) ──────────────`);
            lines.push(`DELETE FROM "${table}";`);

            for (const row of rows) {
                const vals = Object.values(row).map(toSql).join(', ');
                lines.push(`INSERT INTO "${table}" (${cols}) VALUES (${vals});`);
            }
            lines.push('');
        }

        lines.push('SET session_replication_role = DEFAULT;');
        lines.push('');
        lines.push('COMMIT;');

        const totalRows = Object.values(stats).reduce((a, b) => a + b, 0);

        // ── 5. Compression gzip ────────────────────────────────────────────────
        const sql = lines.join('\n');
        const compressed = gzipSync(Buffer.from(sql, 'utf-8'), { level: 9 });

        const dateStr = now.slice(0, 19).replace('T', '_').replace(/:/g, '');
        const filename = `baco_backup_${dateStr}.sql.gz`;

        return new Response(compressed, {
            headers: {
                'Content-Type': 'application/gzip',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': String(compressed.byteLength),
                'X-Backup-Tables': String(tables.length),
                'X-Backup-Rows': String(totalRows),
            },
        });

    } finally {
        await client.end();
    }
}
