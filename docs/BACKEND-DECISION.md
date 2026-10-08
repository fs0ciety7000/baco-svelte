# Backend de CSM v2 — recommandation chiffrée (étape 1)

> Session 2, 8 octobre 2026. Prototype réalisé en local sur une copie de la base BACO, sauvegardée en lecture
> seule. **À valider par l'utilisateur avant l'étape 2.**
> PocketBase a été retenu le 8 octobre (`docs/CSM-V2.md` §1). Ce document vérifie que ce choix tient,
> chiffre la migration et liste les points à trancher.

## 1. Recommandation

**Confirmer PocketBase 0.40.4**, en instance dédiée sur Coolify, avec Next.js comme seul point d'entrée.
Les quatre risques à vérifier sont levés par le prototype :

| Risque | Résultat |
|---|---|
| Import des comptes sans réinitialiser les mots de passe | ✅ Les 29 empreintes bcrypt `$2a$` (coût 6 ou 10) sont reprises. La connexion PocketBase fonctionne avec une empreinte `$2a$` de chaque coût. |
| Reprise des droits (équivalent RLS) | ✅ 24 contrôles automatisés, y compris l'escalade de privilèges (faille S1 de BACO) et l'accès sans connexion (faille S2b) |
| Temps réel à travers le pare-feu | ✅ SSE PocketBase relayé par Next (`/api/events`), testé dans Chromium en 1440×900 et 390×844 : aucune requête hors du domaine CSM, aucun WebSocket |
| Sauvegarde et restauration | ✅ Le zip restauré dans une autre instance redonne les mêmes comptages et le même avatar à l'octet près. Les sauvegardes sont planifiées chaque nuit à 2 h, 14 conservées. |

L'effort restant pour migrer le backend est d'environ **10 jours de développement** (détail §4). Il s'ajoute au
design (étapes 2-3) et aux modules (étape 5).

## 2. Ce que le prototype a validé

### Données de travail (étape 0)

- Sauvegarde relancée avec la nouvelle clé de service, **GET uniquement** : l'inventaire Storage est lu par
  SELECT via le connecteur, ce qui supprime le `POST /object/list` de la session 1.
- 51 tables sur 51 ont exactement le même nombre de lignes que le `count(*)` SQL (9 257 lignes au total).
- 29 comptes ; 39 fichiers (32 Mo), chacun de la même taille que dans `storage.objects`.
- 29 empreintes exportées hors Git (`/home/user/csm-backup/auth_password_hashes.json`, droits 600) ; leur
  MD5 est identique à celui calculé côté serveur.

### Import (`pocketbase csm-import`)

| Élément | Résultat |
|---|---|
| Comptes | 29 sur 29, **mêmes UUID que Supabase**, rôle, `grants`/`denies` repris de `profiles.permissions`, district, fonction |
| Empreintes de mot de passe | 29 sur 29 recopiées telles quelles. PocketBase (bcrypt de Go) lit `$2a$` sans conversion |
| Avatars (Storage) | 6 fichiers attachés aux comptes. Les 23 autres profils pointent vers DiceBear (URL externe, non migrée) |
| Sociétés de bus | 29 sur 29, dont **3 au nom vide dans BACO** (n° 27, 28, 29), importées sous « Société sans nom n°… » |
| Commandes bus (C3) | 295 sur 295, **statut unifié** à partir du statut, de la colonne kanban et de la case « mail envoyé » de la v1 |
| Commandes taxi | 3 sur 3 |
| Historique d'audit | 487 lignes de `audit_logs` (avec différentiel), marquées `legacy` |
| Durée | 2,6 s, en une transaction : en cas d'erreur, rien n'est importé |

L'import ne passe que par la ligne de commande, jamais par HTTP. Il peut être rejoué (`CSM_IMPORT_RESET=1`)
pour répéter la bascule.

### Connexion

- La Server Action Next appelle `auth-with-password`. Le jeton PocketBase est stocké dans le cookie
  `csm_session` (**httpOnly**, `SameSite=Lax`, `Secure` en production). `document.cookie` ne le voit pas
  (test E2E).
- Le middleware renvoie vers `/connexion` sans jeton valide et rafraîchit le jeton à moins de 24 h de son
  expiration.
- Chaque requête relit l'agent dans PocketBase : un rôle modifié ou un compte désactivé prend effet
  immédiatement.
- ⚠️ Le mot de passe de `CSM_TEST_ADMIN_PASSWORD` **ne correspond pas** à l'empreinte BACO de ce compte
  (vérifié aussi hors PocketBase avec bcryptjs). Soit la variable n'est pas à jour, soit le mot de passe a
  changé dans BACO. L'import n'est pas en cause, voir §5 question 1.

### Règles d'accès

Le navigateur ne parle jamais à PocketBase. Next l'appelle **avec le jeton de l'agent**, donc les règles
s'appliquent à chaque requête, comme les policies RLS. `pocketbase/scripts/test-rules.mjs` vérifie
24 contrôles :
- sans connexion : aucune lecture, aucune création, y compris sur les commandes taxi, qui contiennent des
  données PMR ;
- un agent ne peut changer ni son rôle, ni ses permissions, ni son bannissement, ni son e-mail (faille S1
  de BACO) ;
- un agent ne crée pas de commande au nom d'un autre et ne supprime rien ;
- un lecteur ne fait que lire ;
- une permission retirée (`denies`) l'emporte sur le rôle ;
- le journal d'audit est alimenté par les hooks, avec l'auteur et le différentiel, et personne ne peut
  y écrire, admin compris.

**Bug trouvé et corrigé** pendant les tests E2E : un compte sans `grants`/`denies` (JSON `null`) ne voyait
aucune commande, car `null !~ …` vaut faux en SQL. Un hook normalise désormais ces champs, et le test
couvre ce cas.

### Temps réel

`/api/events` ouvre le flux SSE de PocketBase, s'y abonne avec le jeton de l'agent et ne renvoie au
navigateur que `{ collection, action, id }` :
- les sujets sont limités à une liste blanche ;
- un battement est envoyé toutes les 25 s ;
- l'en-tête `X-Accel-Buffering: no` empêche le proxy de Coolify de mettre le flux en tampon.

Le test E2E crée une commande côté serveur et vérifie que la liste se met à jour dans le navigateur.

### Sauvegardes

- Elles sont planifiées par migration : chaque nuit à 2 h UTC, 14 conservées dans `pb_data/backups`.
- Le zip contient la base SQLite et les fichiers. La restauration a été testée dans une autre instance.
- Il manque une **copie hors du serveur** : PocketBase sait envoyer vers un stockage S3, voir §5 question 2.

### Mesures locales

| Mesure | Valeur |
|---|---|
| Mémoire PocketBase (base importée) | 47 Mo |
| Base SQLite (5 collections importées) | 620 Ko ; zip de sauvegarde avec fichiers : 2,7 Mo |
| `/commandes` rendue par Next (50 lignes) | 34 ms en médiane, 59 ms au pire sur 6 essais |
| Requête PocketBase directe (50 lignes) | 11 ms |
| JS client partagé | 103 Ko, page `/connexion` 115 Ko |

## 3. Comparaison

| Critère | PocketBase dédié (recommandé) | Rester sur Supabase via le serveur Next |
|---|---|---|
| Coexistence avec BACO | **Base séparée** : CSM fait évoluer son schéma sans risque pour BACO | Même base que BACO : chaque changement de schéma touche la production, ou il faut un 2ᵉ projet |
| Sécurité de départ | Règles réécrites et testées (24 contrôles). Les failles S1, S2 et S2b n'existent pas | Il faut d'abord appliquer le hotfix, puis assainir les policies (254 alertes de policies superposées) |
| Temps réel | SSE natif, relayé par Next (validé) | Realtime en WebSocket côté serveur Next, puis SSE vers le navigateur (faisable, non testé) |
| Comptes | Empreintes reprises, aucune réinitialisation | Inchangés |
| Requêtes avancées | SQLite : pas de `pg_trgm` ni de RPC SQL. Recherche par filtres `~` et routes JS | Postgres complet (recherche, RPC) |
| Exploitation | 1 conteneur et 1 volume sur ton Coolify, sauvegardes intégrées ; pas de haute disponibilité (inutile pour 29 agents) | Hébergé et managé |
| Coût | 0 € de plus (serveur Coolify existant, environ 50 Mo de RAM) | Base BACO actuelle : 0 € ; un 2ᵉ projet : offre gratuite (mise en pause après inactivité) ou Pro à 25 $ par mois |
| Risque produit | PocketBase avant la 1.0 : version figée, montées de version testées sur une copie | Faible |

## 4. Chiffrage de la migration complète

Unité : **jour de développement** (≈ une session de travail), tests compris, hors design et écrans des
modules.

### Tables (51 dans `public`)

| Lot | Tables Supabase → collections PocketBase | Effort |
|---|---|---|
| ✅ Fait (prototype) | `profiles` (+ comptes), `societes_bus`, `otto_commandes`, `taxi_commands`, `audit_logs` (historique) | — |
| Commandes (fin) | `chauffeurs_bus`, `contacts_bus`, `lignes_bus`, `taxis` (champs tableaux → JSON), `remises`, `b201_reports` | 1 j |
| PMR | `daily_movements`, `movement_interventions`, `pmr_clients`, `pmr_data` : données de santé, règles plus strictes, PDF protégés | 1,5 j |
| Référentiels | `ebp`, `ligne_data`, `ptcar_abbreviations` (1 148 lignes), `gare_coordinates`, `pn_data`, `spi_data`, `contacts_repertoire`, `liaisons_contenu` | 1 j |
| Opérations et connaissances | `main_courante` (+ pièces jointes, mentions), `log_reactions`, `custom_emojis`, `procedures` (+ `procedure_versions`), `document_metadata` (+ fichiers), `changelog` | 1,5 j |
| Équipe | `planning`, `leave_requests`, `presences`, `user_presence`, `team_board`, `favoris`, `notifications`, `user_preferences`, `profile_comments`, `infractions` | 1,5 j |
| Admin / technique | `app_settings` (maintenance), `app_error_logs`, `audit_log` (3 931 lignes sans différentiel : archivées en `legacy`) | 0,5 j |
| **À ne pas migrer** (à confirmer, §5 question 3) | `darts_games`, `temp_geo_data`, `profile_likes` (gamification retirée), `remise_bus` / `remise_taxi` / `remise_intervention` / `remise_pmr` (0 ou 1 ligne chacune, remplacées par `remises`), `app_backups` (remplacée par les sauvegardes PocketBase) | — |

Environ **41 collections** à créer (5 sont faites). Chacune suit le même schéma : migration, règles via
`can(perm, rôles)`, fonction d'import, comptage dans le rapport, contrôles ajoutés à `test-rules.mjs`.

### Fonctions, triggers et Storage

| Élément Supabase | Remplacement | Effort |
|---|---|---|
| `log_audit_action` / `log_audit_diff` (24 triggers) | ✅ Hook générique `audit.pb.js` ; il suffit d'ajouter chaque collection à la liste | 0,25 j |
| `handle_updated_at*`, `handle_new_user`, `sync_user_role` | `autodate` + hook « modifié par » ; rôle lu directement dans `users` (plus de copie dans les métadonnées) | 0,25 j |
| `archive_procedure`, `handle_procedure_update` | Hook de mise à jour → `procedure_versions` | 0,25 j |
| `handle_new_mention_notification` | Hook de création sur `main_courante` → `notifications` (+ SSE) | 0,25 j |
| `admin_*` (8 RPC : création, rôle, bannissement, mot de passe, infractions, présence) | Server Actions Next réservées à l'admin, appelées avec son jeton ; ce sont les règles PocketBase qui autorisent (pas de jeton superuser dans l'app) | 1 j |
| `global_search`, `get_linked_content`, `get_my_*`, `user_check_in/out`, `upsert/delete_societe_bus` | Fonctions de `src/server/data` (filtres liés) ; recherche ⌘K multi-collections | 0,75 j |
| Storage : `avatars` (21), `documents` (17), `taxis` (1), `movements_pdf` (0) | Champs fichier ; documents et PDF **protégés**, servis par une route Next (`/api/fichiers/…`) avec un jeton de fichier, jamais de lien public vers PocketBase | 0,5 j |
| Répétition de la bascule + script de contrôle (comptages, sommes) | Import complet, rapport de comparaison avec `report.json` | 0,5 j |

### Total

| Poste | Jours |
|---|---|
| Tables restantes | 7 |
| Fonctions et triggers | 2,75 |
| Storage | 0,5 |
| Répétition de la bascule | 0,5 |
| **Total backend** | **≈ 10,75 j** (fourchette 9 à 12 j) |

Ces lots ne se font pas d'un bloc : chaque collection est créée **avec son module** à l'étape 5, dans
l'ordre Commandes → PMR → Opérations → Référentiels → Équipe → Admin. Le prototype a fixé le modèle à
suivre.

### Le jour de la bascule (≈ 1 h, sans intervention de l'IT)

1. Annoncer le gel de BACO et passer BACO en maintenance (`app_settings`). Cette écriture dans Supabase
   demande ton accord à ce moment-là.
2. Lancer `scripts/supabase-backup.mjs` et exporter les empreintes (connecteur, SELECT).
3. `csm-import` sur l'instance Coolify, puis lancer le script de contrôle des comptages.
4. Faire tester deux agents (connexion avec leur mot de passe habituel), puis ouvrir CSM.
5. BACO reste consultable en lecture.

## 5. Points à trancher

1. **Mot de passe du compte de test** : `CSM_TEST_ADMIN_PASSWORD` ne correspond pas à l'empreinte BACO de
   ce compte. Est-ce volontaire (mot de passe différent pour CSM), ou la variable est-elle périmée ? Le plus
   simple : te connecter toi-même à l'instance de test une fois déployée (étape 4).
2. **Copie des sauvegardes hors du serveur** : un stockage S3 (Backblaze B2, Scaleway, Cloudflare R2…) ou
   la sauvegarde du volume par Coolify ? PocketBase s'en charge si tu fournis un bucket.
3. **Tables à ne pas migrer** : confirmes-tu la liste du §4 ? Que fait-on de `infractions` (sanctions,
   donnée RH sensible) : migration réservée à l'admin, ou archive hors application ?
4. **Les 3 sociétés de bus sans nom** (n° 27, 28, 29) : à compléter dans BACO avant la bascule, ou à
   supprimer ?
5. **Avatars DiceBear** (23 profils) : reconstruire l'URL à l'affichage (service externe, donc bloqué par
   le pare-feu de l'entreprise), ou passer à des initiales ? Je recommande les initiales.

## 6. Rappels

- **BACO est toujours vulnérable** : la migration `supabase/migrations/20261008120000_security_hotfix.sql`
  n'est pas appliquée. Elle corrige :
  - l'escalade vers le rôle admin ;
  - les données PMR lisibles et modifiables sans connexion ;
  - 11 tables sans RLS ;
  - les fonctions exécutables par `anon`.

  Elle ne sera appliquée qu'avec ton accord explicite. Plus la date de bascule est lointaine, plus cette
  correction compte.
- Clés Supabase : la nouvelle clé de service fonctionne. Je ne peux pas vérifier que les anciennes sont révoquées : vérifie-le dans le tableau de bord Supabase (API Keys).
