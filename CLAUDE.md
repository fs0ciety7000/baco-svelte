# CLAUDE.md — CSM (Client Solutions Management Tool)

> Ex-**BACO**. Outil métier ferroviaire (SNCB) de l'équipe PACO → **Client Solutions** :
> commandes de bus / taxis de remplacement, assistance PMR, contenu des lignes, EBP,
> répertoire, départs/arrivées (iRail), planning, journal, Otto, stats, admin.
> Utilisé **toute la journée** par des opérateurs : chaque clic compte, la fiabilité prime sur l'effet.

Ce fichier est maintenu par Claude. **Mets-le à jour à chaque décision, convention ou piège nouveau**
(état §1, journal §8), ainsi que les autres fichiers d'instructions (voir §4.8). Un fichier d'instructions
périmé est un bug.

## 0. À lire d'abord (v2)

0. `docs/NOUVELLE-SESSION.md` — message de lancement de la session en cours (objectifs, règles, état).
   `docs/BACKEND-DECISION.md` — recommandation backend de l'étape 1 (validée).

1. `docs/CSM-V2.md` — cahier des charges v2 (pivot Next.js + PocketBase, retours UX, feuille de route).
2. Ce fichier — contraintes (§6), workflow (§4), journal (§8).
3. `docs/DESIGN-DIRECTION.md` + `docs/references/*.jpg` — direction « Tactical premium » ; refonte v4 « Signal / Quai / Cabine » : `docs/design/REFONTE-DESIGN-V4.md` (lots 0-2 faits le 15 oct.).
4. `docs/SAUVEGARDE-SUPABASE.md` — sauvegarde de la base BACO et procédure de restauration.
5. `docs/AUDIT.md`, `docs/PROPOSITION.md` §3-6 — audit, parcours métier, nouveautés.

**BACO (`main`, Vercel, base Supabase) : on n'y touche pas.** Supabase en **lecture seule**.
Code dans `/web` (Next.js) et `/pocketbase`. Le SvelteKit v1 (**référence métier gelée**) a été **retiré du dépôt CSM
le 11 oct.** : il ne vit plus que sur `main` (BACO en production) et la branche `ccr-5dca0da8-4yg4i6` ; ne pas les modifier.
**Branches** : `csm-prod` (production, branche principale), `csm-preview` (préversion), `main` (BACO, intouchable).

---

## 1. État du projet (v2)

| # | Étape | Statut |
|---|---|---|
| 0 | Sauvegarde Supabase complète | ✅ 8 oct. (restauration testée, archive `age` remise à l'utilisateur). Session 2 : sauvegarde relancée (GET seuls) + 29 empreintes bcrypt exportées dans `/home/user/csm-backup` |
| 1 | Prototype PocketBase vs Supabase + squelette Next | ✅ 8 oct. — `pocketbase/` : migrations, audit, import (29 comptes + empreintes, 295 BC bus), 24 contrôles de règles OK, sauvegarde/restauration OK ; `web/` : Next 15.5, connexion cookie httpOnly, `/commandes`, relais SSE, 6 E2E OK (1440 + 390). recommandation `docs/BACKEND-DECISION.md` validée |
| 2 | Design system + page `/design` (5 thèmes, GSAP) | ✅ 8 oct. — jetons + test AA (156 contrôles), 19 composants, `/design`, 17 E2E ; captures et écarts **validés** |
| 3 | Shell (6 entrées, onglets, ⌘K, mobile 4 + Plus) + tableau de bord | ✅ 8 oct. — 24 E2E, CSP, gardes par page, captures validées |
| 4 | Données : schéma PocketBase, règles d'accès, import | ✅ **bascule faite le 10 oct.** : sauvegarde Supabase fraîche (GET seuls) → base construite en local (`csm-import` + référentiels) → restaurée sur `pb-csm` ; comptages vérifiés (29 comptes + connecteur, 300 bons bus, 445 prestations, 1148 PtCar…) |
| 5 | Modules : Commandes → PMR → Opérations → Référentiels → Équipe → Admin | 🔄 **Commandes** livré en session 3 (schéma + 66 contrôles de règles, bus, taxi, envoi `.eml` + PDF, suivi, B201, E2E) : **validé le 8 oct.**, cycle v3 brouillon → terminé → envoyé le 14 oct. ; **PMR validé le 8 oct.** (schéma + 105 contrôles de règles, prestations, collage DICOS, clients, matériel, E2E) ; **Opérations validé le 8 oct.** (trains en direct iRail, Journal (ex-main courante), carte PN, statistiques, cloche ; 149 contrôles de règles, 46 E2E) ; **DICOS / Missions PMR validé** (extension + ingestion, lecture seule, trajet/IN-OUT/district/copier) ; **Annuaire et données (ex-Référentiels) livré** (annuaire, lignes, PtCar, EBP, procédures + documents ; 7 collections ; 173 contrôles de règles ; audit + revue passés ; données v1 importées sur l'instance de test) ; **Équipe et Admin validés le 10 oct.** (+ vue admin des appareils connectés) |
| 5b | Référentiel des relations de trains (Ressources › Trains) | 🔄 préversion le 14 oct. — GTFS SNCB + Infrabel, import quotidien par Next, 3 collections, écran 3 vues ; Ressources › Lignes tirées du référentiel (`rail_lines`) |
| 5d | Réseau : PN Infrabel + zones SPI (lot A du plan du 15 oct.) | 🔄 15 oct. (branche `reseau-pn-spi`, non poussée) — 1 290 PN Infrabel (CC0) dont 183 rapprochés des 211 PN BACO, zones SPI des gares (carte COI relevée), Carte PN refaite, admin Zones SPI |
| 5e | Planificateur de tâches PMR (remplace les classeurs Excel DSO / DSE) | 🔄 15 oct. — P0 (socle, Quinyx gares, dossiers DICOS en attente, extension 1.9.1) + P1 (moteur, vue Jour) livrés sur la branche de session, audit + revue corrigés ; à valider (captures) avant la préversion. Cadrage `docs/design/CADRAGE-PLANIFICATEUR-PMR.md`, règles `docs/design/REGLES-PLANIFICATEUR-PMR.md` |
| 5c | Horaires Quinyx (Équipe › Planning) | 🔄 1er lot le 14 oct. (branche `claude/quinyx-horaires`, PR vers `csm-preview`) — extension 1.8.0, ingestion, 4 collections, planning, admin, districts du jour proposés, widget « Fin de service » réel ; cadrage `docs/design/CADRAGE-QUINYX.md` |
| 6 | Déploiement Coolify : `web` + `pocketbase` (volume, sauvegardes), CI | ✅ 8 oct. — **PRODUCTION en ligne le 10 oct. : https://csm.fs0ciety.org** (`csm-web-prod` + `csm-pocketbase-prod`, environnement Coolify `prod`, branche **`csm-prod`**, données BACO importées le 10 oct., sauvegardes R2) ; **test-csm = preview** (branche de session) ; projet Coolify **CSM** créé par l'API (`csm-web`, `csm-pocketbase`, volume + sauvegardes 2 h / 2 h 30), CI `csm-v2.yml` — `docs/DEPLOIEMENT-V2.md` |
| — | Hotfix sécurité BACO (`supabase/migrations/20261008120000_security_hotfix.sql`) | ✅ appliqué par l'utilisateur (SQL Editor) le 8 oct., vérifié : 0 ERROR (36 avant). Suite **non appliquée** : `20261008130000_hotfix_followup.sql` (test NULL de `get_my_role()`) et `20261008140000_pn_data_update_fix.sql` (XSS stocké carte PN), accord requis ; protection des mots de passe compromis encore désactivée |

**Ne pas commencer une étape sans validation de l'utilisateur.** Les captures desktop (1440×900) et
mobile (390×844) sont soumises avant de généraliser un design.

## 2. Stack v2

| Couche | Choix |
|---|---|
| Web | Next.js 15+ App Router, `output: 'standalone'`, TypeScript strict |
| UI | Tailwind v4 + shadcn/ui (Radix) personnalisé, lucide-react, cmdk, Vaul, Sonner |
| Motion | GSAP 3 + `@gsap/react` (`useGSAP`, `gsap.matchMedia()` + `prefers-reduced-motion`) |
| Données client | TanStack Query + TanStack Table ; formulaires react-hook-form + zod |
| Backend | **PocketBase 0.40.4** auto-hébergé (Coolify), SDK `pocketbase` **côté serveur Next uniquement** — `docs/BACKEND-DECISION.md` |
| Auth | Auth PocketBase, jeton en cookie httpOnly posé par Next ; le navigateur ne parle qu'au domaine CSM |
| Temps réel | SSE PocketBase relayé par Next (`/api/events`), jamais de WebSocket |
| Tests | Vitest + Testing Library ; Playwright (dont 390×844 sur chaque écran) |
| Déploiement | Docker sur Coolify : `csm-web` (`/web`) + `csm-pocketbase` (volume `/pb_data`, sauvegardes) — `docs/DEPLOIEMENT-V2.md` |

### Environnement cloud (noms de variables, jamais les valeurs)

Environnement dédié **CSM** : configuration de référence dans `docs/ENVIRONNEMENT-CLOUD.md` (à tenir à jour).
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (clé de service, lecture seule par discipline), `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWKS_URL`
- `CSM_TEST_ADMIN_EMAIL`, `CSM_TEST_ADMIN_PASSWORD` — compte admin BACO/CSM de test
- `COOLIFY_API_URL`, `COOLIFY_API_TOKEN` — API Coolify (`/api/v1`) : Claude crée et déploie les ressources du projet
  **CSM** uniquement ; ne jamais toucher aux autres projets (« Main Stack » : jeu, agenda, PocketBase perso…)
- `CSM_PB_URL`, `CSM_PB_ADMIN_EMAIL`, `CSM_PB_ADMIN_PASSWORD` — PocketBase CSM de test (`pb-test-csm.fs0ciety.org`),
  à créer par l'utilisateur depuis les variables de `csm-pocketbase` dans Coolify
- `PREPROD_PB_URL`, `PREPROD_PB_ADMIN_*`, `PREPROD_KEEP_EMAILS` — **PocketBase de test.fs0ciety.org (jeu
  Cosmic Empires), PAS une instance CSM : n'y rien écrire**
- Sortie réseau : HTTPS uniquement (pas de TCP 5432 → pas de `pg_dump`). Le connecteur Supabase (MCP) exécute
  du SQL en rôle `postgres` : **SELECT uniquement**.
- Les variables modifiées ne sont lues qu'au démarrage d'une session. Ne jamais utiliser une clé collée
  dans la conversation (bloqué par le garde-fou, et la clé doit alors être tournée).

## 3. Commandes

```bash
# v2 — PocketBase local (détails : pocketbase/CLAUDE.md), binaire 0.40.4 dans /usr/local/bin
cd pocketbase && P="--dir pb_data --migrationsDir pb_migrations --hooksDir pb_hooks"
pocketbase migrate up $P && CSM_IMPORT_RESET=1 pocketbase csm-import /home/user/csm-backup $P
pocketbase csm-import-delta <sauvegarde du gel> --base /home/user/csm-backup-prod --dry-run $P  # bascule (DEPLOIEMENT-V2 §7)
pocketbase serve --http 127.0.0.1:8090 $P
node scripts/test-rules.mjs            # PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD
# v2 — web (détails : web/CLAUDE.md)
cd web && npm install && npm run dev
# Sauvegarde Supabase (lecture seule) : voir docs/SAUVEGARDE-SUPABASE.md
node scripts/supabase-backup.mjs /home/user/csm-backup
```

## 4. Règles de travail (workflow Claude)

1. **Branche** : travailler sur la branche de session indiquée, puis intégrer à **`csm-preview`** (préversion,
   avance rapide ou fusion) ; `csm-prod` n'avance que depuis `csm-preview`, sur demande. Commits atomiques, messages
   conventionnels en français (`feat(bus): …`, `fix(auth): …`, `chore(deps): …`).
2. **Base de données = PRODUCTION.** Jamais de DDL/DML sur Supabase sans accord explicite.
   Toute modification de schéma passe par un fichier `supabase/migrations/AAAAMMJJHHMMSS_nom.sql`
   versionné, relu, puis appliqué. Relancer `get_advisors` (security + performance) après chaque DDL.
3. **Avant chaque push** : `npm run lint && npm run test:run && npm run build` doivent passer.
4. **Agents spécialisés** (via l'outil Agent, en parallèle quand c'est indépendant) :
   - *Security auditor* — RLS, endpoints, XSS, secrets, headers.
   - *UX / product designer* — parcours métier, IA, accessibilité.
   - *UI / web designer* — tokens, thèmes, motion, références.
   - *Perf* — bundle, requêtes, polling.
   - *Reviewer* — relecture adversariale du diff avant push (`/code-review`).
   Donner à chaque agent un prompt autonome (contexte métier + fichiers + format de sortie).
5. **Pas de nouvelle dépendance** sans justification (taille, maintenance, alternative native).
6. **Pas de fonctionnalité supprimée** sans validation utilisateur (même la gamification).
7. Langue : UI et docs en **français**, code (identifiants) en anglais de préférence.
8. **Fichiers d'instructions à tenir à jour au fil de l'eau** (dans le même commit que le changement) :
   `CLAUDE.md` (état, stack, commandes, pièges, journal), `docs/CSM-V2.md` (décisions de cadrage),
   `docs/DESIGN-DIRECTION.md` (tout écart validé), `docs/DEPLOIEMENT-V2.md`, `docs/NOUVELLE-SESSION.md`
   (message de lancement de la session suivante), et un `CLAUDE.md` local dans `/web` et `/pocketbase`
   dès qu'ils existent (commandes et conventions propres au dossier).
9. **Données personnelles** (PMR, comptes, empreintes) : jamais dans Git, jamais dans un artefact publié ;
   archives chiffrées (`age`) hors dépôt (`/csm-backup*` est ignoré).
10. **Changelog** : à chaque mise à jour livrée, ajouter une entrée au `CHANGELOG.md` (racine ; `## [AAAA.MM.JJ] — titre`,
   sous-sections Nouveautés / Améliorations / Corrections / Sécurité) **dans le même commit**, écrite pour les agents (pas
   de jargon interne, aucune donnée personnelle ni secret), puis `cd web && npm run changelog` (copie embarquée
   `web/src/generated/changelog-source.ts`, refaite aussi par `npm run build` ; un test échoue si elle est périmée). Une
   nouvelle version en tête déclenche la fenêtre « CSM a été mis à jour » une fois par compte.


## 5. Conventions de code

Les conventions sont dans **`web/CLAUDE.md`** et **`pocketbase/CLAUDE.md`**. Principes : accès données côté serveur
uniquement, droits vérifiés côté serveur et par les règles PocketBase (le masquage UI n'est que du confort), couleurs par
jetons sémantiques, navigation à source unique (`web/src/navigation.ts`), imports lourds dynamiques, pas de WebSocket
navigateur (SSE relayé par `/api/events`), `prefers-reduced-motion` respecté.

## 6. Contraintes métier / infra (non négociables)

- **Réseau entreprise** : WebSocket (et probablement HTTPS) vers `*.supabase.co` bloqués, l'IT n'ouvrira rien.
  → Le navigateur ne parle **qu'au domaine CSM** (`csm.fs0ciety.org` en production, `test-csm.fs0ciety.org` en preview) ; données via le serveur Next,
  temps réel via SSE relayé par le serveur. PocketBase n'est jamais appelé directement par le navigateur.
- **E-mail** : pas de jeton Outlook/Graph ; l'envoi est **manuel** depuis la **boîte fonctionnelle**.
  → Générer un brouillon `.eml` (`X-Unsent: 1`) avec le PDF joint pour les fournisseurs. **Seules exceptions SMTP
  (validées le 10 oct.)** : e-mail « mot de passe oublié » et campagnes internes envoyées par un admin.
- **Coexistence** : BACO (Vercel, branche `main`) reste en production sur Supabase jusqu'à la **date de bascule**.
  CSM v2 tourne sur sa propre base PocketBase, alimentée par import ; la migration réelle se fait **en une fois**
  à la bascule (gel de BACO, export, import, vérification). Aucune écriture dans Supabase d'ici là.
- Gamification (classement, badges, likes, jauge de confiance, fléchettes, Konami) : **supprimée** (validé).
- **Mobile obligatoire** : toute page doit être utilisable à 360 px de large (pas de scroll horizontal de page,
  cibles tactiles ≥ 44 px, champs ≥ 16 px, safe-areas). Shell : tiroir + barre d'onglets en bas (< md).
  Vérifier chaque écran en 390×844 (Playwright) avant de livrer.

## 7. Pièges connus

- (v2) `PREPROD_PB_URL` n'est pas l'instance CSM (voir §2).
- (v2) **Deux instances : prod (`csm.fs0ciety.org`, `pb-csm.fs0ciety.org`, branche `csm-prod`) et preview (`test-csm`,
  `pb-test-csm`, branche **`csm-preview`** depuis le 11 oct.).** On développe et on valide sur la preview ; la prod n'avance
  que par une avance rapide de `csm-prod` depuis `csm-preview` (`git push origin csm-preview:csm-prod`) **quand l'utilisateur le demande**. Jamais de test destructif ni
  de données fictives sur la prod (`pb-csm`) ; les comptes réels y sont.
- (v2) **Cloudflare « Email Address Obfuscation »** réécrit les e-mails du HTML → erreurs d'hydratation React (#418) et
  `mailto:` cassés : `middleware.ts` pose `Cache-Control: … no-transform` sur les pages (10 oct.). Une nouvelle option
  Cloudflare de réécriture (Rocket Loader, Auto Minify…) doit rester coupée ou couverte par `no-transform`.
- (v2) **Sauvegardes PocketBase et bucket partagé** : la rotation supprime toutes les sauvegardes `@auto_pb_backup_*` du
  stockage au-delà de N, quelle que soit l'instance (vérifié dans `core/backup.go` de la 0.40.4) → **un bucket R2 = une
  instance**. `csm-backups` est réservé à la prod ; la preview sauvegarde sur son volume.
- (v2) **Ne jamais authentifier un domaine d'envoi d'e-mail sur un nom qui porte une application** : la configuration
  automatique Brevo (Domain Connect) sur `csm.fs0ciety.org` a remplacé son enregistrement par un CNAME `brevosend.com` →
  **production hors service** le 10 oct. (rétabli par l'utilisateur, Brevo abandonné). Envoi : serveur Stalwart
  `mail.fs0ciety.org` (compte `csm@fs0ciety.org`, DEPLOIEMENT-V2 §SMTP). Après tout changement DNS, vérifier `https://csm.fs0ciety.org/api/health`.
- (v2) PocketBase refuse un **filtre sur `email`** (champ masqué) même pour un admin avec `manageRule` : filtrer en
  JavaScript après lecture (campagnes).
- (v2) PostgREST (Supabase) plafonne une réponse à **1000 lignes** : paginer (`offset`) — PtCar en a 1148.
- (v2) Dans l'environnement cloud, `fetch` de Node ignore le proxy sortant : lancer les scripts avec
  `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`. Un domaine absent de « Network access »
  renvoie un 403 du proxy (`curl -sS "$HTTPS_PROXY/__agentproxy/status"`).
- (v2) PocketBase : le champ `autodate` `created` est forcé à l'enregistrement → l'import rétablit la date
  d'origine par SQL. Les empreintes bcrypt s'écrivent aussi par SQL (`setPassword` rehacherait).
- (v2) PocketBase : un champ JSON `null` dans une règle (`denies !~ …`) vaut faux en SQL → hook de normalisation
  (`pocketbase/pb_hooks/users.pb.js`). Trouvé par l'E2E, pas par le test des règles : tester aussi des comptes
  créés « à nu ».
- (v2) **PocketBase JSVM : une fonction déclarée en tête d'un `*.pb.js` n'est PAS visible dans un gestionnaire `routerAdd` /
  `onRecord…`** (« Something went wrong », HTTP 400) : répéter le code dans le gestionnaire ou passer par `require()`.
- (v2) WebAuthn refuse une adresse IP comme identifiant : tester les passkeys sur `http://localhost:3000` (pas 127.0.0.1),
  avec l'authentificateur virtuel de Chromium (CDP `WebAuthn.addVirtualAuthenticator`).
- (v2) Docker : le démon n'est pas lancé dans l'environnement cloud (`nohup dockerd &` suffit) ; les builds qui
  téléchargent (wget, npm, polices) échouent derrière le proxy TLS → tester l'image avec le binaire local.
- (v2) Coolify : `POST /deploy` (et non GET) ; variables créées par l'API = `is_buildtime: true` par défaut → forcer
  `false` pour les secrets ; `custom_internal_name` donne un nom réseau stable (`csm-pocketbase`) ; sonde de santé à
  régler sur `127.0.0.1` (`localhost` = `::1` dans Alpine → 503). Logs de déploiement : droit `read:sensitive` absent
  (voulu) → diagnostic par tâches planifiées exécutées une fois (le statut reflète le code de retour), puis supprimées.
- (v2) Coolify : **un push sur la branche déployée redéploie déjà `csm-web` et `csm-pocketbase`** (webhook). Ne pas
  appeler `POST /deploy` en plus : deux déploiements simultanés ont laissé `csm-pocketbase` arrêté (`exited:unhealthy`,
  9 oct.) ; rétabli par un nouveau push. Journal de démarrage dans `/pb_data/startup.log` ; `PB_DEBUG_HOLD=1` (variable
  runtime, à retirer ensuite) garde le conteneur en vie après un échec pour l'examiner par tâche planifiée.
- (v2) **Les PocketBase publics (`pb-csm`, `pb-test-csm`) sont derrière Cloudflare Access depuis le 10 oct.** (application
  « PocketBase CSM », e-mails autorisés seulement, `docs/DEPLOIEMENT-V2.md`) : depuis l'environnement cloud, tout appel
  direct (contrôle « collection présente » ci-dessous, restauration par l'API, réglages, `CSM_PB_URL`) reçoit un 302 vers
  `cinecode.cloudflareaccess.com`. Passer par une tâche planifiée Coolify exécutée une fois, ou demander à l'utilisateur un
  jeton de service Access posé en variables d'environnement. L'appli web n'est pas concernée (réseau Docker interne).
- (v2) Un déploiement Coolify **raté** de `csm-pocketbase` laisse l'ancienne version en ligne : `csm-web` (déployé, lui)
  appelle alors une collection absente → 404 PocketBase (« Missing collection context »). Vérifier après un push qui
  ajoute une migration : `curl https://pb-test-csm.fs0ciety.org/api/collections/<nom>/records` (401/403/200 = présente,
  404 = absente) et l'état des déploiements (`GET /deployments/applications/<uuid>`). 9 oct. : déploiement de b51d672
  « failed » (journaux illisibles par l'API), migration pourtant valide sur trois copies de la base.
- (v2) Le job CI `sign-firefox` (si les secrets AMO existent) **commite le .xpi signé sur la branche de session** une fois
  par version, ~10 min après le push : faire `git pull` avant de pousser, sinon le push est refusé (non fast-forward).
- (v2) **« [skip ci] » dans un message de commit fait aussi sauter le déploiement Coolify** (pas seulement GitHub Actions) :
  le 1er `.xpi` signé (fa0422b) n'a pas été servi. Même **cité** dans un message (dfd312d), le marqueur suffit à bloquer le déploiement : ne
  jamais l'écrire dans un message de commit. Ne pas l'utiliser ; un push fait avec `GITHUB_TOKEN` ne relance aucun
  workflow. Secrets AMO : 1er essai avec retours à la ligne puis le secret **masqué** (« •••• ») copié depuis AMO —
  le job affiche maintenant longueur / format / classes de caractères des clés, jamais leur valeur.
- (v2) `cn()` = tailwind-merge **étendu** (tailles et couleurs sémantiques), sinon il supprime `text-accent-fg` ou
  `text-body` : voir `web/CLAUDE.md`.
- (v2) Avant de relancer le serveur web, vérifier que l'ancien `next-server` est arrêté (sinon EADDRINUSE et les
  tests tournent contre l'ancien build) : `ps -eo pid,args | grep "[n]ext-server"`.
- (v2) Ne jamais faire `pkill -f "<motif>"` (ni `ps | grep "[m]otif" | xargs kill`) quand le motif figure dans la
  commande elle-même : le shell se tue (code 144) ; utiliser `pgrep -x pocketbase`. Passer par un fichier pid ; `npm run start:standalone` laisse un `next-server` enfant : l'arrêter par
  `fuser -k 3000/tcp` (sinon EADDRINUSE et l'ancien serveur sert un build remplacé → « Application error »).
- (v2) Lecture Supabase **autorisée sans redemander** (SELECT connecteur, GET clé de service) ; toute écriture
  reste soumise à l'accord explicite de l'utilisateur.
- (v2) Restauration Postgres : colonnes `GENERATED ALWAYS AS IDENTITY` → `overriding system value` ;
  `search_path` doit inclure `extensions` ; `"PUBLIC"` à déguillemeter dans `08_grants_roles.sql`.
- (v2) Certaines fonctions Supabase sont stockées avec des fins de ligne CRLF.
- (BACO) Rôles en base Supabase : `admin`, `sysop`, `moderator`, `otto_agent`, `user` (table `profiles.role`),
  recopiés dans `auth.users.raw_user_meta_data.role` par trigger — **ne jamais se fier à
  `user_metadata` pour une décision de sécurité** (modifiable par l'utilisateur).

- (v2) **Ne jamais changer de route par `history.replaceState` sous un formulaire en cours** : au rafraîchissement suivant
  (Server Action, `router.refresh`), Next rend l'arbre de la nouvelle route et React remonte le formulaire (saisie et
  dialogue perdus). Le brouillon créé garde sa route : `/commandes/nouveau?id=…`, rendu par la même structure
  (`div > BusForm`, clé `nouveau-<k>-<statut>` où `k` est tiré à chaque visite et gardé dans l'URL) que la fiche.
  Clé des formulaires = identité + statut, jamais `updated`.
- (v2) **`.chamfer` ne doit jamais fixer `position`** avec une spécificité > 0 : il écrasait le `fixed` des dialogues
  (dialogue rendu en bas de page, invisible en mobile ; l'E2E desktop passait car Playwright fait défiler). Règle en
  `:where(.chamfer)` ; l'E2E commandes vérifie que le dialogue tient dans la fenêtre.
- (v2) Grille / flex : tout conteneur de champ doit avoir `min-w-0` (`Field` l'a) ; un `<select>` impose sinon la
  largeur de sa plus longue option (débordement horizontal en 390 px).
- (v2) **Les comptes repris de BACO gardent leur UUID Supabase** (36 caractères avec tirets) : tout contrôle d'un identifiant
  d'agent doit accepter `/^[a-z0-9-]{15,36}$/`, jamais `{15}` seul (avatars et présence invisibles pour les 29 vrais comptes,
  11 oct. ; trouvé seulement en préversion, les E2E créant des comptes neufs).
- (v2) PocketBase : un champ nombre vide vaut 0 → index uniques partiels en `WHERE legacy_id > 0` (voir `pocketbase/CLAUDE.md`).
- (v2) **Paramètre d'URL d'un panneau** (`?entree=`, `?train=`, `?pn=`) : le synchroniser par `window.history.replaceState`
  (même chemin), jamais par `router.replace` : ce dernier relance le rendu serveur pendant la Server Action qui charge
  le panneau, et le panneau restait vide (trouvé par l'E2E). Un `useEffect` sur le paramètre gère les liens de la cloche
  vers la page déjà ouverte.
- (v2) Le relais iRail et les tuiles passent par `fetch` de Node : dans l'environnement cloud, lancer le serveur avec
  `NODE_USE_ENV_PROXY=1` ; les serveurs de tuiles sont bloqués ici → E2E et captures avec `web/e2e/mock-services.mjs`.
- (v2) **Une seule connexion SSE par onglet** (`web/src/lib/live.ts`) : plusieurs `EventSource` saturent les 6 connexions
  HTTP/1.1 par domaine et la navigation se bloque (accueil avec widgets en direct, 10 oct.) ; en production HTTP/2 masque le
  problème. Trouvé par l'E2E shell en local.
- (v2) **Traefik (Coolify) intercepte `/.well-known/acme-challenge/` sur le port 80** : un service derrière Traefik ne peut
  pas obtenir son certificat en HTTP-01 (404 vide), ni en TLS-ALPN-01 (443 tenu par Traefik). Stalwart : DNS-01 (jeton
  Cloudflare limité) ou passthrough TCP. API Stalwart v0.16 = JMAP (`/jmap/`, `urn:stalwart:jmap`), plus de `/api/principal`,
  appelée sur `https://mailadmin.fs0ciety.org` depuis le 10 oct. (`mail.fs0ciety.org` n'a plus de route HTTPS).
- (v2) **`csm.fs0ciety.org` résout par le joker `*.fs0ciety.org`** (aucun enregistrement propre) : y ajouter un MX / TXT
  fait cesser le joker pour ce nom → prod hors service. Poser d'abord un `A` explicite (152.53.176.13, non proxifié),
  vérifier `/api/health`, puis le reste. Un CNAME n'admet pas de MX : le remplacer par un A équivalent (même proxy).
- (v2) **Cloudflare Access ne protège que les noms proxifiés** (nuage orange) : un nom en « DNS seulement » ou résolu par le
  joker `*.fs0ciety.org` est joint directement, Access ou non. Proxifier avant de protéger (zone en SSL « Full ») ; jamais
  `mail.fs0ciety.org` (SMTP / IMAP exigent le DNS seul). Un service avec clients non navigateur (API, webhooks, appli mobile)
  casse derrière Access sauf jeton de service ou chemin limité (`base.fs0ciety.org/_` = admin PocketBase seul).
  **Une application Access à plusieurs domaines** renvoie, après la connexion, vers `/cdn-cgi/access/authorized` d'un
  **autre** domaine de l'application (boucle : base → tools, puis webmail → tools, 10 oct.) → **une application Access par
  nom d'hôte ou par chemin**, jamais de regroupement.
- (v2) **Access se contourne par l'IP du serveur** (Traefik route sur l'en-tête Host ; vérifié le 11 oct. : le hub répondait 200
  par `https://152.53.176.13` + `Host: services.fs0ciety.org`). Parades posées : signature Access vérifiée par le hub ; étiquette
  Traefik `ipallowlist` des IP Cloudflare (`cf-only-*`) sur webmail, Stalwart, Surrealist, PocketBase CSM (prod + preview),
  PocketBase de Cosmic Empires, préprod Cosmic et OCC Deliveries. Services compose : une étiquette
  `traefik.http.middlewares.<nom>.ipallowlist.sourcerange=…` dans le compose suffit (Coolify l'ajoute à ses routeurs).
  Applications : `custom_labels` complètes modifiées par l'API (« Readonly labels » reste coché et n'est pas modifiable par
  l'API : **si quelqu'un change le domaine dans l'interface, Coolify régénère les étiquettes et la liste blanche saute** →
  l'audit `/admin/access` du hub le signale). Le tableau de bord Coolify reste joignable par l'IP (sa connexion protège).
- (v2) **Les services envoient avec le mot de passe d'application** du compte Stalwart `nicolas`, jamais son mot de passe
  personnel (le changer coupe tous les envois : 10 oct.).
- (v2) **Tests d'envoi d'e-mail : uniquement vers `nd.managment@gmail.com`** (demande de l'utilisateur du 10 oct.), jamais
  vers d'autres adresses ni vers les joueurs / agents ; jamais d'envoi de campagne à tous pour un test.
- (v2) **Vercel (projet « baco ») ne construit plus les branches de CSM** : `vercel.json` à la racine, `git.deploymentEnabled:
  false` (10 oct., demande de l'utilisateur ; échecs « script.sh introuvable » sur chaque push). `main` (BACO en production)
  n'est pas touché ; pour couper Vercel entièrement, déconnecter le dépôt dans le tableau de bord Vercel.
- (v2) **Server Actions limitées à 1 Mo** (défaut de Next) : un envoi de fichier passe par une route (`POST /api/…`,
  lecture bornée du corps) — les documents de la bibliothèque ne partaient pas au-delà de 1 Mo (11 oct.).
- (v2) **Webhook de la GitHub App de Coolify** : son adresse était `http://152.53.176.13:8000/…` (fixée à la création de l'App) ;
  la fermeture du port 8000 (pare-feu netcup, 11 oct.) a coupé tous les déploiements automatiques. Remise sur
  `https://coolify.fs0ciety.org/webhooks/source/github/events` depuis le hub (GitHub › « Déploiements automatiques », qui montre
  aussi les livraisons). Les sites CARDOR (`mons-corp`) sont en source « Public GitHub » : sans webhook, sauf webhook manuel
  sur le dépôt. **Pare-feu netcup** : la politique se termine par un « Drop all » implicite → une règle ACCEPT tout en dernier.
- (v2) **Un fichier HAR contient les cookies de session** (onglet Réseau « Enregistrer tout au format HAR ») : ne jamais
  l'ouvrir en entier ni le copier dans le dépôt ; l'analyser par script qui n'affiche que chemins, clés et types
  (fait pour Quinyx le 14 oct.), et demander à l'utilisateur de se déconnecter du service ensuite.
- (v2) **Identifiants Quinyx (groupes, employés) jamais dans Git** : les groupes se saisissent dans Administration ›
  Quinyx ; l'extension les demande à CSM (`/api/equipe/quinyx/config`). E2E et tests : identifiants fictifs.
- (v2) **PocketBase JSVM : `e.json(...)` renvoie `undefined`** : une fonction partagée qui « renvoie » une réponse de refus
  (`return e.json(403…)` puis `if (denied) return denied;`) ne stoppe RIEN, le gestionnaire continue et écrit sa réponse à la
  suite (faille critique de « voir en tant que », 14 oct. : jeton d'un autre agent sans secret). Toujours **lever** une erreur
  (`throw new ForbiddenError(…)`) hors du gestionnaire, ou `return e.json(…)` directement dans le gestionnaire.
- (v2) **Chaque push sur `csm-preview` redéploie** (PocketBase s'arrête ~30 s quand `pocketbase/**` change, pas de mise à jour
  sans coupure avec un volume) : regrouper les envois vers la préversion ; les pages d'erreur réessaient seules
  (`lib/use-auto-retry.ts`).
- (v2) **`users.preferences` est réécrit en entier** (lire puis `update`) par chaque action de préférence : deux actions
  lancées en même temps s'écrasent (favori + récent de l'annuaire, 14 oct.) → les passer en file côté client. En E2E,
  attendre la réponse de la Server Action visée (filtrer sur son argument) : la barre latérale poste aussi ses compteurs.
- (v2) **Déplacer une page = l'ajouter à `web/src/lib/redirects.ts`** (navigation v3) : les notifications en base, les
  favoris et ⌘K portent d'anciens liens (`/operations?train=`, `/operations/carte-pn?pn=`…). Ne jamais rediriger
  `/pmr/extension` tant que l'extension ne déclare pas `/extension*` dans ses `content_scripts` (connexion cassée).
- (v2) **Un conteneur à défilement interne (`overflow-auto` / `overflow-y-auto`) dans la page doit être positionné
  (`relative`)** : sinon les éléments en position absolue qu'il contient (`sr-only` des badges, boutons…) prennent pour
  référence un ancêtre extérieur, échappent au défilement et allongent la page (22 oct. : Missions PMR 2 881 px pour un shell
  de 1 035, barre latérale collante et pied de page qui remontaient). E2E `layout-scroll.spec.ts`.
- (v2) **Tâche planifiée Coolify : commande de 255 caractères au plus** (« Server Error » au-delà) : découper en plusieurs
  tâches exécutées une fois (ex. jeton superuser dans `/tmp/a`, puis appel, puis suppression du fichier), et supprimer
  chaque tâche après sa première exécution (`GET …/scheduled-tasks/<uuid>/executions`).
- (v2) Playwright : un libellé avec astérisque requis (`Arrivée *`) ne répond pas à `getByLabel(…, { exact: true })` ;
  passer par `getByRole(…, { name, exact: true })`.

## 8. Journal des décisions

- 2026-10-08 — Audit initial réalisé (3 agents + inspection Supabase). Proposition rédigée.
  Renommage BACO → CSM acté par l'utilisateur.
- 2026-10-08 — Retours utilisateur : pas de Realtime WS (pare-feu) → relais SSE serveur ; PocketBase
  étudié et écarté (migration lourde, coexistence BACO) ; Next.js écarté (pas de gain perf, réécriture) ;
  e-mail = brouillon .eml + PDF depuis boîte fonctionnelle ; gamification supprimée ; BACO reste actif.
- 2026-10-08 — Phases 0→3 livrées sur la branche : migration sécurité (non appliquée), XSS, socle serveur,
  Docker/CI, gamification retirée, design system 5 thèmes + shell (sidebar, topbar, ⌘K, tiroir/onglets mobiles).
  Découverte : 6 tables métier (déplacements PMR, interventions, commandes taxi/bus, présences) ouvertes à anon
  → ajoutées à la migration (4h). Exigence utilisateur : app **totalement compatible mobile**.
- 2026-10-08 — **Pivot v2** demandé par l'utilisateur : Next.js/React (+ PocketBase probable), nouvelle branche,
  environnement de test `test-csm.fs0ciety.org`, BACO intouché, sauvegarde Supabase. Retours UX sur la v1 :
  sidebar trop chargée (→ 6 entrées + onglets internes), widgets non responsive (→ container queries),
  lisibilité insuffisante, design pas assez moderne, besoin de composants réutilisables et de motion GSAP.
  Référence design : test.fs0ciety.org/decisions (derrière connexion). Cahier des charges : `docs/CSM-V2.md`.
- 2026-10-08 — **Session v2, étape 0 : sauvegarde Supabase** faite en lecture seule (`docs/SAUVEGARDE-SUPABASE.md`).
  Pas de TCP sortant depuis l'environnement cloud (donc pas de `pg_dump`) : schéma par requêtes catalogue via le
  connecteur Supabase, données par REST (`scripts/supabase-backup.mjs`) complétées en SQL, Storage par l'API.
  Restauration testée sur Postgres 16 local. Archive chiffrée `age`, hors Git. Empreintes de mot de passe non
  sauvegardées (accord utilisateur requis). Piège : les variables d'environnement modifiées ne sont lues qu'au
  démarrage d'une session ; ne jamais réutiliser une clé collée dans la conversation.
  **`PREPROD_PB_URL` = PocketBase de test.fs0ciety.org (jeu Cosmic Empires), pas une instance CSM : n'y rien écrire.**
- 2026-10-08 — Plan des étapes 1-3 **validé**. PocketBase retenu ; export des empreintes bcrypt autorisé
  (import PocketBase) ; instance PocketBase CSM **dédiée sur Coolify** avec l'app web ; migration des données
  **en une fois à une date de bascule**. Fichiers d'instructions à alimenter au fil de l'eau (§4.8).
- 2026-10-08 — Session 2, étape 0 : sauvegarde relancée avec la nouvelle clé (GET seuls, inventaire Storage par
  SELECT), comptes recoupés (51/51 tables), 29 empreintes `$2a$` exportées hors Git. Réseau de l'environnement
  élargi par l'utilisateur (Supabase, Coolify, test-csm, iRail). Lectures Supabase autorisées sans redemander.
- 2026-10-08 — Session 2, étape 1 : prototype PocketBase 0.40.4 + squelette Next 15.5. Empreintes `$2a$` reprises
  telles quelles (pas de réinitialisation), UUID Supabase conservés, 24 contrôles de règles, relais SSE et
  sauvegarde/restauration validés. Recommandation chiffrée **soumise** (`docs/BACKEND-DECISION.md`, ≈ 10,75 j de
  backend, collections créées avec chaque module). `CSM_TEST_ADMIN_PASSWORD` ne correspond pas à l'empreinte BACO
  du compte (question posée). Arrêt demandé par l'utilisateur à cette recommandation.
- 2026-10-08 — Réponses de l'utilisateur : sauvegardes = volume Coolify (R2 plus tard) ; 8 tables non migrées
  confirmées, **`infractions` abandonnée** ; sociétés sans nom à compléter plus tard ; avatars DiceBear → initiales ;
  `CSM_TEST_ADMIN_PASSWORD` mis à jour (à revérifier en session 3 : variables lues au démarrage).
- 2026-10-08 — Étape 2 lancée. Agents UI (`docs/design/REFERENCES-UI.md`) et UX (`docs/design/AUDIT-UX-COMMANDES.md`).
  L'audit UX révèle un **bug de la B201 de BACO** (changer la date puis enregistrer écrase le rapport du jour précédent)
  et un e-mail taxi sans destinataire : signalés à l'utilisateur, BACO non modifié. Captures soumises avant de généraliser.
- 2026-10-08 — Design **validé**. Réponses métier : taxi utilisé ; `.eml` sur mobile non prioritaire ; **statut « facturé »
  supprimé** (confirmer l'envoi = facturé, migration `1760000100`) ; « en cours » gardé ; modèles « oui » (lu comme
  personnels + partageables, à confirmer). Étape 3 lancée.
- 2026-10-08 — Étape 3 faite (shell, navigation source unique, ⌘K, mobile 4 + Plus, tableau de bord dnd-kit, CSP).
  Trouvé : contenu de page qui fuit dans le flux RSC malgré `notFound()` du layout → gardes dans chaque page.
- 2026-10-08 — **Accord de l'utilisateur pour appliquer le hotfix sécurité.** Vérifications préalables OK (objets
  présents, 0 écart de rôle profiles/user_metadata, code BACO `main` compatible). Le connecteur Supabase expire sur
  toute écriture (apply_migration et execute_sql, 3 essais) sans rien appliquer : connecteur en lecture seule.
  Exécution confiée à l'utilisateur (SQL Editor), vérification ensuite par SELECT + advisors (référence avant :
  36 ERROR / 69 WARN).
- 2026-10-08 — Étape 3 validée. **Étape 4** : projet Coolify CSM créé par l'API ; `csm-pocketbase` (volume `/pb_data`,
  superuser par variables runtime, sauvegarde PocketBase 2 h + volume Coolify 2 h 30, 14 conservées ; R2 plus tard) et
  `csm-web` (`PB_URL` interne). Branche déployée = branche de session (à changer dans Coolify à chaque session).
  CI `csm-v2.yml` (web, règles PocketBase, E2E, images). Base de test vide : import des données à décider.
- 2026-10-08 — `https://test-csm.fs0ciety.org` **en ligne** (santé OK, PocketBase joint en interne, CSP/HSTS), CI verte
  au premier run. Trouvés au déploiement : sonde `localhost`/IPv6 (503), balise Cloudflare Web Analytics injectée
  (à couper côté Cloudflare), tailwind-merge qui retirait `text-accent-fg` (bouton primaire peu lisible) → corrigé.
- 2026-10-08 — **Import des données BACO sur l'instance de test** (choix A de l'utilisateur) par sauvegarde PocketBase
  construite en local puis envoyée et restaurée par l'API (DEPLOIEMENT-V2 §5). **Connexion réelle vérifiée** avec le
  mot de passe BACO du compte admin de test (desktop + mobile, cookie httpOnly/Secure, SSE « En direct » via
  Cloudflare). `CSM_TEST_ADMIN_PASSWORD` correspond désormais à l'empreinte BACO.
- 2026-10-08 — **Hotfix sécurité appliqué par l'utilisateur** (SQL Editor) et vérifié en lecture : trigger de garde,
  RLS partout, plus de policy `public … true`, vue d'audit en `security_invoker`, advisors **0 ERROR** (36 avant).
  Reste : `admin_update_user_role` / `admin_set_presence` passent si l'appelant n'a pas de profil (NULL) → correctif
  `20261008130000_hotfix_followup.sql` préparé, non appliqué. Balise Cloudflare Web Analytics coupée (vérifié).
- 2026-10-08 — Fin de session 2. Message de la session 3 (étape 5, module Commandes) dans `docs/NOUVELLE-SESSION.md`.
- 2026-10-08 — **Session 3, module Commandes.** Réponses de l'utilisateur (AUDIT-UX-COMMANDES §6) : **tout agent confirme**,
  heure confirmée facultative ; **une B201 par jour** pour l'équipe, filtre district à l'écran et au PDF ; **bus annulé masqué
  de la B201** (gardé barré sur le bon) ; **modèles tous partagés**, modifiables par tout agent qui écrit des commandes.
  Schéma `1760000200_commandes.js` (cycle de vie par hook, `order_events`, chauffeurs, contacts, lignes desservies, taxis,
  clients PMR minimaux, gares par ligne, modèles, B201), 66 contrôles de règles. Écrans bus, taxi, suivi, B201 ; envoi par
  `.eml` (X-Unsent, PDF `pdf-lib` joint, copie au bureau PACO du district). Suivi des agents Security auditor et Reviewer
  avant push. `CSM_PB_*` toujours mal formées (une seule ligne) : rappelé à l'utilisateur.
  Audit sécurité : 0 critique / élevé ; corrigés : contournement de l'annulation (en cours → confirmé → annulé), données PMR
  copiées sur le taxi masquées sans `pmr:read` (fiche, panneau, PDF, `.eml`, recherche), numéros de bon atomiques, champs
  d'attribution non forgeables, modèles sans données personnelles. Revue : « Nouveau » reprenait le brouillon précédent
  (clé par visite `?k=`), panne réseau / redéploiement qui faisait planter le formulaire (`safeCall`, autosave), bornes
  taxi fausses en heure d'hiver, heure vide devenue 00:00 (`time_pending`), réponses du panneau dans le désordre.
  2e revue (sur les corrections) : la copie PMR d'un taxi repris de BACO n'est plus effacée à la modification ; un agent
  sans `pmr:read` ne réécrit plus les champs PMR masqués ; cause PMR retirée des listes sans ce droit ; « Préparer
  l'envoi » d'un modèle non modifié crée bien la commande (`flush({ create: true })`) ; la B201 ne reprend la version
  distante que sans saisie en cours (`isDirty()`).
- 2026-10-08 — **Module Commandes validé** par l'utilisateur (« ok la suite »). Questions restées sans réponse, défauts gardés :
  B201 écrite par les moderators (comme BACO), cause PMR gardée sur le bon taxi, PO et références comptables de la v1,
  B201 sans liste de diffusion (PDF seul). Étape suivante : module PMR.
- 2026-10-08 — **B201 écrite par tous les agents du district** (user et otto_agent rattachés à un district, moderators
  comme avant ; migration `1760000300`). Le district donnant un droit, l'agent ne peut plus le modifier lui-même.
  `otto_agent` reçoit `b201:read` (sa B201 ne montre que les bus). Cause PMR gardée sur le bon taxi, PO et références
  comptables de la v1 gardés, B201 en PDF seul.
- 2026-10-08 — **Module PMR** : audit `docs/design/AUDIT-UX-PMR.md` (10 bugs v1 signalés, v1 non modifiée). Décisions :
  **saisie de la journée abandonnée** (plus utilisée depuis le 3 mai 2026 : livrer Clients et Matériel, historique
  archivé en lecture) ; prestation **structurée** par assistance avec « Coller depuis DICOS » ; **réf. DICOS, client
  facultatif**, aucun nom en texte libre ; données de santé **anonymisées après 12 mois** (fiches sans prestation
  archivées après 24 mois, exports sans nom), à valider avec le DPO. Matériel : état par `pmr:write`, création et
  modification complète par les coordinateurs ; zones modifiables (district) ; téléphone etrali: desktop / tel: mobile.
  Audit sécurité PMR : aucune fuite de nom sans `pmr:read` ; corrigé : anonymisation incomplète (historique, audit,
  taxis, réf. DICOS), texte BACO déplacé dans `pmr_assist_legacy`, règles resserrées. Revue : période / zone non
  recalculées, « Et une autre » sans contrôle, téléphone en double sur mobile (`inline-flex` l'emportait sur `hidden`),
  doublons par téléphone, dialogue d'état qui changeait l'état.
- 2026-10-08 — **Module PMR validé** (captures). Durées de conservation 12 / 24 mois et texte libre visible des lecteurs
  jusqu'à l'anonymisation : acceptés, à confirmer avec le DPO. Accord de l'utilisateur pour la branche
  `occ-studios-showcase` (captures de démo sur base fictive + `showcase/README.md`, demande de la session du site studio).
- 2026-10-08 — Branche `occ-studios-showcase` poussée (orpheline, 4 captures fictives + README). **Module Opérations** :
  audit `docs/design/AUDIT-UX-OPERATIONS.md` (13 bugs v1, 12 questions soumises). Vérifié en lecture sur Supabase :
  **XSS stocké de la carte PN dans BACO** (`pn_data` modifiable par tout compte connecté, popup `setHTML` sans
  échappement) → correctif `supabase/migrations/20261008140000_pn_data_update_fix.sql` préparé, **non appliqué**
  (aucun code de BACO `main` n'écrit `pn_data`). `/operationnel`, `/lignes`, `/ptcar` → Référentiels ; `/planning` → Équipe.
- 2026-10-08 — **Réponses Opérations** : toutes les recommandations de l'audit validées, **fonds de carte option B**
  (tuiles raster OpenStreetMap relayées par le serveur, Leaflet ≈ 42 Ko gzip chargé sur la seule carte, sans changement de
  CSP) ; **PN : seulement ceux de BACO avec leur adresse** (211/211, `temp_geo_data` non reprise — Q6 révisée par
  l'utilisateur). Livré : schéma `1760000500_operations.js` (`ops_log`, `ops_log_reads`, `ops_log_events`,
  `notifications`, `level_crossings`, `train_watches`, dépôts sur `pmr_zones`), hooks (mentions, urgence diffusée une
  fois par agent et par entrée, retrait 15 min / coordinateurs, historique, cron des trains suivis), import (33 entrées,
  22 « Lu », 211 PN), écrans des 4 onglets, cloche, widgets d'accueil, bus de substitution pré-rempli. Audit sécurité :
  0 critique / élevé ; corrigés : historique et « Lu » d'une entrée retirée visibles, notifications répétables, envoi de
  fichier non borné en mémoire, recherches de mentions sans limite, débit des relais iRail / tuiles, survol de carte
  en HTML, lien de notification. Revue : alerte de retard répétée toutes les 2 min, liens de la cloche sans effet sur la
  page ouverte, entrée « modifiée » dès l'envoi d'une pièce jointe, enregistrement refusé après suppression d'une pièce
  jointe, train ouvert au mauvais jour, bus des commandes annulées comptés, PMR hors filtre de district, PDF bloqué par
  le bac à sable.


- 2026-10-08 — **Intégration DICOS (Missions PMR)** cadrée (`docs/design/CADRAGE-DICOS.md`). Contrainte : DICOS
  derrière Entra ID/IdHub, **pas de client credentials** (refus IT) ni de `refresh_token` (pas de scope
  `offline_access`) → aucun flux serveur non interactif. **Solution retenue : extension de navigateur** greffée sur
  l'onglet DICOS connecté (réutilise la session, aucun secret SNCB stocké), qui lit `POST /api/missions` (jour) +
  `GET /api/missions/{id}?reservationType=…` (n° de dossier `reservationId`, format AAAA-MM-JJ-NNNN), filtre et
  **pousse vers un endpoint d'ingestion CSM** (jeton de connecteur révocable, dédup sur `dicos_id`). Décisions de
  l'utilisateur : **garder tous les champs** (e-mail, téléphone, accompagnateur, conducteur compris) derrière
  `pmr:read`, anonymisés à 12 mois, jamais en Git/capture (à confirmer DPO) ; **deux modes de synchro** (bouton +
  auto onglet visible) ; **renommer Prestations → Missions PMR** + sélecteur de jour. Jeton DICOS collé dans la
  conversation = à régénérer (secret exposé). Suivant : audit UX Référentiels (en cours) puis implémentation.
- 2026-10-08 — **DICOS / Missions PMR implémenté.** Extension MV3 `extension/dicos-connector/` (inject.js en monde MAIN
  capte le Bearer en vol — jamais stocké — + les stationIds ; content.js lit DICOS en même origine, débit global ~4 req/s,
  modes bouton + auto avec pause onglet caché ; background.js pousse vers CSM avec le jeton de connecteur ; popup avec
  sélecteur de jour en Europe/Brussels). Mapping **côté serveur** (`web/src/lib/pmr/dicos-mission.ts`, source unique) ;
  ingestion `POST /api/pmr/missions/ingest` (secret `x-dicos-token` timing-safe, compte de service `dicos:write`,
  idempotent, dédup `dicos_id`, ignore les anonymisées). Renommage Prestations → **Missions PMR**, **création manuelle
  retirée** (`/pmr/nouveau` supprimé). **Validé en prod test** (test-csm) : mauvais jeton 401, mission fictive créée puis
  dédupliquée, mapping correct (CRE, dossier AAAA-MM-JJ-NNNN, heure mur d'horloge), fiche fictive supprimée.
  **Audit sécurité** (0 critique/élevé) + **revue** passés ; corrigés : compte de service passé d'un rôle `reader`
  (lisait tout le nominatif PMR) à un **rôle dédié `connector`** hors READERS lisant seulement `pmr_assists`/`pmr_mission`
  (`1760000700`) ; `optional_host_permissions` resserré à `*.fs0ciety.org` ; XSS potentiel du popup (coercition +
  échappement) ; endpoint borné (taille de corps + débit) ; lecture d'upsert ne masquant plus que le 404 ; compteurs
  exacts + pas de réécriture inutile ; cache de l'extension purgé à la synchro manuelle ; jour calculé en Europe/Brussels
  + garde de lot tolérante à ±1 jour (missions de nuit) ; parse d'heure défensif si offset UTC. 161 contrôles de règles.
- 2026-10-08 — **Missions PMR v2** (retours utilisateur après 1re synchro réelle, 139 missions) : écran **lecture seule**
  (aucune édition/transition) ; **trajet** gare départ → gare arrivée (`other_station` ajouté) ; **sens IN/OUT** (départ =
  IN/embarquement, arrivée = OUT/débarquement) ; **district** DSE/DSO/DCE déduit de la gare via Supabase `ligne_data`
  (`web/src/lib/pmr/districts.ts`, 324 gares) et filtre par district (remplace zone) ; **nom du voyageur** en liste et au
  détail (lu dans `pmr_mission` via back-relation, `pmr:read`), + e-mail/point de rencontre/voiture-porte/accompagnateur/
  conducteur au panneau ; bouton **Copier** un libellé (« Embarquement d'une chaise roulante », nombre en toutes lettres,
  accord genre/nombre, `assistCopyText`). Migration `1760000800` (`other_station`, `district`). **Type PMR encore à
  fiabiliser** : sur 139 missions, 69 sans type + 29 « AUTRE » (le détail DICOS n'est pas toujours récupéré / codes
  d'assistance inconnus) → échantillon brut à demander à l'utilisateur.
- 2026-10-08 — **Missions PMR v3** (retours : filtres automatiques, plage de dates, heure d'arrivée absente, type « 2 × autre »
  pour une chaise fixe, copier-coller impossible dans le panneau, trajets en correspondance). Source = **dossier complet
  DICOS** `trip-details/{n°}/{type}` (`mapDossier`, test fictif) → **une ligne par trajet** (choix de l'utilisateur) : gare +
  heure de départ ET d'arrivée, IN (`withDepartureAssistance`) et OUT (`withArrivalAssistance`) sur la même ligne, district
  des deux gares, **taxis affichés** (`transport`), type PMR depuis `travelers.disableds` (`pmr-lm` = MR). Migration
  `1760001100` (`arr_time`, `arr_district`, `in_assist`, `out_assist`, `transport`) ; `dicos_id` = `j<journeyId>`. Filtre
  district = départ **ou** arrivée, gare assistée du district **surlignée** (IN → départ, OUT → arrivée). Filtres soumis au
  changement (`FormAutoSubmit`). Panneau : `Sheet` en `handleOnly` (le glisser de Vaul empêchait la sélection de texte).
  Extension **1.1.0** : liste du jour → dossiers distincts → trip-details (gabarit de chemin relevé sur la SPA par
  `inject.js`), repli sur le format v1.0. Les anciennes lignes v2 (`dicos_id` sans `j`) sont supprimées sur le test.
- 2026-10-08 — **Missions PMR v3, correctifs** (1re synchro après v3 : **0 ligne au format trajet**, l'extension était
  retombée sur l'ancien format → « 2 × MR », « ? », types vides). Nombre de voyageurs : les compteurs DICOS
  full/light et `disableds` décrivent les **mêmes personnes** → max, jamais la somme (dossier réel 2026-10-02-0119).
  Nouveau type **DCO** (`pmr-to` / `orientation-problems`, « difficultés de compréhension/orientation », migration
  `1760001200`). District de la gare d'arrivée aussi en v2 ; gare hors des 3 districts affichée « hors » (Flandre,
  étranger : normal). Panneau : lignes Téléphone et E-mail (mailto) séparées. Extension **1.2.0** : chemin
  `/trip-details/{n°}/{type}` ajouté aux candidats, 401/403 sur un candidat ≠ session expirée, **diagnostic dans le
  popup** (mode dossiers / repli + chemins essayés et codes) et version affichée.
- 2026-10-08 — **Nom / téléphone / e-mail du client jamais affichés** : PocketBase renvoie la back-relation
  `pmr_mission_via_assist` sous forme d'**objet** (index unique sur `assist`), le code attendait une liste → corrigé
  (`server/data/pmr.ts` accepte les deux). Missions **« Stickering »** (tâche interne DICOS qui double le départ, sans
  sens ni type → lignes « type ? ») ignorées à l'ingestion. Extension **1.3.0** : gabarit du dossier appris sur
  **toute requête portant un n° de dossier** (pas seulement « trip-details »), jusqu'à 8 gabarits essayés ;
  **avancement en direct** dans le popup (phase, x / y, secondes) ; « déjà en cours » affiche l'avancement ;
  garde-fou 4 min ; erreur interne détaillée (recharger l'onglet DICOS après mise à jour de l'extension) ;
  **synchro de plusieurs jours** (1, 2, 3 ou 7, un jour après l'autre, cache de dossiers partagé, totaux cumulés).
- 2026-10-09 — **Missions PMR : une ligne par trajet reconstruite depuis la LISTE** (trip-details toujours injoignable).
  La liste DICOS du jour contient aussi des **réservations de groupe** (`reservationType: Group`, écoles, 0 PMR) et des
  tâches **Stickering** : absentes de la vue PMR de DICOS (100 lignes CSM contre 78 missions) → écartées (serveur +
  extension). `mapMissionList` regroupe les missions Departure/Arrival par `journey.id` (= id du dossier complet →
  même clé `j<id>`) : gare + heure de départ (mission de départ, ou `otherStationName`/`otherTime` de l'arrivée), d'arrivée,
  IN/OUT (`withDepartureAssistance`/`withArrivalAssistance`), taxi, statut agrégé ; type, n° de dossier et nominatif
  depuis le détail par mission. Dates DICOS « 0001-01-01 » = vide. Gare assistée **toujours surlignée** (IN → départ,
  OUT → arrivée ; avec filtre district, seulement celles du district). Extension **1.4.0** : ne lit que les missions
  PMR, trip-details seulement si un gabarit a été relevé.
- 2026-10-09 — **Commandes (retours utilisateur)** : lien « Ouvrir le PDF du bon » dans l'encadré « Aperçu du bon » (bus et
  taxi) ; **heure réelle** par bus dès la création (`buses[].actual`, JSON, aussi au PDF et au suivi) ; société **sans
  adresse e-mail** → champ libre « E-mail de la société » (`bus_orders.company_email`, migration `1760001300` ; le taxi avait
  déjà `taxi_email`) ; l'adresse n'est **plus bloquante** : sans adresse, la feuille d'envoi propose « Télécharger le PDF »
  (`/pdf?download=1`) puis la même confirmation « marquer envoyé », pas de brouillon .eml.
- 2026-10-09 — **Valider l'envoi = « Terminé »** (brouillon → terminé, heure d'envoi posée aussi ; hook `lib/orders.js`) ;
  le chemin envoyé → confirmé → en cours reste pour les commandes déjà envoyées. **Le hook refusait encore l'envoi sans
  adresse e-mail** (le « PDF seul » de la veille aurait échoué) → refus retiré. Bon PDF : **logo SNCB** en haut à
  gauche (`server/pdf/sncb-logo.ts`, PNG 16 couleurs en base64), plus de ligne « Statut » (seul « ANNULÉ » reste).
  Widget « À confirmer » : chaque bon est un lien. Nouveaux widgets **Perturbations** et **Travaux** (messages iRail,
  `DisturbanceWidget`). Module « Référentiels » renommé **« Annuaire et données »** (libellés ; routes inchangées).
- 2026-10-09 — **Export ALEA** (Missions PMR) : bouton + modale ; par jour + train + gare, PMR additionnées par sens
  (IN = embarquement à la gare de départ, OUT = débarquement à l'arrivée) et **type précis** (« chaise roulante fixe »,
  « mobilité réduite »), une ligne par combinaison, copie par bloc ou « Tout copier » ; annulées exclues ; avec un filtre
  district, seulement ses gares (`aleaGroups`, testé).
- 2026-10-09 — **Modules Équipe et Admin** (réponses : widget « Présents » **retiré** ; comptes gérés par **admin/sysop
  seuls** ; partie sociale **abandonnée** ; Admin = Utilisateurs, Journal d'audit, **Lignes et arrêts**, **Santé +
  maintenance** ; Gares abandonné ; pas de planning ni de congés). Migration `1760001400` : `users.createRule`/`manageRule`
  = admin (mot de passe réinitialisé sans l'ancien), **`authRule` `role != "disabled"`** (connexion refusée),
  `disabled_role` (rôle rendu à la réactivation, non modifiable par l'agent) ; `changelog` (Nouveautés : admin, sysop,
  moderator ; auteur non forgeable) ; `app_settings` (clé unique, `maintenance`). Audit étendu à ces deux collections.
  Équipe : `/equipe` annuaire léger (`fields` restreints : rôle/droits jamais renvoyés), `/equipe/profil` (nom,
  fonction, mot de passe → reconnexion automatique, PocketBase invalidant les jetons), `/equipe/nouveautes` (Markdown
  sûr). Admin : liste + fiche (identité, rôle, district, **droits à 3 états** `PERMISSION_CATALOG`, désactivation,
  mot de passe provisoire affiché une fois, création de compte), journal d'audit (filtres liés, différentiel, export
  CSV neutralisé), lignes (ajout, district, ordre, retrait), santé (PocketBase, volumes 30 j) + **mode maintenance**
  (écran d'attente pour les agents dans `(app)/layout.tsx`, bandeau pour les admins). Agent Otto : onglet « Mon profil »
  seulement. **Audit sécurité** (0 critique/élevé) + **revue** ; corrigés : un agent ne change plus son `username`
  (identifiant de connexion), branche « soi-même » refusée aux comptes désactivés + **`tokenKey` régénérée à la
  désactivation** (anciens jetons révoqués), compte `connector` non gérable depuis l'admin, `audit:read` retiré du
  catalogue (nominatif PMR), export d'audit sans différentiel des collections nominatives, **catalogue des droits =
  clés réellement testées** (`journal:*`, `deplacements:*`, `*:delete` ; test de couverture de la navigation), droits
  hors catalogue repris de BACO **conservés**, maintenance appliquée dans **`requireUser`** (toutes pages et actions →
  `/maintenance`) et pas seulement dans le layout, mot de passe actuel **vérifié par authWithPassword** (manageRule
  dispense les admins d'`oldPassword`), bornes de dates de l'audit en heure de Bruxelles, filtres d'audit invalides
  ignorés un par un, `unstable_rethrow` dans les actions. 195 contrôles de règles. Reste (infra) : `pb-test-csm` est
  public → à restreindre (Cloudflare Access / IP) pour que les règles ne soient pas la seule barrière.
- 2026-10-09 — **Groupes DICOS** (demande : onglet comme les PMR, « Export ALEA » de groupe) : collection
  `group_missions` (`1760001500`, une ligne par trajet `j<journeyId>`, écrite par le connecteur, lue avec `pmr:read`,
  contact purgé à 12 mois par `pmr-retention`), `mapGroupList` (réservations `Group`, comptages adultes / enfants /
  seniors), ingestion `{ groups }`. Écran **PMR › Groupes** (`/pmr/groupes`, lecture seule, mêmes filtres jour/plage/
  district/statut, panneau avec contact, « Export ALEA » : « Embarquement d'un groupe de 25 personnes dont 20 enfants »,
  sans « dont… » s'il n'y a pas d'enfant, Débarquement pour OUT). Extension **1.5.0** : envoie aussi les groupes
  (détail d'un trajet par dossier), totaux « Groupes » dans le popup.
- 2026-10-09 — **Journal** (ex-main courante, demande de l'utilisateur) : écran plein façon messagerie (`/operations/journal`,
  anciennes routes redirigées), Markdown sûr maison (`lib/ops/chat-markdown.ts`, arbre → éléments React, testé), emojis
  (menu Radix, sans dépendance), barre d'écriture ancrée (Entrée envoie au clavier, brouillon local), consignes épinglées en
  bandeau, « Plein écran ». Puis : **fil continu** (plus de sélection par jour, « messages plus anciens » par 100), chaque
  message affiche **auteur + date et heure d'envoi** (heure de l'événement à part si elle diffère). **Districts du jour** :
  `users.duty_day` + `duty_districts` (`1760001600`), bandeau non bloquant le matin + puce dans le Journal ; les urgences
  et iRail sont notifiées selon ces districts (repli : district du profil). **Perturbations / travaux iRail → Journal** :
  cron PocketBase `irail-journal` (5 min), `ops_log.source = "irail"` sans auteur, dédup `external_id`, district déduit
  des gares citées (`line_stations`), notification `perturbation` aux agents du district ; `CSM_IRAIL_URL=off` en CI.
  CI E2E remise au vert (attentes périmées après les renommages). 201 contrôles de règles.
- 2026-10-09 — **ALEA « Obligatoire »** (logigrammes d'encodage fournis par l'utilisateur) : un bloc ALEA = **train + jour +
  gare + sens** (IN embarquement / OUT débarquement), PMR de tous les dossiers additionnées par type (groupes additionnés
  aussi : « Embarquement de 2 groupes, 52 personnes dont 22 enfants ») ; en-tête « X dossiers composent cet ALEA » avec le
  nombre par dossier et le total ; modale élargie, train et gare mis en avant, filtres Obligatoires / À vérifier,
  « Copier les obligatoires ». Décision (`aleaDecision`, testée) : arrêt prévu ≥ 5 min → non ; PMR complète → oui ; PMR
  légère < 4 → non, sinon oui si nombre × 30 s > arrêt ; groupes : ≥ 25 enfants, ≥ 25 seniors ou ≥ 75 personnes → oui.
  Temps d'arrêt = horaire iRail (`aleaDwell`, départ − arrivée prévus à la gare) ; **gare d'origine / terminus, train ou
  gare introuvable, assistance inconnue → « À vérifier »** ; taxi → non. Complète / légère = compteurs DICOS
  `fullAssistances` / `lightAssistances`, stockés à l'ingestion (`pmr_assists.full_pax` / `light_pax`, `1760001700`) :
  les lignes déjà synchronisées restent « À vérifier » jusqu'à la prochaine synchro. **Colonne Train en premier**, en gras sur
  fond accent (`TrainChip`), PMR et Groupes ; onglet Groupes déplacé en **`/groupes`** (redirection depuis `/pmr/groupes`).
  **PDF** : « Agent » = créateur du bon (`orderAgent`, repli sur l'agent repris de BACO), arrêts intermédiaires sans
  « (L.125) », plus de ligne « Bon n° » (bus) ni « Commande n° » (taxi). Origine / terminus : « À vérifier » confirmé.
- 2026-10-09 — **Temps d'arrêt ATMS** (demande : « procéder comme avec DICOS mais pour ATMS ») : l'extension **1.6.0**
  lit, après chaque synchro DICOS, l'itinéraire des trains des missions (PMR + groupes) dans un **onglet ATMS connecté**
  (`atms.js`, `GET /api/v1/trains/{n°}/{jour}`, même origine, aucun cookie lu ni conservé ; ~3 req/s, 60 trains max) et
  l'envoie à `POST /api/pmr/schedules/ingest` (même jeton de connecteur ; `server/dicos-service.ts` partagé). Calcul côté
  serveur (`lib/pmr/atms.ts`, `mapAtmsTrain`, testé) : temps d'arrêt = départ − arrivée planifiés par point
  (`ptcarSymbolicName` = abréviation PtCar → nom FR via le référentiel `ptcar`). Collection `train_schedules`
  (`1760001800`, une fiche par jour + train, connecteur seul en écriture, `pmr:read` en lecture, purge 60 j). L'ALEA
  (`aleaDwell`) prend **ATMS d'abord, iRail en repli** ; la modale affiche la source (« ATMS (4) · iRail (1) »). Sans onglet
  ATMS ouvert, la synchro DICOS n'est pas bloquée. Le message de l'utilisateur contenait ses **cookies de session ATMS**
  (MRHSession…) : non utilisés ni conservés, déconnexion d'ATMS conseillée pour invalider la session. 206 contrôles de règles.
- 2026-10-09 — **ATMS, 1re synchro réelle : 0 / 71 trains** (« Could not establish connection. Receiving end does not
  exist »). Extension **1.6.1** : onglet ATMS ouvert avant l'installation / la mise à jour → script injecté à la demande
  (permission `scripting`, ping `atms-ping`, garde contre la double injection) ; sans onglet joignable, **lecture directe**
  depuis le service worker (permission d'hôte, session ATMS du navigateur) ; 3 essais content → service worker ; 100
  trains max ; le popup affiche la voie (onglet / directe) et les trains introuvables. Logique testée avec un `chrome`
  simulé. Les compteurs complète / légère étaient bien remplis (12 / 45 lignes sur le test).
- 2026-10-09 — **Étape 7 « Finition de l'interface » : audit** (accord de l'utilisateur ; référence gsap.com fournie,
  `docs/design/references/GSAP-STYLE.md`). 29 écrans capturés (1440 + 390, hors dépôt), 4 audits (UI, UX, motion,
  typo / couleur) → `docs/design/AUDIT-INTERFACE.md` + `docs/design/audit-interface/`. Critiques : accent partout et
  confondu avec les statuts, texte trop petit / pâle, premier écran mobile mangé par les filtres, pas de date de
  synchro DICOS, aucun `loading`/`error.tsx`, dialogues qui glissent en diagonale, graphiques illisibles. Planche
  interactive (artefact « Planche CSM v2 ») : palettes A Commandement affiné / B Craie (GSAP, couleur par module) /
  C Porcelaine, forme angle ou pilule, typo. **En attente des choix de l'utilisateur** avant tout changement.
- 2026-10-09 — **Étape 7 validée** par l'utilisateur (« je valide tous les thèmes et tes propositions » : 11 thèmes avec
  forme et typo propres, plan en 5 lots). **Lot 0 livré** : keyframes `pop-in`/`pop-out` en `transform` (la palette ⌘K
  glissait de 288 px en diagonale), panneau Vaul à 260 ms, squelette statique, compteur des StatCards sans tween au
  montage, cascade de l'accueil seulement en navigation client (plus de flash), trait d'onglet `useSlideIndicator`
  (`x` + `scaleX`, posé sans animation au montage, un seul `matchMedia`), **filtres en `next/form`** (14 formulaires,
  plus de rechargement de page), barre de navigation `NavProgress` (après 150 ms), `(app)/error.tsx` et
  `global-error.tsx` en français, graphique des Statistiques en HTML (texte à taille réelle, repères). E2E
  `e2e/motion.spec.ts`.
- 2026-10-09 — **Lot 1 livré : 11 thèmes** (`tokens.ts` : couleurs + forme + typographie + couleurs de module ;
  `themes.css` régénéré ; IBM Plex chargée sans préchargement), jetons `fg-subtle` / `progress` / `--mod-*`,
  `rounded-box` / `rounded-control` sur les composants, chanfrein qui suit le thème, accent réservé à l'action
  (Confirmé en `progress`, train en puce neutre, liens `.link`, IN/OUT neutres), échelle typo (corps 15 px, rien sous
  12 px, badges et en-têtes en casse normale), sélecteur de thème en grille d'aperçus. Test des jetons : contraste +
  ΔE OKLab accent ↔ statuts (594 tests). `FormSection` en `min-w-0` (débordement mobile trouvé par l'E2E /design).
  DESIGN-DIRECTION : écarts validés de l'étape 7.
- 2026-10-09 — **Lot 2 livré (structure)** : en-tête de module compact sur une ligne (titre `text-h2`, plus de sourcil
  redondant, fil d'Ariane dans la barre du haut seulement), « Nouveau » de la barre du haut en secondaire (une seule
  primaire par écran), composants `FilterChip` / `ChipRow` / `CollapsibleFilters` (`components/ui/filters.tsx`) :
  un seul style de puce (contour accent + `bg-accent-soft`), filtres secondaires repliés en mobile (premier résultat
  ≈ 120 px plus haut), **filtrage automatique sur toutes les listes** ; jetons `accent-soft` / `accent-faint` à la place
  des `color-mix` ad hoc ; Journal : mes messages en `surface-2`, non lu = pastille info ; cartes mobiles PMR (trajet
  entier, Copier dans la carte) ; pluriels accordés (`pl()` dans `lib/utils.ts`, plus de « mission(s) ») ; voile ambre
  du fond retiré.
- 2026-10-09 — **Lot 3 livré (UX)** : **fraîcheur DICOS** (collection `dicos_syncs`, `1760001900`, une fiche par envoi
  de l'extension, écrite par le connecteur, lue avec `pmr:read`, purge 60 j ; « Synchronisé avec DICOS il y a X min »
  sur Missions PMR et Groupes, alerte au-delà d'1 h ou si la période n'est pas synchronisée, état vide « Pas encore
  synchronisé » distinct de « Aucune mission ») ; **« Tout marquer lu »** dans le Journal (`markAllRead`, 200 max) ;
  widget « À confirmer » avec jour de service, retard « il y a N jours » et lien vers le Suivi ; **⌘K cherche dans les
  données** (`app/search-actions.ts` : contacts, bons, PtCar, n° de train, avec les droits de l'agent) ; raccourcis
  **« / »** (recherche de la page) et **« N »** (nouveau, `data-shortcut="new"`). 211 contrôles de règles. Questions
  UX encore ouvertes (iRail dans les non-lus, ALEA commun PMR + groupes, clôture des bons jamais confirmés, Annuaire
  dans la barre mobile, tu / vous).
- 2026-10-09 — **Lot 4 livré (mouvement)** : primitive **`highlight`** (`highlightElements` dans `lib/motion.ts`,
  composant `LiveHighlight`) : une ligne arrivée ou modifiée en direct (SSE) s'allume en `info` puis s'estompe en
  1,2 s, sur Missions PMR, Groupes, Commandes bus et taxi (jamais au premier rendu, ni après un changement de filtre :
  `context`) ; vérifié en local par une modification PocketBase pendant que la page est ouverte. **« Copié » sur place**
  (`useCopy`, icône → coche verte, annonce `aria-live`, toast seulement en cas d'échec) dans les listes, le panneau et
  l'export ALEA ; ligne ouverte marquée (`selected` → `bg-accent-soft`) ; durées en jetons CSS `--d-*` (miroir de
  `MOTION`). Continuité Flip ligne → panneau non faite (jugée facultative par l'audit).
- 2026-10-09 — **GSAP étendu** (feu vert de l'utilisateur) : transition de page côté client (`PageTransition`, corps
  `[data-page-body]` en fondu + 6 px, jamais au premier affichage ni sur un changement de filtre), fondu de la liste au
  changement de filtres (primitive `swap` dans `LiveHighlight`), nouveaux messages des collègues signalés dans le
  Journal, **intro de la page de connexion** (lettres de « CSM », filet, sous-titre ; masqués dès le premier rendu,
  repli CSS 1,2 s). **Revue adversariale des lots 0-3** (0 critique, 4 importants, 7 mineurs, sécurité RAS), corrigés :
  `NavProgress` qui ne voyait pas les clics `next/link` (écoute en capture), **filtres périmés après « Effacer »**
  (`FilterForm` = `next/form` remonté à chaque URL ; état replié mobile gardé par page), observateurs accumulés dans
  `useSlideIndicator` (`revertOnUpdate`), Groupes « pas encore synchronisé » les jours sans groupe (synchro missions
  comptée), Vaul animé en mouvement réduit, clés ⌘K en double, débit de `paletteSearch` (120/min), raccourcis « / » et
  « N » désactivables dans « Affichage » (WCAG 2.1.4) et sans répétition, `aria-current` sur les puces du Journal, « Non
  lu » annoncé. Reste connu : une synchro DICOS interrompue après un lot s'affiche comme synchronisée.
- 2026-10-09 — **Réponses aux 5 questions UX** : (1) messages iRail comptés dans les non-lus du Journal **et** dans la
  cloche (déjà le cas, gardé) ; (2) **pas** d'export ALEA commun PMR + groupes pour l'instant ; (3) **clôture d'un bon
  envoyé jamais confirmé 5 jours après la date de service** : transition `envoye → termine` ajoutée au hook
  (`CLOSE_DAYS`, refus avant 5 jours, `ended_at` posé), bouton « Clôturer sans confirmation » (`isClosable`), badge
  « À clôturer » sur l'accueil et le Suivi (212 contrôles de règles) ; (4) **Annuaire dans la barre du bas mobile**
  (5 onglets + Plus, libellé court `shortLabel`) ; (5) **tutoiement** dans toute l'interface (l'e-mail aux sociétés de
  bus reste au vouvoiement).
- 2026-10-09 — **Suite demandée par l'utilisateur** : (a) **vue admin des jetons d'extension** : onglet Admin « Appareils
  connectés » (`/admin/extension`, tous les agents, lien vers la fiche) + section dans la fiche d'un compte, révocation
  par `revokeAgentConnectorToken` (règles déjà ouvertes aux admin / sysop) ; (b) **alerte cloche « Synchro DICOS en
  retard »** : cron PocketBase `dicos-stale` (10 min), si la dernière synchro missions / groupes a plus d'1 h pendant le
  service (`CSM_DICOS_ALERT_HOURS`, défaut 6-22 h Bruxelles, 1 h de marge après l'ouverture), notification `systeme` aux
  propriétaires d'un jeton personnel (ceux qui ont coché leurs districts du jour s'il y en a), une par épisode
  (dédup `source_id` = dernière synchro), testée en local ; (c) **Chrome Web Store** préparé puis **abandonné** par l'utilisateur (compte développeur payant) : script, job CI et
  bouton retirés, Chrome / Edge restent installés depuis le `.zip`; (d) **R2** :
  `pb_hooks/backups.pb.js` règle les sauvegardes S3 de PocketBase depuis `CSM_BACKUP_S3_*` au démarrage (bucket et
  jeton à créer par l'utilisateur, procédure + test de restauration dans DEPLOIEMENT-V2 §3) ; (e) actions GitHub
  passées en **v7** (checkout, setup-node, upload-artifact, build-push-action ; setup-buildx v4 : Node 24),
  feuille de route `CSM-V2.md` §7 et `NOUVELLE-SESSION.md` (session 4 : bascule) remises à jour. Revue : alerte dédupliquée par
  épisode **et par jour** (sinon la synchro de la veille bloquait l'alerte du matin), variables R2 = seule source de vérité
  (S3 coupé sans elles, seulement pour `serve`, réglages sur une copie). Note DPO : la durée des
  sauvegardes était fausse (« 28 h ») → 14 jours, R2 ajouté comme sous-traitant à valider.
- 2026-10-10 — **Retards des trains liés aux missions PMR et aux groupes** (demande de l'utilisateur, lot « suite » du 10 oct. :
  retards, ALEA encodé, Journal (fils, recherche, image collée, @district, refonte mobile, catégories auto + nouvelles
  catégories Service / Perturbation / Groupes, tri des messages automatiques ET reclassement des anciens messages BACO),
  Flip, widgets, impression, E2E admin). Cron PocketBase `mission-trains` (3 min) → `mission_trains`, badge « +N » /
  « Supprimé » à la gare assistée (Missions PMR, Groupes), notification `train` aux agents du district, widget d'accueil
  « Missions impactées ». Vérifié en local avec le faux iRail (retard de 5 min à Mons, notification, badge, widget,
  1440 + 390). 230 contrôles de règles.
- 2026-10-10 — **ALEA « encodé »** : chaque bloc de l'export ALEA (PMR et groupes) se coche une fois saisi dans ALEA ;
  partagé en direct avec l'équipe (`alea_marks`, SSE), auteur et heure au survol, filtre « À encoder ». 236 contrôles.
- 2026-10-10 — **Journal v2** : réponses en fil (citation, compteur, panneau), recherche plein texte surlignée, image collée
  depuis le presse-papiers, mentions de district `@DSO` / `@DSE` / `@DCE`, refonte mobile (en-tête sans chevauchement,
  catégorie en liste, actions en icônes, fil bord à bord), catégories **Service / Perturbation / Groupes** (choix de
  l'utilisateur), **tri automatique** réglable (Administration › Tri du Journal : règles source iRail / BACO + mots-clés)
  et **reclassement des anciens messages BACO** (« les deux » : messages automatiques et messages importés). 240 contrôles.
- 2026-10-10 — **Revue adversariale des trois lots** (0 critique), corrigés : un changement de catégorie seul (reclassement)
  ne renotifie plus (urgence / mentions des anciens messages) et l'import BACO remplit `notified` ; noms de gares iRail en
  français d'abord (nom officiel bilingue gardé en `alt`, comparé par moitiés) ; **retard à l'arrivée pour les
  débarquements** (`da` / `ca`, terminus compris) ; notifications de retard seulement aux agents dont les districts du jour
  croisent ceux des gares (plus de diffusion aux comptes sans district) et enregistrées avant l'envoi ; préfixe de gare à
  une frontière de mot (« Ath » ≠ « Athus ») ; compteurs de réponses par paquets de 50 ; widget sans lecture nominative ;
  reclassement BACO qui ne touche ni les consignes ni une catégorie d'origine autre qu'« info » par la règle par défaut ;
  double coche ALEA simultanée tolérée. **E2E Admin en CI** (compte admin de test `E2E_ADMIN_*`, `e2e/admin.spec.ts` :
  écrans 1440 + 390, création / désactivation / réactivation). **Mentions de district ouvertes à tout agent qui écrit au Journal** (décision de l'utilisateur du 10 oct. : pas de restriction aux coordinateurs).
- 2026-10-10 — **Finition** : continuité animée ligne → panneau (`ghostFlip`, tous les panneaux `Sheet`), widgets
  « Aujourd'hui en PMR » (volumes, prochaines prises en charge des districts du jour avec retard du train, fraîcheur DICOS)
  et « Mentions et alertes », **impression** soignée (listes, Journal ; B201 garde son PDF), **E2E Admin** en CI. Corrigé en
  route : flux temps réel mutualisé (6 SSE bloquaient la navigation depuis l'accueil), attente « 7 widgets » de l'E2E shell
  périmée depuis « Missions impactées ».
- 2026-10-10 — **Équipe et Admin validés** par l'utilisateur. Nouveau lot demandé : Relève de service, frise « Ma journée »,
  notifications du navigateur, feuille de route PDF par gare, export ALEA commun PMR + groupes, ⌘K étendue (Journal,
  missions), PWA, fiabilité de la synchro DICOS, page **/tv** (écran commun du bureau). **Relève livrée**
  (`/operations/releve`, copier / épingler au Journal en consigne 12 h).
- 2026-10-10 — **Frise « Ma journée »** (`/operations/journee`, onglet Opérations) : une prise en charge par bout assisté
  (IN à la gare de départ, OUT à l'arrivée) + bons de bus (premier → dernier départ prévu) et taxis du jour, sur une ligne
  de temps horizontale en desktop (rangées PMR / Groupes / Bus / Taxis, pistes sans chevauchement, queue ambre / rouge du
  retard iRail propre au bout, trait « maintenant » qui avance, placée sur maintenant à l'ouverture) et en **agenda vertical**
  en mobile (trait « maintenant » entre les éléments). Filtres jour / district (districts du jour par défaut) / gare
  (liste des gares du jour). GSAP : trait qui descend, queues de retard qui s'étirent, éléments en cascade au changement de
  filtre (jamais au premier rendu). Aucun nom de voyageur. E2E Ma journée + Relève (1440 + 390).
- 2026-10-10 — **Notifications du navigateur** (réglage « Affichage », par navigateur, demande la permission) : urgences,
  mentions et retards de train quand l'onglet CSM est **en arrière-plan** ; la cloche détecte les nouvelles notifications
  (le premier chargement amorce sans alerter), une seule alerte même avec plusieurs onglets (marque en `localStorage`),
  clic → onglet ramené au premier plan, notification lue, lien ouvert. **Le texte d'une mention ou d'une urgence n'est
  jamais affiché par le système** (il peut citer un voyageur) : titre + « Mention au Journal » / « Urgence au Journal ».
  Repli service worker (Android) prévu pour la PWA. Titre de mention passé au tutoiement (« te mentionne dans le Journal »).
- 2026-10-10 — **Feuille de route PDF par gare** (bouton dans « Ma journée » dès qu'une gare est filtrée ; route
  `GET /api/pmr/feuille-de-route?gare=&jour=`) : prises en charge à la gare (embarquements au départ, débarquements à
  l'arrivée, PMR + groupes, annulées barrées), dossier, nom et téléphone du voyageur **seulement avec `pmr:read`** +
  RDV / voiture / porte, rampes de la gare (`pmr_equipment` par abréviation PtCar), contacts de l'annuaire qui citent la
  gare ; mention « données personnelles, à détruire après le service ». **Export ALEA commun PMR + groupes** (bouton
  « ALEA PMR + groupes » sur Missions PMR, avec `pmr:read`) : blocs d'un même train / jour / gare / sens fusionnés
  (`mergeAleaBlocks`), règle « mixed » = la décision la plus exigeante des deux logigrammes ; la coche « encodé » d'un
  bloc commun coche ses parties PMR et groupes (`alea_marks` inchangé). Revient sur la réponse du 9 oct. (« pas pour
  l'instant ») : demandé explicitement le 10 oct.
- 2026-10-10 — **Profil enrichi** (demande de l'utilisateur) : photo de profil **visible de tous les agents** (choix de
  l'utilisateur), recadrée en carré et réduite à 512 px dans le navigateur, type revérifié côté serveur (signature du
  fichier), champ `users.avatar` **protégé** (images seulement, 2 Mo, miniatures 96 / 256 ; migration `1760002400`) servi
  par `GET /api/avatar/<id>` avec un jeton de fichier ; affichée dans la barre du haut, l'annuaire Équipe et le Journal ;
  **téléphone professionnel** (`work_phone`, annuaire Équipe avec lien etrali / tel) ; districts du jour modifiables
  depuis le profil ; préférences d'affichage et notifications intégrées ; lien « Appareils connectés » ; **Mon activité**
  (30 jours : messages au Journal, bons créés, blocs ALEA encodés). 242 contrôles de règles. Décisions prises : **mot de
  passe oublié par e-mail (SMTP)**, **passkeys (WebAuthn, `@simplewebauthn`)** ; **passage en production demandé ensuite**
  : `csm.fs0ciety.org` = prod, `test-csm.fs0ciety.org` = preview, réimport complet des données BACO (Supabase) à date
  fraîche.
- 2026-10-10 — **Mot de passe oublié par e-mail** : seul envoi automatique de CSM (exception validée par l'utilisateur) ;
  `pb_hooks/mail.pb.js` règle le SMTP au démarrage depuis `CSM_SMTP_HOST` / `_PORT` / `_USER` / `_PASSWORD`,
  `CSM_MAIL_SENDER` (+ `_NAME`) et `CSM_APP_URL` (sinon coupé, la page renvoie vers un admin) ; modèle d'e-mail français,
  lien vers `/connexion/nouveau-mot-de-passe?token=` (30 min, usage unique ; migration `1760002500`) ; même réponse que le
  compte existe ou non, débit borné (IP, boîte). **Variables SMTP à fournir par l'utilisateur.** **Passkeys** (WebAuthn,
  `@simplewebauthn` 13.3, choix de l'utilisateur) : collection `passkeys` (`1760002600` : **aucune création directe**, enregistrement par la route
  interne `/api/csm/passkey/register` après vérification par Next ; l'agent ne modifie que le nom ; admin / sysop lisent
  et suppriment ; supprimées à la réinitialisation du mot de passe et à la désactivation), vérification par le serveur Next, défis à usage
  unique 5 min ; connexion : routes internes PocketBase `/api/csm/passkey/lookup` et `/token` (compteur anti-clonage,
  compte désactivé refusé, jeton `newAuthToken`) protégées par **`CSM_INTERNAL_SECRET`** (≥ 32 caractères, posé sur
  `csm-web` et `csm-pocketbase` par l'API Coolify le 10 oct.) + **`CSM_PUBLIC_URL`** sur `csm-web` (identifiant WebAuthn, jamais
  tiré des en-têtes) ; sans eux, passkeys masquées. Vérification de l'utilisateur exigée (PIN / biométrie). Revue sécurité
  passée (0 critique ; corrigés : passkey écrite directement dans PocketBase, rpID tiré de `x-forwarded-host`, compte désactivé
  révélé, UV facultative, débit de `request-password-reset` sur le PocketBase public : **seule** règle du limiteur, ses règles
  par défaut brideraient toute l'équipe derrière la même IP). Profil : « Passkeys »
  (ajout, liste, suppression) ; fiche admin : passkeys de l'agent. Une passkey est liée au domaine : à recréer après le
  passage sur `csm.fs0ciety.org`. 249 contrôles de règles.
- 2026-10-10 — **Fin du lot « suite »** : **⌘K** cherche aussi dans le Journal (messages actifs) et les missions PMR /
  groupes (gare, train, n° de dossier, ±30 jours, sans nom) ; **PWA installable** (`app/manifest.ts`, icônes
  `public/icons/`, service worker `public/sw.js` **sans aucune donnée mise en cache** : page hors connexion + clic sur
  notification ; enregistré en production seulement ; manifeste, icônes, `sw.js` et `offline.html` publics dans le
  middleware) ; **synchro DICOS** : fraîcheur affichée = celle du **jour le moins récemment synchronisé** de la période
  (et non la dernière synchro tous jours confondus), période couverte seulement si **chaque** jour l'est, jours manquants
  nommés (`lib/pmr/sync-state.ts`, testé) — pas de suppression des missions absentes d'une synchro (la vue DICOS de
  chaque agent peut être filtrée par gares) ; **écran commun `/tv`** (hors shell, plein écran, horloge, prises en charge
  des 3 h, trains en retard, urgences / consignes, bons ouverts, ALEA à encoder ; relu en direct + toutes les 60 s ;
  aucun nom ; lien depuis la Relève). E2E carte PN rendu indépendant du parallélisme (PN de test cherché par son adresse).
- 2026-10-10 — **Écran commun** : départs et arrivées iRail **de Mons** en temps réel (`?gare=` pour une autre gare,
  relu toutes les 60 s, voie, retard, suppression) ; **thèmes Forêt (défaut) et Rail** (`?theme=rail`, `data-theme` posé sur
  le `<main>` de `/tv`, indépendant du thème de l'agent connecté sur le poste). Liens depuis la Relève.
- 2026-10-10 — **Mise en production** (accord de l'utilisateur : « Tu peux lancer la PROD ») : branche **`csm-prod`**,
  environnement Coolify **`prod`** du projet CSM (`csm-pocketbase-prod` `k3qyrzgja0ob7pbgd25xp0ms`, volume `/pb_data`,
  domaine `pb-csm.fs0ciety.org` à protéger par **Cloudflare Access** (choix de l'utilisateur) ; `csm-web-prod`
  `oe9umzuky1alqztamtenvugz`, `https://csm.fs0ciety.org`), secrets neufs (superuser, `CSM_INTERNAL_SECRET`, compte
  connecteur DICOS), copiés hors dépôt dans `/home/user/csm-backup-prod/.*` (600). **Données** : sauvegarde Supabase
  fraîche en lecture seule (écart depuis le 8 oct. : 4 bons, 2 audits, 2 coordonnées), empreintes de mot de passe reprises
  de la base de test (empreintes BACO ou mot de passe changé depuis dans CSM, jamais affichées), `csm-import` + script des
  référentiels (PtCar paginé), compte `connector` créé, zip restauré par l'API ; parcours vérifié avec le compte admin réel
  (11 écrans, desktop + mobile, cookie httpOnly/Secure, en-têtes). **R2** : l'utilisateur voulait le même bucket pour test
  et prod ; la rotation de PocketBase l'interdit (voir §7) → bucket réservé à la prod, variables retirées de la preview.
  Trouvé en prod : obfuscation d'e-mails Cloudflare (corrigé par `no-transform`).
- 2026-10-10 — **Profil (suite)** : **statut du jour** (`users.status` + `status_day`, préréglages EXTRA / Pas en service /
  En pause / Au téléphone / En formation ou texte libre, affiché au Journal à côté du nom et dans l'annuaire Équipe) ;
  **page d'accueil choisie** (`preferences.home`, liste fermée `lib/home.ts`, appliquée après la connexion par mot de passe
  ou passkey, « Accueil » reste le tableau de bord) ; **sessions ouvertes** (`user_sessions` + cookie httpOnly `csm_sid`,
  appareil / IP masquée / méthode / dernière activité notée toutes les 10 min ; supprimer une fiche déconnecte l'appareil
  à sa requête suivante ; « déconnecter les autres appareils » = nouvelle `tokenKey` par la route interne
  `/api/csm/session/rotate` + jeton neuf pour l'appareil courant ; changement de mot de passe = autres sessions closes). Revue sécurité : `csm_sid` **obligatoire** (le retirer contournait la
  révocation ; tout le monde se reconnecte une fois), fiches créées par la route interne `/api/csm/session/open` seulement
  (20 par agent, purge 30 j), flux SSE coupé après révocation, verrou d'envoi des campagnes, `{prenom}` neutralisé.
- 2026-10-10 — **Campagnes d'e-mail** (Administration › Campagnes, admin / sysop) : modèle « BACO devient CSM » au design de
  CSM (`lib/mail/campaign.ts`, Markdown du Journal → HTML de messagerie échappé + texte, `{prenom}`), aperçu isolé (iframe
  `sandbox`), **e-mail de test obligatoire** avant l'envoi à tous, envoi un par un (400 ms) par la route interne
  `/api/csm/mail/send` (SMTP de PocketBase), journal (envoyés, échecs), une campagne envoyée ne repart pas (dupliquer).
  Deuxième exception à « pas d'envoi automatique » validée par l'utilisateur (avec le mot de passe oublié). SMTP : **Resend**
  sur un sous-domaine dédié (`mail.fs0ciety.org`) ; Brevo essayé puis abandonné (vérification par SMS, et sa configuration
  DNS automatique a coupé la prod). 261 contrôles de règles.
- 2026-10-10 — **Lot suivant évoqué : Quinyx** (tableau de service) pour voir qui est en poste — à cadrer (API Quinyx
  avec identifiants délivrés par l'IT, ou flux iCal par agent).
- 2026-10-10 — **Cloudflare Access devant les deux PocketBase** (autorisation du propriétaire, par l'API Cloudflare) :
  application « PocketBase CSM » (`85ccd53d-4528-43ce-a653-96214a9c6a77`) sur `pb-csm` et `pb-test-csm`, One-time PIN
  existant, session 24 h, politique Allow = `occmons@gmail.com`, pas de jeton de service. Vérifié : PocketBase → 302 vers
  Access ; web prod et preview → santé 200 (`pocketbase: true`), connexion 200. Clôt le « Reste (infra) » du 9 oct.
  Puis, à la demande du propriétaire, `nico.dessenius@gmail.com` ajouté à la politique Allow.
- 2026-10-10 — **Éditeur renommé** (demande de l'utilisateur) : « Développé par OCC MONS Studios » → **« OCC Interactive · une
  division de CARDOR Media »** (liens https://interactive.cardormedia.com/ et https://cardormedia.com/marque), emblèmes
  animés du site Cardor (Dragon : glitch et « boot » à l'apparition ; roue du Car d'Or : un tour au survol), monochromes au
  repos, couleurs de la charte au survol, rien en mouvement réduit. Pied de l'e-mail de campagne mis à jour.
- 2026-10-10 — Mention de l'éditeur : **« CM Interactive »** au lieu d'« OCC Interactive » (demande de l'utilisateur).
- 2026-10-11 — **Ménage du dépôt** (demande de l'utilisateur) : SvelteKit v1 retiré de la racine (`src`, `static`,
  configs, `package.json`, Dockerfile, CI `ci.yml`, `docs/DEPLOIEMENT.md`) — il reste sur `main` (BACO, toujours en
  production jusqu'à la transition officielle) et `ccr-5dca0da8-4yg4i6` ; README réécrit. **Branches** : `csm-preview`
  créée (préversion suivie par test-csm), `csm-prod` = branche principale (réglage GitHub par l'utilisateur), anciennes
  branches archivées en tags `archive/<nom>` puis supprimées (choix de l'utilisateur).
- 2026-10-11 — **Page EBP** triée par gare (le tri par vue mettait les 19 fiches sans vue en tête : « il manque les
  données de vue ») ; **admin : « Envoyer un lien par e-mail »** sur la fiche d'un agent (e-mail « mot de passe oublié »,
  `sendResetLink`), à côté du mot de passe provisoire ; grisé sans SMTP. Le « mot de passe oublié » des agents existait déjà.
- 2026-10-11 — **« En ligne maintenant »** dans la barre du haut (demande de l'utilisateur ; revient sur le retrait du
  widget « Présents » du 9 oct.) : pastille verte qui pulse + nombre, liste au clic (avatar, statut du jour, district,
  heure d'arrivée). Présence = au moins un onglet CSM ouvert, calculée par le serveur Next à partir des flux SSE (rien en
  base, rien de conservé).
- 2026-10-11 — **Rôles v2, Ressources, documents** (demande de l'utilisateur) : menu « Annuaire et données » → **« Ressources »** ;
  rôles **Administrateur / Sysop** (tout), **Modérateur** (`moderator` : PACO/RCCA + suppression partout et Nouveautés,
  pas d'administration ; ajouté à la demande de l'utilisateur), **PACO/RCCA** (`paco` : lecture partout, écriture et modification, pas de
  suppression ; districts DSO / DSE / DCE en combinaison libre = filtres et alertes, pas de limite d'écriture), **Invité**
  (`guest` : lecture bus et taxis) ; comptes BACO : **moderator → Modérateur**, user et **agents Otto → PACO/RCCA**
  (confirmé par l'utilisateur après l'alerte des relectures : les 14 agents C3 accèdent au nominatif PMR, note DPO §4-5),
  les deux invités sont à régler par l'admin dans l'interface (aucun nom dans le dépôt). Modération du Journal (messages
  retirés, textes des autres) : modérateur et admin seulement ; matériel / zones PMR soumis à `pmr:write` / `pmr:update` ;
  invité sans zones PMR, points SPI, Nouveautés ni liste des agents en ligne ; `audit:read` repris de BACO retiré. Droits par module en **4 actions**
  (lecture, écriture, modification, suppression) avec héritage (grants / denies), matrice dans la fiche d'un compte ;
  migration `1760002800` (règles réécrites, comptes convertis, `X:write` → `X:update`), 292 contrôles de règles. Les
  Nouveautés : admin et modérateur. **Bordure d'avatar** par rôle (accent doublé pour admin / sysop). **Documents** : envoi
  jusqu'à 30 Mo par route (la Server Action était limitée à 1 Mo : l'envoi de vrais documents échouait), depuis la
  bibliothèque **et depuis une procédure** ; **visionneuse** PDF / image + téléchargement (Word, Excel… en téléchargement :
  pas de conversion, choix de l'utilisateur). Corrigé en route : halo de la pastille « en ligne » démesuré en desktop.
- 2026-10-11 — **Archives des bons** (demande de l'utilisateur) : à la clôture d'un bon bus ou taxi (« terminé »), Next produit
  le PDF (taxi **sans** nominatif PMR : l'archive n'a pas de limite de durée) et l'envoie à la route interne PocketBase
  `/api/csm/archives/store` (secret interne, délai de 30 s ; seulement au vrai passage à « terminé ») → collection
  `order_pdfs` (fichier protégé sur le volume, une fiche par bon) + copie **R2** (cron 5 min, la clôture n'attend jamais R2) dans le bucket des sauvegardes, dossier `bons/<bus|taxi>/AAAA/MM/` (prod seulement : la préversion n'a pas
  les variables `CSM_BACKUP_S3_*`, volume seul ; choix de l'utilisateur). Chaque nuit (cron `order-pdf-backup`, 1 h UTC) :
  zip mensuel des PDF des mois modifiés (`order_pdf_backups`, zip « stocké » écrit dans `lib/archives.js`) sur le volume
  + `bons/sauvegardes/` dans R2, rattrapage R2 des PDF en attente. Page **Commandes › Archives** (référence TC_ / n° de
  taxi, trajet, date, PDF, zips mensuels) ; droit **`archives`** (lecture : PACO/RCCA, Modérateur, admin, sysop ;
  suppression : Modérateur, admin, sysop) ; admin : « Archiver les bons terminés » (historique, par paquets de 15) et
  « Sauvegarder maintenant ». Les fichiers `bons/` apparaissent dans la liste des sauvegardes de l'admin PocketBase (même
  bucket) : ne pas les « restaurer » ; la rotation ne supprime que `@auto_pb_backup_*`.
- 2026-10-08 — **Types DICOS fiabilisés** (échantillon réel) : `pmr-wc`/fixed-wheelchair → CRF (cause des « AUTRE »),
  `pmr-fw`/folding-wheelchair → CRP ; mapping par **symbole** d'abord. L'extension récupère le détail même sans
  `reservationType`. **Extension Firefox** ajoutée (`manifest.firefox.json`, ≥ 128) ; paquets Chrome + Firefox dans
  `extension/dist/` (`build-zips.sh`) ; workflow `.github/workflows/dicos-extension-release.yml` publie la Release sur
  un tag `dicos-connector-v*` (pas de CLI `gh` ni d'API Releases dans l'environnement cloud, et push de tag bloqué par
  le proxy → l'utilisateur crée le tag / la Release).
  9 oct. : le workflow n'apparaissait pas dans Actions (absent de `main`) → il tourne aussi à chaque push d'une branche
  `claude/**` qui touche `extension/**` et joint les zips au run (artefact `dicos-connector-zips`). Filtre `paths` retiré
  le 9 oct. (les pushes sans changement de l'extension ne produisaient plus de zip) : **chaque** push de la branche de
  session produit l'artefact (90 j).
- 2026-10-09 — **Page « Extension DICOS »** (`/pmr/extension`, onglet PMR, `deplacements:read`) : téléchargement des
  paquets Chrome / Edge et Firefox **depuis CSM** (route `GET /api/pmr/extension/[fichier]`, agent connecté, liste
  blanche = `release.json`), procédure d'installation, configuration (URL CSM à copier, jeton fourni par l'admin),
  synchro quotidienne, mise à jour, dépannage des messages de l'extension, nouveautés par version
  (`lib/pmr/extension-releases.ts`). Les zips sont désormais construits dans **`web/downloads/dicos-connector/`**
  (+ `release.json` : version, tailles, SHA-256 ; inclus dans l'image par `outputFileTracingIncludes`) au lieu
  d'`extension/dist/`. Un test vérifie manifests = paquets = nouveautés. Lien « Extension DICOS » sous la date de
  synchro quand elle est périmée.
- 2026-10-09 — **Jetons de connecteur personnels + extension 1.7.0** (demande : « en générer un pour chaque compte,
  pré-remplir l'extension »). Collection `connector_tokens` (`1760002000` : empreinte SHA-256 seule, pour soi avec
  `deplacements:write` (un lecteur ne peut pas écrire de missions par l'extension), lue par le propriétaire / admins / connecteur, usage noté par le connecteur seul, 10 au plus,
  supprimés à la désactivation du compte) ; l'ingestion accepte le jeton personnel `csmc_…` (cache 60 s, droits du propriétaire relus à chaque
  recherche, recherches de jetons inconnus bornées à 120/min) **ou** le secret partagé `CSM_DICOS_TOKEN`, devenu facultatif. Page `/pmr/extension` : **« Connecter l'extension à mon
  compte »** (le script `csm-link.js` de l'extension, actif seulement sur `/pmr/extension` de `test-csm` et
  `csm.fs0ciety.org`, reçoit le jeton par `postMessage` même origine et annonce sa version), repli « jeton à coller »,
  liste « Mes appareils connectés » (dernière synchro, version, révocation). Extension : bouton **« Autoriser CSM »**,
  en-tête `x-csm-extension`, bandeau **« Nouvelle version disponible »** (version publiée renvoyée par l'ingestion).
  **Synchro incomplète** : dernier lot de chaque jour en `final: true`, `dicos_syncs.complete` / `version` /
  `synced_by` ; « Synchro DICOS en cours… / incomplète (arrêtée il y a X) » et « par <agent> » ; jour sans mission
  envoyé vide (compte comme synchronisé). **Firefox signé** : job CI `sign-firefox` (secrets `AMO_JWT_ISSUER` /
  `AMO_JWT_SECRET`, canal non listé, `.xpi` commité puis proposé par CSM), `data_collection_permissions` au manifest.
  **Note DPO** `docs/DPO-CONSERVATION.md` (données, durées appliquées, questions). Audit sécurité + revue : 0
  critique ; corrigés : droit d'écriture exigé, droits du propriétaire relus, débit des jetons inconnus, ancien jeton
  révoqué à la reconnexion, état de synchro calculé jour par jour (plusieurs agents), job de signature en
  `concurrency` + attente de 10 min avant le push (Coolify), `web-ext` figé. 226 contrôles de règles ; parcours
  vérifié avec la vraie extension chargée dans Chromium (détection, connexion, envoi, 401 sur mauvais jeton).
- 2026-10-09 — **Mention « Développé par OCC MONS Studios · <année> »** (lien https://studios.fs0ciety.org/, nouvel
  onglet) en pied de page du shell (sous le contenu, au-dessus de la barre d'onglets mobile) et de la page de connexion :
  `components/shell/studio-credit.tsx`.
- 2026-10-09 — **« Masquer les annulées »** sur Missions PMR, Groupes et Historique (puce bascule, `?annulees=masquees`,
  gardée par les raccourcis de dates et les filtres, `status != "annulee"` côté serveur sauf statut précis demandé ; aussi
  dans l'export CSV de l'historique). **Logo OCC MONS Studios** (emblème du site studio, `public/brand/occ-mons-studios.webp`)
  à côté de la mention du pied de page ; `/brand` public dans le middleware (page de connexion).
- 2026-10-09 — **Choix « Masquer les annulées » mémorisé dans les préférences de l'agent** (`users.preferences.pmr.cancelled`,
  choix de l'utilisateur : suit le compte sur tous les postes ; le cookie d'un premier essai est abandonné) : la bascule
  (`?annulees=masquees|affichees`) est enregistrée avec le jeton de l'agent (`server/pmr-prefs.ts`) ; sans paramètre,
  Missions PMR, Groupes et Historique reprennent le dernier choix (`lib/pmr/cancelled-pref.ts`, testé ; E2E sur une
  2e session).
- 2026-10-08 — **Module Référentiels** (audit `docs/design/AUDIT-UX-REFERENTIELS.md`, tout validé). 7 collections
  (`1760000900` : `directory_contacts`, `spi_points`, `ptcar` [abbr unique], `ebp_views`, `documents` [fichier
  protégé], `procedures`, `procedure_versions` hook-only) ; écriture annuaire/SPI/PtCar/EBP = coordinateurs,
  procédures + documents = user + moderator. Hooks : versioning atomique (seulement si le texte change) + refus de
  suppression d'un document référencé. 5 écrans (annuaire, lignes district majoritaire, PtCar/EBP, procédures +
  documents), Markdown rendu en éléments React (sans injection HTML), fichiers servis par route Next (fin du bucket
  public). Données v1 importées sur l'instance de test (385/112/1148/466/8/24/11). **Audit sécurité** (0 critique/élevé)
  + **revue** passés ; corrigés : PDF en téléchargement sous CSP sandbox (bug déjà vu en Opérations), pagination de
  l'annuaire (page large, référentiel borné), `documents.updateRule` resserré aux coordinateurs + `uploaded_by` figé
  (`1760001000`), hook de suppression fail-closed (`findRecordsByFilter`), restauration de version réservée aux
  coordinateurs, filtre par catégorie câblé, e-mail validé. 173 contrôles de règles.

- 2026-10-10 — **Serveur mail Stalwart** (`smtp-fs0ciety`, projet Dev) : **tous les envois et réceptions des services
  hébergés y passeront** (décision de l'utilisateur), Resend transitoire ; variables Coolify (et code si besoin) des services
  à adapter ensuite (inventaire dans DEPLOIEMENT-V2 §SMTP). Fait : certificat Let's Encrypt `*.fs0ciety.org` par **DNS-01**
  avec le jeton Cloudflare existant (accord de l'utilisateur ; HTTP-01 intercepté par Traefik), listener 587, compte
  `csm@fs0ciety.org` + alias `dmarc@`, DKIM des 5 domaines, MX `cardormedia.com` / `empire` (CNAME → A proxifié).
  **CSM branché** (preview puis prod, santé 200, test de campagne envoyé depuis la preview). Reste à l'utilisateur : SPF de
  4 domaines, MX `tandem-agenda.app` (après création des boîtes) et `tasks.tandem-agenda.app` (après adaptation d'agenda).

- 2026-10-10 — **Boîtes mail** (demande de l'utilisateur) : compte Stalwart `nicolas` avec `contact@fs0ciety.org` et les
  alias `contact@` de `eat` / `privatix` / `csm` / `taupe`, `contact@` + `hello@cardormedia.com`, `support@empire.fs0ciety.org`
  (« .com » lu comme une coquille), `support@tandem-agenda.app` ; 4 sous-domaines ajoutés à Stalwart (DKIM automatique).
  Puis DNS posé (A explicite `csm`, CNAME → A pour `eat` / `privatix` / `taupe`, MX des 4 sous-domaines et de
  `tandem-agenda.app`, SPF) ; restent à l'utilisateur les SPF de `cardormedia.com` et `tandem-agenda.app` (refusés).

- 2026-10-10 — **Services sur Stalwart** : un seul compte d'envoi `nicolas@fs0ciety.org` (choix de l'utilisateur, les 5
  comptes par service créés puis supprimés), expéditeurs en alias ; variables SMTP posées sur OCC Deliveries, agenda, RailCards,
  elo, fs0ciety, documenso, ntfy ; adresses de contact ajoutées / remplacées dans 10 dépôts (agents par dépôt, relus, poussés
  sur les branches déployées). SPF `cardormedia.com` et `tandem-agenda.app` posés. CSM garde `csm@fs0ciety.org`.

- 2026-10-10 — **Webmail Roundcube** sur https://webmail.fs0ciety.org (service Coolify `webmail`, projet Dev), branché sur
  Stalwart (IMAP 993, SMTP 587, Sieve 4190) ; connexion et envoi / réception vérifiés avec la boîte `nicolas@`.

- 2026-10-10 — **OCC Studios désactivé** (remplacé par interactive.cardormedia.com) : application Coolify `OCC MONS Studios`
  arrêtée (pas supprimée), CNAME `studios.fs0ciety.org` retiré (le nom résout encore par le joker `*.fs0ciety.org` → 503).
  **Cosmic Empires** : déploiements Vercel coupés (`vercel.json` `git.deploymentEnabled: false`, ogame-like `7556af4`).

- 2026-10-10 — **CSM passé sur `nicolas@`** (compte `csm@` supprimé, `csm@` en alias) ; le mot de passe personnel de Nicolas
  ayant été changé, **mot de passe d'application** dédié aux services, posé partout et vérifié (test de campagne preview OK).
  **Cloudflare Access** : application « Outils internes fs0ciety » (`bdd4ba85-8fd8-4af2-8852-7b661ef4807f`, 24 h, Allow =
  occmons@gmail.com + nico.dessenius@gmail.com) sur convert, img, link, profilarr, surrealist, tools, search, webmail
  (passés en proxifié) ; `base.fs0ciety.org/_` (admin PocketBase de Cosmic Empires, API publique gardée) dans sa propre
  application « Admin PocketBase Cosmic Empires » (`3ac94e48-518f-4a43-902c-a50b874583ea`) après une boucle de connexion.

- 2026-10-10 — **Cloudflare Access étendu** (demande : Coolify, ssh, PocketBase, mail, Immich) : Coolify (tableau de bord ;
  `/api` et `/webhooks` en Bypass), Termix, Immich, admins PocketBase `/_` (eat, devblog, test, base-test), **interface
  Stalwart déplacée sur `mailadmin.fs0ciety.org`** (protégée ; `mail.fs0ciety.org` reste en DNS seul pour SMTP / IMAP).
  Vérifié : redirections Access, API Coolify et webhooks 200, sites publics et API du jeu 200, envoi SMTP CSM OK.

- 2026-10-10 — **Tests « mot de passe oublié »** avec nd.managment@gmail.com et nico.dessenius@gmail.com : CSM prod + preview,
  OCC Deliveries, Tandem (en-tête `X-Requested-With: tandem` exigé), RailCards, fs0ciety, HumaScan → demandes acceptées, file
  Stalwart vide, aucun avis de non-distribution ; réception depuis Gmail et Outlook vérifiée. Cosmic Empires (prod
  `base.fs0ciety.org` + préprod `test.fs0ciety.org`) testé après réglage manuel du SMTP par l'utilisateur (mot de passe
  d'application dédié « Cosmic Empires ») : 204, file vide. Non testé : documenso (403). `nd.managment@gmail.com` ajouté aux politiques Access.

- 2026-10-10 — **Access retiré** de convert, img, link, profilarr, tools, search (décision de l'utilisateur : publics), remis en
  DNS seul ; restent protégés : Coolify, ssh, Immich, mailadmin, webmail, Surrealist, admins PocketBase.

- 2026-10-10 — **Hub `services.fs0ciety.org`** (dépôt `fs0ciety7000/coolify`, dossier `hub`) : pied de page « Développé par CM
  Interactive · une division de CARDOR Media » (emblèmes animés), mention Coolify retirée, **page GitHub** (`/admin/github` :
  PR, CI, alertes, fusion / approbation / relance de workflow, `GITHUB_TOKEN` à fournir par l'utilisateur), annuaire remis à
  jour (sites CARDOR, CSM prod, webmail, Coolify, Immich ; OCC Studios retiré) et **hôte entier derrière Cloudflare Access**
  (application « fs0ciety Hub » `b1f29c62-07d0-428b-8bce-823f6e1e43e7`, mêmes e-mails que Coolify).

- 2026-10-11 — **Sauvegardes hors serveur de Cosmic Empires et OCC Deliveries** : déjà en place (OCC : sauvegardes PocketBase
  vers R2 `occ-deliveries-backups` avec vérification de restauration, ajoutées le matin par une autre session ; Cosmic : copie
  quotidienne des sauvegardes PocketBase vers R2 `cosmic` par le workflow GitHub `r2-backup.yml`, heure variable). Première
  sauvegarde OCC lancée et vérifiée ; le hub suit les deux (clé R2 en lecture seule limitée au bucket `cosmic`). **Tableau de
  bord Coolify** : `coolify.yaml` est régénéré par Coolify (nom réservé) → fichier séparé `hub/docs/cloudflare-only.yaml`
  (dépôt `coolify`, routeurs prioritaires + liste blanche Cloudflare) à poser par l'utilisateur dans Proxy › Dynamic configurations.

- 2026-10-11 — **Sauvegardes lancées et restaurées depuis le hub** (section « Sauvegarder et restaurer les services » de
  `/admin/backups`, variable `BACKUP_SERVICES`) et **scripts shell** `scripts/backups/` du dépôt `coolify` (`csm-prod.sh`,
  `csm-preview.sh`, `cosmic.sh`, `occ.sh` : list, backup, download, mirror, push, restore, restore-offline). CSM : API PocketBase
  avec le superuser `PB_ADMIN_*` (jeton de service Access pour `pb-csm`, accès direct au conteneur sur le serveur). Toute
  restauration commence par une sauvegarde de sécurité ; archives du hub nommées `hub_<app>_<date>.zip` (l'API PocketBase refuse
  `@`), 10 gardées par stockage. OCC : route `POST /api/occ/admin/backups/restore` ajoutée (superusers sous MFA). Cosmic :
  superuser dédié au hub + jeton R2 lecture/écriture limité au bucket `cosmic`. Testé en local (PocketBase et OCC) ; en prod,
  liste + une sauvegarde Cosmic seulement, **aucune restauration**.

- 2026-10-11 — **Pages d'erreur de tous les services** (dépôt `coolify`, dossier `error-pages`, service Coolify du même nom) : pages
  404 / 502 / 503 / 504 / maintenance par marque (CARDOR, CSM, OCC, Privatix, hub, Tandem, Cosmic, RailCards, Taupe, générique
  fs0ciety), route Traefik de secours de priorité 1 (service arrêté → 503 de la marque, adresse inconnue → 404). CSM : pages
  « introuvable » de l'appli (globale + dans le shell), en préversion. Pages Cloudflare « serveur injoignable » prêtes mais
  **impossibles en offre gratuite**. Taupe passé derrière le proxy Cloudflare (IP joueur par `CF-Connecting-IP`, liste blanche).

- 2026-10-11 — **Évolution du design « poste d'exploitation »** (demande : « le design est-il en phase avec le but et
  le côté professionnel ? ») : verdict d'un agent design (interface vue en local), ébauche publiée en artefact privé, audit
  produit (top 8). **Validé par l'utilisateur**, avec deux réserves : **les PACO/RCCA gardent la réouverture des bons**
  (pas de réservation au modérateur) et **les 11 thèmes du 9 oct. restent intacts** (sous « Autres thèmes »). Livré :
  thèmes de référence **Jour / Nuit / Contraste élevé** (Geist, rayon 4 px, libellés sans mono ; « Automatique » =
  Nuit / Jour), barre du haut sur une ligne avec onglets et **puce des districts du jour** (le bandeau est retiré),
  **compteurs** dans la barre latérale et état des flux, **accueil « À traiter »** (bande de compteurs + file par gravité ;
  « Vue du jour » et « À confirmer » y sont repris), filtres sans bouton « Filtrer », **panneau ancré** dès 1280 px.
  Correctifs : barre d'onglets mobile qui se chevauchait, recherche Admin (filtre `email` refusé par PocketBase →
  JavaScript), PDF d'archive produit **après** la clôture (`after()`). Lancés en parallèle (agents) : alertes H-2 /
  rôle Écran / synchro DICOS, recherche de gare / fournisseurs / supervision / conservation du Journal, import
  différentiel BACO pour le gel.
- 2026-10-11 — **Import différentiel pour la bascule** (`pocketbase csm-import-delta`, `lib/import-delta.js`) : rapatrie ce qui
  a été saisi dans BACO après la sauvegarde de l'import initial (10 oct., 12:36Z) sans écraser CSM : créé si nouveau et
  absent, mis à jour si CSM n'a pas touché les champs repris, sinon **conflit listé** ; jamais de suppression ; comptes
  nouveaux créés **désactivés** (`paco` à la réactivation), comptes existants jamais touchés ; `--dry-run`, transaction par
  table, idempotent (registre `app_settings.import_delta`). Correspondances de `lib/import.js` extraites en fonctions
  partagées (import complet inchangé, vérifié par empreinte). **La sauvegarde `/home/user/csm-backup-prod` sert de base de
  comparaison (`--base`) : à garder en archive chiffrée jusqu'à la bascule.** Répétition locale sur une sauvegarde Supabase
  fraîche (GET seuls) : 1 commande bus créée dans BACO depuis le 10 oct. Procédure de bascule : DEPLOIEMENT-V2 §7 ; rien
  exécuté sur la prod.

- 2026-10-11 — **Fusion des lots parallèles + relectures.** Intégrés : rôle **Écran** (`/tv` seul), alerte **bus H-2**,
  missions **« absentes de DICOS »**, alertes **DICOS de dernière minute** ; recherche de gare tolérante (accents, PtCar),
  filtres par défaut (districts du jour, semaine des bons), **Commandes › Fournisseurs** + relance `.eml`, **Admin › Santé**
  (sauvegardes, tâches planifiées via `cron_runs` / `lib/heartbeat.js`, SMTP, R2, extensions), conservation du Journal ;
  **import différentiel BACO** (`csm-import-delta`, jamais lancé sur la prod). Audit sécurité (0 critique / élevé) et revue
  adversariale ; corrigés : une mission présente ne passe plus « absente » sur une erreur d'écriture (vue avant l'upsert,
  lot en erreur = synchro non complète) et les « absentes » **restent dans l'ALEA** (un faux « absent » ne doit pas faire
  disparaître un ALEA obligatoire) ; champs sensibles de `pmr_assists` (note, réf. DICOS, client…) **masqués au compte
  Écran** par `onRecordEnrich` ; **purge du Journal coupée par défaut** (`CSM_JOURNAL_RETENTION_MONTHS` à poser après avis
  du DPO), journal d'audit gardé, mois borné (31 → fin de mois) ; registre de l'import (`app_settings.import_delta`) réservé
  aux admins (`1760003200`) ; Santé ne prend plus un zip `bons/` ou `hub_*` pour la dernière sauvegarde ; panneau ancré au
  premier plan du Journal plein écran et fermé seulement par la croix / Échap ; période par défaut des bons ignorée avec une
  recherche ou un statut ; district « tous » de l'historique ; bons à H-2 en rouge et alertes DICOS dans « À traiter ».
  384 contrôles de règles, 827 tests unitaires, E2E 88 / 89 (le dernier, « palette sans glisser », passe seul : charge).
  Restes : onglet Fournisseurs visible seulement avec `otto:read` (un agent « taxi seul » ne le voit pas) ; urgences et
  consignes du Journal affichées sur l'écran commun (choix fonctionnel, à confirmer DPO).

- 2026-10-11 — **Arrêts au choix** dans le bon bus (« Toutes les gares des lignes cochées », direct compris, arrêts d'un direct
  imprimés). **Lot du 11 oct. poussé en production** (accord de l'utilisateur, `csm-prod` = fd09365, santé 200). Référentiel
  des lignes : **Schaerbeek retiré de la L.161** (placé avant Namur, faussait les itinéraires ; il est sur la L.26, absente du
  référentiel, et reste sur la L.36) en préversion et en production par Admin › Lignes et arrêts (accord de l'utilisateur).
  À refaire si le référentiel des lignes est réimporté depuis BACO.

- 2026-10-11 — **Widget « Fin de service »** (demande de l'utilisateur) : l'agent choisit AM, PM, Nuit ou Extra (8-16), l'accueil
  décompte le temps restant (barre de progression, heure de fin). Horaires AM 6-14, PM 14-22, Nuit 22-6 **supposés** (à
  confirmer) ; choix mémorisé dans le profil.

- 2026-10-12 — **Missions PMR / Groupes : statut par bout** (retour utilisateur : PMR CRF Tournai IN → Charleroi-Central OUT ;
  dès que Tournai validait, la prise en charge de Charleroi disparaissait). Cause : le statut du trajet était déduit des
  seules missions du lot ; la vue DICOS de l'agent de Tournai ne contient que la mission de départ → trajet « réalisé ».
  Désormais `in_status` / `out_status` fusionnés d'une synchro à l'autre, trajet réalisé seulement quand départ ET arrivée
  assistés sont validés ; badges IN / OUT cochés. Filtre de statut en **cases à cocher multiples**. Les lignes déjà mal
  marquées se corrigent à la synchro suivante.

- 2026-10-14 — **« Valider l'envoi »** (demande de l'utilisateur) : un bouton qui ouvre le brouillon Outlook (`.eml` X-Unsent,
  adresse du fournisseur, message généré avec date / trajet / n° TC, PDF joint) et passe le bon en « Envoyé ».
- 2026-10-14 — **Cycle des bons v3** (décision de l'utilisateur) : **1. Brouillon / en cours** (`brouillon`) → **2. Terminé**
  (`termine` : bus démobilisés, heures de démobilisation proposées) → **3. Envoyé / finalisé** (`envoye` : « Valider l'envoi »,
  `.eml` semi-automatique, PDF archivé ; bon verrouillé, « Rouvrir » par les coordinateurs). **« Confirmé » supprimé**, avec
  l'alerte H-2 (`bus-h2`) et la relance fournisseur. Conversion (migration `1760003400`) : ancien terminé et ancien envoyé →
  envoyé / finalisé ; confirmé et en cours → brouillon / en cours ; l'historique garde les anciens libellés. Suivi : vues
  « À envoyer » (terminés), « Aujourd'hui », « En cours », « Toutes » ; accueil, Relève et `/tv` comptent les bons à envoyer.
  E-mail fournisseur = récapitulatif, sans demande de confirmation. 378 contrôles de règles.
- 2026-10-14 — **Heure de retour taxi vide** : enregistrée 00:00 et le bon bloqué (« le retour doit suivre l'aller ») →
  `taxi_orders.return_time_pending` (`1760003500`, comme `time_pending` pour l'aller ; brouillons déjà à minuit repris).
  Gel de BACO reporté (décision de l'utilisateur). L.26 absente aussi des données BACO : stations à fournir ou à saisir
  dans Admin › Lignes et arrêts.

- 2026-10-14 — **Référentiel des relations de trains** (demande de l'utilisateur : ligne, type IC / L / S / P, relation IC14…,
  série 17xx, arrêts ; « via iRail ou DICOS »). Recherche par agent : iRail ne donne pas la relation, DICOS n'est lisible que
  par l'extension → **GTFS officiel SNCB** (arrêts, passages, horaires, jours ; conditions de licence **non lues**, pages
  bloquées ici : à vérifier) + **données ouvertes Infrabel (CC0)** : ponctualité J-1 (relation exacte « IC 14 », n° de ligne à
  chaque point) et points opérationnels (noms FR / NL). Jointure par n° de train ; série = demi-bloc de 50 (les blocs de 100
  mélangent deux relations : 17xx = IC14 + S1). Import par le serveur Next chaque matin (≥ 5 h, `instrumentation.ts`, ~1 min,
  7 400 trains, 267 relations), écrit par routes internes PocketBase (`1760003600` : `train_paths`, `train_services`,
  `train_relations`). Écran **Ressources › Trains** : relations, fiche relation / train, par gare (s'arrêtent / passent), par
  ligne. Revue adversariale : corrigés deux imports simultanés (verrou PocketBase 30 min + `globalThis`), rattrapage mensuel
  Infrabel non bloquant (une fois par mois), jours fériés hors semaine de référence, chemin Infrabel d'un n° réutilisé
  (EXTRA) ignoré, lignes d'un trajet partiel, passages sans arrêt déduits d'Infrabel. 396 contrôles de règles.
  Nouveau lot demandé (feuille de route CSM-V2 §7, étapes 11-13) : districts des gares en base, gares frontière, bons bus /
  taxi et Lignes branchés sur le référentiel, CHANGELOG.md + `/changelog` + modale de mise à jour.
- 2026-10-14 — **Changelog** (demande de l'utilisateur) : `CHANGELOG.md` à la racine (versions datées AAAA.MM.JJ, amorcé avec
  les livraisons du 9 au 14 oct.), page **`/changelog`** « Nouveautés » hors module (tout agent connecté, jamais l'Écran ;
  `/equipe/nouveautes` redirige en 308, l'onglet Équipe › Nouveautés disparaît) ; les **annonces de l'équipe** (collection
  `changelog`, admin / sysop / modérateur) restent sur la page, onglet « Annonces de l'équipe » (masqué à l'invité comme
  avant). Lien en pied de barre latérale avec la version, entrée dans « Plus » (mobile) et ⌘K. **Fenêtre « CSM a été mis à
  jour »** une fois par version et par compte (`users.preferences.changelogSeen`), **comptes neufs compris** (choix par
  défaut, à confirmer) ; ouvrir `/changelog` vaut lecture. Image Docker construite depuis `web/` seul → copie embarquée
  générée (`npm run changelog`). E2E : les comptes E2E communs ont « tout vu » (`e2e/global-setup.ts`).

- 2026-10-14 — **Référentiel des gares et districts** (étapes 11 de la feuille de route) : collection `stations` (`1760003700`),
  construite par l'import quotidien (gares de l'horaire SNCB + abréviation et noms Infrabel, UIC, pays, lignes, alias :
  « Maubeuge (FR) » = « Maubeuge », « Aachen Hbf (DE) » = « Aachen ») ; **district modifiable** (Ressources › Gares, droit
  `ptcar:update`, hook : district seul, marqué manuel et jamais écrasé par l'import ; « Automatique » rend la proposition,
  tirée de la table BACO `districts.ts`). L'ingestion DICOS lit ces districts (route interne `/api/csm/stations/districts`,
  cache 10 min, table figée en repli) ; la recherche de gare tolérante y prend aussi noms NL et alias. Local : 685 gares,
  137 DSO, 170 DSE, **1 seule DCE** (table BACO) : à compléter par les coordinateurs. 406 contrôles de règles.

- 2026-10-14 — **Ressources › Lignes tirées du référentiel des trains** (étape 12, demande de l'utilisateur ; Missions PMR et
  Groupes gardent les données DICOS, rien de changé de ce côté). Collection `rail_lines` (`1760003850`, une fiche par ligne,
  écrite par la route interne `/api/csm/timetable/lines` à la fin de l'import quotidien, lue comme `train_services`).
  Ordre des gares (`lib/timetable/lines.ts`, testé) : paires de gares **consécutives** des chemins Infrabel (`train_paths`,
  toutes les gares traversées, donc pas de raccourci par les trains rapides), arêtes rares écartées, raccourcis retirés
  (le moins chargé d'abord s'il existe un détour ≤ 8 gares), tronc = chemin le plus chargé, embranchements listés ensuite ;
  **sens et km** par les sections Infrabel « lijnsecties » (CC0, 2,5 Mo, facultatif) ; morceau qui prolonge le tronc sans
  chevauchement kilométrique rattaché avec un trou signalé (L.161 : La Hulpe → Ottignies passe sous le n° 161A). Local :
  86 lignes (68 orientées par les km). District d'une ligne = majorité des districts de ses gares, **calculé à la lecture**
  depuis `stations` (une correction dans Ressources › Gares se voit aussitôt). Vue « par ligne » de Ressources › Trains
  ordonnée par `rail_lines`. **Décision provisoire (à confirmer)** : `line_stations` (BACO) et **Admin › Lignes et arrêts**
  restent tels quels (source des itinéraires des bons bus, de `resolveStationTerms` et des perturbations iRail par district
  `districtStations`), avec une note dans l'admin ; aucune correction manuelle sur `rail_lines`. Schaerbeek n'apparaît plus
  sur la L.161 du nouveau référentiel (les trains de la L.161 partent de Bruxelles-Nord dans les données Infrabel).
  418 contrôles de règles.
- 2026-10-14 — **Bons bus / taxi branchés sur le référentiel des trains** (étape 12, partie bons) : champ de gare alimenté
  par `stations` (nom FR retenu, nom NL / alias / PtCar acceptés : « Bergen » → Mons, « Maubeuge » → « Maubeuge (FR) »,
  suffixe de pays gardé ; saisie libre permise, anciens bons inchangés). **Lignes et arrêts tirés des trains** (Server
  Action `orderTrainRoute`, `lib/orders/train-route.ts`) : trains qui passent par les deux gares, **les deux sens** (un bus
  roule dans les deux : Charleroi-Central → Mons n'a aucun omnibus direct dans ce sens) ; omnibus = L / S / P avec le plus
  d'arrêts, direct = IC avec le moins d'arrêts ; puces = union des arrêts de tous ces trains ; repli sur `routeBetween`
  (réseau des lignes BACO) sans train. Posés d'office seulement après un changement de gare (jamais à l'ouverture d'un bon).
  **N° de train** (`train_number`, `1760003800`, bus et taxi) : variante du jour du bon, trajet repris d'office si la gare
  d'arrivée est vide, sinon bouton « Reprendre le trajet du train » ; gares du rédacteur gardées si le train y passe ;
  « Annuler la reprise » ; taxi : heure = départ du train. Sur le PDF, l'e-mail et le panneau du Suivi. Corrigé en route :
  l'indicateur d'enregistrement restait « Modifié » quand la saisie revenait à l'état enregistré. 409 contrôles de règles.

- 2026-10-14 — **Gares v2** (demande de l'utilisateur : « chaque gare et PANG, ligne et district, éditables par admin /
  coordinateur / modérateur ; assigner facilement le district des 377 gares sans district ») : réponses de l'utilisateur
  = **5 districts SNCB** (DSO, DSE, DCE + DNO Nord-Ouest, DNE Nord-Est ; les filtres et alertes de l'équipe restent sur
  DSO / DSE / DCE : `DISTRICTS` de `lib/pmr/districts.ts` inchangé, DNO / DNE donnent « » pour les missions) et
  **proposition automatique + validation**. Migration `1760003950` : `kind` (gare / pang / etranger), `lat` / `lon`,
  `district_suggested` + `suggestion` (calculées par la route interne `/api/csm/stations/suggest` : 6 gares connues les plus
  proches à 30 km au plus, poids ×2 si ligne commune, majorité 60 % ; sans coordonnées : district majoritaire des lignes),
  `lines_manual`. L'import ajoute toutes les gares et PANG d'Infrabel (lignes relevées sur les chemins). Ressources › Gares :
  sélection multiple, « Attribuer à la sélection », « Valider les propositions », lignes et type modifiables (droit
  `ptcar:update`). Local : 829 gares (425 gares, 328 PANG, 52 étrangères), 314 propositions sur 521 sans district. Attention :
  la table BACO classe déjà des gares flamandes en DSO / DSE (Gand-Saint-Pierre, Waregem, Louvain, Hasselt), les propositions
  s'en inspirent : à revoir par les coordinateurs. **Nouveau GTFS** : le serveur vérifie toutes les 3 h (requête HEAD,
  `Last-Modified`) et relance l'import aussitôt (tous les référentiels).
- 2026-10-14 — **⌘K granulaire dans tous les modules** (demande de l'utilisateur) : `paletteSearch` renvoie des **groupes
  par module** (« Ressources › Gares », « Commandes › Fournisseurs »…, 5 résultats par groupe + « Voir tout » vers la recherche
  de la page). Lecture de la saisie (`lib/search/palette.ts`, testée) : 2 à 5 chiffres = n° de train (+ bons, PN), « IC14 » /
  « S1 » = relation, « L.96 » = ligne seule, « L36 » = ligne ET relation omnibus, 2 à 5 lettres = abréviation de gare ; le
  groupe le plus probable passe en tête et son premier résultat est actif. Groupes ajoutés et droit : Gares, Lignes,
  Relations, Trains (onglets Ressources, hors invité / Écran), Procédures et Documents (`documents:read`), EBP (`ebp:read`),
  PN (`carte_pn:read`), Bons taxi (`generate_taxi:read`), Fournisseurs (onglet, `otto:read` hors invité ; taxi avec
  `generate_taxi:read`), Archives (`archives:read`), Agents (onglet Équipe, champs de l'annuaire seulement), Ma journée à la gare
  trouvée (`journal:read`), Comptes (admin / sysop) ; bons bus cherchés aussi par `train_number`. Aucun nom de voyageur
  (missions, taxis). `Promise.allSettled` : un groupe en erreur est omis.

- 2026-10-14 — **Retours sur Ressources et notifications** : « ne fonctionne pas » sur Gares (`?q=fcr`) = la recherche ne partait
  qu'à l'Entrée → **recherche pendant la frappe** (`FormAutoSubmit live`, 450 ms, focus gardé) sur Gares, Lignes et Trains ;
  filtre district de Lignes qui montrait des lignes flamandes (la table BACO met Hasselt, Louvain, Gand-Saint-Pierre… en
  DSO / DSE, et le district d'une ligne était la majorité des seules gares avec un district) → **district d'une ligne = ceux qui
  portent ≥ 30 % de toutes ses gares** (`LINE_DISTRICT_SHARE`, plusieurs possibles, DNO / DNE compris). **Barre du bas mobile :
  « Données »** (libellé court de Ressources ; l'onglet Annuaire des contacts garde son nom). **Notifications selon les districts
  du jour** : champ `notifications.districts` (`1760004000`, noms, posé par les hooks, non modifiable) — urgences (district de
  l'entrée), perturbations iRail, retards des trains de mission, changements DICOS, mentions @district ; la cloche
  (`notificationScope`) n'affiche que ceux qui croisent les districts du jour (cochés → permanents → profil), sans district =
  toujours ; changer ses districts recharge la cloche (`DUTY_CHANGED`) sans réalerter. Index des gares iRail lu d'abord dans
  `stations` (FR + NL, districts corrigés). 426 contrôles de règles. **À signaler** : districts BACO flamands douteux (DSO / DSE).

- 2026-10-14 — **Districts de la préversion = référentiel par défaut** (demande : « ce sont les vraies données, à injecter en prod et
  faire le référentiel par défaut ») : export `GET /api/referentiels/gares/export` (CSV, `?format=json`), lu avec le compte admin
  de test → `web/src/data/station-seed.json` (829 gares, 65 districts corrigés à la main ; `scripts/station-seed.mjs`), appliqué
  par `buildStations` comme valeur automatique (avant la table BACO) : la prod reçoit ces districts au premier import après son
  déploiement (rien d'écrit à la main dans `pb-csm`). À régénérer après de nouvelles corrections en préversion.
  **Fin de `line_stations`** (validé par l'utilisateur) : bons bus / taxi (`orderLines` : `rail_lines` → `LineInfo` avec
  tronçons `segments`, libellé « L.96 » ; repli `line_stations` seulement si `rail_lines` est vide), recherche de gare,
  perturbations iRail par district (`districtStations` lit `stations`), index iRail de PocketBase ; **Admin › Lignes et arrêts
  remplacé** par l'édition dans Ressources › Lignes (`ptcar:update`, `1760004100` : `manual`, `stations_auto` /
  `branches_auto` / `name_auto`, l'import n'écrase ni ne supprime une ligne manuelle ; « Rétablir l'automatique »).
  `line_stations` reste en base (import BACO, import différentiel) mais n'est plus lue. **IC 943** : variante de 3 jours
  réellement déviée par Braine-le-Comte (GTFS) ; l'insertion des passages Infrabel ne traverse plus un vrai arrêt absent du
  chemin (sinon les gares de la L.118 apparaissaient après Braine-le-Comte). ⌘K granulaire (agent) fusionné. 431 contrôles.

- 2026-10-14 — **Lot du 14 oct. poussé en production** (accord de l'utilisateur : « Tu peux pousser en prod ») : `csm-prod` =
  7681554 (22 commits depuis 7d6b436 : cycle des bons v3, référentiels trains / gares / lignes, ⌘K granulaire, notifications par
  districts du jour, changelog). Déploiements Coolify terminés, santé 200 ; premier import du référentiel lancé au démarrage
  (vérifié en lecture : 148 gares DSE = référentiel par défaut, L.96 à 20 gares, `/admin/lignes` redirigé). Quinyx (horaires
  PACO / RCCA) confié à une session dédiée (`session_01BiKDcUpFvzU6ZbqdH1XD9n`, branche `claude/quinyx-horaires`, PR vers
  `csm-preview`) ; cookies de session Quinyx collés dans la conversation non utilisés (déconnexion conseillée).
- 2026-10-14 — **Horaires Quinyx, 1er lot** (demande de l'utilisateur : capturer les prestations publiées des PACO / RCCA
  sans accès API, les relier aux comptes CSM, en déduire le district). Deux captures HAR de l'utilisateur analysées par
  script (chemins et formes seulement ; elles contenaient ses cookies → déconnexion demandée) : planning du mois par
  `GET /extapi/v1/shifts/by-group/<g>`, types, sections, date de publication, agents. Réponses : **MONS / OCC SO → DSO,
  NAMUR / OCC SE → DSE** ; groupes Mons et OCC SE à saisir dans l'admin (jamais dans Git). Livré : extension **1.8.0**
  (module Quinyx, même jeton de connecteur, tri dans le navigateur : seulement PACO / RCCA / EXTRA affectées et publiées),
  `POST /api/equipe/quinyx/ingest` + `GET …/config`, `lib/quinyx/model.ts` (source unique, testée), migration
  `1760004200` (`quinyx_groups`, `quinyx_places`, `quinyx_agents`, `quinyx_shifts`), purge `quinyx-retention`
  (90 j / 180 j, à valider DPO), **Équipe › Planning**, **Administration › Quinyx**, district du jour proposé d'après la
  prestation, widget « Fin de service » sur l'horaire réel. Réponses de l'utilisateur : date de publication Quinyx **incluse**, EXTRA = en service, pas d'autre
  groupe ni district pour l'instant.
  Revues sécurité + adversariale : retrait des prestations disparues limité aux agents visibles du compte Quinyx
  (`visible`), aux sections reçues et à 30 %, un lot à la fois par groupe, bornes de période et d'heures, création
  concurrente relue, date de publication la plus prudente. **Horaires gardés seulement pour les comptes CSM de
  l'équipe** (paco, moderator, admin, sysop ; précision de l'utilisateur) ; une synchro profite à tous.
  Cadrage `docs/design/CADRAGE-QUINYX.md`, note DPO §2-3-5. PR vers `csm-preview` (demandée par l'utilisateur).

- 2026-10-14 — **Rôles v3, lots L2 et L3** (`docs/design/CADRAGE-ROLES-V3.md` annexe F) : règles PocketBase en `users.perms`
  (`1760004400`, 47 collections réécrites explicitement, `down` = règles v2 exactes), tests de rôle des hooks et du web devenus
  des permissions (`journal:moderate`, `bus:reopen` / `taxi:reopen`, `pmr_equipment:manage`, `changelog:*`, `presence:read`,
  `team:read`, `quinyx:read`, `timetable:read`, `suppliers:read`) ; corrections validées (audit ADMIN seul, zones PMR
  supprimables avec `pmr:delete`, gares fermées à l'invité, lignes modifiables avec `ptcar:update`) ; **suppression des bons par
  leur créateur pendant 8 h** (demande de l'utilisateur, `1760004410`, `deleteOrder` sans bouton) ; collection **`roles`**
  (`1760004500`, 8 rôles système, `users.role` en texte validé, garde-fous dans les hooks : dernier admin, admin / sysop attribués
  par un admin, rôle verrouillé / système / utilisé) ; commande **`perms-check`** (lecture seule) à lancer sur préversion et prod.
  558 contrôles de règles. Pas encore d'écran Rôles (L4).
- 2026-10-14 — **Synchro DICOS : dernier agent et heure** (retour : « il y a 12 h » alors que d'autres ont pu synchroniser) :
  `syncSummary` renvoie `latest` (synchro complète la plus récente de la période, tous agents, heure + nom de la même fiche)
  et `oldestDay` ; `SyncStatus` affiche la dernière synchro et signale à part un jour resté ancien (> 1 h). Avant, l'heure
  était celle du jour le moins récent et le nom celui du dernier envoi. Constat : la préversion n'avait reçu que la synchro
  de 03:43 (utilisateur) et la **prod n'a jamais reçu de synchro** (extensions encore branchées sur test-csm).

- 2026-10-14 — **Navigation v3** (audit `docs/design/AUDIT-NAVIGATION.md`, proposition B validée avec les décisions en tête) :
  Accueil (À traiter · Statistiques), Opérations (Journal par défaut · Ma journée · Relève), Commandes (Suivi « À envoyer »
  par défaut, ouvert au « taxi seul » · Bus · Taxi · Archives · Fournisseurs), PMR (Missions · Groupes · Clients · Matériel ·
  Historique), **Réseau** (Trains en direct · Horaires · Lignes · Gares · PtCar · EBP · Carte PN ; Gares et PtCar restent
  séparés), Ressources (Contacts · Collègues · Planning · Procédures et documents · **B201**) ; module Équipe supprimé, Mon
  profil (`/profil`) et Extension CSM (`/extension`) dans le menu du compte ; mobile Accueil · Opérations · Bons · PMR · Plus.
  Nouvelles URL `/reseau/*`, `/ressources/*`, `/statistiques`, `/profil`, `/extension` ; **anciennes routes redirigées en
  308 (requête gardée) depuis une liste unique** `web/src/lib/redirects.ts` ; `/pmr/extension` gardée en **alias** (le script
  de connexion des extensions installées n'y est injecté que là). **Droits (décision de l'utilisateur)** : gares (district,
  lignes, type), lignes, PtCar, EBP, points SPI en **lecture seule pour PACO/RCCA et modérateurs**, modifiables avec la clé
  sensible **`referentiels:manage`** (admin / sysop d'office, rôle personnalisé possible ; migration `1760004700`) ; Carte PN
  inchangée. **Administration › Référentiels** : tableau de bord qualité + écrans Gares et districts, Lignes (création d'une
  ligne absente, ex. L.26), PtCar, EBP, Points SPI, Passages à niveau (désactivation), Imports. 617 contrôles de règles.

- 2026-10-14 — **Refonte de l'annuaire** (Ressources › Annuaire, demande de l'utilisateur : « plus agréable à utiliser /
  rechercher » ; `docs/design/REFONTE-ANNUAIRE.md`). Audit : « liege » ne trouvait pas « Liège », un numéro tapé avec
  d'autres espaces ou en +32 introuvable, abréviation de gare ignorée, recherche à l'Entrée seulement, numéro non
  appelable depuis la liste mobile, ni favori ni récent. Livré : recherche **instantanée dans le navigateur** (toutes les
  fiches lues une fois avec les alias des gares citées : `FMS`, `Bergen`), tolérante (accents, désordre, numéro en forme
  nationale, fautes au second passage seulement), classée et surlignée, « / » / ↓ / Entrée ; lignes avec numéro lisible,
  appel (`etrali:` / `tel:` 44 px), copie, e-mail ; **favoris et « Consultés récemment » dans `users.preferences.directory`**
  (aucune nouvelle collection) ; fiche avec Appeler / Copier ; état vide avec correction proposée ; ⌘K ouvre la fiche
  (`?id=`). Droits d'écriture inchangés. Piège trouvé par l'E2E : deux Server Actions « lire-modifier-écrire » des
  préférences lancées ensemble s'écrasent → file côté client.

- 2026-10-14 — **Refonte de l'interface et rôles v3 validés** (« je valide tout ») : plans `docs/design/REFONTE-UI-2026-10.md`
  et `docs/design/CADRAGE-ROLES-V3.md`, réponses par défaut retenues (contrôles personnalisés aussi en mobile en feuille du
  bas ; administration réservée à admin / sysop ; un lien « Administration » dans le menu du profil ; « + Nouveau » et
  « En ligne » hors de la barre du haut sous 1536 px ; barre du bas à 5 entrées avec Ressources dans « Plus » ; filtres
  multi-districts partout ; jours fériés belges dans le calendrier ; heures au pas de 5 min ; ordre R0 → R1 → R3 ; rôles :
  admin seul gère les rôles, Sysop gardé, pas de portée par district ni de droits temporaires, rôle utilisé non supprimable
  (réaffectation proposée), Modérateur et PACO/RCCA modifiables non supprimables, couleur du rôle = anneau d'avatar).
  **R0 livré** : Administration dans la barre latérale (groupes Comptes / Supervision / Réglages, repliable ≥ 1280 px, menu
  latéral « Admin » sur le rail, « Plus » mobile groupé), barre du haut « Administration › page », menu du profil allégé.
- 2026-10-14 — **Rôles v3, lots L0 et L1** (plan `docs/design/CADRAGE-ROLES-V3.md` validé : admin seul gère les rôles, Sysop
  distinct, ni portée par district ni droits temporaires, rôle utilisé non supprimable, Modérateur et PACO/RCCA modifiables
  non supprimables, couleur du rôle = anneau d'avatar). **L0** : catalogue `web/src/lib/permissions/catalog.ts` (69 clés :
  56 v2 + 13 nouvelles), copie des hooks `pocketbase/pb_hooks/lib/catalog.js` par `npm run catalog`, inventaire de tous les
  tests de rôle (annexe du cadrage). **L1** : `users.perms` calculé par hook seul (migration `1760004300`), masqué aux
  non-admins, lu par `can()` ; contrôle d'équivalence `pocketbase/scripts/perms-equivalence.mjs` (0 écart sur la base de
  dev). Aucun changement de droit ni de règle. Vérifié : une souscription temps réel suit un changement de droits fait par
  `$app.save()` (pas par SQL direct). 482 contrôles de règles.
- 2026-10-14 — **Refonte R1 + R3 livrés** (agent) : `@radix-ui/react-popover` **1.2.0** figé (seule version dont les
  dépendances internes sont déjà installées ; publiée le 5 oct.), `Popover` / `PickerSurface` (Popover en desktop, feuille Vaul
  < 768 px ou tactile), `Listbox` (APG), pont formulaire `useFormBridge` (champ caché + `change` après un choix seulement),
  `Select` (le `Select` natif d'`input.tsx` coexiste jusqu'au lot R5), `Calendar` (fériés belges + Pâques / Pentecôte),
  `DateField`, `TimeField` (pas de 5 min, `pending`), `DateRangePicker` (raccourcis), `MonthField` ; logique `lib/dates/calendar.ts`.
  **36 champs natifs date / heure / mois migrés** (plus aucun dans `web/src`), filtres Du / Au en `DateRangePicker`. E2E : `frDate()`.
- 2026-10-14 — **Notifications triées à l'affichage** (demande : « doivent s'afficher / alerter en fonction des districts
  sélectionnés ») : urgences, mentions @district, perturbations / travaux iRail, retards des trains de mission et changements
  DICOS sont envoyés à **tous** les agents qui ont le droit (avec `notifications.districts`) ; `notificationScope()` ne montre
  que ceux des districts du jour (sans district choisi : seulement les notifications sans district). **Catégories masquables**
  dans le profil (`preferences.notifications.hidden`, `lib/notification-prefs.ts` : `hiddenFilter`, travaux = titre
  « Travaux ( »). Demandes suivantes : suppression des bons (admin ; créateur PACO pendant 8 h) confiée au lot L2 ; « voir en
  tant que » pour l'admin (agent dédié).
- 2026-10-14 — **Fusions du soir** : rôles v3 **L2** (règles en `perms`, `1760004400`, retour arrière `migrate down` vers
  `lib/rules-v2.js`) et **L3** (collection `roles`, `users.role` en texte validé, garde-fous, `1760004500`), suppression des
  bons par le créateur 8 h (`1760004410`, hook `checkDelete` ; bon envoyé : droit de suppression seul), **« voir en tant
  que »** (route interne `/api/csm/impersonate`, cookie `csm_as`, lecture seule par le middleware et `createPb`, audit
  `impersonate_*`), refonte **R2 / R4** (`Combobox`, `MultiSelect`, `DistrictPicker`, `CheckboxGroup`, `lib/district-param.ts`,
  filtres multi-districts) et **R5 / R6** (Select personnalisé, `OrderActionBar` mobile, Segmented en grille, `SwitchField`).
  582 contrôles de règles, 1053 tests unitaires. Restent : 6 `<select>` natifs (district d'édition, ligne de PN, bifurcation),
  `ListToolbar`, `loading.tsx`, R7, L4-L6, **audit sécurité de L2 avant la prod**, `perms-check` sur préversion et prod.
  Test E2E instable sous charge : Journal « publier… » / « répondre en fil » (passe en série).
- 2026-10-14 — **Audit sécurité rôles v3 / « voir en tant que »** (agent, attaques sur copie locale) : **critique corrigé**
  (route `/api/csm/impersonate` : `guard()` lève une erreur au lieu de renvoyer `e.json`), sysop bloqué sur les comptes admin /
  sysop (`assertCanManage`, hook + web), `disabled_role` et rôles techniques contrôlés (`assertSpecial`, `dicos:write` superuser
  seul), bon déjà envoyé (historique `order_events`) non supprimable par son créateur, filtres / tris sur `grants|denies|
  disabled_role` refusés aux non-admins, jeton de la cible **scellé** dans `csm_as` (AES-256-GCM, `server/acting-seal.ts`,
  format `admin~cible~exp~scellé`). 594 contrôles de règles. `perms-check` sur la préversion : 38 comptes, 0 écart.
  Téléphonie : **Genesys Cloud** (`tel:` E.164, extension de navigateur « Click-to-Dial ») ou Etrali au choix (`lib/telephony.ts`).
  Audit de navigation rendu (`docs/design/AUDIT-NAVIGATION.md`), en attente de validation.
- 2026-10-14 — **Nouvelle arborescence validée** (`docs/design/AUDIT-NAVIGATION.md`, décisions en tête) : Accueil (À traiter,
  Statistiques) · Opérations (Journal par défaut, Ma journée, Relève) · Commandes (Suivi « À envoyer » par défaut, Bus, Taxi,
  Archives, Fournisseurs) · PMR · **Réseau** (Trains en direct, Horaires, Lignes, Gares, PtCar, EBP, Carte PN) · Ressources
  (Contacts, Collègues, Planning, Procédures et documents, **B201**) · Administration (+ **Référentiels**). Gares et PtCar
  **non fusionnés** ; PtCar / EBP / SPI, **gares et lignes** : **lecture seule pour les PACO/RCCA, modifiables par admin /
  sysop seulement** ; module Équipe supprimé (profil et extension dans
  le menu du compte) ; anciennes routes redirigées. Mise en œuvre après fusion des lots en cours.

- 2026-10-14 — **Rôles v3, lots L4-L5** (demande : « un admin moins à l'aise avec l'informatique doit pouvoir ajouter / retirer
  des permissions facilement ») : **Administration › Rôles** (cartes, nouveau rôle à partir d'un modèle, éditeur par tâche
  métier en phrases avec dépendances expliquées, aperçu « peut / ne peut pas », comparaison, récapitulatif et confirmation
  des droits sensibles, toast « Annuler », historique avec « Annuler ce changement », suppression avec réaffectation) et
  **fiche d'un agent** (ajustements en phrases, aperçu, suggestion « Créer un rôle à partir de ces ajustements », matrice en
  vue experte). Logique pure `web/src/lib/roles-editor.ts`, E2E `roles.spec.ts`. Écart : pas de raison par ajustement
  (champ à créer). Détails : CADRAGE-ROLES-V3 §G.
- 2026-10-14 — **Bons (retours utilisateur)** : taxi **plusieurs gares via** ordonnées (`via_stations`, migration `1760004620`,
  anciens bons = une étape), **taxi PMR « Numéro de dossier »** AAAA-MM-JJ-NNNN dans `pmr_file` (colonne BACO existante, purgée
  à 12 mois, masquée sans `pmr:read` ; saisie remise au format, dossiers DICOS proposés), « Terminer » sans « bus démobilisés »
  pour un taxi, **bouton « Supprimer le bon »** (menu « ⋯ », feuille mobile, panneau du Suivi ; créateur 8 h si jamais envoyé),
  **archivage** : bon envoyé ou annulé depuis plus de 30 jours hors des listes courantes, visible dans Commandes › Archives
  (« Bons archivés »), fiche et ⌘K avec badge « Archivé », rien de supprimé ; la B201 garde tous les bons.

- 2026-10-15 — **Réseau : PN Infrabel et zones SPI** (lot A, `docs/design/PLAN-2026-10-15.md`). PN : données ouvertes
  Infrabel « geoow » (CC0, 1 369 PN dont 1 290 « L-ligne-n° » ; zones portuaires sans ligne ignorées ; **pas de BK dans le
  fichier** → BK estimée le long de la ligne, affichée « ≈ ») ; essai local : 183 des 211 PN BACO rapprochés (181 par
  ligne + numéro, 2 par proximité), 1 107 créés, 28 PN BACO absents du fichier gardés. Zones SPI (ex-COI) : 19 zones et
  districts donnés par l'utilisateur ; carte PDF interne lue hors dépôt (QGIS → SVG, recalage Lambert 72 sur 438 noms de
  gares, couleur de la ligne sous chaque gare) → 681 gares / PANG rattachées « d'après la carte », 72 à la gare la plus
  proche, 76 sans zone (étranger, sans position) ; seul le résultat gare → zone est versionné. Zones dessinées par
  cellules de Voronoï des gares (calcul maison). « Zone commune FBMZ et FBN » de la carte non reprise (aucune gare).
  Gares de Hal à Uccle en FBMZ et Flawinne / Floreffe en FNR alors que le référentiel des districts les met en DSO : la
  carte fait foi pour la zone, districts inchangés (à revoir par l'équipe).
- 2026-10-15 — **Réponses sur le lot A** : noms et couleurs des zones validés ; pas de zone commune FBMZ / FBN ; **la carte
  fait foi** → graine des districts (`station-seed.json`) : Buizingen, Huizingen, Halle-Goederen, Moensberg, Bruxelles-Midi
  → DCE (Bruxelles-Midi rattaché à FBMZ), Flawinne, Floreffe, Ham-sur-Sambre, Moustier → DSE ; les 28 PN BACO absents
  d'Infrabel **désactivés** (réversible) ; **BK réelle** : interpolée entre les bornes kilométriques Infrabel (CC0), 1 112 PN
  sur 1 290, estimation « ≈ » en repli (53) ; **vrai fond de carte** (tuiles OSM relayées) sous les zones.

- 2026-10-15 — **PN Infrabel et zones SPI** (lot A, `docs/design/PLAN-2026-10-15.md`) : PN du jeu ouvert Infrabel (CC0), BK
  interpolée entre les bornes kilométriques Infrabel (`bk_source`, `1760004810` ; BK relevée jamais remplacée), 28 PN BACO absents
  d'Infrabel **désactivés** (réactivables), collection `spi_zones` (19 zones, noms = gare de référence, **pas de zone commune
  FBMZ / FBN**), Carte PN refaite sur fond OpenStreetMap relayé (zones en polygones semi-transparents). **Districts par défaut
  alignés sur la carte SPI** (décision de l'utilisateur : la carte fait foi) dans `web/src/data/station-seed.json` : Hal → Uccle
  et Bruxelles-Midi en DCE ; Flawinne, Floreffe, Ham-sur-Sambre, Moustier, Ligny, Tilly, Villers-la-Ville, Bierges-Walibi en DSE ;
  Boitsfort DCE ; Courtrai DNO ; Tirlemont, Bilzen, Nossegem, Zaventem, Boom DNE. Une correction manuelle déjà en base l'emporte.
- 2026-10-15 — **Lot B (Opérations, Commandes, PMR)**, fusionné le 15 oct. : **Relève → « B201 »**
  (`/operations/b201`, onglet ouvert à `journal:read` OU `b201:read`) = synthèse de la relève (jour même) + **notes et
  commentaires du jour en Markdown** (barre d'outils, aperçu sûr du Journal, enregistrement automatique, verrou optimiste,
  auteur / heure, versions du jour tenues par un hook) + transports du jour ; Ressources › B201, `/operations/releve` et
  `/commandes/b201` redirigent (308). Toujours **une fiche par jour** (le district ne filtre que l'affichage, comme
  l'ancienne remise) ; migration `1760004830` (`content`, `versions` ; anciens commentaires par période convertis en
  Markdown, `notes` gardé et relu si `content` est vide). PDF B201 : notes + synthèse + transports. **Fournisseurs** :
  lignes desservies choisies en masse dans `rail_lines` (plus de saisie libre, anciennes valeurs « hors référentiel »).
  **Missions PMR / Groupes** : `ScrollTable` (défilement dans le cadre, Train et Copier collants, colonnes secondaires
  masquées par requête de conteneur) et **repère « maintenant »** (ligne, passées estompées, prochaine, mini-frise,
  « Aller à maintenant »). 615 contrôles de règles.

- 2026-10-15 — **B201 : notes par district** (décisions de l'utilisateur) : une fiche de notes par jour ET par district
  (`b201_notes`, DSO / DSE / DCE, `1760004840`), chacune avec ses versions, son auteur et son verrou optimiste ; à
  l'ouverture, les districts du jour ; plusieurs districts = éditeurs l'un sous l'autre en desktop, onglets en mobile.
  Notes d'avant (une fiche par jour, sans district) : **non recopiées**, affichées une fois en lecture seule sous « Notes
  communes (avant le 15 oct.) » (aussi en tête du PDF) ; `b201_reports.content` figé par les règles. « Copier » et
  « Épingler au Journal » : la synthèse de la relève seule, sans les notes. PDF : une section par district demandé.
  Retour arrière testé (notes reversées dans `b201_reports.content` sous « ### Notes DSO »…). 661 contrôles de règles.
- 2026-10-15 — **Refonte du design v4, lots 0 à 2** (`docs/design/REFONTE-DESIGN-V4.md` ; décision de l'utilisateur : « Signal,
  défauts » + les trois directions). Captures « avant » / « après » hors dépôt (scratchpad `design-v4/`). Jetons : `jour` /
  `nuit` deviennent **Signal** (identifiants gardés), 4 thèmes **Quai** (IBM Plex) et **Cabine** (Inter Tight + JetBrains Mono,
  sans préchargement, compact 32 px en desktop), un « Automatique » par direction (`auto`, `quai-auto`, `cabine-auto`),
  `surface-3` (dérivé pour les 11 « Autres thèmes », couleurs inchangées), ombres repos / flottante (aucune pour « angle »),
  forme `net` 8 / 6 px, `rounded-pill`, `text-kpi` / `text-panel`, chiffres des compteurs sans mono. Composants de base :
  cartes, `StatStrip` / `Stat` (accueil), tableaux, badges en pilule, puces, champs 38 px à halo de focus, `EmptyState` compact,
  `TrainChip` dans `components/ui`, `/design`. Trois couleurs ajustées pour l'AA (Quai Jour `warn`, Cabine Jour `warn`, Cabine
  Nuit `border-strong`). Restent : shell (lot 3), écrans (4 à 6).

- 2026-10-15 — **Retours sur les lots 0-2 de la refonte** : sélecteur à boutons en relief neutre gardé ; **boutons alignés sur les champs (38 px**, Cabine 34 px) ; pas de bouton « Reprendre dans <district> » sur les notes communes de la B201.
- 2026-10-15 — **Refonte v4, lot 3 « Shell »** (trois directions ; « Autres thèmes » inchangés : surface, capitales mono, chanfreins).
  Barre latérale : sections *Travail* / *Référence* (`NavModule.section`), actif = carte `--nav-on` + trait de 3 px, compteurs
  teintés (warn / danger / info), carte « État des flux » collante en pied (temps réel, DICOS, **iRail** : état mesuré sur les
  appels réels du serveur, `irailHealth()`, aucune requête de plus). Jetons de thème `--nav-bg|on|card|rule|card-shadow`
  (`ThemeStyle.nav*`, utilitaires `bg-nav`, `bg-nav-on`, `bg-nav-card`, `border-nav-rule`). Barre du haut : recherche élargie
  (≥ 1280 px) qui ouvre ⌘K, icônes nues 34 px (44 au tactile), avatar seul (**nom et rôle retirés**, décision de l'utilisateur),
  compteur par onglet (`NavTab.count`). Compteurs dessinés en CSS (`content: attr(data-count)`) et annoncés par
  `aria-describedby` : le texte et le nom des liens ne changent pas (E2E intacts). `fitTabs` déplacé dans `module-tabs-fit.ts`
  (le test importait sinon une Server Action « server-only »). Restent : écrans (lot 4, en parallèle), mouvement (5), reste (6).
- 2026-10-15 — **Refonte v4, lot 5 « Mouvement et performance »** (agent, en parallèle du lot 4). `lib/motion-core.ts` **sans
  GSAP** : arrivée de page en CSS (`.motion-enter`, fondu + 6 px, 320 ms, `--ease-out`, cascade 4 × 40 ms, jamais au premier
  affichage ni sur un filtre, rien en mouvement réduit), trait d'onglet, `highlight`, `ghostFlip` (plus d'animation de
  `left` / `width` / `height`), compteurs, frise « Ma journée », écran commun et intro de connexion en CSS / Web Animations ;
  emblèmes du pied de page : GSAP par `import()`. **GSAP (≈ 40 Ko compressés) sort du bundle de toutes les pages sauf**
  Accueil, Missions PMR, Groupes, Historique et Clients PMR, qui l'importent encore par `app/(app)/dashboard.tsx`
  (`useStaggerIn` depuis `@/lib/motion`) et `components/pmr/day-progress.tsx` (zone du lot 4 : à basculer). Mesures
  Playwright (`npm run start:standalone`, médiane de 5) : JS initial bon bus 359 → 322 Ko, connexion 209 → 171 Ko ; CLS
  mobile Ressources › Lignes 0,141 → 0, Horaires 0,061 → 0, Journal 0,052 → 0,007, Ma journée 0,044 → 0,001, connexion
  0,025 → 0 (largeur des listes personnalisées fixée, libellé « En direct » réservé, bouton passkey rendu par le serveur,
  hauteur du fil du Journal par défaut, ligne DICOS de la barre latérale posée d'après le droit). Gares : rendu progressif
  (150 + « Afficher 150 de plus ») ; Historique PMR paginé par 200 (`listAssists({ page })`). Champs : plus de transition de
  `box-shadow`. **`loading.tsx` essayé puis retiré** (LCP plus tardif au chargement complet, 404 → 200, contenu un instant en
  double pour les E2E stricts). Trouvé, non corrigé (préexistant) : la recherche pendant la frappe de Réseau › Gares
  recharge la page entière (RSC 200 puis navigation document).

- 2026-10-15 — **Retours sur le lot 3** : pas de compteur sur l'Accueil dans la barre latérale ; **pastille « Flux » sur le rail** (768-1279 px : une pastille par source, détail en infobulle et pour les lecteurs d'écran, `feed-rail`).
- 2026-10-15 — **Refonte v4, lot 4 « Écrans clés »** (réponses par défaut validées) : **Accueil** (date + service du jour,
  file « À traiter » groupée Urgent / À faire aujourd'hui / Pour information, logique pure `todoItems` / `groupTodo` /
  `primaryTodo` testée, une action nommée par ligne et une seule primaire, colonne droite ≥ 1280 px « Fin de service » +
  « Prochaines prises en charge », widgets gardés dessous) ; **Missions PMR / Groupes / Historique** (barre d'outils sur une
  ligne : `SegmentedNav` période, `DistrictMenu`, recherche, `CollapsibleFilters always` « Filtres (n) », ALEA à droite ;
  `StationCell` : sens dans la cellule de gare) ; **bons bus / taxi** (rail d'étapes `OrderSteps` ≥ 1280 px,
  `lib/orders/steps.ts` testé, aperçu en billet `OrderTicket`, compact en tête en mobile, barre d'actions flottante +
  `scroll-padding-bottom`) ; `EmptyState framed`. Aucune logique métier changée. Captures hors dépôt (`design-v4/lot4/`).
- 2026-10-15 — **Campagne du jour J** (demande : « campagne mail pour le basculement de BACO vers CSM, à envoyer le jour J, jolie,
  principales nouveautés ») : modèle « Basculement BACO → CSM (jour J) » par défaut dans Administration › Campagnes (accroche,
  ce qui ne change pas, bouton, 6 cartes de nouveautés tirées du CHANGELOG, 3 étapes de première connexion, aide /changelog,
  contact « un administrateur CSM », signé « L'équipe CSM »), ancienne annonce gardée au choix. Rendu `lib/mail/campaign.ts`
  étendu de blocs `::: bandeau / bouton / cartes / etapes / encadre` (tableaux, styles en ligne, colonnes hybrides + tableau
  fantôme Outlook, mode sombre par `prefers-color-scheme`, couleurs Signal · Jour) ; anciennes campagnes rendues comme avant
  (couleurs pétrole au lieu d'ambre). Aucun e-mail envoyé. Date du jour J non citée (le texte dit « aujourd'hui »).
- 2026-10-15 — **Refonte v4, lot 6 « Reste des écrans »** (agent, en parallèle du lot 5 mouvement / perf) : Journal, Ma
  journée, B201, Réseau (trains en direct, horaires, lignes avec PN, gares, PtCar, EBP, carte PN : panneaux et barre
  seulement), Ressources, Commandes (Suivi, listes, Archives, Fournisseurs), PMR (Clients, Matériel), **Statistiques**
  (barres info / progress, axes fg-subtle, ligne de base + repères, StatStrip, tableau gardé), Administration, profil,
  extension, Nouveautés, /tv, erreurs. Barre d'outils de liste commune (`components/ui/list-toolbar.tsx` : `TOOLBAR`,
  `ToolbarSearch`, `ListStatus`, `ListCount`), `CardDisclosure`, `SegmentedNav` `count` / `scroll`, `EmptyState framed`,
  chiffres en `figures` / `tabular`, `shadow-float`, aucun rayon ni couleur en dur (erreur racine : jetons avec repli
  Signal · Nuit). Vues en `SegmentedNav` (plus de bouton accent pour naviguer). Aucune logique métier changée ; E2E motion
  adapté au menu des districts de Collègues. Captures hors dépôt (`design-v4/lot6/`).

- 2026-10-15 — **Retours lot 4 et campagne** : « Masquer les annulées » remis visible dans la barre d'outils PMR / Groupes (hors « Filtres ») ; boutons ALEA en libellé court en mobile (« ALEA », « ALEA + groupes », nom accessible complet) ; campagne du jour J **sans date**, signée **« Nicolas & Thomas »**, et annonçant que **BACO est fermé à partir du jour J** (plus de saisie, données dans CSM).

- 2026-10-15 — **Refonte v4 terminée (lots 0 à 6)** ; retours sur le lot 6 : en mobile, « En direct » du Suivi (`LiveRefresh compact`) et « Export CSV » des Statistiques en icône seule (libellé pour les lecteurs d'écran) ; n° de train de l'export ALEA en `TrainChip` ; `e2e/auth.spec.ts` suit `E2E_BASE_URL`.

- 2026-10-15 — **Districts du jour posés d'office d'après Quinyx** (retour : « la détection ne fonctionne pas, ça doit activer le district selon la prestation par défaut » ; ex. PACO_N OCC MONS → Sud-Ouest dès 22:00, PACO_AM OCC SE → Sud-Est dès 6:00). Deux causes : la prestation n'était qu'une **proposition** dans la fenêtre de choix, et seul un rattachement Quinyx **validé** par l'admin comptait. Désormais `getCurrentUser` applique, si l'agent n'a rien choisi aujourd'hui, le district de la prestation en cours / prochaine du jour / dernière du jour (`pickDutyShift`, nuit de la veille comprise), **à la requête seulement** (rien écrit en base : tout ce qui lit les districts du jour suit, un choix de l'agent reste prioritaire) ; rattachement validé **ou proposé** (`user_suggested`, nom identique et unique, tant que l'admin n'a rien validé). Puce « d'après Quinyx » (`data-auto`). Limite : les tâches PocketBase qui lisent `users.duty_districts` (alerte de synchro DICOS) ne voient pas ce district.

- 2026-10-15 — **Planificateur de tâches PMR, cadrage** (demande : remplacer les classeurs Excel « planificateur de tâches » DSO / DSE, agents de gare SPI / OPI / CPI / PA / B-CS lus dans Quinyx, prises en charge DICOS réparties à la main ou automatiquement, vues jour / semaine / mois, glisser-déposer). Rétro-ingénierie des deux classeurs (formules, VBA lu sans exécution) : fenêtres PMR vérifiées sur 1 659 tâches (light T−15→T+5 IN / T−5→T+15 OUT, fauteuil ±10 de plus), correspondance < 30 min, matrice de trajets par base, guichets B-CS (3 PMR light / h), aucune vérification automatique dans Excel. Règles sans donnée personnelle dans `docs/design/REGLES-PLANIFICATEUR-PMR.md` ; classeurs, noms et identifiants des plannings Quinyx **hors dépôt**. Proposition : Quinyx étendu aux groupes « gares » (revient sur « seulement l'équipe CSM » : accord + DPO), `planner_*`, moteur pur `lib/planner/`, PMR › Planificateur, lots P0-P4. Ébauche publiée en artefact privé (données fictives). En attente de validation et des réponses (codes Quinyx des postes, couverture, B-CS, chevauchements).
- 2026-10-15 — **Audit sécurité + revue adversariale du planificateur : corrigés** gare de la saisie ALEA validée contre le référentiel (nom de voyageur écarté, « gare inconnue » sinon, contrôle serveur), plafonds et auteur (`synced_by`) des dossiers en attente, « Modifiée par DICOS » (`dicos_changed`), agent de gare seul, jour J-2 → J+60, connecteur privé des tâches manuelles et des notes (`1760004910`) ; attribution automatique et glisser-déposer cumulés (plus de « Occupé » après coup), guichet B-CS de la gare de la tâche, attributions revérifiées par le serveur, nuit qui déborde (jours voisins chargés, compteurs par jour, « NUIT » = lendemain, axe à l'heure de Bruxelles), bouts disparus de DICOS annulés, taxi saisi attribué et jamais n° de train, « faite » jamais désattribuée, extension 1.9.1 (voyageurs comptés une fois). 746 contrôles de règles.
- 2026-10-15 — **Planificateur de tâches PMR, lot P0 (socle de données)** (P0 + P1 validés). Droits `planner:read` / `planner:write` (PACO/RCCA et au-dessus, seuls planificateurs) et `planner:manage` (admin / sysop : référentiels, suppression d'une tâche DICOS). Migration `1760004900` : Quinyx « gares » (`purpose`, `post`, `base`), référentiels pré-remplis depuis les classeurs (10 bases avec trajets et couvertures, 30 guichets B-CS aux fins d'horaire corrigées ; modèles techniques laissés vides, à vérifier), `planner_tasks` (champs DICOS réservés au compte de service, auteurs posés par hook, purge 90 j). Quinyx : un groupe « Gares » garde les prestations CPI / SPI / OPI / PA / EXTRA de **tous** ses agents (décision de l'utilisateur, note DPO §2-3-5) avec poste et gare de base. DICOS : l'extension 1.9.0 lit les dossiers « à vérifier » (jamais le client) → `POST /api/pmr/pending/ingest` → une tâche par bout assisté (début = fin = heure du train, fenêtre calculée à l'affichage) ; à l'arrivée de la mission acceptée, la tâche est reliée (`dicos_mission`) sans toucher à l'attribution ; annulation = tâche annulée, agent gardé. `plannerDay` + actions (verrou optimiste) pour l'écran du lot P1 ; onglet PMR › Planificateur minimal. 714 contrôles de règles (sans le secret interne). Le moteur pur (`lib/planner/`, fenêtres, contrôles, parseur, auto-attribution) est écrit en parallèle par un autre agent.


- 2026-10-15 — **Planificateur, écran vue Jour (lot P1)** : `/pmr/planificateur` = Gantt des agents de gare (base puis poste,
  hors service hachuré, libres, trajets de `agentTimeline`), guichets B-CS (capacité « n/3 » par heure), taxi et chef de bord ;
  colonne « À attribuer » (source, zone, gare) ; glisser-déposer en pointer events (poignée au doigt), lignes éclairées /
  grisées par `checkAssign`, refus expliqué, agent occupé → `suggestAgents` ; attribution optimiste + « Annuler », tâches
  liées ensemble ; panneau (`?tache=`, dossier, trajet, contrôles) ; ajout ALEA / tâche libre (seuls les champs analysés
  partent) ; doublon saisie ↔ DICOS (`resolveDuplicate`) ; « Attribuer automatiquement » (aperçu, `assignTasks` groupé, sans
  solution → taxi / chef de bord) ; SSE `planner_tasks` ; mobile : agenda + « Attribuer à… » en feuille du bas. Adaptateur
  unique `lib/planner/adapt.ts`, logique d'écran `lib/planner/board.ts` (testés). Semaine / Mois affichés « bientôt » (P3).
- 2026-10-15 — **Planificateur : missions DICOS et annulations** (demande de l'utilisateur) : en plus des dossiers en attente, les **missions DICOS nouvellement créées** arrivent dans « À attribuer » (reprise de fond `server/planner-scheduler.ts`, toutes les 5 min, J-1 → J+2, compte de service), et une mission / un dossier **annulé se retire seul du planificateur** (tâche `annulee` masquée partout ; fiche gardée en base avec son agent, réapparaît si DICOS la rétablit). Revient sur « annulée barrée, agent gardé » de l'audit.

- 2026-10-22 — **Export ALEA : choix du jour et synchro depuis CSM** (demande de l'utilisateur : « pouvoir choisir la date
  voulue, scraper les missions du jour choisi via l'extension ») : sélecteur de jour dans la fenêtre ALEA (Missions PMR, commun,
  Groupes), blocs d'un autre jour lus par `aleaDay` ; bouton « Synchroniser ce jour » → extension **1.10.0** (`csm-link.js` sur
  toutes les pages CSM, commande `dicos-sync` du service worker : origine = URL CSM enregistrée, onglet DICOS ouvert, résumé
  chiffré seulement vers la page). Logique du service worker vérifiée avec un `chrome` simulé ; E2E `alea-jour` (desktop + mobile).
- 2026-10-22 — **Barre latérale et pied de page qui remontaient sur Missions PMR** (retour de l'utilisateur, capture) : `sr-only`
  des badges IN / OUT « validé » en position absolue hors du cadre de `ScrollTable` (zone de défilement non positionnée) →
  page de ~1 800 px de trop. `relative` sur la zone de défilement de `ScrollTable` et sur les autres listes à défilement
  interne de page ; E2E de non-régression (échoue sans le correctif).
- 2026-10-22 — **Missions PMR / Groupes sans défilement horizontal** (retour : « il faut tout voir d'un coup d'œil ») : colonnes
  de gare bornées (`max-w-72`), nom qui passe à la ligne (heure et puces IN / OUT gardées sur la ligne), badges de statut
  empilés, `AbsentBadge compact` (« Hors DICOS »). E2E `layout-scroll` : aucun débordement horizontal du tableau à 1 440 px
  (gares longues, missions « Hors DICOS » simulées par une synchro complète plus récente).
- 2026-10-22 — **Repère « maintenant » : le bout OUT compte** (retour : train 4569 IN Bierges-Walibi 19:13 → OUT Charleroi-Central
  20:09, l'arrivée n'apparaissait jamais comme à venir ; « sans afficher tout deux fois ») : toujours une ligne par trajet ;
  la prochaine prise en charge compare départs et arrivées (« Prochaine » sur la gare d'arrivée si c'est elle), trajet parti
  mais pas arrivé non grisé (départ seul estompé), « Débarquement à venir » sous la ligne « maintenant » pour les arrivées des
  trajets placés au-dessus (clic = retour au trajet). Badge OUT des cartes mobiles qui passait sous « Copier » corrigé.
- 2026-10-23 — **Services Quinyx non pourvus** (demande : « lister tous les services non alignés PACO / RCCA AM / PM / NUIT pour
  OCC Mons et OCC Namur, route API, export PDF / Excel, filtres zone / mois / année / RCCA ou PACO, vue par défaut pour les
  admins / sysop » ; « non aligné » = **non pourvu**, réponse de l'utilisateur) : extension **1.11.0** (services PACO / RCCA publiés
  sans agent, champ `open` du lot, aucun nom), collection `quinyx_open_shifts` (`1760005000`, aucune donnée personnelle,
  gardée 2 ans), clé **`quinyx_open:read`** (admin / sysop par défaut, accordable), page **Ressources › Planning › Non pourvus**,
  route `GET /api/equipe/quinyx/non-pourvus` (`format=json|csv|xlsx|pdf`) ; Excel écrit sans dépendance (`lib/xlsx.ts`).
  Un service pourvu / supprimé est retiré à la synchro complète suivante (pas de plafond : rien de personnel).
- 2026-10-22 — **Lot du 15 au 22 oct. poussé en production** (accord de l'utilisateur : « ok prod ») : `csm-prod` = 1d8b277
  (139 commits depuis 7681554, 14 migrations : rôles v3, navigation v3, refonte v4, B201 par district, PN / zones SPI,
  planificateur PMR, ALEA par jour, correctifs de mise en page). Sauvegarde PocketBase de la prod faite juste avant (R2, tâches
  Coolify exécutées une fois : **commande limitée à 255 caractères** → jeton dans un fichier temporaire supprimé aussitôt).
  Déploiements terminés, santé 200 ; `perms-check` : 30 comptes, 0 écart (2 retraits voulus par dépendance).
---

## Annexe — BACO / v1 SvelteKit (référence gelée)

SvelteKit 2 + Svelte 5 + Supabase (projet `mgljaheyimizrydazrxh`), déployé par Vercel depuis `main` ; code de référence
sur la branche `ccr-5dca0da8-4yg4i6` (et `main`). Retiré du dépôt CSM le 11 oct. 2026 ; fermeture de BACO prévue avec
la transition officielle (campagne d'e-mail).
