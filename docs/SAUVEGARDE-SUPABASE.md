# Sauvegarde et restauration de la base Supabase (BACO)

> Projet `mgljaheyimizrydazrxh`, sauvegarde du 8 octobre 2026, réalisée **en lecture seule**.
> L'archive contient des données personnelles (PMR, comptes, e-mails) : elle reste **hors Git**,
> chiffrée, et n'est jamais publiée.

## 1. Contenu de l'archive

```
csm-backup/
├── schema/                 DDL extrait des catalogues Postgres (voir 00_SUMMARY.md)
│   ├── 01_extensions_types.sql
│   ├── 02_tables.sql       tables, contraintes (FK en fin de fichier), RLS activée, séquences
│   ├── 03_indexes.sql
│   ├── 04_views.sql
│   ├── 05_functions.sql    fonctions et procédures de public (hors extensions)
│   ├── 06_triggers.sql     public, auth, storage
│   ├── 07_policies.sql     policies RLS de public et storage
│   ├── 08_grants_roles.sql droits tables, colonnes, fonctions ; rôles ; droits par défaut
│   ├── 09_storage.sql      buckets + inventaire des objets
│   └── 10_realtime_publication.sql
├── data/<table>.json       les 51 tables de public, un tableau JSON par table
├── auth_users.json         comptes (sans empreinte de mot de passe ni jetons)
├── auth_identities.json
├── storage/<bucket>/…      fichiers des buckets avatars, documents, taxis, movements_pdf
└── report.json             comptes de lignes et d'objets, erreurs
```

## 2. Comment elle a été produite

L'environnement n'autorise que le HTTPS sortant (pas de TCP 5432/6543), donc pas de `pg_dump`.

| Partie | Méthode |
|---|---|
| Schéma | Requêtes catalogue (`pg_get_functiondef`, `pg_get_constraintdef`, `pg_policies`…) via le connecteur Supabase, rôle `postgres`, SELECT uniquement |
| Données | `scripts/supabase-backup.mjs` (API REST, pagination par `Range`) avec un compte admin ; les lignes masquées par RLS (journal d'audit, préférences, infractions, notifications…) ont été complétées par SELECT via le connecteur et vérifiées par comptage + empreinte MD5 des clés |
| Comptes | `auth.users` sans `encrypted_password` ni jetons, via le connecteur |
| Storage | listage + téléchargement (`/storage/v1/object/authenticated` et `/public`), octets comparés à `storage.objects` |

Relancer une sauvegarde :

```bash
# Avec une clé de service valide (tout est exporté, comptes compris) :
SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/supabase-backup.mjs /home/user/csm-backup
# Sans clé de service (données limitées par RLS) :
SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… BACKUP_LOGIN_EMAIL=… BACKUP_LOGIN_PASSWORD=… \
BACKUP_TABLES="table1,table2,…" node scripts/supabase-backup.mjs /home/user/csm-backup
```

Le plus fiable reste un `pg_dump` depuis une machine qui atteint le port 5432 :

```bash
pg_dump "postgresql://postgres:<mot de passe>@db.mgljaheyimizrydazrxh.supabase.co:5432/postgres" \
  --schema=public --schema=auth --schema=storage -Fc -f baco-$(date +%F).dump
```

## 3. Chiffrement

```bash
tar -C /home/user -czf - csm-backup | age -p -o csm-backup-2026-10-08.tar.gz.age   # chiffrer (phrase de passe)
age -d csm-backup-2026-10-08.tar.gz.age | tar -xzf -                              # déchiffrer
```

## 4. Restauration

**Jamais vers la production BACO.** La cible est un nouveau projet Supabase, un Supabase local
(`supabase start`) ou un Postgres de test. Les rôles Supabase (`anon`, `authenticated`, `service_role`)
et les schémas `auth` / `storage` doivent exister : c'est le cas sur un projet Supabase.

1. **Schéma, sans les FK** : exécuter `01_extensions_types.sql`, puis `02_tables.sql` **jusqu'à la section FK**.
2. **Données** : `DATABASE_URL=… scripts/supabase-restore-data.sh csm-backup`
   (import par `json_populate_recordset`, triggers suspendus via `session_replication_role = replica`,
   séquences réalignées).
3. **FK, index, vues, fonctions, triggers, policies, droits** : section FK de `02_tables.sql`, puis
   `03` → `08`, puis `10`.
4. **Comptes** : recréer chaque compte avec le **même UUID** via l'API admin
   (`POST /auth/v1/admin/users` avec `id`, `email`, `email_confirm: true`, `user_metadata`), puis envoyer
   un lien de réinitialisation : les empreintes de mot de passe ne sont pas dans l'archive.
5. **Storage** : créer les buckets (`09_storage.sql`), puis téléverser `storage/<bucket>/<chemin>` au même
   chemin (`supabase storage cp -r storage/avatars ss:///avatars` ou l'API Storage).
6. **Contrôles** : comparer les comptes de lignes avec `report.json`, lancer `get_advisors`.

Un test de restauration complet (schéma + données) sur un Postgres 16 local est consigné en §5.

## 5. Vérification
