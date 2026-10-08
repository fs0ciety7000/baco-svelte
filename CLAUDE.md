# CLAUDE.md — CSM (Client Solutions Management Tool)

> Ex-**BACO**. Outil métier ferroviaire (SNCB) de l'équipe PACO → **Client Solutions** :
> commandes de bus / taxis de remplacement, assistance PMR, contenu des lignes, EBP,
> répertoire, départs/arrivées (iRail), planning, journal, Otto, stats, admin.
> Utilisé **toute la journée** par des opérateurs : chaque clic compte, la fiabilité prime sur l'effet.

Ce fichier est maintenu par Claude. **Mets-le à jour à chaque décision, convention ou piège nouveau**
(état §1, journal §8), ainsi que les autres fichiers d'instructions (voir §4.8). Un fichier d'instructions
périmé est un bug.

## 0. À lire d'abord (v2)

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
| 1 | Prototype PocketBase vs Supabase + squelette Next | ⏳ session 2 — **PocketBase retenu par l'utilisateur**, prototype = chiffrage + validation de l'import des comptes |
| 2 | Design system + page `/design` (5 thèmes, GSAP) | ⏳ plan validé — captures à faire valider |
| 3 | Shell (6 entrées, onglets, ⌘K, mobile 4 + Plus) + tableau de bord | ⏳ plan validé — captures à faire valider |
| 4 | Données : schéma PocketBase, règles d'accès, import | ⏳ migration **en une fois à une date de bascule** (pas de synchro BACO ↔ CSM) |
| 5 | Modules : Commandes → PMR → Opérations → Référentiels → Équipe → Admin | ⏳ |
| 6 | Déploiement Coolify : `web` + `pocketbase` (volume, sauvegardes), CI | ⏳ `test-csm.fs0ciety.org` |
| — | Hotfix sécurité BACO (`supabase/migrations/20261008120000_security_hotfix.sql`) | ⏳ **non appliqué**, accord explicite requis — le rappeler |

**Ne pas commencer une étape sans validation de l'utilisateur.** Les captures desktop (1440×900) et
mobile (390×844) sont soumises avant de généraliser un design.

## 2. Stack v2

| Couche | Choix |
|---|---|
| Web | Next.js 15+ App Router, `output: 'standalone'`, TypeScript strict |
| UI | Tailwind v4 + shadcn/ui (Radix) personnalisé, lucide-react, cmdk, Vaul, Sonner |
| Motion | GSAP 3 + `@gsap/react` (`useGSAP`, `gsap.matchMedia()` + `prefers-reduced-motion`) |
| Données client | TanStack Query + TanStack Table ; formulaires react-hook-form + zod |
| Backend | **PocketBase** auto-hébergé (Coolify), SDK `pocketbase` **côté serveur Next uniquement** |
| Auth | Auth PocketBase, jeton en cookie httpOnly posé par Next ; le navigateur ne parle qu'au domaine CSM |
| Temps réel | SSE PocketBase relayé par Next (`/api/events`), jamais de WebSocket |
| Tests | Vitest + Testing Library ; Playwright (dont 390×844 sur chaque écran) |
| Déploiement | Docker sur Coolify : `csm-web` (`/web`) + `csm-pocketbase` (volume `/pb_data`, sauvegardes) — `docs/DEPLOIEMENT-V2.md` |

### Environnement cloud (noms de variables, jamais les valeurs)

Environnement dédié **CSM** : configuration de référence dans `docs/ENVIRONNEMENT-CLOUD.md` (à tenir à jour).
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (clé de service, lecture seule par discipline), `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWKS_URL`
- `CSM_TEST_ADMIN_EMAIL`, `CSM_TEST_ADMIN_PASSWORD` — compte admin BACO/CSM de test
- `PREPROD_PB_URL`, `PREPROD_PB_ADMIN_*`, `PREPROD_KEEP_EMAILS` — **PocketBase de test.fs0ciety.org (jeu
  Cosmic Empires), PAS une instance CSM : n'y rien écrire**
- Sortie réseau : HTTPS uniquement (pas de TCP 5432 → pas de `pg_dump`). Le connecteur Supabase (MCP) exécute
  du SQL en rôle `postgres` : **SELECT uniquement**.
- Les variables modifiées ne sont lues qu'au démarrage d'une session. Ne jamais utiliser une clé collée
  dans la conversation (bloqué par le garde-fou, et la clé doit alors être tournée).

## 3. Commandes

```bash
# v2 (à compléter dès que /web et /pocketbase existent)
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

> Les conventions ci-dessous sont celles de la v1 SvelteKit. Les conventions v2 (React/Next) sont à écrire
> dans `web/CLAUDE.md` dès la création du squelette ; les principes restent : accès données côté serveur
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
