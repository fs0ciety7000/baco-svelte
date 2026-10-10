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
3. `docs/DESIGN-DIRECTION.md` + `docs/references/*.jpg` — direction « Tactical premium ».
4. `docs/SAUVEGARDE-SUPABASE.md` — sauvegarde de la base BACO et procédure de restauration.
5. `docs/AUDIT.md`, `docs/PROPOSITION.md` §3-6 — audit, parcours métier, nouveautés.

**BACO (`main`, Vercel, base Supabase) : on n'y touche pas.** Supabase en **lecture seule**.
Nouveau code dans `/web` (Next.js) et `/pocketbase` ; le SvelteKit à la racine est la **référence métier
gelée** (v1, branche `ccr-5dca0da8-4yg4i6`) : ne pas le modifier.

---

## 1. État du projet (v2)

| # | Étape | Statut |
|---|---|---|
| 0 | Sauvegarde Supabase complète | ✅ 8 oct. (restauration testée, archive `age` remise à l'utilisateur). Session 2 : sauvegarde relancée (GET seuls) + 29 empreintes bcrypt exportées dans `/home/user/csm-backup` |
| 1 | Prototype PocketBase vs Supabase + squelette Next | ✅ 8 oct. — `pocketbase/` : migrations, audit, import (29 comptes + empreintes, 295 BC bus), 24 contrôles de règles OK, sauvegarde/restauration OK ; `web/` : Next 15.5, connexion cookie httpOnly, `/commandes`, relais SSE, 6 E2E OK (1440 + 390). recommandation `docs/BACKEND-DECISION.md` validée |
| 2 | Design system + page `/design` (5 thèmes, GSAP) | ✅ 8 oct. — jetons + test AA (156 contrôles), 19 composants, `/design`, 17 E2E ; captures et écarts **validés** |
| 3 | Shell (6 entrées, onglets, ⌘K, mobile 4 + Plus) + tableau de bord | ✅ 8 oct. — 24 E2E, CSP, gardes par page, captures validées |
| 4 | Données : schéma PocketBase, règles d'accès, import | 🔄 données BACO du 8 oct. importées sur l'instance de test (5 collections) ; migration réelle **en une fois à la bascule** |
| 5 | Modules : Commandes → PMR → Opérations → Référentiels → Équipe → Admin | 🔄 **Commandes** livré en session 3 (schéma + 66 contrôles de règles, bus, taxi, envoi `.eml` + PDF, suivi, B201, E2E) : **validé le 8 oct.** ; **PMR validé le 8 oct.** (schéma + 105 contrôles de règles, prestations, collage DICOS, clients, matériel, E2E) ; **Opérations validé le 8 oct.** (trains en direct iRail, Journal (ex-main courante), carte PN, statistiques, cloche ; 149 contrôles de règles, 46 E2E) ; **DICOS / Missions PMR validé** (extension + ingestion, lecture seule, trajet/IN-OUT/district/copier) ; **Annuaire et données (ex-Référentiels) livré** (annuaire, lignes, PtCar, EBP, procédures + documents ; 7 collections ; 173 contrôles de règles ; audit + revue passés ; données v1 importées sur l'instance de test) ; **Équipe et Admin livrés, à valider** (+ vue admin des appareils connectés, 9 oct.) |
| 6 | Déploiement Coolify : `web` + `pocketbase` (volume, sauvegardes), CI | ✅ 8 oct. (R2 prêt le 9 oct., variables à poser) — https://test-csm.fs0ciety.org en ligne ; projet Coolify **CSM** créé par l'API (`csm-web`, `csm-pocketbase`, volume + sauvegardes 2 h / 2 h 30), CI `csm-v2.yml` — `docs/DEPLOIEMENT-V2.md` |
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
pocketbase serve --http 127.0.0.1:8090 $P
node scripts/test-rules.mjs            # PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD
# v2 — web (détails : web/CLAUDE.md)
cd web && npm install && npm run dev
# Sauvegarde Supabase (lecture seule) : voir docs/SAUVEGARDE-SUPABASE.md
node scripts/supabase-backup.mjs /home/user/csm-backup
```

## 4. Règles de travail (workflow Claude)

1. **Branche** : travailler sur la branche de session indiquée, commits atomiques, messages
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


## 5. Conventions de code

> Les conventions ci-dessous sont celles de la v1 SvelteKit. Les conventions v2 (React/Next) sont dans
> **`web/CLAUDE.md`** et **`pocketbase/CLAUDE.md`** ; les principes restent : accès données côté serveur
> uniquement, couleurs par jetons sémantiques, navigation à source unique, imports lourds dynamiques,
> pas de WebSocket navigateur, `prefers-reduced-motion` respecté.


- Svelte 5 **runes uniquement** (`$state`, `$derived`, `$props`, `onclick`), pas de `$:` ni `export let`.
- Accès données **uniquement** via `src/lib/server/**` (load / form actions) ou `src/lib/services/**`
  — jamais `supabase.from()` dans un composant de page.
- Tout HTML rendu via `{@html}` passe par `sanitize()` (DOMPurify). Aucune exception.
- Les droits se vérifient **côté serveur et en RLS** ; le masquage UI n'est que du confort.
- Couleurs : utilitaires sémantiques (`bg-canvas`, `bg-surface`, `bg-surface-2`, `border-line`, `text-fg`,
  `text-muted`, `text-subtle`, `bg-accent`/`text-accent-fg`, `text-ok|warn|danger|info`) — jamais de hex en dur.
  La palette Tailwind historique (`gray`, `blue`, `white`…) est **remappée sur le thème** dans `app.css` pour
  que les anciennes pages suivent les 5 thèmes : ne pas l'utiliser dans le nouveau code.
- Thèmes : `<html data-theme="nocturne|ivoire|rail|contraste|tactique" data-scheme data-density>` ;
  store `$lib/stores/theme.js` ; script anti-flash dans `app.html` (nonce CSP).
- Motion : jetons `--d-*` / `--ease-*`, popovers via `.csm-pop` (data-state), transitions de page = View
  Transitions ; aucune boucle infinie sauf `.live-dot` ; `prefers-reduced-motion` respecté globalement.
- Navigation : **une seule source** `src/lib/navigation.js` (sidebar, ⌘K, onglets mobiles, raccourcis).
- Imports lourds (jspdf, exceljs, gridstack, maplibre, chart.js) en `await import()`.
- Polling : utiliser `src/lib/utils/poller.js` (pause onglet caché) ou le flux SSE serveur (`/api/events`). **Jamais** de client Supabase Realtime/WebSocket côté navigateur : bloqué par le pare-feu de l’entreprise.

## 6. Contraintes métier / infra (non négociables)

- **Réseau entreprise** : WebSocket (et probablement HTTPS) vers `*.supabase.co` bloqués, l'IT n'ouvrira rien.
  → Le navigateur ne parle **qu'au domaine CSM** (`test-csm.fs0ciety.org` en test) ; données via le serveur Next,
  temps réel via SSE relayé par le serveur. PocketBase n'est jamais appelé directement par le navigateur.
- **E-mail** : pas de jeton Outlook/Graph ; l'envoi est **manuel** depuis la **boîte fonctionnelle**.
  → Générer un brouillon `.eml` (`X-Unsent: 1`) avec le PDF joint, jamais d'envoi SMTP automatique.
- **Coexistence** : BACO (Vercel, branche `main`) reste en production sur Supabase jusqu'à la **date de bascule**.
  CSM v2 tourne sur sa propre base PocketBase, alimentée par import ; la migration réelle se fait **en une fois**
  à la bascule (gel de BACO, export, import, vérification). Aucune écriture dans Supabase d'ici là.
- Gamification (classement, badges, likes, jauge de confiance, fléchettes, Konami) : **supprimée** (validé).
- **Mobile obligatoire** : toute page doit être utilisable à 360 px de large (pas de scroll horizontal de page,
  cibles tactiles ≥ 44 px, champs ≥ 16 px, safe-areas). Shell : tiroir + barre d'onglets en bas (< md).
  Vérifier chaque écran en 390×844 (Playwright) avant de livrer.

## 7. Pièges connus

- (v2) `PREPROD_PB_URL` n'est pas l'instance CSM (voir §2).
- (v2) Dans l'environnement cloud, `fetch` de Node ignore le proxy sortant : lancer les scripts avec
  `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`. Un domaine absent de « Network access »
  renvoie un 403 du proxy (`curl -sS "$HTTPS_PROXY/__agentproxy/status"`).
- (v2) PocketBase : le champ `autodate` `created` est forcé à l'enregistrement → l'import rétablit la date
  d'origine par SQL. Les empreintes bcrypt s'écrivent aussi par SQL (`setPassword` rehacherait).
- (v2) PocketBase : un champ JSON `null` dans une règle (`denies !~ …`) vaut faux en SQL → hook de normalisation
  (`pocketbase/pb_hooks/users.pb.js`). Trouvé par l'E2E, pas par le test des règles : tester aussi des comptes
  créés « à nu ».
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
- (v1) `.gitignore` liste `vite.config.js` et `src/lib/supabase.js` alors qu'ils sont suivis : les modifs
  passent quand même (fichiers déjà trackés) mais un nouveau clone sans eux casserait — à nettoyer.
- `hooks.server.js` exclut `/api*` du « gate » ; le gate lui-même est un cookie base64 non signé.
- Rôles en base : `admin`, `sysop`, `moderator`, `otto_agent`, `user` (table `profiles.role`),
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
- (v2) PocketBase : un champ nombre vide vaut 0 → index uniques partiels en `WHERE legacy_id > 0` (voir `pocketbase/CLAUDE.md`).
- (v2) **Paramètre d'URL d'un panneau** (`?entree=`, `?train=`, `?pn=`) : le synchroniser par `window.history.replaceState`
  (même chemin), jamais par `router.replace` : ce dernier relance le rendu serveur pendant la Server Action qui charge
  le panneau, et le panneau restait vide (trouvé par l'E2E). Un `useEffect` sur le paramètre gère les liens de la cloche
  vers la page déjà ouverte.
- (v2) Le relais iRail et les tuiles passent par `fetch` de Node : dans l'environnement cloud, lancer le serveur avec
  `NODE_USE_ENV_PROXY=1` ; les serveurs de tuiles sont bloqués ici → E2E et captures avec `web/e2e/mock-services.mjs`.
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
  écrans 1440 + 390, création / désactivation / réactivation). Laissé : mentions de district ouvertes à tout agent qui écrit.
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

---

## Annexe — stack v1 SvelteKit (référence gelée)


- SvelteKit 2 + **Svelte 5 runes**, Tailwind CSS 4, JavaScript + JSDoc (TypeScript progressif)
- Supabase (projet `mgljaheyimizrydazrxh`) — **même base que BACO** (Vercel, branche `main`)
- Session Supabase en **cookie `csm-auth`** ; navigateur → `/api-proxy/*` (liste blanche) ; login par form action
- Gardes de route serveur : `src/lib/server/guards.js` + `hooks.server.js` + `+layout.server.js` (relancé à chaque navigation)
- UI : `bits-ui` (primitives accessibles), `lucide-svelte`, polices `@fontsource-variable` (Inter, Space Grotesk, JetBrains Mono)
- Exports : `exceljs` (`$lib/utils/excel.js`), `jspdf` ; HTML : `$lib/utils/sanitize.js`
- Déploiement : Docker (adapter-node) sur Coolify, `csm.fs0ciety.org` — voir `docs/DEPLOIEMENT.md`

### Commandes v1

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # IS_COOLIFY=true pour adapter-node
npm run test:run     # vitest
npm run lint         # prettier --check
```
