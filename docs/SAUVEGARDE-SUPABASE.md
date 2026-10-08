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
# Avec une clé de service valide (tout est exporté, comptes compris), GET uniquement :
# l'inventaire Storage vient d'un SELECT bucket_id, name, metadata->>'size' FROM storage.objects (connecteur),
# ce qui évite le POST /storage/v1/object/list. Dans l'environnement cloud, fetch de Node n'emprunte
# le proxy sortant qu'avec NODE_USE_ENV_PROXY=1 (sinon : « Ni clé de service valide »).
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt BACKUP_OBJECTS_FILE=/home/user/csm-backup/storage_inventory.json \
  node scripts/supabase-backup.mjs /home/user/csm-backup
# Sans clé de service (données limitées par RLS) :
SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… BACKUP_LOGIN_EMAIL=… BACKUP_LOGIN_PASSWORD=… \
BACKUP_TABLES="table1,table2,…" node scripts/supabase-backup.mjs /home/user/csm-backup
```

La clé de service permet d'exporter aussi les lignes masquées par RLS et les comptes, sans passer par le connecteur.

Le plus fiable reste un `pg_dump` depuis une machine qui atteint le port 5432 :

```bash
pg_dump "postgresql://postgres:<mot de passe>@db.mgljaheyimizrydazrxh.supabase.co:5432/postgres" \
  --schema=public --schema=auth --schema=storage -Fc -f baco-$(date +%F).dump
```

## 3. Chiffrement

```bash
tar -C /home/user -czf - csm-backup | age -r <clé publique age> -o csm-backup-AAAA-MM-JJ.tar.gz.age  # chiffrer
age -d -i csm-backup-AAAA-MM-JJ.key csm-backup-2026-10-08.tar.gz.age | tar -xzf -                       # déchiffrer
cd csm-backup && sha256sum -c SHA256SUMS                                                                # contrôle d'intégrité
```

## 4. Restauration

**Jamais vers la production BACO.** La cible est un nouveau projet Supabase, un Supabase local
(`supabase start`) ou un Postgres de test. Les rôles Supabase (`anon`, `authenticated`, `service_role`)
et les schémas `auth` / `storage` doivent exister : c'est le cas sur un projet Supabase.
Sur un Postgres nu, `search_path` doit inclure `extensions` (`alter database … set search_path = public, extensions`).

1. **Schéma, sans les FK** : exécuter `01_extensions_types.sql`, puis `02_tables.sql` **jusqu'à la section FK**.
2. **Données** : `DATABASE_URL=… scripts/supabase-restore-data.sh csm-backup`
   (import par `json_populate_recordset`, triggers suspendus via `session_replication_role = replica`,
   séquences réalignées).
3. **FK, index, vues, fonctions, triggers, policies, droits** : section FK de `02_tables.sql`, puis
   `03` → `08`, puis `10`. Dans `08`, remplacer `"PUBLIC"` par `PUBLIC`. Les policies du schéma `cron`
   et les triggers de `storage` sont gérés par Supabase : les erreurs à leur sujet sont attendues.
4. **Comptes** : `auth_users.json` se réinjecte tel quel dans `auth.users` (`json_populate_recordset`),
   mais sans empreinte de mot de passe : chaque agent devra réinitialiser le sien. Variante : recréer chaque compte avec le **même UUID** via l'API admin
   (`POST /auth/v1/admin/users` avec `id`, `email`, `email_confirm: true`, `user_metadata`), puis envoyer
   un lien de réinitialisation : les empreintes de mot de passe ne sont pas dans l'archive.
5. **Storage** : créer les buckets (`09_storage.sql`), puis téléverser `storage/<bucket>/<chemin>` au même
   chemin (`supabase storage cp -r storage/avatars ss:///avatars` ou l'API Storage).
6. **Contrôles** : comparer les comptes de lignes avec `report.json`, lancer `get_advisors`.

Un test de restauration complet (schéma + données) sur un Postgres 16 local est consigné en §5.

## 5. Vérification

Test réalisé le 8 octobre 2026 sur un Postgres 16 local, avec un socle imitant Supabase (rôles, `auth.users`,
`auth.uid()`, `storage.*`), en suivant la procédure du §4 :

| Contrôle | Production | Restauré |
|---|---|---|
| Tables `public` et nombre de lignes de chacune | 51 | 51, toutes identiques |
| Comptes `auth.users` | 29 | 29 |
| Clés étrangères | 49 | 49 |
| Fonctions `public` | 30 | 30 |
| Triggers `public` + `auth` | 26 | 26 |
| Policies | 168 | 166 (les 2 de `cron` appartiennent à Supabase) |
| Fichiers Storage (avatars / documents / taxis / movements_pdf) | 21 / 17 / 1 / 0 | octets identiques à `storage.objects` |

Contrôles d'extraction : MD5 calculé côté serveur pour chaque bloc de DDL et chaque lot de lignes, comparé à
celui des fichiers. Les tables exportées par REST ont été recomptées en SQL ; celles que RLS masquait au compte
admin (`audit_log`, `procedure_versions`, `user_preferences`, `infractions`, `favoris`, `notifications`) ont été
réexportées par le connecteur. `SHA256SUMS` couvre chaque fichier de l'archive.

### Session 2 (8 octobre 2026, après rotation des clés)

Sauvegarde relancée avec la clé de service, **GET uniquement** : 51 tables sur 51 aux comptes identiques au
`count(*)` SQL (9 257 lignes ; la 52ᵉ entrée de l'OpenAPI est la vue `admin_audit_view`), 29 comptes,
39 fichiers Storage (21 / 17 / 1 / 0) dont la taille est identique à `storage.objects`.
Empreintes : `auth_password_hashes.json` (`id`, `encrypted_password`), 29 sur 29, toutes en bcrypt `$2a$`
(coût 6 ou 10), MD5 de contrôle identique à celui calculé côté serveur. Le DDL (`schema/`) n'a pas été
réextrait : il se relit à la demande par le connecteur.

**Non sauvegardé** (session 1) : les empreintes de mot de passe (`auth.users.encrypted_password`) et les jetons Auth,
les secrets du Vault, la configuration Auth du tableau de bord (fournisseurs, modèles d'e-mails, URL de redirection).
