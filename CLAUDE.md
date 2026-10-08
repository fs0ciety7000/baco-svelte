# CLAUDE.md — CSM (Client Solutions Management Tool)

> Ex-**BACO**. Outil métier ferroviaire (SNCB) de l'équipe PACO → **Client Solutions** :
> commandes de bus / taxis de remplacement, assistance PMR, contenu des lignes, EBP,
> répertoire, départs/arrivées (iRail), planning, journal, Otto, stats, admin.
> Utilisé **toute la journée** par des opérateurs : chaque clic compte, la fiabilité prime sur l'effet.

Ce fichier est maintenu par Claude. **Mets-le à jour** dès qu'une décision, une convention
ou un piège nouveau apparaît (section « Journal des décisions » en bas).

---

## 1. État du projet

| Phase | Statut |
|---|---|
| 0. Audit (sécurité, UX, design, perf) | ✅ fait — voir `docs/AUDIT.md` |
| 1. Proposition stack / design / roadmap | ✅ rédigée — `docs/PROPOSITION.md`, **en attente de validation utilisateur** |
| 2. Hotfix sécurité base (RLS, RPC) | ⏳ en attente d'accord explicite (touche la prod) |
| 3. Socle : auth cookies, design system, shell, Docker | ⏳ |
| 4. Migration module par module | ⏳ |

**Ne pas commencer une phase sans validation de l'utilisateur.**

## 2. Stack actuelle (constat)

- SvelteKit 2 + **Svelte 5** (runes majoritaires, restes Svelte 4 : `export let`, `on:click`, `$:`)
- Tailwind CSS 4 (`@tailwindcss/vite`), JavaScript (pas TypeScript), JSDoc partiel
- Supabase (projet `mgljaheyimizrydazrxh`) : Postgres + Auth + Storage, accès **direct depuis le navigateur**
- Session en `localStorage` → le SSR ne voit pas l'utilisateur ; gardes de route uniquement côté client
- Déploiement actuel : Vercel (`adapter-auto`) ; cible : **Docker sur Coolify** (`adapter-node`), domaine `csm.fs0ciety.org`
- Tests : Vitest (1 seul fichier de tests)

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
- Couleurs / rayons / ombres / durées : **tokens CSS** (`var(--…)`) uniquement, jamais de hex en dur.
- Imports lourds (jspdf, exceljs, gridstack, maplibre, chart.js) en `await import()`.
- Polling : utiliser `src/lib/utils/poller.js` (pause onglet caché) ou Supabase Realtime.

## 6. Pièges connus

- `.gitignore` liste `vite.config.js` et `src/lib/supabase.js` alors qu'ils sont suivis : les modifs
  passent quand même (fichiers déjà trackés) mais un nouveau clone sans eux casserait — à nettoyer.
- `hooks.server.js` exclut `/api*` du « gate » ; le gate lui-même est un cookie base64 non signé.
- Rôles en base : `admin`, `sysop`, `moderator`, `otto_agent`, `user` (table `profiles.role`),
  recopiés dans `auth.users.raw_user_meta_data.role` par trigger — **ne jamais se fier à
  `user_metadata` pour une décision de sécurité** (modifiable par l'utilisateur).

## 7. Journal des décisions

- 2026-10-08 — Audit initial réalisé (3 agents + inspection Supabase). Proposition rédigée.
  Renommage BACO → CSM acté par l'utilisateur.
