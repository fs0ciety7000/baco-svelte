# pocketbase/ — instance PocketBase dédiée à CSM

Backend de CSM v2 (voir `../CLAUDE.md` et `../docs/CSM-V2.md`). Version figée : **0.40.4** (Dockerfile, binaire local).
Le navigateur ne parle **jamais** à PocketBase : seul le serveur Next l'appelle, avec le jeton de l'agent
(les règles d'accès s'appliquent donc à chaque requête, comme les policies RLS).

## Commandes

```bash
P="--dir pb_data --migrationsDir pb_migrations --hooksDir pb_hooks"
pocketbase migrate up $P                                   # appliquer les migrations
pocketbase superuser upsert <email> <mot de passe> $P      # compte superuser local
pocketbase serve --http 127.0.0.1:8090 $P                  # serveur local
CSM_IMPORT_RESET=1 pocketbase csm-import /home/user/csm-backup $P   # import de la sauvegarde Supabase (hors Git)
PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… node scripts/test-rules.mjs  # tests des règles (482 contrôles)
node scripts/perms-equivalence.mjs pb_data/data.db         # rôles v3 : ancien calcul ↔ users.perms (0 écart attendu)
CSM_IMPORT_SCOPE=commandes CSM_IMPORT_RESET=1 pocketbase csm-import … $P  # Commandes + PMR, comptes gardés
CSM_IMPORT_SCOPE=pmr CSM_IMPORT_RESET=1 pocketbase csm-import … $P        # PMR seul (zones, matériel, prestations)
CSM_IMPORT_SCOPE=operations CSM_IMPORT_RESET=1 pocketbase csm-import … $P # main courante + 211 PN de BACO
# Bascule : ce qui a été saisi dans BACO après l'import initial, sans écraser CSM (docs/DEPLOIEMENT-V2.md §7)
pocketbase csm-import-delta /home/user/csm-backup-gel --base /home/user/csm-backup-prod --dry-run --report r.json $P
```

## Conventions

- **Migrations JS** dans `pb_migrations/` (`<horodatage>_<nom>.js`, `migrate(up, down)`), appliquées au démarrage.
  Jamais de modification de schéma par l'interface admin sans la reporter en migration.
- **Rôles v2** (`1760002800_roles_v2.js`, 11 oct. 2026) : `admin`, `sysop` (tout), **`moderator`** (Modérateur : tout ce
  qu'a `paco` + suppression partout — `canDelete` : admin, modérateur sauf droit retiré, ou droit accordé — et Nouveautés ;
  ni comptes ni réglages), **`paco`** (PACO/RCCA : lecture partout,
  écriture et modification, **jamais de suppression** ; a les pouvoirs des anciens coordinateurs dans les hooks), **`guest`**
  (invité : lecture bus et taxi), `disabled`, `connector`. Les anciens `moderator` / `user` / `otto_agent` / `reader` sont
  convertis en `paco` et **refusés** ensuite. Droits par module : `X:read`, `X:write` (**création**), `X:update`
  (**modification** : toutes les `updateRule` testent `:update`, sauf `dicos:write` du connecteur), `X:delete`
  (suppression : `deleteRule` = admin ou droit accordé ; restent permis à leur propriétaire : notifications, trains suivis,
  passkeys, sessions, jetons, coche ALEA). Un `X:write` accordé / retiré avant la migration l'est aussi en `X:update`.
  Nouveautés (`changelog`) : admin, sysop, modérateur. Les règles réécrites testent `(paco || moderator)`. `users.districts` (1 à 3, admin seul) : filtres et alertes
  (`dutyDistricts` : jour coché → districts permanents → `district`). La migration réécrit les règles en place par
  remplacement de motifs : toute nouvelle collection doit écrire directement `paco` / `guest`.
- **Rôles v3, lots L0-L1** (14 oct. 2026, `docs/design/CADRAGE-ROLES-V3.md`) : **`users.perms`** (JSON, migration
  `1760004300`) = permissions effectives, **écrites par le hook seul** (`users.pb.js` → `lib/perms.js`, chargé par
  `require()`) à chaque création / modification d'un compte, à partir de `role`, `grants`, `denies` ; une valeur envoyée
  dans le corps est ignorée (admin et superuser compris) ; jamais `null` (`[]` pour écran, désactivé, connecteur) ;
  recalculé pour tous les comptes au démarrage de `serve` si le catalogue a changé (SQL, sans `updated`). Catalogue et
  rôles par défaut : **`lib/catalog.js`, copie générée** depuis `web/src/lib/permissions/catalog.ts` par `npm run catalog`
  (web/) — ne jamais l'éditer à la main. `onRecordEnrich` masque `perms` / `grants` / `denies` d'un autre agent aux
  non-admins (le compte `connector` lit `perms`, pas grants / denies ; l'agent lit les siens) ; `@request.auth.*` des
  règles n'est pas touché. **Les règles ne testent pas encore `perms`** (lot L2). Une écriture SQL directe sur `users` ne
  rafraîchit pas la fiche `@request.auth` des souscriptions temps réel ouvertes (`$app.save()`, lui, la rafraîchit).
- **Règles** : construites avec `can(perm, rôles)` (rôle par défaut, `grants` / `denies` par agent).
  `users.role`, `grants`, `denies`, `banned_until`, `email` ne sont modifiables que par un admin.
- **Identifiants** : les UUID Supabase sont conservés (`users.id` accepte 15 à 36 caractères `[a-z0-9-]`) ;
  les tables à clé numérique gardent l'ancienne clé dans `legacy_id`.
- **Hooks** (`pb_hooks/*.pb.js`) : isolés, la logique partagée est dans `pb_hooks/lib/` chargée par `require()`.
  `audit.pb.js` trace les écritures faites par l'API (auteur + différentiel), `import.pb.js` ajoute `csm-import`,
  `users.pb.js` force `grants` / `denies` en tableau. Piège : dans un hook, `record.get()` d'un champ JSON renvoie
  du JSON brut (pas un tableau JS) → tester `record.getString(champ)`.
- **Piège des règles** : un champ JSON `null` rend `x !~ '…'` faux (NULL SQL) et coupe l'accès ; tout champ JSON
  utilisé dans une règle doit avoir une valeur par défaut posée par hook.
- **Import** : CLI uniquement (aucune route HTTP), en une transaction ; les empreintes bcrypt `$2a$` de Supabase sont
  recopiées telles quelles dans `users.password` (connexion testée, coûts 6 et 10).
- **Correspondances d'import** : une fonction par table dans `lib/import.js` (`fillCompany`, `fillBusOrder`, `fillOpsLog`…),
  partagées par `csm-import` et `csm-import-delta` (refactor du 11 oct. vérifié : empreinte de la base importée identique
  avant / après). Toute évolution d'une correspondance vaut pour les deux.
- **Import différentiel** (`csm-import-delta`, `lib/import-delta.js`, bascule finale) : lit une sauvegarde Supabase plus
  récente (format de `scripts/supabase-backup.mjs`) ; ligne du delta = horodatage BACO postérieur à `--since`, ou fiche citée
  par le journal d'audit BACO (`audit_log` / `audit_logs`) après `--since`, ou ligne différente / absente de la sauvegarde de
  base `--base` (celle de l'import initial). Absente de CSM et nouvelle → créée ; identique → rien ; différente et non
  modifiée dans CSM → mise à jour des **champs repris** seulement ; modifiée dans CSM → **conflit** (jamais écrasée) ; absente
  de CSM mais ancienne → conflit (supprimée dans CSM : pas recréée) ; **jamais de suppression**. « Non modifiée dans CSM » =
  `updated` ≤ `--imported-at` (auto : dernière fiche importée + 1 min, gardée au registre), **ou** champs repris égaux à
  l'empreinte écrite par le delta précédent (registre `app_settings.import_delta`), **ou** égaux à ce que la ligne de base
  aurait produit (seule voie pour `line_stations`, sans `updated`). Clés : `legacy_id` ; `taxi_orders` (pas de legacy_id) =
  date de création BACO rétablie ; `b201_reports` = jour ; `ops_log_reads` = entrée + agent ; `audit_log` = date + table +
  fiche + action ; `ebp_views` (aucun id dans BACO) = contenu, **exige `--base`**. Tables BACO **sans horodatage** :
  `societes_bus`, `chauffeurs_bus`, `contacts_bus`, `lignes_bus`, `ligne_data`, `pn_data`, `contacts_repertoire`,
  `spi_data`, `ebp` ; **sans `updated_at`** (création seule datée) : `otto_commandes`, `taxi_commands`, `taxis`, `pmr_data`,
  `ptcar_abbreviations`, `document_metadata`, `log_reactions`, `daily_movements`, `movement_interventions` → modifications
  vues par `--base` (et par le journal d'audit BACO pour sociétés, chauffeurs, contacts, lignes de bus, taxis, annuaire,
  clients PMR, matériel PMR, journal, procédures, documents). Comptes : création seule, `role = disabled` +
  `disabled_role = paco` (empreinte BACO reprise si `auth_password_hashes.json` est fourni) ; comptes existants jamais
  modifiés. Prestations de la saisie de la journée (abandonnée) : création, ou conflit « à reprendre à la main » si
  l'intervention a changé. Procédure mise à jour → version précédente archivée (le hook de versioning est un hook de
  requête). Commandes : `order_events` « legacy » à la création et au changement de statut. Les hooks de **requête**
  (transitions, notifications, audit) ne jouent pas en CLI : aucune notification envoyée. Transaction par table (une seule,
  annulée, en `--dry-run`) ; arrêt à la première table en erreur. Rapport JSON + texte (`--report`) : identifiants et noms
  de champs seulement, jamais de valeur. Test local du 11 oct. (copie de la base prod du 10 oct. + sauvegarde fictive) :
  9 créations, 6 mises à jour (dont 2 par champ), 5 conflits (fiche modifiée dans CSM ×3, supprimée dans CSM, clé unique
  PtCar prise), relance = 15 identiques / 0 écriture, 2e vague (registre) correcte. **Jamais lancé sur la prod** sans
  l'accord de l'utilisateur (procédure : DEPLOIEMENT-V2 §7).
- **Piège des fichiers** : PocketBase efface les fichiers d'une fiche supprimée *après* la validation de la
  transaction. Purger puis réimporter des fiches de même identifiant dans une seule transaction perd les fichiers
  → purge et import dans deux transactions (`lib/import.js`).
- **Module Commandes** (`1760000200_commandes.js`, `orders.pb.js`, `lib/orders.js`) : **cycle v3** (`1760003400`, 14 oct.
  2026) `brouillon` (brouillon / en cours) → `termine` (bus démobilisés) → `envoye` (envoyé / finalisé), ou `annule`.
  Transitions par hook (table `TRANSITIONS` de `lib/orders.js`) : brouillon → terminé / annulé ; terminé → envoyé /
  brouillon / annulé ; `envoye → termine` (« Rouvrir ») et « rétablir » une annulée réservés aux coordinateurs ; un bon
  envoyé n'est **plus modifiable** (400) avant d'être rouvert ; motif d'annulation obligatoire ; envoi permis sans e-mail
  fournisseur (PDF seul). « Confirmé », « En cours », la clôture à 5 jours, l'alerte `bus-h2` et la route de relance
  n'existent plus (anciens statuts convertis : terminé / envoyé → envoyé, confirmé / en cours → brouillon). Les horodatages
  `*_at` / `*_by` (`ended_*` au passage à terminé, `sent_*` à envoyé), `number` et `status_before_cancel` sont posés par le
  hook et **refusés dans le corps des requêtes**. Chaque transition écrit `order_events` (lecture seule ; anciens statuts
  gardés). Création toujours en `brouillon`, au nom de l'agent. `number` = n° de bon, attribué par une seule instruction
  SQL atomique sur `_order_counters` ; = ancien id pour les bus importés. Rôle Écran : lit les bons bus en brouillon ou
  terminés. `time_pending` / `return_time_pending` (taxi) : heure de prise en charge / de retour non saisie.
  `updated_by` de `pmr_clients` / `b201_reports` et l'attribution BACO des bus (`sent_by_name`, `validated_by`,
  `legacy_id`) ne sont pas forgeables.
- **Piège des index** : un champ nombre vide vaut **0**, pas NULL → un index unique `WHERE legacy_id IS NOT NULL`
  bloque la 2e fiche créée dans CSM. Toujours `WHERE legacy_id > 0`.
- **Accès** (avant les rôles v2) : taxi, sociétés de taxi et clients PMR n'étaient pas lisibles par `otto_agent` ; modèles
  `order_templates` tous partagés (décision du 8 oct.) ; `b201_reports` une fiche par `day`, non modifiable, écrite par
  les agents (user, otto_agent) rattachés à un district et les moderators (`1760000300`) ; `users.district` réservé à l'admin.
- **Module PMR** (`1760000400_pmr.js`, `pmr.pb.js`, `lib/pmr.js`) : pas de « journée » (abandonnée) ; `pmr_assists`
  = une prestation par assistance (créée « prévue » au nom de l'agent, période et zone déduites par hook, transitions
  prévue ⇄ réalisée / annulée / absent avec motif), `pmr_equipment` (création / suppression coordinateurs, état par
  `pmr:write`), `pmr_zones` (coordinateurs, district), `pmr_events` (hooks seulement ; un lien client est tracé « lié »,
  jamais le nom). Cron `pmr-retention` (3 h 15) : après 12 mois, prestations anonymisées (client, réf. DICOS, remarque,
  motif), texte BACO supprimé, notes d'historique et journal d'audit des prestations effacés, copies PMR des taxis
  vidées ; fiches sans activité (`last_activity`, posée par hook sur prestation ou taxi lié) depuis 24 mois archivées
  et leur audit > 24 mois purgé. Import : texte DICOS analysé (`parseDicos`, 373/375 lignes) ; texte d'origine dans
  **`pmr_assist_legacy`** (lisible avec `pmr:read` seulement : une règle ne masque pas un champ). Règles : lien client
  seulement avec `pmr:read`, `legacy_id` / `created_by` / `last_activity` non forgeables, matériel modifiable en
  entier par les coordinateurs seulement (les autres : état, précision, réparation). Période toujours recalculée
  depuis l'heure ; zone recalculée quand la gare change. Les callbacks étant isolés, toute fonction
  partagée (ex. `event`) vit dans `lib/`.
- **Module Opérations** (`1760000500_operations.js`, `operations.pb.js`, `lib/operations.js`) : `ops_log` (auteur forcé,
  statut / heure / district / mentions posés par hook, `notified` = agents déjà notifiés, retrait avec motif par l'auteur
  15 min puis coordinateurs, rétablissement coordinateurs, suppression admin), `ops_log_reads` et `ops_log_events`
  visibles comme l'entrée, `notifications` (écrites par les hooks seulement, le destinataire lit / marque lu / supprime ;
  supprimées au retrait de l'entrée ; purge 30 j lues / 90 j), `level_crossings` (zone = code texte, coordinateurs),
  `train_watches` (10 par agent, aujourd'hui ou demain ; cron `train-watches` toutes les 2 min, 40 trains et 90 s au
  plus, 350 ms entre appels iRail via `sleep`). Dépôts (`depot_*`) sur `pmr_zones`, zone FNR créée.
- **Intégration DICOS / Missions PMR** (`1760000600_dicos.js`, `pmr.pb.js`) : les missions PMR de DICOS sont ingérées
  dans `pmr_assists` (`dicos_id` unique partiel `WHERE dicos_id != ''`, `source`, `mission_type`) par un **compte de
  service** portant le droit `dicos:write` (jamais un agent interactif). Branche ajoutée à `createRule`/`updateRule` :
  `source = "dicos"`, `dicos_id` posé, `created_by`/`updated_by` = l'appelant, `legacy_id`/`anonymized` non forgeables,
  `dicos_id`/`created_by` non modifiables. Statut libre à l'ingestion (une mission peut arriver déjà réalisée) : le hook
  **saute les contrôles de transition seulement pour `source=dicos` + `dicos:write`** (`dicosIngest`), un agent reste
  soumis aux transitions. Le détail **nominatif** (client, e-mail, téléphone, accompagnateur, conducteur, point de
  rencontre, voiture / porte) va dans **`pmr_mission`** (une par assist, `cascadeDelete`), lisible avec `pmr:read`
  seulement (`otto_agent` ne lit pas) — une règle ne masque pas un champ. La purge `pmr-retention` efface aussi
  `pmr_mission` quand l'assist est anonymisée. Le compte de service a un **rôle dédié `connector`** (hors READERS,
  `1760000700`) : il ne lit QUE `pmr_assists` et `pmr_mission` (branche `dicos:write` ajoutée à leurs list/view), pas
  le reste du nominatif PMR (`pmr_clients`, `pmr_assist_legacy`, taxis) — moindre privilège (audit du 8 oct.).
  17 contrôles de règles dédiés (161 au total).
- **Module Référentiels** (`1760000900_referentiels.js`, `referentiels.pb.js`) : `directory_contacts` (annuaire),
  `spi_points` (zones SPI par ligne), `ptcar` (abréviations, `abbr` **unique**), `ebp_views` (correspondances),
  `documents` (fichier **protégé**, servi par Next), `procedures` (Markdown, `attachments` → `documents`),
  `procedure_versions` (écrites **par hook** seulement). Écriture annuaire / SPI / PtCar / EBP = **coordinateurs**
  (`*:write`, moderator) ; procédures + documents = **user + moderator** (comme la v1). `updated_by`/`uploaded_by`
  non forgeables, `legacy_id` figé. Hooks : **versioning atomique** des procédures (snapshot de l'état précédent à
  chaque modif, BUG-8) et **refus de suppression** d'un document référencé par une procédure (BUG-6/9). Les gares
  (`line_stations`) et PN (`level_crossings`) sont seulement **lus** par l'onglet Lignes. 12 contrôles de règles.
- **Sauvegardes** : réglées par migration (`0 2 * * *`, 14 conservées dans `pb_data/backups`). `backups.pb.js`
  (`onBootstrap`) les envoie dans **R2** si `CSM_BACKUP_S3_ENDPOINT` / `_BUCKET` / `_ACCESS_KEY` / `_SECRET` sont posées,
  sinon coupe S3 et efface le secret (variables = seule source de vérité : une copie restaurée n'écrit pas dans le bucket
  de production) ; seulement pour `serve` ; `CSM_BACKUP_KEEP` pour la conservation ; une erreur de réglage n'empêche pas
  le démarrage.
- **Alerte synchro DICOS** : cron `dicos-stale` (10 min, `lib/operations.js` → `dicosStaleAlert`), notification
  `systeme` (`source = "dicos-sync"`, `source_id` = dernière synchro) ; `CSM_DICOS_ALERT_HOURS` (`6-22`, `off`).
- `PREPROD_PB_*` désigne une autre instance (jeu) : **n'y jamais écrire**, ne pas y lancer `test-rules.mjs`.
- **Groupes DICOS** (`1760001500_group_missions.js`) : `group_missions` = une ligne par trajet de réservation de groupe
  (`dicos_id = j<journeyId>`, unique), écrite par le connecteur (`dicos:write`, `dicos_id` figé), lue avec `pmr:read`
  (pas `otto_agent`), suppression admin. Contact (nom, téléphone, e-mail) effacé à 12 mois par `pmr-retention`.
- **Journal / districts du jour / iRail** (`1760001600_journal_irail_duty.js`) : `ops_log.author` facultatif, `source`
  (`agent`/`irail`) et `external_id` (unique partiel) **refusés dans les requêtes** ; `users.duty_day` + `duty_districts`
  (modifiables par l'agent lui-même) ; notification `perturbation`. `lib/operations.js` : `dutyDistricts` (jour coché,
  sinon district du profil), urgences selon ces districts, `irailJournal` (cron `irail-journal`, 5 min, 30 entrées max par
  passage, perturbation > 24 h ignorée, district par gares citées dans le titre ou le texte ≥ 4 lettres).
  `CSM_IRAIL_URL` : autre source (mock) ou `off` (CI).
- **ALEA** (`1760001700_pmr_assistance_level.js`) : `pmr_assists.full_pax` / `light_pax` (voyageurs en assistance
  complète / légère, compteurs DICOS posés par l'ingestion ; 0 et 0 = inconnu) pour le logigramme « Obligatoire ».
- **Synchros DICOS** (`1760001900_dicos_syncs.js`) : `dicos_syncs` (jour, `kind` missions / groups / schedules,
  compteurs), une fiche par envoi de l'extension, écrite par le connecteur, lue avec `pmr:read`, jamais modifiable,
  purgée après 60 jours. Sert à « synchronisé il y a X min ».
  Depuis `1760002000` : `complete` (dernier lot du jour reçu ; fiches antérieures mises à vrai), `version` (extension),
  `synced_by` (propriétaire du jeton personnel).
- **Jetons de connecteur** (`1760002000_connector_tokens.js`) : `connector_tokens` (user, label, `token_hash` SHA-256
  unique, prefix, last_used, last_version). Création pour soi avec `deplacements:write` (dates d'usage non forgeables),
  lecture propriétaire / admin / connecteur, mise à jour par le connecteur seul (usage), suppression propriétaire ou
  admin ; 10 au plus par agent et suppression à la désactivation du compte (`users.pb.js`).
- **Horaires ATMS** (`1760001800_train_schedules.js`) : `train_schedules` (jour + train uniques, `stops` JSON : abréviation
  PtCar, nom ATMS, arrivée, départ, temps d'arrêt, position), écrits par le connecteur (`dicos:write`, jour et train
  figés), lus avec `pmr:read` (pas `otto_agent`), purgés après 60 jours par `pmr-retention`. Données d'exploitation.
- **Retards des trains de mission** (`1760002100_mission_trains.js`, cron `mission-trains` toutes les 3 min, 5 h - minuit à
  Bruxelles, `lib/operations.js` → `missionTrains`) : trains des `pmr_assists` / `group_missions` du jour (pas annulées ni
  réalisées, ni taxi), dans une fenêtre de 90 min avant le départ à 60 min après l'arrivée ; 60 trains et 100 s par
  passage, 350 ms entre appels iRail. `mission_trains` (jour + train uniques) : retard courant, `cancelled`, `stops`
  (`st`, `t`, `d`, `c`, `l`), écrit par le hook seul, lu avec `deplacements:read`, purgé après 7 jours. Notification
  `train` aux agents `deplacements:read` des districts concernés (districts du jour), au retard ≥ 5 min à la gare
  assistée puis par paliers de 10 min, et à la suppression de l'arrêt (`notified_delay`, `notified_cancel`).
  `CSM_IRAIL_URL=off` coupe aussi ce suivi (CI).
- **ALEA « encodé »** (`1760002200_alea_marks.js`) : `alea_marks` (jour, `kind` pmr / groupe, `block` = clé
  jour|train|gare|sens de l'export, `marked_by` forcé = l'appelant), unique par (kind, block) ; coché / décoché par un agent
  `deplacements:write`, lu avec `deplacements:read`, purgé après 30 jours.
- **Journal v2** (`1760002300_journal_threads.js`) : catégories `service`, `perturbation`, `groupes` ; `ops_log.reply_to`
  (réponse, un niveau : le hook rattache une réponse de réponse au fil d'origine, refuse un message absent ou retiré ;
  non modifiable après publication). Mentions de district `@DSO` / `@DSE` / `@DCE` (`districtTagsIn`, une fois par district
  et par entrée, `*@DSO` dans `notified`). Tri automatique : réglage `app_settings.journal_rules` (`{ rules: [{ source:
  irail|baco, match, category }] }`), appliqué par `journalCategory` aux messages iRail (perturbations → `perturbation`) ;
  reclassement des messages BACO (`legacy_id > 0`) depuis Administration › Tri du Journal. Un changement de catégorie
  seul ne pose plus `edited_at` (pas de « modifié »).
- **Mot de passe oublié** (`1760002500_password_reset.js`, `pb_hooks/mail.pb.js`) : modèle d'e-mail français, lien vers le
  site (`{APP_URL}/connexion/nouveau-mot-de-passe?token=`), 30 min ; SMTP depuis `CSM_SMTP_*` / `CSM_MAIL_SENDER` /
  `CSM_APP_URL` ; `GET /api/csm/password-reset` → `{ enabled }`.
- **Passkeys** (`1760002600_passkeys.js`, `pb_hooks/passkeys.pb.js`) : routes internes `POST /api/csm/passkey/lookup`,
  `/token` et `/register` (création : aucune règle `createRule`), en-tête `x-csm-internal` = `CSM_INTERNAL_SECRET` (404 sinon), compteur qui ne recule pas, compte désactivé refusé.
- **Profil** (`1760002400_profile.js`) : `users.avatar` protégé (jpeg/png/webp, 2 Mo, miniatures 96x96 / 256x256), `users.work_phone` (40) ; modifiables par l'agent lui-même (`updateRule` inchangée).
- **Statut, sessions, campagnes** (`1760002700_status_sessions_campaigns.js`) : `users.status` / `status_day` ;
  `user_sessions` (**aucune création par l'API** : route interne `/api/csm/session/open`, 20 par agent au plus, purge cron
  `user-sessions-purge` après 30 j ; seule `last_seen` modifiable, lecture / suppression propriétaire ou admin) ;
  `mail_campaigns` (admin / sysop, `created_by` forcé, verrou `envoi` posé seulement sur un brouillon). Routes internes :
  `POST /api/csm/mail/send` (`mail.pb.js`, 503 sans SMTP, sujet sans CR/LF) et `/api/csm/session/rotate` (`passkeys.pb.js` :
  `refreshTokenKey` + `newAuthToken`). 261 contrôles.
- **Prod** (`pb-csm.fs0ciety.org`, 10 oct.) : base construite en local (`migrate up`, `superuser upsert`, `csm-import` d'une
  sauvegarde Supabase fraîche + empreintes, script des référentiels, compte `connector`), zip `POST /api/backups` puis
  `upload` + `restore` sur la prod. Ne jamais lancer `test-rules.mjs` ni d'E2E contre la prod.
- **Archives des bons** (`1760002900_order_archives.js`, `archives.pb.js`, `lib/archives.js`) : `order_pdfs` (kind, order_id,
  reference, route, service_day, district, file PDF protégé 10 Mo, generated_by, r2_key / r2_at / r2_error ; unique
  (kind, order_id)) et `order_pdf_backups` (month AAAA-MM unique, count, zip protégé 500 Mo). **Aucune écriture par l'API** :
  routes internes `POST /api/csm/archives/store` (multipart, upsert, rend la main sans attendre R2 ; ancienne copie R2
  retirée si la clé change) et `/api/csm/archives/backup` (**un mois par appel**) (secret `CSM_INTERNAL_SECRET`).
  `1760002910` : `content_at` (contenu, seul repère des zips à refaire), `r2_tried_at`, `as_of` du zip. Copie R2 par le
  cron `order-pdf-r2` (5 min, 20 PDF + 2 zips, par ancienneté d'essai) ; archive supprimée → copie R2 retirée et mois
  refait (nombre de PDF ≠ zip). Lecture `archives:read` (paco, moderator), suppression `archives:delete` (moderator) / admin.
  R2 : `$filesystem.s3` avec les variables `CSM_BACKUP_S3_*` (dossier `bons/`), `CSM_ARCHIVE_R2=off` pour couper ; sans
  variables : volume seul. Cron `order-pdf-backup` (1 h UTC) : zip « stocké » écrit dans un `Uint8Array` préalloué
  (CRC32 maison, ~2 s/Mo en JSVM, mémoire bornée ; refus au-delà de 200 Mo par mois), 6 mois au plus, chacun isolé.
- **Fournisseurs** (`1760003100_suppliers.js`, 11 oct. 2026 : Commandes › Fournisseurs) : `bus_companies`,
  `taxi_companies`, `bus_drivers`, `bus_contacts`, `bus_company_lines` gardent les règles des rôles v2 (création
  `otto:write` / `generate_taxi:write`, modification `:update`, suppression `:delete`) ; `legacy_id` **refusé dans le
  corps** (création et modification) ; `bus_companies.notes` (2000). Hook `orders.pb.js` : une société citée par un bon
  ne se supprime pas (400, `companyUses` dans `lib/orders.js`).
- **Battements des tâches planifiées** (`1760003110_cron_runs.js`, `lib/heartbeat.js`) : **tout `cronAdd` passe par
  `require(lib/heartbeat.js).run($app, '<nom>', () => { … })`** (erreur capturée, journalisée, notée ; jamais relancée)
  → fiche `cron_runs` (nom unique, début, fin, durée, `ok`, erreur, nombre de passages), lue par admin / sysop, jamais
  écrite par l'API. Nouvelle tâche : l'ajouter à `EXPECTED` (périodicité en minutes, sert au « en retard »). Ne pas
  avaler une erreur dans le corps d'une tâche (sinon elle paraît OK).
- **Supervision** (`supervision.pb.js`) : route interne `GET /api/csm/health` (secret `CSM_INTERNAL_SECRET`) →
  sauvegardes (`$app.newBackupsFilesystem().list('')`, la plus récente, volume ou S3), battements + `EXPECTED`, SMTP
  (`settings().smtp.enabled`), archives en attente / en erreur de copie R2, versions d'extension (`connector_tokens`
  groupés par `last_version`), conservation du Journal. `POST /api/csm/journal/retention` : purge à la demande.
- **Conservation du Journal** (11 oct. 2026, **24 mois, à valider DPO**) : cron `journal-retention` (3 h 50 UTC,
  `lib/operations.js` → `journalRetention`) : messages `ops_log` créés il y a plus de `CSM_JOURNAL_RETENTION_MONTHS`
  mois (**coupée tant que la variable n'est pas posée** ; `24` = durée proposée) supprimés par `$app.delete` (pièces
  jointes effacées, lectures et historique en cascade, notifications par le hook), journal d'audit **gardé** ; réponses d'abord, message d'origine gardé tant qu'une réponse reste,
  consigne encore épinglée gardée ; 500 messages et 50 s par passage. Testé en local sur des données fictives antidatées
  (SQL direct sur `created`).

- **Rôle « Écran »** (`1760003000_screen_role.js`, 11 oct. 2026) : `screen` = compte d'affichage du poste partagé, qui ne voit
  que `/tv`. La migration a ajouté `&& @request.auth.role != "screen"` à **toutes** les règles (lecture, écriture,
  suppression) puis rouvert des lectures bornées : sa fiche `users`, `app_settings` clé `maintenance`, `bus_orders` en brouillon /
  terminés, `pmr_assists` non anonymisées, `mission_trains`, `alea_marks`, `dicos_syncs`, `ops_log` actifs urgents / épinglés
  / iRail ; `user_sessions` inchangée. Rien de nominatif (ni `taxi_orders`, ni `group_missions`, ni `pmr_mission`,
  `pmr_clients`…) et **aucun droit accordé (`grants`) ne s'applique**. **Toute nouvelle collection** doit écrire elle-même
  `&& @request.auth.role != "screen"` dans ses règles. Hooks : `hasJournalRead` / `hasPerm` (lib/operations.js) refusent
  `screen` (jamais destinataire d'une notification).
- **Alertes et fiabilité DICOS** (`1760003010_dicos_presence_alerts.js`, `lib/alerts.js`, 11 oct. 2026) :
  - (cron `bus-h2` retiré avec le cycle v3 du 14 oct. 2026.)
  - **changements DICOS de dernière minute** (hooks `pmr_assists` / `group_missions` de `pmr.pb.js`, écriture du compte
    `dicos:write` seulement) : mission nouvelle (seulement si une synchro complète du jour existe déjà, sinon la première
    synchro du matin alerterait tout), annulée, rétablie, déplacée ou bout IN / OUT ajouté / retiré, **aujourd'hui et dans
    les 3 h** → notification de type **`dicos`** (nouveau) aux agents `deplacements:read` (groupes : `pmr:read`) dont les
    districts du jour contiennent celui de la gare (pas de diffusion sans district) ; texte : gare, heure, train, type
    PMR ou taille du groupe, **jamais de nom**. Dédup `source = "dicos"`, `source_id = <id>:<new|can|tim>:<IN|OUT>:<heure>`
    par agent. Miroir web testé : `web/src/lib/pmr/dicos-changes.ts`.
  - **missions vues** : l'ingestion envoie dans chaque `dicos_syncs` la liste `seen` (`j<journeyId>` du lot) ; le hook la
    vide et pose en SQL `last_seen_sync` (= `created` du lot) et `last_seen_by` (= `synced_by`) sur `pmr_assists` /
    `group_missions` (pas d'audit, pas d'événement temps réel, `updated` inchangé). Sur le dernier lot (`complete`), il pose
    `session_start` = `created` du premier lot de la même synchro (même jour, type et agent depuis sa synchro complète
    précédente). `last_seen_*` et `session_start` sont refusés dans les requêtes. L'écran « Absente de DICOS » est calculé
    côté web (`isAbsentFromDicos`). Limite : CSM ne connaît pas le périmètre de gares de la vue DICOS de l'agent, donc une
    mission n'est jugée que par la synchro du MÊME agent que celle qui l'a vue en dernier ; secret partagé (sans agent) et
    missions jamais vues depuis la mise en service : jamais signalées ; un jour sans aucun groupe n'envoie pas de lot
    « groups » (groupes disparus d'un coup non signalés).
  - Contrôles : `/api/crons/<id>` (superuser) lance un cron **en arrière-plan** (réponse 204 avant la fin) : attendre avant de
    compter ses effets (`test-rules.mjs`).
- **Référentiel des relations de trains** (`1760003600_timetable.js`, `timetable.pb.js`, `lib/timetable.js`, 14 oct. 2026) :
  `train_paths` (chemin Infrabel par n° de train : relation, lignes, gares `{n, k (NL), l, i}` ; superuser seul ; purge 60 j),
  `train_services` (train de la semaine de référence : clé n° + empreinte, type, relation, série, arrêts JSON avec passages
  `p: 1`, lignes, clés de recherche `|nom|`), `train_relations` (résumé par relation). Lecture : agents hors invité, Écran,
  désactivé. **Aucune écriture par l'API** : routes internes (secret) `GET/POST /api/csm/timetable/status` (app_settings
  `timetable` ; `state: "running"` refusé si un import tourne depuis < 30 min = verrou), `POST/GET …/paths`, `POST …/services`,
  `…/relations` (upsert, rien n'est écrit si `sig` est inchangée), `…/finish` (supprime les clés absentes ; refusé sous 500
  trains / 20 relations).
- **Référentiel des gares** (`1760003700_stations.js`, 14 oct. 2026) : `stations` (key = nom FR replié, unique ; name, name_nl,
  abbr, uic, country, district DSO/DSE/DCE, `district_manual`, aliases, lines, search_key `|nom|`, served, sig_import).
  Lecture : agents actifs sauf Écran (invité et compte de service compris). Modification : `ptcar:update`, `updated_by`
  forcé ; le hook (`timetable.pb.js`) refuse tout champ sauf le district et pose `district_manual` (faux si le corps envoie
  `district_manual: false` = retour à l'automatique). Création / suppression : import seulement (route interne
  `POST /api/csm/timetable/stations`, district gardé si manuel) ; `GET /api/csm/stations/districts` pour l'ingestion DICOS.
  Audit des modifications (`audit.pb.js`).
- **Lignes** (`1760003850_rail_lines.js`, 14 oct. 2026) : `rail_lines` (line = n° normalisé unique « 96 », name = extrémités,
  stations JSON ordonné `{n, a?, km?, b?, g?}` : tronc puis embranchements `b`, `g` = reprise après un trou ; branches
  `{b, from, to}`, count, oriented, sig). Lecture comme `train_services` (ni invité, ni Écran, ni désactivé) ; **aucune
  écriture par l'API** : route interne `POST /api/csm/timetable/lines` (upsert par n°, rien si `sig` identique) ; `…/finish`
  supprime les lignes absentes si la liste `lines` reçue en compte au moins 20. Pas de district stocké (calculé côté web
  depuis `stations`). `line_stations` (BACO) inchangée : bons bus et Admin › Lignes et arrêts.
- **N° de train d'un bon** (`1760003800_order_train.js`, 14 oct. 2026) : `bus_orders.train_number` et
  `taxi_orders.train_number` (texte, 6 chiffres au plus, motif `^[0-9]*$`), règles du bon inchangées ; non repris de BACO
  (import et import différentiel ne le touchent pas).
- **Gares v2** (`1760003950_stations_v2.js`, 14 oct. 2026) : district DSO / DSE / DCE / DNO / DNE, `kind` (gare / pang /
  etranger, posé par l'import s'il est vide), `lat` / `lon`, `district_suggested` + `suggestion` (route interne
  `POST /api/csm/stations/suggest`, `suggestDistricts` de `lib/timetable.js` ; appelée par l'import et après une attribution),
  `lines_manual`. Le hook accepte district, lignes et type (lignes → `lines_manual` ; district → `district_manual`, proposition
  effacée) ; propositions, noms, coordonnées refusés.
- **Notifications par district** (`1760004000_notification_districts.js`, 14 oct. 2026) : `notifications.districts` (noms
  « Sud-Ouest »…, 0 à 3), 9e argument de `notify()` ; posé pour les urgences (district de l'entrée), perturbations iRail,
  retards des trains de mission, changements DICOS et mentions @district ; vide pour les mentions personnelles, trains suivis
  et alertes système. Refusé dans le corps des requêtes (`updateRule`). La cloche (web) filtre sur les districts du jour.
  `stationIndex` (iRail) lit `stations` (FR + NL, DSO / DSE / DCE) puis `line_stations`.
- **Lignes modifiables** (`1760004100_rail_lines_edit.js`, 14 oct. 2026) : `rail_lines.manual`, `stations_auto`, `branches_auto`,
  `name_auto`, `updated_by` ; `updateRule` = `ptcar:update` (comme `stations`) + `updated_by` = appelant, ni invité ni Écran.
  Hook (`timetable.pb.js`) : gares / embranchements / nom seulement (`cleanLineStations`, `cleanLineBranches` de
  `lib/timetable.js`), tronc ≥ 2 gares, ligne marquée `manual` ; corps `manual: false` = version automatique rétablie.
  `upsertLines` tient toujours la version `*_auto` et ne touche pas l'affichage d'une ligne manuelle ; `pruneLines` ne la
  supprime jamais. `line_stations` n'est plus lue (hors repli de l'index iRail si `stations` est vide). Attention : un
  superuser passe aussi par le hook de modification (`*_auto` refusés) → les poser à la création.
- **Horaires Quinyx** (`1760004200_quinyx.js`, `quinyx.pb.js`, 14 oct. 2026) : `quinyx_groups` (n° de groupe Quinyx unique,
  saisi par un admin — jamais dans Git —, nom, district par défaut, `enabled`, `last_*` écrits par le connecteur qui ne
  peut changer ni le n°, ni le nom, ni le district, ni `enabled`), `quinyx_places` (motif unique → district, admin ;
  amorcée MONS / OCC SO → DSO, NAMUR / OCC SE → DSE), `quinyx_agents` (n° Quinyx unique et figé, prénom, nom,
  `user_suggested` posé par le connecteur, `user` + `confirmed` par un admin seulement), `quinyx_shifts` (n° de
  prestation unique, groupe, agent en `cascadeDelete`, jour, début, fin, code, section, `kind` am / pm / nuit / extra /
  autre, district ; écrites et supprimées par le connecteur, suppression aussi admin). Lecture : agents actifs **sauf
  `guest` et `screen`** (le connecteur compris). Connecteur = rôle `connector` **et** `dicos:write`. Cron
  `quinyx-retention` (3 h 25 UTC) : prestations > 90 j, agents sans prestation et non vus depuis 180 j. Audit :
  `quinyx_places` (et création / suppression de `quinyx_groups`).
