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
PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… node scripts/test-rules.mjs  # tests des règles (70 contrôles)
CSM_IMPORT_SCOPE=commandes CSM_IMPORT_RESET=1 pocketbase csm-import … $P  # module Commandes seul, comptes gardés
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
  l'annulation). Rétablir une annulée ne réhorodate pas. `time_pending` (taxi) : heure de prise en charge non saisie.
  `updated_by` de `pmr_clients` / `b201_reports` et l'attribution BACO des bus (`sent_by_name`, `validated_by`,
  `legacy_id`) ne sont pas forgeables.
- **Piège des index** : un champ nombre vide vaut **0**, pas NULL → un index unique `WHERE legacy_id IS NOT NULL`
  bloque la 2e fiche créée dans CSM. Toujours `WHERE legacy_id > 0`.
- **Accès** : taxi, sociétés de taxi et clients PMR ne sont pas lisibles par `otto_agent` (comme la v1) ; modèles
  `order_templates` tous partagés (décision du 8 oct.) ; `b201_reports` une fiche par `day`, non modifiable.
- **Sauvegardes** : réglées par migration (`0 2 * * *`, 14 conservées dans `pb_data/backups`).
- `PREPROD_PB_*` désigne une autre instance (jeu) : **n'y jamais écrire**, ne pas y lancer `test-rules.mjs`.
