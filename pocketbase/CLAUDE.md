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
PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… node scripts/test-rules.mjs  # tests des règles (24 contrôles)
```

## Conventions

- **Migrations JS** dans `pb_migrations/` (`<horodatage>_<nom>.js`, `migrate(up, down)`), appliquées au démarrage.
  Jamais de modification de schéma par l'interface admin sans la reporter en migration.
- **Règles** : construites avec `can(perm, rôles)` (rôle par défaut de la v1, `grants` / `denies` par agent).
  `users.role`, `grants`, `denies`, `banned_until`, `email` ne sont modifiables que par un admin.
- **Identifiants** : les UUID Supabase sont conservés (`users.id` accepte 15 à 36 caractères `[a-z0-9-]`) ;
  les tables à clé numérique gardent l'ancienne clé dans `legacy_id`.
- **Hooks** (`pb_hooks/*.pb.js`) : isolés, la logique partagée est dans `pb_hooks/lib/` chargée par `require()`.
  `audit.pb.js` trace les écritures faites par l'API (auteur + différentiel), `import.pb.js` ajoute `csm-import`.
- **Import** : CLI uniquement (aucune route HTTP), en une transaction ; les empreintes bcrypt `$2a$` de Supabase sont
  recopiées telles quelles dans `users.password` (connexion testée, coûts 6 et 10).
- **Sauvegardes** : réglées par migration (`0 2 * * *`, 14 conservées dans `pb_data/backups`).
- `PREPROD_PB_*` désigne une autre instance (jeu) : **n'y jamais écrire**, ne pas y lancer `test-rules.mjs`.
