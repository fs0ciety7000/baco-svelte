#!/usr/bin/env bash
# Réinjecte les données JSON d'une sauvegarde CSM dans une base Postgres VIERGE
# dont le schéma a déjà été recréé (fichiers schema/01 à 03, sans les FK).
# Ne jamais lancer contre la production BACO.
#
# Usage : DATABASE_URL=postgres://… scripts/supabase-restore-data.sh /chemin/csm-backup
set -euo pipefail

BACKUP="${1:?dossier de sauvegarde attendu}"
: "${DATABASE_URL:?DATABASE_URL manquant}"

case "$DATABASE_URL" in
  *mgljaheyimizrydazrxh*) echo "Refus : cible = base de production BACO" >&2; exit 1 ;;
esac

for f in "$BACKUP"/data/*.json; do
  t="$(basename "$f" .json)"
  n="$(node -e 'console.log(require(process.argv[1]).length)' "$f")"
  [ "$n" = "0" ] && { echo "  $t : vide"; continue; }
  # session_replication_role=replica : pas de triggers (audit, sync de rôle) pendant l'import.
  # Le JSON passe par \set (backtick psql) : un argument de ligne de commande est limité à 128 Ko.
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
\\set data \`cat '$f'\`
set session_replication_role = replica;
insert into public."$t" select * from json_populate_recordset(null::public."$t", :'data'::json);
SQL
  echo "  $t : $n lignes"
done

# Réaligne les séquences sur le max des clés importées.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
do $$
declare r record;
begin
  for r in
    select c.relname as tbl, a.attname as col, pg_get_serial_sequence(format('public.%I', c.relname), a.attname) as seq
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0
    where n.nspname = 'public' and c.relkind = 'r'
      and pg_get_serial_sequence(format('public.%I', c.relname), a.attname) is not null
  loop
    execute format('select setval(%L, coalesce((select max(%I) from public.%I), 0) + 1, false)', r.seq, r.col, r.tbl);
  end loop;
end $$;
SQL
echo "Données réinjectées."
