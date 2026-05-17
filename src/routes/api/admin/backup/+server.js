import { error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { gzipSync } from 'node:zlib';
import pg from 'pg';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } from '$env/static/private';

export const config = { runtime: 'nodejs22.x' };

const EXCLUDED_TABLES = new Set([
    'schema_migrations', 'spatial_ref_sys', 'geography_columns',
    'geometry_columns', 'pg_stat_statements',
]);

// ── Mapping des types PostgreSQL ───────────────────────────────────────────────
function pgType(col) {
    const { data_type, udt_name, character_maximum_length, numeric_precision, numeric_scale } = col;

    if (data_type === 'ARRAY') {
        const base = udt_name.startsWith('_') ? udt_name.slice(1) : udt_name;
        return `${resolveUdt(base)}[]`;
    }
    if (data_type === 'USER-DEFINED') return udt_name;
    if (data_type === 'character varying') return character_maximum_length ? `varchar(${character_maximum_length})` : 'varchar';
    if (data_type === 'character') return character_maximum_length ? `char(${character_maximum_length})` : 'char';
    if (data_type === 'numeric') return numeric_precision != null ? `numeric(${numeric_precision},${numeric_scale ?? 0})` : 'numeric';
    if (data_type === 'timestamp with time zone') return 'timestamptz';
    if (data_type === 'timestamp without time zone') return 'timestamp';
    if (data_type === 'time with time zone') return 'timetz';
    if (data_type === 'time without time zone') return 'time';
    return resolveUdt(udt_name);
}

function resolveUdt(udt) {
    return { int2: 'smallint', int4: 'integer', int8: 'bigint', float4: 'real',
             float8: 'double precision', bool: 'boolean', timestamptz: 'timestamptz',
             bpchar: 'char', }[udt] ?? udt;
}

// ── Échappement des valeurs SQL ────────────────────────────────────────────────
function toSql(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
    if (val instanceof Date) return `'${val.toISOString()}'`;
    if (Buffer.isBuffer(val)) return `'\\x${val.toString('hex')}'`;
    if (Array.isArray(val)) return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
    if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
    return `'${String(val).replace(/'/g, "''")}'`;
}

// ── Génération du schéma (DDL) ─────────────────────────────────────────────────
async function buildSchema(client, tables) {
    const out = [];

    for (const table of tables) {
        // Colonnes
        const { rows: cols } = await client.query(`
            SELECT column_name, data_type, udt_name, is_nullable,
                   column_default, character_maximum_length,
                   numeric_precision, numeric_scale
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            ORDER BY ordinal_position
        `, [table]);

        if (!cols.length) continue;

        // Clé primaire
        const { rows: pkRows } = await client.query(`
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema = kcu.table_schema
            WHERE tc.table_schema = 'public' AND tc.table_name = $1
              AND tc.constraint_type = 'PRIMARY KEY'
            ORDER BY kcu.ordinal_position
        `, [table]);

        // Contraintes UNIQUE
        const { rows: uqRows } = await client.query(`
            SELECT tc.constraint_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema = kcu.table_schema
            WHERE tc.table_schema = 'public' AND tc.table_name = $1
              AND tc.constraint_type = 'UNIQUE'
            ORDER BY tc.constraint_name, kcu.ordinal_position
        `, [table]);

        // Construire CREATE TABLE
        out.push(`CREATE TABLE IF NOT EXISTS "${table}" (`);

        const parts = cols.map(col => {
            let def = `    "${col.column_name}" ${pgType(col)}`;
            if (col.column_default !== null) def += ` DEFAULT ${col.column_default}`;
            if (col.is_nullable === 'NO') def += ' NOT NULL';
            return def;
        });

        if (pkRows.length) {
            parts.push(`    PRIMARY KEY (${pkRows.map(r => `"${r.column_name}"`).join(', ')})`);
        }

        // Regrouper les UNIQUE multi-colonnes
        const uqMap = {};
        for (const r of uqRows) {
            (uqMap[r.constraint_name] ??= []).push(r.column_name);
        }
        for (const [name, uqCols] of Object.entries(uqMap)) {
            parts.push(`    CONSTRAINT "${name}" UNIQUE (${uqCols.map(c => `"${c}"`).join(', ')})`);
        }

        out.push(parts.join(',\n'));
        out.push(');');

        // Indexes (hors PK)
        const { rows: idxRows } = await client.query(`
            SELECT indexname, indexdef FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = $1
              AND indexname NOT LIKE '%_pkey'
              AND indexname NOT IN (
                  SELECT constraint_name FROM information_schema.table_constraints
                  WHERE table_schema = 'public' AND table_name = $1
                    AND constraint_type = 'UNIQUE'
              )
        `, [table]);

        for (const idx of idxRows) out.push(`${idx.indexdef};`);
        out.push('');
    }

    // FK à la fin (toutes les tables doivent exister avant)
    out.push('-- ── Clés étrangères ──────────────────────────────────────────');
    for (const table of tables) {
        const { rows: fkRows } = await client.query(`
            SELECT
                tc.constraint_name,
                kcu.column_name,
                ccu.table_name  AS ref_table,
                ccu.column_name AS ref_column,
                rc.delete_rule,
                rc.update_rule
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema    = kcu.table_schema
            JOIN information_schema.referential_constraints rc
                ON tc.constraint_name = rc.constraint_name
               AND tc.table_schema    = rc.constraint_schema
            JOIN information_schema.constraint_column_usage ccu
                ON rc.unique_constraint_name = ccu.constraint_name
               AND rc.constraint_schema      = ccu.table_schema
            WHERE tc.table_schema = 'public' AND tc.table_name = $1
              AND tc.constraint_type = 'FOREIGN KEY'
        `, [table]);

        for (const fk of fkRows) {
            out.push(
                `ALTER TABLE "${table}" ADD CONSTRAINT "${fk.constraint_name}" ` +
                `FOREIGN KEY ("${fk.column_name}") ` +
                `REFERENCES "${fk.ref_table}" ("${fk.ref_column}") ` +
                `ON DELETE ${fk.delete_rule} ON UPDATE ${fk.update_rule};`
            );
        }
    }
    out.push('');

    return out;
}

// ── Génération des données (DML) ───────────────────────────────────────────────
async function buildData(client, tables) {
    const out = [];
    const stats = {};

    for (const table of tables) {
        const { rows } = await client.query(
            `SELECT * FROM "${table}" ORDER BY created_at ASC NULLS LAST`
        ).catch(() => client.query(`SELECT * FROM "${table}"`));

        stats[table] = rows.length;
        if (!rows.length) continue;

        const cols = Object.keys(rows[0]).map(c => `"${c}"`).join(', ');
        out.push(`-- ── ${table} (${rows.length} lignes) ──────────────`);
        out.push(`DELETE FROM "${table}";`);

        for (const row of rows) {
            const vals = Object.values(row).map(toSql).join(', ');
            out.push(`INSERT INTO "${table}" (${cols}) VALUES (${vals});`);
        }
        out.push('');
    }

    return { lines: out, stats };
}

// ── Handler principal ──────────────────────────────────────────────────────────
export async function GET({ request }) {
    // Auth via JWT (localStorage, pas cookies)
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

    if (!DATABASE_URL) throw error(500, 'DATABASE_URL non configurée (voir README)');

    const client = new pg.Client({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 8000,
        statement_timeout: 28000,
    });
    await client.connect();

    try {
        // Lister les tables
        const { rows: tableRows } = await client.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);
        const tables = tableRows.map(r => r.table_name).filter(n => !EXCLUDED_TABLES.has(n));

        const now = new Date().toISOString();

        // Assembler le dump final
        const header = [
            `-- ============================================================`,
            `-- BACO — Dump complet (schéma + données)`,
            `-- Généré le : ${now}`,
            `-- Tables    : ${tables.length}`,
            `-- Restauration : psql "<DATABASE_URL>" < fichier.sql`,
            `-- ============================================================`,
            ``,
            `BEGIN;`,
            `SET client_min_messages = WARNING;`,
            `SET session_replication_role = replica;  -- désactive FK checks`,
            ``,
            `-- ════════════════════════════════════════════════════════════`,
            `-- SCHÉMA`,
            `-- ════════════════════════════════════════════════════════════`,
            ``,
        ];

        const schemaLines = await buildSchema(client, tables);
        const { lines: dataLines, stats } = await buildData(client, tables);

        const footer = [
            `-- ════════════════════════════════════════════════════════════`,
            `-- FIN`,
            `-- ════════════════════════════════════════════════════════════`,
            ``,
            `SET session_replication_role = DEFAULT;`,
            `COMMIT;`,
        ];

        const dataHeader = [
            `-- ════════════════════════════════════════════════════════════`,
            `-- DONNÉES`,
            `-- ════════════════════════════════════════════════════════════`,
            ``,
        ];

        const sql = [
            ...header,
            ...schemaLines,
            ...dataHeader,
            ...dataLines,
            ...footer,
        ].join('\n');

        const compressed = gzipSync(Buffer.from(sql, 'utf-8'), { level: 9 });
        const totalRows = Object.values(stats).reduce((a, b) => a + b, 0);
        const dateStr = now.slice(0, 19).replace('T', '_').replace(/:/g, '');

        return new Response(compressed, {
            headers: {
                'Content-Type': 'application/gzip',
                'Content-Disposition': `attachment; filename="baco_backup_${dateStr}.sql.gz"`,
                'Content-Length': String(compressed.byteLength),
                'X-Backup-Tables': String(tables.length),
                'X-Backup-Rows': String(totalRows),
            },
        });
    } finally {
        await client.end();
    }
}
