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
PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… node scripts/test-rules.mjs  # tests des règles (149 contrôles)
CSM_IMPORT_SCOPE=commandes CSM_IMPORT_RESET=1 pocketbase csm-import … $P  # Commandes + PMR, comptes gardés
CSM_IMPORT_SCOPE=pmr CSM_IMPORT_RESET=1 pocketbase csm-import … $P        # PMR seul (zones, matériel, prestations)
CSM_IMPORT_SCOPE=operations CSM_IMPORT_RESET=1 pocketbase csm-import … $P # main courante + 211 PN de BACO
```

## Conventions

- **Migrations JS** dans `pb_migrations/` (`<horodatage>_<nom>.js`, `migrate(up, down)`), appliquées au démarrage.
  Jamais de modification de schéma par l'interface admin sans la reporter en migration.
- **Règles** : construites avec `can(perm, rôles)` (rôle par défaut de la v1, `grants` / `denies` par agent).
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
- **Piège des fichiers** : PocketBase efface les fichiers d'une fiche supprimée *après* la validation de la
  transaction. Purger puis réimporter des fiches de même identifiant dans une seule transaction perd les fichiers
  → purge et import dans deux transactions (`lib/import.js`).
- **Module Commandes** (`1760000200_commandes.js`, `orders.pb.js`, `lib/orders.js`) : statut unifié
  `brouillon → envoye → confirme → en_cours → termine`, ou `annule`. Les transitions sont contrôlées par hook
  (table dans `lib/orders.js` ; retour d'un cran permis ; `en_cours → annule`, `termine → en_cours` et « rétablir »
  réservés aux coordinateurs moderator/admin/sysop ; motif d'annulation obligatoire ; envoi impossible sans e-mail
  fournisseur). Les horodatages `*_at` / `*_by`, `number` et `status_before_cancel` sont posés par le hook et
  **refusés dans le corps des requêtes** (règles). Chaque transition écrit `order_events` (lecture seule pour tous).
  Création toujours en `brouillon`, au nom de l'agent. `number` = n° de bon, attribué par une seule instruction
  SQL atomique sur la table interne `_order_counters` (pas de doublon en création simultanée, testé à 12 requêtes) ;
  = ancien id pour les bus importés. `en_cours → confirmé` est réservé aux coordinateurs (sinon contournement de
  l'annulation). **`envoye → termine`** (« clôturer » un bon jamais confirmé) seulement 5 jours après la date de service
  (`CLOSE_DAYS`, décision du 9 oct. 2026). Rétablir une annulée ne réhorodate pas. `time_pending` (taxi) : heure de prise en charge non saisie.
  `updated_by` de `pmr_clients` / `b201_reports` et l'attribution BACO des bus (`sent_by_name`, `validated_by`,
  `legacy_id`) ne sont pas forgeables.
- **Piège des index** : un champ nombre vide vaut **0**, pas NULL → un index unique `WHERE legacy_id IS NOT NULL`
  bloque la 2e fiche créée dans CSM. Toujours `WHERE legacy_id > 0`.
- **Accès** : taxi, sociétés de taxi et clients PMR ne sont pas lisibles par `otto_agent` (comme la v1) ; modèles
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
- **Sauvegardes** : réglées par migration (`0 2 * * *`, 14 conservées dans `pb_data/backups`).
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
