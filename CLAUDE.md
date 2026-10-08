# CLAUDE.md — CSM (Client Solutions Management Tool)

> Ex-**BACO**. Outil métier ferroviaire (SNCB) de l'équipe PACO → **Client Solutions** :
> commandes de bus / taxis de remplacement, assistance PMR, contenu des lignes, EBP,
> répertoire, départs/arrivées (iRail), planning, journal, Otto, stats, admin.
> Utilisé **toute la journée** par des opérateurs : chaque clic compte, la fiabilité prime sur l'effet.

Ce fichier est maintenu par Claude. **Mets-le à jour** dès qu'une décision, une convention
ou un piège nouveau apparaît (section « Journal des décisions » en bas).

> ## ⚠️ PIVOT (8 oct. 2026) — lire d'abord `docs/CSM-V2.md`
> La v1 SvelteKit (cette branche, `ccr-5dca0da8-4yg4i6`) est **gelée comme référence**.
> La suite se fait en **Next.js + React + TypeScript** (± **PocketBase**) dans `/web` (et `/pocketbase`)
> sur une **nouvelle branche**, déployée sur **test-csm.fs0ciety.org**.
> **BACO (`main`, Vercel, base Supabase) : on n'y touche pas** — Supabase en lecture seule, sauvegarde d'abord.
> Les sections ci-dessous décrivant la stack SvelteKit concernent la v1 ; les **contraintes (§6)**,
> le **workflow (§4)** et le **journal (§8)** restent valables pour la v2.

---

## 1. État du projet

| Phase | Statut |
|---|---|
| 0. Audit (sécurité, UX, design, perf) | ✅ `docs/AUDIT.md` |
| 1. Proposition stack / design / roadmap | ✅ validée (`docs/PROPOSITION.md`) |
| 0bis. Hotfix sécurité base | ✅ migration écrite + testée hors ligne (`supabase/migrations/20261008120000_security_hotfix.sql`) — **⏳ à appliquer par l'utilisateur** |
| 0ter. XSS (DOMPurify) | ✅ commit isolé, à reporter sur `main` (BACO) |
| 2. Socle : session cookie, gardes serveur, proxy verrouillé, Docker, CI, nettoyage | ✅ |
| 3. Design system + shell (5 thèmes, sidebar, topbar, ⌘K, mobile) | ✅ shell ; modules encore en style historique (remappé sur les thèmes) |
| 4. Refonte module par module (Commandes → PMR → Opérations → Référentiels → Équipe → Admin) | ⏳ nécessite identifiants de test |

**Ne pas commencer une phase sans validation de l'utilisateur.**

## 2. Stack

- SvelteKit 2 + **Svelte 5 runes**, Tailwind CSS 4, JavaScript + JSDoc (TypeScript progressif)
- Supabase (projet `mgljaheyimizrydazrxh`) — **même base que BACO** (Vercel, branche `main`)
- Session Supabase en **cookie `csm-auth`** ; navigateur → `/api-proxy/*` (liste blanche) ; login par form action
- Gardes de route serveur : `src/lib/server/guards.js` + `hooks.server.js` + `+layout.server.js` (relancé à chaque navigation)
- UI : `bits-ui` (primitives accessibles), `lucide-svelte`, polices `@fontsource-variable` (Inter, Space Grotesk, JetBrains Mono)
- Exports : `exceljs` (`$lib/utils/excel.js`), `jspdf` ; HTML : `$lib/utils/sanitize.js`
- Déploiement : Docker (adapter-node) sur Coolify, `csm.fs0ciety.org` — voir `docs/DEPLOIEMENT.md`

## 3. Commandes

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # IS_COOLIFY=true pour adapter-node
npm run test:run     # vitest
npm run lint         # prettier --check
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

## 5. Conventions de code (cible)

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
  → Le navigateur ne parle **qu'à `csm.fs0ciety.org`** ; données via load/actions serveur, temps réel via SSE relayé par le serveur.
- **E-mail** : pas de jeton Outlook/Graph ; l'envoi est **manuel** depuis la **boîte fonctionnelle**.
  → Générer un brouillon `.eml` (`X-Unsent: 1`) avec le PDF joint, jamais d'envoi SMTP automatique.
- **Coexistence** : BACO (Vercel, branche `main`) reste en production sur **la même base**.
  → Migrations **rétrocompatibles** uniquement (additives) ; si un hotfix casse BACO, corriger `main` aussi.
- Gamification (classement, badges, likes, jauge de confiance, fléchettes, Konami) : **supprimée** (validé).
- **Mobile obligatoire** : toute page doit être utilisable à 360 px de large (pas de scroll horizontal de page,
  cibles tactiles ≥ 44 px, champs ≥ 16 px, safe-areas). Shell : tiroir + barre d'onglets en bas (< md).
  Vérifier chaque écran en 390×844 (Playwright) avant de livrer.

## 7. Pièges connus

- `.gitignore` liste `vite.config.js` et `src/lib/supabase.js` alors qu'ils sont suivis : les modifs
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
