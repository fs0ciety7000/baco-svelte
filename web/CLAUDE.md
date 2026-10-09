# web/ — CSM v2 (Next.js 15)

Application web de CSM (voir `../CLAUDE.md`, `../docs/CSM-V2.md`, `../docs/DESIGN-DIRECTION.md`).
Next **15.5** App Router, `output: 'standalone'`, React 19, TypeScript strict (`noUncheckedIndexedAccess`),
Tailwind v4, shadcn/ui (composants écrits à la main dans `src/components/ui`, le CLI shadcn télécharge depuis
ui.shadcn.com), zod 4, TanStack Query 5, SDK `pocketbase` **côté serveur uniquement**.

## Commandes

```bash
npm ci
npm run dev                      # http://localhost:3000 (PB_URL=http://127.0.0.1:8090, CSM_COOKIE_SECURE=false)
npm run typecheck && npm run lint && npm run format && npm run test:run && npm run build   # avant chaque push
PB_URL=… CSM_COOKIE_SECURE=false npm run start:standalone   # serveur de production local (copie static + public)
# E2E (serveur + PocketBase local importé lancés à part ; desktop 1440×900 et mobile 390×844) :
E2E_IDENTITY=… E2E_PASSWORD=… PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… npm run e2e
```

Playwright est figé en **1.56.1** : seule version compatible avec le Chromium de `/opt/pw-browsers`
(ne jamais lancer `playwright install`).

## Architecture serveur (`src/server/`, `import "server-only"`)

- `env.ts` : variables serveur validées par zod (`PB_URL`, `CSM_COOKIE_SECURE`).
- `pocketbase.ts` : `createPb(token)` = **un client par requête**, authentifié avec le jeton de l'agent ; les
  règles PocketBase s'appliquent. Jamais de client partagé, jamais de jeton superuser dans l'app.
- `session.ts` : cookie `csm_session` **httpOnly**, `SameSite=Lax`, `Secure` en production, expiration = jeton.
- `auth.ts` : `getCurrentUser()` (relu dans PocketBase une fois par requête via `cache`), `requireUser()`.
- `data/*.ts` : accès aux données par module, paramètres validés par zod, filtres **liés** (`pb.filter`).
- `sse.ts` + `app/api/events/route.ts` : relais temps réel. Le navigateur ouvre `EventSource('/api/events?topics=…')`,
  le serveur s'abonne au SSE PocketBase avec le jeton de l'agent et ne renvoie que `{ collection, action, id }`
  (liste blanche de sujets). Côté client : `router.refresh()` ou invalidation TanStack Query.
- `middleware.ts` : redirige vers `/connexion` sans jeton valide ; rafraîchit le jeton à moins de 24 h d'expiration.

## Pièges

- Relancer `npm run build` pendant qu'un serveur standalone tourne remplace `.next/standalone` **sans** les
  fichiers statiques : le JS client répond 404, la page s'affiche mais rien n'est interactif (le formulaire de
  connexion marche quand même, il fonctionne sans JS). Toujours redémarrer par `npm run start:standalone`.

- **Garde dans chaque page, pas seulement dans le layout** : Next rend layout et page en parallèle, et le contenu
  d'une page part dans le flux RSC même si le layout appelle `notFound()`. Chaque `page.tsx` appelle
  `requirePermission(perm)`, `requireRoute(href)` (règles de la navigation) ou `requireAdmin()`. Test E2E dédié.
- `Button asChild` : Radix `Slot` exige un seul enfant (pas de spinner dans ce cas).
- `cn()` (tailwind-merge) est **étendu** avec nos tailles (`text-body`…) et nos couleurs (`text-fg`…) : sans cela il
  supprimait l'une des deux (bouton primaire sans `text-accent-fg`, contraste 1,6:1). Tout nouveau jeton de taille ou de
  couleur doit être ajouté dans `src/lib/utils.ts`. L'E2E `/design` vérifie la couleur calculée du bouton primaire.

## Shell (étape 3)

- Navigation : **source unique** `src/navigation.ts` (6 modules, onglets en routes, `hideFor`, actions rapides,
  administration). Barre latérale (rail 96 px dès 768 px, 232 px dès 1280 px), barre du haut (fil, ⌘K, + Nouveau,
  menu utilisateur), mobile : 4 onglets + « Plus » (Sheet). Composants dans `src/components/shell/`.
- Les icônes ne traversent pas la frontière serveur → client : la navigation est calculée côté client
  (`ShellProvider`) à partir de l'agent, avec les mêmes fonctions que les gardes serveur.
- Palette ⌘K / Ctrl+K uniquement (jamais un « K » seul). Groupes Créer, Aller à, Administration, Affichage.
- Tableau de bord : widgets en `@container`, grille dense, réorganisables (dnd-kit + flèches + masquer), disposition
  dans `users.preferences.dashboard` (Server Action avec le jeton de l'agent). Dates « du jour » en Europe/Brussels.
- CSP avec nonce posée par `middleware.ts` (`connect-src 'self'`).

## Module Commandes (étape 5)

- Domaine partagé client / serveur dans `src/lib/orders/` : `status.ts` (miroir d'affichage des transitions, le hook
  PocketBase fait foi), `schemas.ts` (brouillons zod bus / taxi, contrôles avant envoi), `time.ts` (Europe/Brussels :
  `brusselsDay`, `brusselsToUtc`, périodes B201), `stops.ts` (lignes et arrêts entre deux gares), `mail.ts` + `eml.ts`
  (e-mail et brouillon `.eml` X-Unsent, échappement HTML, en-têtes RFC 2047/2231), `use-autosave.ts`.
- Convention de dates : `bus_orders.order_date` = jour de service à **minuit UTC** ; `taxi_orders.trip_at` = instant réel.
- Données : `src/server/data/orders.ts` (fiches, liste unifiée, vues enregistrées, référentiels, modèles), `b201.ts`.
  Écritures : `src/app/(app)/commandes/actions.ts` (Server Actions zod ; `ActionResult` ; verrou optimiste `expectedUpdated`).
- PDF : `src/server/pdf/order-pdf.ts` (pdf-lib, Helvetica WinAnsi → `safe()`), routes `GET /api/commandes/{bus|taxi}/{id}/pdf`,
  `/eml` et `/api/commandes/b201/{jour}/pdf` (401/404, `no-store`, `nosniff`). Le statut ne change **jamais** dans ces routes.
- Composants : `src/components/orders/*` (formulaires, feuille d'envoi, transitions, suivi en panneau, B201) ;
  `src/components/ui/form-kit.tsx` (Segmented, FormSection, ActionBar, AutosaveIndicator, Timeline, ToggleChip, dans `/design`).
- Brouillon : créé au 1er enregistrement automatique, l'URL devient `/commandes/nouveau?id=…` (même route, voir le piège
  dans `../CLAUDE.md` §7). Fiche : `/commandes/bus/[id]`, `/commandes/taxi/[id]` (rendu partagé `*-order-view.tsx`).
- E2E `e2e/commandes.spec.ts` : crée ses sociétés de démo (superuser), parcours complet en desktop, captures
  `test-results/commandes-<thème>-<écran>-<projet>.png` en Commandement et Ivoire.

## Module PMR (étape 5, session 3)

- Domaine : `src/lib/pmr/model.ts` (statuts des prestations, états du matériel, schémas zod, `expiry`, `dialable`),
  `src/lib/pmr/dicos.ts` (`parseDicos`, même logique que `pocketbase/pb_hooks/lib/pmr.js`, testée).
- Données : `src/server/data/pmr.ts` — le nom / téléphone d'un client n'est lu (expand) et rendu **que** si l'agent a
  `pmr:read` ; `legacyText` (texte BACO, peut contenir un nom) idem. Écritures : `src/app/(app)/pmr/actions.ts`.
- Écrans : `/pmr` (**Missions PMR** — missions par jour, panneau + transitions, sélecteur `?du=&au=` + raccourcis),
  `/pmr/historique` (+ `GET /api/pmr/export` CSV **sans nom**, formules neutralisées, BOM), `/pmr/clients` (`?id=`
  ouvre la fiche), `/pmr/materiel` (vues, état, zones). Composants `src/components/pmr/*` ; `PmrClientPicker` (exporté
  de `components/orders/taxi-form.tsx`) est partagé. **Plus de création manuelle** : les missions viennent de DICOS
  (décision du 8 oct. 2026) — `/pmr/nouveau` et `assist-form` retirés, `createAssists`/`updateAssist` supprimés.
- Téléphone : `PhoneLink` (`etrali:` desktop, `tel:` mobile, deux liens alternés en CSS).
- **Missions PMR = lecture seule** (synchro DICOS, aucune édition/transition dans l'UI, décision du 8 oct. 2026) :
  la liste montre le **trajet** gare départ → gare arrivée (gare d'assistance soulignée), le **sens IN/OUT**
  (départ = IN/embarquement, arrivée = OUT/débarquement), le **district** (DSE/DSO/DCE), le **nom du voyageur** (avec
  `pmr:read`) et un bouton **Copier** (`assistCopyText` : « Embarquement d'une chaise roulante »…). Le panneau montre
  en plus le détail nominatif DICOS (e-mail, langue, point de rencontre, voiture/porte, accompagnateur, conducteur,
  affectée à) via l'expand `pmr_mission_via_assist` (back-relation), avec `pmr:read` seulement.
- **v3 (une ligne par trajet)** : `mapDossier` (dossier `trip-details`) → `arr_time`, `arr_district`, `in_assist`,
  `out_assist`, `transport` ; `assist-board.tsx` (`legOf`, `IoBadges`, `RouteText` qui surligne la gare assistée du
  district filtré, `copyTextOf`). L'ingestion accepte `{ day, dossiers }` (v3) et `{ day, missions }` (v2).
  `FormAutoSubmit` (dans un `<form method="get">`) soumet au changement ; `Sheet` mobile en `handleOnly`.
- **District** : `src/lib/pmr/districts.ts` (généré depuis Supabase `ligne_data`, `scratchpad/gen-districts.mjs`) →
  `districtForStation(gare)`. Posé à l'ingestion sur `pmr_assists.district` ; filtre de l'écran = district (plus zone).
- **Ingestion DICOS** (`src/lib/pmr/dicos-mission.ts`, pur et testé + `app/api/pmr/missions/ingest/route.ts`) : mapping
  mission DICOS → prestation CSM (type PMR, statut, n° de dossier `AAAA-MM-JJ-NNNN`, détail nominatif) **côté serveur**
  = source unique de vérité ; l'extension (`extension/dicos-connector/`) envoie la mission brute. Endpoint authentifié
  par `x-dicos-token` (`CSM_DICOS_TOKEN`, comparaison à temps constant), écrit via le compte de service
  (`CSM_DICOS_PB_EMAIL`/`CSM_DICOS_PB_PASSWORD`, droit `dicos:write`), idempotent (dédup `dicos_id`), ignore les
  prestations anonymisées ; **503** tant que les variables sont vides. Heure/jour lus en mur d'horloge de l'ISO local.
- **Groupes** (**`/groupes`**, onglet du module PMR via `groupes/layout.tsx` ; `/pmr/groupes` redirige) : `group_missions` (ingérée par `mapGroupList`, réservations DICOS `Group` sans PMR),
  `server/data/groups.ts`, `components/pmr/group-board.tsx` (réutilise `Leg`, `IoBadges` d'`assist-board`),
  ALEA de groupe `aleaGroupBlocks` (`lib/pmr/model.ts`). Contact lisible avec `pmr:read`.
- **Export ALEA** : `components/pmr/alea-export.tsx` (`AleaButton`, partagé PMR / groupes), modèle `aleaGroups` /
  `aleaGroupBlocks` / `aleaDecision` / `stationKey` (`lib/pmr/model.ts`, testés), temps d'arrêt par la Server Action
  `aleaDwell` (`pmr/actions.ts`) : horaire **ATMS** (`train_schedules`, poussé par l'extension via
  `POST /api/pmr/schedules/ingest`, mapping `lib/pmr/atms.ts`) d'abord, **iRail** en repli (60 trains max, 3 en parallèle). `copy.tsx` (`copyLabel`,
  `CopyButton`), `train-chip.tsx` (train en première colonne).
- E2E `e2e/pmr.spec.ts` (fixtures superuser, captures `test-results/pmr-*`).

## Module Opérations (étape 5, session 3)

- Domaine : `src/lib/ops/` → `irail.ts` (types, `normalizeTrain`, seuils de retard, gares favorites), `log.ts`
  (catégories, schéma zod d'une entrée, `segments` : texte / mention / lien http(s), jamais de HTML), `stats.ts`
  (agrégats purs), `tiles.ts` (tuiles relayées : Belgique, zoom 7–18). Tests : `ops.test.ts`.
- Serveur : `src/server/irail.ts` (User-Agent, cache, requêtes en vol regroupées, 3 req/s vers iRail, file bornée),
  `src/server/rate-limit.ts`, données `src/server/data/ops.ts` (main courante, notifications, PN, trains suivis) et
  `stats.ts`. Écritures : `src/app/(app)/operations/actions.ts`.
- Routes : `/api/operations/irail/{gares|tableau|train|composition|perturbations}` (`live:read`, 60/min par agent),
  `/api/operations/tuiles/{z}/{x}/{y}` (`carte_pn:read`, cache), pièces jointes
  `/api/operations/main-courante/[id]/fichiers` (POST multipart borné, type vérifié sur les octets) et `/[nom]` (GET,
  jeton de fichier côté serveur), exports CSV main courante et statistiques.
- Écrans : `/operations` (trains en direct, `?gare=&nom=&train=&jour=`), **`/operations/journal`** (ex-main courante :
  fil continu façon messagerie, `?entree=&pn=&q=&categorie=&urgentes=&agents=&n=`, `?train=&categorie=` pré-remplit la
  barre d'écriture ; `/operations/main-courante[/nouveau]` redirigent), `/operations/carte-pn` (Leaflet chargé à la demande,
  `?pn=&q=`), `/operations/statistiques`. Cloche `components/shell/notification-bell.tsx` (SSE `notifications`).
- Variables : `IRAIL_URL`, `TILES_URL`, `CSM_USER_AGENT` (facultatives). E2E : `e2e/operations.spec.ts` avec
  `node e2e/mock-services.mjs 8094` et `IRAIL_URL=http://127.0.0.1:8094/v1 TILES_URL=http://127.0.0.1:8094/tiles/{z}/{x}/{y}.png`.

## Module Référentiels (étape 5, session 3)

- Données : `src/server/data/referentiels.ts` (lectures serveur, filtres `pb.filter` liés), `src/lib/referentiels/model.ts`
  (schémas zod contacts / procédures / documents). Écritures : `src/app/(app)/referentiels/actions.ts` (contacts,
  procédures, documents + upload `FormData`, restauration de version **réservée aux coordinateurs**).
- Écrans (`src/app/(app)/referentiels/`) : `/` **Annuaire** (liste groupée, filtres catégorie/zone/groupe, fiche en
  panneau, création avec détection de doublon — coordinateurs) ; `/lignes` (district DSE/DSO/DCE **majoritaire** + ligne
  d'un clic, sections Gares/PN/SPI, lien Carte PN) ; `/ptcar` et `/ebp` (`ReferenceTable` : recherche serveur paginée,
  cartes < 640 px, EBP « incomplètes ») ; `/documents` (**Procédures** Markdown + **Documents**, `Segmented` par `?vue=`,
  filtre catégorie). Composants `src/components/referentiels/*`.
- **Markdown** : `markdown-view.tsx` rend un sous-ensemble SÛR en **éléments React** (aucun `dangerouslySetInnerHTML`,
  liens bornés http(s)) — pas de dépendance ni de surface XSS.
- **Fichiers** : servis par `GET /api/referentiels/documents/[id]` avec le jeton de l'agent (fichier PocketBase
  **protégé**, jamais d'URL publique) ; **images en aperçu, PDF et le reste en téléchargement** (CSP `sandbox` → le
  visionneur PDF de Chrome ne s'ouvre pas en inline, comme la main courante). Upload borné (type/taille, octets).
- Import des données v1 (contacts 385, SPI 112, PtCar 1148, EBP 466, procédures 8 + 24 versions, 11 documents +
  fichiers, liens par relation) : script `scratchpad/referentiels-import.mjs` (PostgREST plafonne à 1000 lignes →
  paginer PtCar par `offset`).

## Conventions

- **Le navigateur ne parle qu'au domaine CSM** : ni PocketBase, ni Supabase, ni WebSocket (test E2E dédié).
- Lecture : Server Components qui appellent `src/server/data`. Écriture : Server Actions validées par zod.
- Redirections après connexion : chemins internes uniquement (`safeNext`).
- Messages d'erreur de connexion identiques que le compte existe ou non.
- Mobile : chaque écran vérifié en 390×844 (pas de défilement horizontal, cibles ≥ 44 px, champs ≥ 16 px).
- **Design system** (`../docs/DESIGN-DIRECTION.md`) :
  - couleurs **uniquement** par jetons (`bg`, `surface`, `surface-2`, `border`, `border-strong`, `fg`, `fg-muted`,
    `accent`, `accent-fg`, `ok`, `warn`, `danger`, `info`) ; la palette Tailwind par défaut est désactivée ;
  - jetons dans `src/design/tokens.ts` → `npm run tokens` régénère `src/app/themes.css` (ne pas l'éditer à la main) ;
    `src/design/tokens.test.ts` échoue si le CSS n'est pas à jour ou si un contraste passe sous AA ;
  - thème et densité : cookie `csm_ui` lu par le layout racine (`data-theme`, `data-scheme`, `data-density`, aucun
    flash) ; `auto` suit `prefers-color-scheme` en CSS ; sélecteur `src/components/theme-switcher.tsx` ;
  - polices `next/font/google` (Geist, Geist Mono, Saira Condensed), auto-hébergées au build ;
  - utilitaires : `label-mono`, `display`, `tabular`, `chamfer` (+ `--frame`, `--fill`), `h-control`, `h-row`,
    `text-label|small|hint|body|body-lg|h3|h2|h1|stat`, `ease-hud`, `animate-fade-in|pop-in` ;
  - composants dans `src/components/ui` (Button, Input/Select/Textarea, Field, Checkbox/Switch, Card, StatCard,
    Badge/StatusBadge, Tabs, Dialog, Sheet, Toast, EmptyState, PageHeader, Kbd, Skeleton, Tooltip, Table/ListCard,
    Command) : **aucun style ad hoc dans les pages** ; tout nouveau composant est ajouté à `/design` ;
  - motion : `src/lib/motion.ts` (GSAP + `gsap.matchMedia()`, ease `hud`, `useStaggerIn`) ; budgets de DESIGN-DIRECTION.
- E2E `e2e/design.spec.ts` : `/design` dans les 5 thèmes × 2 formats (captures `test-results/design-*.png`, pas de
  défilement horizontal, pas d'erreur console, cibles ≥ 44 px sur mobile).

## Journal (ex-main courante, 9 oct. 2026)

- `components/ops/journal-chat.tsx` (fil, bandeau des consignes, plein écran, panneau de détail), `log-composer.tsx`
  (`variant="chat"` : barre d'écriture ; `form` : modification), `chat-markdown.tsx` + `lib/ops/chat-markdown.ts`
  (Markdown SÛR en éléments React : gras, italique, barré, code, liens http(s), mentions, listes, citations ; testé),
  `emoji-picker.tsx` (Radix DropdownMenu), `duty-districts.tsx` (bandeau du matin dans `(app)/layout.tsx` + puce).
- Le fil remplit l'écran : hauteur `calc(100dvh - top - --journal-gap)` mesurée (ResizeObserver sur `main`), défilement
  interne, suivi du bas à l'arrivée d'un message, position gardée au chargement des plus anciens.
- Messages iRail : `source = "irail"`, auteur affiché « iRail · SNCB » ; filtre « Sans iRail » (`?agents=1`).
- Server Action `setDutyDistricts` (`operations/actions.ts`) ; `SessionUser.duty_day` / `duty_districts`.

## Mouvement et navigation (étape 7, lot 0)

- Formulaires de filtres : **`next/form`** (`import Form from "next/form"`, `action` = chemin), jamais
  `<form method="get">` : navigation côté client, pas de rechargement. `FormAutoSubmit` reste valable.
- Keyframes : animer `transform`, `opacity` ; jamais la propriété `translate` (elle porte le centrage Tailwind
  `-translate-x-1/2`).
- Trait d'onglet : `useSlideIndicator(listRef, barRef, sélecteur)` (`lib/motion.ts`), trait `w-px origin-left`.
- Pas d'animation d'entrée sur un contenu rendu par le serveur au premier affichage (`useStaggerIn` l'ignore).
- `NavProgress` (shell) : barre de chargement entre pages ; `(app)/error.tsx` : erreur en français dans le shell.
- Thèmes (lot 1) : 11 thèmes dans `src/design/tokens.ts` (couleurs, `shape`, `type`, `modules`) → `npm run tokens`.
  Jetons en plus : `fg-subtle`, `progress`, `--mod-<module>` (`modColor(id)` dans `design/module-color.ts`).
  Rayons : `rounded-box` (cartes, dialogues, panneaux) et `rounded-control` (boutons, champs, badges, puces) ; jamais
  de rayon en dur. Liens : classe `.link`. L'accent ne sert qu'à l'action, la sélection et le focus.
- Listes (lot 2) : raccourcis et vues en `FilterChip` dans un `ChipRow` ; filtres secondaires dans
  `CollapsibleFilters` (repliés en mobile, en ligne en desktop) ; `FormAutoSubmit` dans chaque formulaire de filtres ;
  pluriels avec `pl(n, "mission")`. En-tête de module : `ModuleLayout` (une ligne), `eyebrow` = information utile.
- Lot 3 : `SyncStatus` (`components/pmr/sync-status.tsx`) + `dicosSyncState()` ; ⌘K `paletteSearch()`
  (`app/search-actions.ts`, 5 résultats par type, droits de l'agent) ; `PageShortcuts` (« / », « N » via
  `data-shortcut="new"`) ; Journal `markAllRead`. E2E `e2e/ux.spec.ts`.
- Lot 4 : `<LiveHighlight scope sigs context />` + `data-hl-scope` sur le conteneur et `data-hl` sur l'élément visible
  (la carte, pas un `<li>` transparent) ; `useCopy()` / `CopyButton` / `CopyIcon` (`components/pmr/copy.tsx`) pour
  toute copie ; ligne active via `Tr selected`.
- E2E `e2e/motion.spec.ts` : palette sans glissement, aucune animation infinie (hors `animate-pulse-dot` /
  `animate-spin`), accueil sans flash, filtre sans rechargement.
