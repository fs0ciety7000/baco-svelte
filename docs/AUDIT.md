# Audit BACO → CSM — 8 octobre 2026

Audit réalisé en lecture seule : code (28 k lignes, 178 fichiers), base Supabase (`mgljaheyimizrydazrxh`, 51 tables), advisors Supabase, `npm audit`, site de référence design.
**Aucune modification n'a été faite en base.**

---

## 1. Sécurité

### 🔴 Critique

| # | Constat | Preuve | Correctif |
|---|---|---|---|
| S1 | **Escalade de privilèges : tout utilisateur connecté peut se nommer admin.** La policy `Allow user to update their own profile` (UPDATE, `auth.uid() = id`) n'a aucune restriction de colonne, et `authenticated` **et `anon`** ont le privilège UPDATE sur `profiles.role` et `profiles.permissions`. Un `supabase.from('profiles').update({role:'admin'}).eq('id', monId)` suffit. Le trigger `sync_user_role` recopie ensuite le rôle dans les métadonnées. | `pg_policies`, `information_schema.column_privileges` | `REVOKE UPDATE (role, permissions, banned_until) ON profiles FROM authenticated, anon;` + changements de rôle uniquement via RPC admin vérifiée |
| S2 | **11 tables sans RLS**, lisibles **et modifiables** avec la seule clé anon publique (présente dans le bundle JS) : `ebp`, `app_settings`, `audit_logs`, `b201_reports`, `liaisons_contenu`, `remise_bus/taxi/intervention/pmr`, `darts_games`, `temp_geo_data`. `app_settings` pilote la maintenance et le gate. | Advisor `rls_disabled_in_public` | `ENABLE ROW LEVEL SECURITY` + policies (les policies existent déjà pour 5 d'entre elles) |
| S3 | **Contrôles d'accès basés sur `user_metadata`** (modifiable par l'utilisateur via `auth.updateUser({data:{role:'admin'}})`) : 19 policies RLS, `is_staff()`, `admin_create_user()`, `admin_set_ban_status()`. | Advisor `rls_references_user_metadata` | Lire le rôle depuis `profiles` (fonction `SECURITY DEFINER` `current_role()` avec `search_path` fixé) ou un *custom access token hook* → `app_metadata` |
| S2b | **6 tables métier ouvertes sans connexion** via des policies `public … using (true)` : `daily_movements` et `movement_interventions` (déplacements PMR — lecture, modification **et suppression** par anon), `taxi_commands` (idem), `otto_commandes`, `pmr_data`, `user_presence` (lecture). | `pg_policies` | Policies restreintes à `authenticated` (migration §4h) |
| S4 | **XSS stocké** : `{@html marked.parse(...)}` sans nettoyage dans journal, opérationnel, changelog ; `{@html}` sur résultats de recherche. `isomorphic-dompurify` est installé mais jamais importé. Combiné à un JWT en localStorage → vol de session admin → `/api/admin/backup` (dump complet). | `journal/+page.svelte:490`, `operationnel/+page.svelte:485`, `changelog/+page.svelte:269`, `GlobalSearch.svelte:221` | `sanitize()` partout + CSP |

### 🟠 Élevé

- **S5 — RBAC uniquement cosmétique** : session en localStorage, aucun `+page.server`/`+layout.server`, la garde `/admin` de `hooks.server.js` ne voit jamais l'utilisateur. Écritures de rôles/permissions directement depuis le navigateur (`admin.service.js`).
- **S6 — 21 fonctions `SECURITY DEFINER` exécutables par `anon`** (dont `admin_create_user`, `admin_reset_user_password`, `get_all_users`). `get_all_users`, `admin_pardon_infraction` et `get_linked_content` **ne vérifient pas l'appelant**, donc fuite de tous les e-mails. 27 fonctions sans `search_path` fixé. Vue `admin_audit_view` en `SECURITY DEFINER`.
- **S7 — Buckets Storage publics** : `documents`, `movements_pdf`, `avatars`. Des PDF de mouvements PMR (données personnelles) sont accessibles par URL sans authentification.
- **S8 — Gate contournable** : cookie `baco_gate_pass` en base64 non signé, code « baco » en clair dans le bundle.
- **S9 — `api-proxy` ouvert** : relaie tous les en-têtes, pas d'auth ni de liste blanche de chemins, et mutualise l'IP, donc le rate-limit de login Supabase est partagé entre tous les utilisateurs.
- **S10 — Aucun en-tête de sécurité** (CSP, HSTS, X-Frame-Options, Referrer-Policy).
- **S11 — `npm audit`** : 18 vulnérabilités (3 critiques, 9 élevées) : `xlsx@0.18.5` (abandonné sur npm), `svelte`, `devalue`, `jspdf`, `dompurify`, `@tiptap/core`.
- **S12 — Protection des mots de passe compromis désactivée** (Supabase Auth). Longueur minimale de 6 caractères dans `admin_create_user`.

### 🟡 Moyen

- `create-user` : un admin peut créer un `sysop` ; `throw error(400)` avalé en 500.
- `backup` : `ssl.rejectUnauthorized:false`, dump en mémoire sans limite, message d'erreur brut renvoyé.
- `hooks.server.js` : cache désactivé, donc un `app_settings` + `getUser()` à chaque requête, plus des `console.log` verbeux.
- Données PMR (santé / handicap = données sensibles RGPD) : à recenser, avec une durée de rétention à définir.

---

## 2. Base de données (advisors performance)

- **254 policies permissives multiples** : plusieurs policies se superposent sur la même table et la même action, d'où un coût CPU élevé et une sécurité illisible (`profiles` a 3 SELECT et 3 UPDATE).
- **96 `auth_rls_initplan`** : `auth.uid()` est réévalué à chaque ligne. Correctif : `(select auth.uid())`.
- 40 clés étrangères sans index, 9 index inutilisés, 1 doublon.
- Tables en doublon ou mortes : `audit_log` (3 931 lignes) et `audit_logs` (487), `temp_geo_data`, `darts_games`, `remise_*` (1 ligne chacune).
- `pg_trgm` installé dans `public`.
- **Aucune migration versionnée dans le dépôt** : le schéma n'existe que dans le dashboard.

---

## 3. Architecture & code

- « SPA déguisée » : SSR inutile, liens directs cassés (rustine `/profil` dans les hooks).
- Couche `services/` (25 fichiers) contournée : 44 fichiers importent `supabase` directement.
- Monolithes : `live` (998 l.), `profil` (928), `operationnel` (884), `Nav` (800), `generateTaxi` (759).
- Mélange Svelte 4 / 5 et stores / runes ; deux systèmes de toast ; un seul fichier de tests.
- **Dépendances mortes** : `@tiptap/*`, `carta-md`, `clsx`, `flatpickr`, `leaflet`, `mapbox-gl`, `notyf`, `pdf-lib`, `snarkdown`, `svelte-sonner`, `tailwind-merge`, `easymde` (à confirmer), `adapter-auto`.
- **Fichiers morts** : `Tiptap.svelte`, `dartsStore.js`, `src/lib/core/layout.js`, `src/services/profile.service.js` (doublon), `src/lib/index.js`.
- `.gitignore` incohérent (`vite.config.js` et `supabase.js` ignorés mais suivis), `dev-dist/` commité.

## 4. Performance

- Polling non coordonné : présence en upsert toutes les 30 s et select toutes les 15 s même onglet caché, `live` toutes les 30 s. Realtime inutilisé.
- Imports lourds statiques : `jspdf` + `html2canvas` (b201), `xlsx` (répertoire), 12 widgets + `gridstack` sur l'accueil.
- N+1 : upsert ligne par ligne (`bus.service.js:170`), géocodage séquentiel (`OttoForm.svelte:168`).
- Assets : `static/favicon.svg` 1,4 Mo, `favicon.png` 1,1 Mo, `logobaco.png.bak` 2,1 Mo **servi publiquement**, `logobaco.png` 2,1 Mo à la racine ; tout est précaché par le service worker.

## 5. UX / design

**Système de design**
- 16 thèmes fantaisie animés, dont aucun ne respecte `prefers-reduced-motion`.
- La couleur principale est définie à partir d'elle-même ; les couleurs d'état ne sont pas définies, d'où 118 hex écrits en dur.
- Mode sombre forcé dans `app.html`, donc pas de vrai mode clair.

**Composants**
- Cinq rayons différents, et un bouton principal différent selon les pages.
- Trois façons de confirmer : `ConfirmModal`, `confirm()` natif et des modales maison.
- `Sidebar.svelte` n'est utilisé nulle part.

**Accessibilité**
- 217 champs pour 11 libellés reliés ; modales sans piège de focus ; toasts sans `aria-live`.

**Comportements globaux**
- L'impression est bloquée par le CSS global.
- Chaque changement de page prend 600 ms d'animation.
- Bug de la palette : taper « K » dans un champ l'ouvre.
- Le menu mobile est incomplet.

Points de friction métier, architecture de l'information et améliorations : voir `docs/PROPOSITION.md`.
