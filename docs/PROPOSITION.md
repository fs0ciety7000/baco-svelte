# CSM — Client Solutions Management Tool · Proposition

> Document à valider **avant tout développement**. Rédigé le 8 octobre 2026 à partir de `docs/AUDIT.md`.

---

## 1. Stack recommandée

**Décision : on garde SvelteKit + Supabase, et on refond l'architecture plutôt que réécrire.**
Une réécriture sous Next.js, Nuxt ou autre coûterait des mois pour un gain nul. Svelte 5 est déjà en place, le bundle est léger et l'équipe connaît le code. Le problème ne vient pas du framework mais de la façon dont il est utilisé : une SPA sans serveur, avec une sécurité côté client.

| Couche | Aujourd'hui | Cible CSM | Pourquoi |
|---|---|---|---|
| Framework | SvelteKit 2 / Svelte 5 mixte | **SvelteKit 2 / Svelte 5 runes 100 %** | Cohérence, réactivité fine |
| Langage | JavaScript | **TypeScript** (progressif, types Supabase générés) | Le schéma de la base devient vérifié à la compilation |
| Rendu | SPA, session en localStorage | **SSR + session en cookie httpOnly** (`@supabase/ssr`), `load` serveur, *form actions* | Vraies gardes serveur, liens directs fonctionnels, protection XSS du token |
| Accès données | `supabase.from()` dans 44 composants | **`src/lib/server/repositories/*`** + services | Un seul endroit par table, testable |
| Validation | Aucune | **Valibot** (schémas partagés client/serveur) | Formulaires de commande fiables, ~1 Ko |
| BDD | Supabase hébergé, schéma non versionné | **Supabase hébergé** + `supabase/migrations/` + RLS réécrite | Historique, revue, rollback |
| Temps réel | Polling 15–30 s | **Supabase Realtime** (présence, journal, notifications) + `poller` pour iRail | Moins de requêtes, instantané |
| UI | Tailwind 4 + composants maison | **Tailwind 4 + tokens CSS + bits-ui** (primitives accessibles, style shadcn-svelte) | Accessibilité clavier/ARIA gratuite, rendu premium |
| Tableaux | Tables maison | **TanStack Table** (+ virtualisation > 200 lignes) | Tri, filtres, colonnes, vues sauvegardées |
| Icônes | lucide-svelte | **@lucide/svelte** | Paquet officiel Svelte 5 |
| Motion | Ad hoc | `svelte/transition` + `animate:flip` + **View Transitions API** + `Spring`/`Tween` | Natif, sans dépendance lourde |
| Toasts | 2 systèmes | **svelte-sonner** seul | Un seul système |
| Markdown | marked sans nettoyage | marked + **DOMPurify** obligatoire | XSS |
| PDF | jspdf + html2canvas (statique) | **jspdf** (mis à jour, chargé à la demande) | Pas de régression des modèles existants |
| Excel | xlsx 0.18.5 (vulnérable) | **exceljs** (chargé à la demande) | Maintenu, sans CVE |
| Cartes | leaflet + mapbox + maplibre | **maplibre-gl** seul | 2 dépendances en moins |
| E-mail | Génération de texte / mailto | **Envoi SMTP serveur** (Nodemailer, ou Resend), PDF en pièce jointe, journalisé | « Envoyer le bon » en 1 clic |
| Tests | 1 fichier Vitest | **Vitest** (unitaires) + **Playwright** (parcours bus/taxi/PMR) | Non-régression des parcours critiques |
| Qualité | Prettier | Prettier + **ESLint** + `svelte-check` + CI GitHub Actions | |
| Observabilité | Table `app_error_logs` | Table conservée + `/healthz` + logs JSON (pino) ; Sentry auto-hébergé en option | |
| Déploiement | Vercel | **Docker multi-stage (node:22-alpine, adapter-node)** sur **Coolify**, `csm.fs0ciety.org` | Demande utilisateur |

### Supabase : hébergé ou auto-hébergé ?
Je recommande de **rester sur Supabase hébergé** (projet actuel). Coolify sait déployer Supabase, mais il faudrait alors gérer soi-même les sauvegardes, les mises à jour, l'Auth et les e-mails, pour une équipe d'environ 30 utilisateurs. On pourra le reconsidérer plus tard.

---

## 2. Design system « CSM »

Références : **test.fs0ciety.org**, plus les codes des outils pros (Linear, Vercel, Attio, Raycast, Stripe).

On reprend de la référence l'architecture par jetons `--th-*` sur `<html data-theme>`, le thème appliqué sans flash par un script inline, le fond en dégradé radial, les liserés accentués, les panneaux en verre et des animations courtes (120–180 ms).
On laisse de côté pour un outil pro les coins biseautés partout, les scanlines et les reflets en boucle. Ils restent disponibles dans le thème optionnel **Tactique**.

### Typographie
- **Inter Variable** pour l'UI, base dense à 13 px, chiffres tabulaires dans les tableaux.
- **Space Grotesk** pour les titres.
- **JetBrains Mono** pour les n° de train, horaires, téléphones et n° de bon.
- Polices auto-hébergées (`@fontsource-variable`) : aucun appel à Google, ce qui est plus rapide et plus respectueux du RGPD.

### Jetons
- Espacements sur une base de 4 px.
- Rayons : 4 / 6 / 10 / 14 px.
- Lignes de tableau : 36 px (confortable) ou 30 px (compact).
- Sidebar : 248 px, ou 56 px repliée.
- Mouvement :
  - 80 / 120 / 180 / 260 / 320 ms ;
  - `ease-out cubic-bezier(.2,.8,.2,1)` ;
  - aucune boucle infinie sauf le point « live » ;
  - `prefers-reduced-motion` respecté partout.

### 5 thèmes (contraste WCAG AA vérifié)

| Jeton | **Nocturne** (défaut) | **Ivoire** (clair) | **Rail** | **Contraste élevé** | **Tactique** |
|---|---|---|---|---|---|
| bg | `#0B0E14` | `#F7F5F0` | `#0A1A33` | `#000000` | `#05070F` |
| surface | `#12161F` | `#FFFFFF` | `#0F2445` | `#0A0A0A` | `#0A0E1C` |
| border | `#262C3A` | `#DEDAD0` | `#24467A` | `#FFFFFF` | `#4BE8FF42` |
| text | `#E6EAF2` | `#1B1E25` | `#F1F5FB` | `#FFFFFF` | `#E7ECFF` |
| accent | `#7C9CFF` | `#1F5FD1` | `#FFC72C` | `#FFE500` | `#4BE8FF` |
| ok / warn / danger | `#3DD68C` `#F2B544` `#FF6B78` | `#137A4B` `#8F5600` `#C0313F` | `#4ADE9B` `#FFB347` `#FF7A7A` | `#5CFFA8` `#FFB000` `#FF8080` | `#4AFF9C` `#FFD86B` `#FF5D6C` |

Le thème suit le système (clair/sombre) par défaut. Un **mode densité** (confortable / compact) est réglable indépendamment.

### Signatures « premium »
- **Palette de commandes ⌘K** : chercher une gare, une ligne, un contact, un client PMR, un bon, ou lancer « Nouveau bon bus ».
- **Raccourcis clavier** : `N` nouveau, `/` recherche, `G B` / `G T` / `G P`… Ils sont affichés en `<kbd>` dans les tooltips.
- **Tiroir de détail** à droite au lieu de modales plein écran.
- **Transitions de page** (View Transitions) et listes animées (`flip`).
- **Pastilles de statut** couleur + icône, jamais la couleur seule.
- États vides illustrés, squelettes de chargement, toasts avec action « Annuler ».

---

## 3. Architecture de l'information & fonctionnel

_(complété avec l'audit UX — voir section suivante)_

---

## 4. Déploiement Coolify

- `Dockerfile` multi-stage : `deps` → `build` → `runtime` (node:22-alpine, utilisateur non-root, `HEALTHCHECK` sur `/healthz`, ~120 Mo).
- `docker-compose.yml` (référence locale et Coolify), `.dockerignore`.
- Variables : `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement), `ORIGIN=https://csm.fs0ciety.org`, `SMTP_*`, `BODY_SIZE_LIMIT`.
- En-têtes de sécurité (CSP, HSTS…) posés par SvelteKit (`kit.csp` + `handle`).
- Doc `docs/DEPLOIEMENT.md` : création de l'app Coolify, DNS `csm.fs0ciety.org`, TLS Let's Encrypt, URLs de redirection Supabase Auth, sauvegardes, rollback.
- CI GitHub Actions : lint, vérification des types, tests, build de l'image ; Coolify redéploie via webhook sur `main`.
