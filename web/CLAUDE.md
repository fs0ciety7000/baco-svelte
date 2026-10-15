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

## Navigation v3 (14 oct. 2026, `../docs/design/AUDIT-NAVIGATION.md`)

- `src/navigation.ts` : Accueil (À traiter `/` · Statistiques `/statistiques`), Opérations (Journal par défaut · Ma journée ·
  **B201** `/operations/b201`, ex-Relève), Commandes (Suivi par défaut · Bus · Taxi · Archives · Fournisseurs), PMR (Missions · Groupes · Clients · Matériel ·
  Historique), **Réseau** (`/reseau` = Trains en direct · `/reseau/horaires` · `lignes` · `gares` · `ptcar` · `ebp` · `pn`),
  **Ressources** (`/ressources` = Contacts · `/ressources/equipe` Collègues · `planning` · `documents` ; la B201 est passée dans Opérations le 15 oct. 2026). Module
  Équipe supprimé. Un onglet peut exiger plusieurs clés (`permission: [...]`) ou **l'une d'elles** (`anyOf`, Suivi : bus OU
  taxi). `ACCOUNT_LINKS` / `accountLinks(user)` (Mon profil `/profil`, Mon planning, Extension CSM `/extension`) : menu du
  compte (`ShellData.account`), ⌘K, et `requireRoute` les accepte comme des onglets. `activeModule` = **plus long préfixe**
  (un onglet ou l'adresse d'un module) ; l'Accueil ne répond qu'à `/` et à ses onglets. Couleurs de module : `reseau`,
  `ressources` (`design/tokens.ts`).
- **Anciennes routes** : `src/lib/redirects.ts` (`LEGACY_REDIRECTS`, lu par `next.config.ts` `redirects()`, 308, requête
  gardée, cible finale directe, jamais `/api`). Toute route déplacée s'y ajoute ; `lib/redirects.test.ts` vérifie que chaque
  cible est une page, que chaque source n'en est plus une et que chaque lien de la navigation mène à une page ; E2E « anciennes
  routes » dans `e2e/shell.spec.ts`. **Exception** : `/pmr/extension` est un ALIAS (réexporte `extension/page.tsx`) car le
  script `csm-link.js` des extensions installées n'est injecté que sur ce chemin ; à rediriger quand une version de
  l'extension aura ajouté `/extension*` à ses `content_scripts`. `lib/home.ts` convertit les anciennes pages d'accueil
  enregistrées (`/operations` → `/reseau`, `/referentiels` → `/ressources`, `/commandes` → `/commandes/suivi`).
- Actions déplacées : `app/team-actions.ts` (ex-`equipe/actions.ts`), `app/(app)/extension/actions.ts`,
  `app/(app)/ressources/actions.ts` (contacts, documents), `app/(app)/reseau/{gares,lignes,horaires}/actions.ts`.
- **Référentiels du réseau** : modification = `can(user, "referentiels:manage")` (gares, lignes, relance de l'import des
  horaires ; PtCar / EBP / SPI dans l'administration). Carte PN : `carte_pn:*` inchangés.
- **Administration › Référentiels** (`/admin/referentiels…`, entrée `ADMIN` à `permission: "referentiels:manage"` ;
  `adminModule()` rend les seuls onglets à permission pour un non-admin ; `admin/layout.tsx` = `adminModule(user)` sinon 404,
  et garde `requirePermission("referentiels:manage")` dans chaque page) : `server/data/admin-referentiels.ts`
  (`referentialQuality`, anomalies `*_ISSUES` partagées tableau de bord / listes, `adminPtcar|Ebp|Spi|Crossings|Lines`),
  actions `admin/referentiels/actions.ts` (`saveReference`, `deleteReference`, `setCrossingActive`, `createRailLine`,
  `deleteRailLine`), composants `components/admin/referentiels/` (`ReferenceAdmin` générique : champs décrits par la page,
  aucun callback serveur → client ; `RefAdminList`, `RefAdminNav`, `LinesAdmin`). Gares : `StationsScreen`
  (`components/referentiels/stations-screen.tsx`) partagé par Réseau › Gares et l'administration.

## Shell (étape 3)

- **Shell v4 (lot 3, 15 oct. 2026)** : sections de la barre latérale par `NavModule.section` (`travail` / `reference`),
  compteurs par `NavTab.count` (clé de `ShellStatus.counts`) ; pastilles `CountPill` + `CountNote` (`shell/counts.tsx` : chiffre en
  CSS `content: attr(data-count)`, phrase reliée par `aria-describedby`, **jamais dans le texte du lien** : les E2E comparent les
  libellés exacts) ; couleurs de la barre latérale par jetons `--nav-*` (`bg-nav`, `bg-nav-on`, `bg-nav-card`, `border-nav-rule`,
  `shadow-[var(--nav-card-shadow)]`) ; boutons-icônes et menus du shell : `SHELL_ICON` / `SHELL_MENU` (`shell/shell-ui.ts`) ;
  état d'iRail : `irailHealth()` (`server/irail.ts`) dans `ShellStatus.irail`. `useSlideIndicator(…, { inset, rounded })` : trait
  arrondi (option gardée pour compatibilité : depuis le lot 5, tous les traits ont leur largeur réelle et glissent en `transform`). Un composant client qui lit `useShellStatus` importe une Server Action
  « server-only » : garder la logique pure testée dans un fichier à part (`module-tabs-fit.ts`).
- Navigation : **source unique** `src/navigation.ts` (6 modules, onglets en routes, `hideFor`, actions rapides,
  administration : `ADMIN.tabs` portent `group` + `icon`, `tabGroups()` ; section `AdminSection` de la barre latérale
  (groupes titrés repliables ≥ 1280 px, menu latéral sur le rail, `data-testid` `sidebar-admin`, `sidebar-admin-<page>`),
  « Plus » mobile groupé, barre du haut « Administration › page » (`topbar-admin-page`) sans onglets). Barre latérale (rail 96 px dès 768 px, 232 px dès 1280 px), barre du haut (fil, ⌘K, + Nouveau,
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
- **Tableaux larges** (15 oct. 2026, tableau coupé à droite) : `ScrollTable` (`components/ui/scroll-table.tsx`, client) =
  défilement dans le cadre (hauteur bornée à l'écran : en-tête collé, barre horizontale fine visible), ombres de bord
  (`scrollEdges`, `lib/scroll-edges.ts`, testé), `stickyFirst` (Train) et `stickyLast` (Copier) collants, zone
  focalisable nommée, `@container` : colonnes secondaires masquées par `hidden @5xl:table-cell` (District) / `@6xl`
  (Réf. DICOS), visibles dans le panneau. Une ligne pleine largeur porte `data-band` (exclue des colonnes collantes).
  Utilisé par Missions PMR et Groupes (et `/design`).
- **Où en est-on dans la journée ?** (15 oct. 2026, Missions PMR et Groupes) : les pages passent `now`
  (`brusselsMinutes(new Date())`) et `today` ; `useNowMinute(now)` (`components/pmr/day-progress.tsx`) part de la valeur du
  serveur (pas d'écart d'hydratation) et se relit toutes les 30 s et au retour sur l'onglet. `NowLine` (`data-testid=now-line`,
  ligne `<tr data-band>` ou `<li>`) insérée avant la première mission à venir, heure + « prochaine dans N min », point
  `animate-pulse-dot` (seule boucle, tolérée par `motion.spec.ts`), trait redessiné (GSAP, mouvement réduit respecté) quand
  il descend ; lignes passées `data-past` estompées (`[&>td>*]:opacity-60` : le fond des cellules collantes reste opaque),
  prochaine `data-next` + `NextBadge`. `DayStrip` (`day-strip`) : densité des prises en charge (IN au départ, OUT à
  l'arrivée) par demi-heure sur 6 h – 22 h au moins, curseur `strip-cursor` (transition CSS), clic sur une tranche =
  défilement vers la première mission de l'heure (`scrollToMission`, puis `highlightElements`), « Aller à maintenant »
  (`go-now`). Logique pure `lib/pmr/now-line.ts` (`nowSplit`, `dayPhase`, `untilLabel`, `stripRange`, `stripBuckets`,
  `stripTicks`, `indexAtMinute` ; testée). Pas de repère sans regroupement par jour (Historique). E2E
  `e2e/pmr-journee.spec.ts` (horloge fixée par `page.clock.install`).
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
- Écrans : `/reseau` (trains en direct, `?gare=&nom=&train=&jour=`), **`/operations/journal`** (ex-main courante :
  fil continu façon messagerie, `?entree=&pn=&q=&categorie=&urgentes=&agents=&n=`, `?train=&categorie=` pré-remplit la
  barre d'écriture ; `/operations/main-courante[/nouveau]` redirigent), `/reseau/pn` (Leaflet chargé à la demande,
  `?pn=&q=`), `/statistiques`. Cloche `components/shell/notification-bell.tsx` (SSE `notifications`).
- Variables : `IRAIL_URL`, `TILES_URL`, `CSM_USER_AGENT` (facultatives). E2E : `e2e/operations.spec.ts` avec
  `node e2e/mock-services.mjs 8094` et `IRAIL_URL=http://127.0.0.1:8094/v1 TILES_URL=http://127.0.0.1:8094/tiles/{z}/{x}/{y}.png`.

## Module Référentiels (étape 5, session 3)

- Données : `src/server/data/referentiels.ts` (lectures serveur, filtres `pb.filter` liés), `src/lib/referentiels/model.ts`
  (schémas zod contacts / procédures / documents). Écritures : `src/app/(app)/referentiels/actions.ts` (contacts,
  procédures, documents + upload `FormData`, restauration de version **réservée aux coordinateurs**).
- Écrans (`src/app/(app)/referentiels/`) : `/` **Annuaire** (refonte du 14 oct. 2026, `../docs/design/REFONTE-ANNUAIRE.md` :
  `components/referentiels/directory-board.tsx` ; formulaires / actions de fiche dans `contact-board.tsx`) ; `/lignes` (district DSE/DSO/DCE **majoritaire** + ligne
  d'un clic, sections Gares/PN/SPI, lien Carte PN) ; `/ptcar` et `/ebp` (`ReferenceTable` : recherche serveur paginée,
  cartes < 640 px, EBP « incomplètes ») ; `/documents` (**Procédures** Markdown + **Documents**, `Segmented` par `?vue=`,
  filtre catégorie). Composants `src/components/referentiels/*`.
- **Annuaire** : `listDirectory()` lit **toutes** les fiches (borné, ≈ 400) + les gares (`stations`, hors PANG) et joint à
  chaque fiche les alias des gares qu'elle cite (abréviation PtCar, nom NL : `stationAliasesFor`, mots entiers) ; la
  recherche tourne **dans le navigateur** à chaque frappe (`lib/referentiels/directory.ts`, pur et testé : repli accents /
  casse / ligatures, mots dans le désordre tous requis, numéro en forme nationale `+32` / `0032` → `0`, fautes tolérées
  **seulement au second passage** si rien ne correspond exactement, `keep` = filtres de la page appliqués avant ce second
  passage, classement, surlignage `highlightText` / `highlightPhone`, `suggestQuery` pour l'état vide). État dans l'URL
  (`q`, `category`, `zone`, `group`, `id`) par `history.replaceState`, rejoué au rendu serveur (lien partageable, ⌘K ouvre
  la fiche par `?id=`). Favoris (60) et « Consultés récemment » (8) dans **`users.preferences.directory`**
  (`readDirectoryPrefs`, actions `toggleContactFavorite` / `noteContactViewed`, jamais en « Voir en tant que ») ; les
  écritures de préférences passent **en file** côté client (lire-modifier-écrire : deux actions simultanées s'écrasaient) ;
  les bonus de classement viennent des préférences du chargement (une étoile ne réordonne pas la liste sous le curseur).
  Lignes : étoile, nom + catégorie / groupe / zone, numéro (`etrali:` desktop, bouton `tel:` 44 px mobile), copie, e-mail ;
  clavier : « / » focalise, ↓ / ↑ parcourent, Entrée ouvre le premier, Échap efface. E2E `e2e/annuaire.spec.ts` (attendre
  la Server Action **qui porte l'id de la fiche** avant de recharger : la barre latérale poste aussi ses compteurs).
- **Markdown** : `markdown-view.tsx` rend un sous-ensemble SÛR en **éléments React** (aucun `dangerouslySetInnerHTML`,
  liens bornés http(s)) — pas de dépendance ni de surface XSS.
- **Fichiers** : servis par `GET /api/referentiels/documents/[id]` avec le jeton de l'agent (fichier PocketBase
  **protégé**, jamais d'URL publique) ; visionneuse PDF / images depuis le 11 oct. (voir « Documents » plus bas).
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
  - motion : `src/lib/motion-core.ts` (CSS / Web Animations, sans GSAP : à utiliser partout) et `src/lib/motion.ts` (GSAP +
    `gsap.matchMedia()`, ease `hud`, pour une mise en scène propre à une page) ; budgets de DESIGN-DIRECTION.
- **Contrôles personnalisés (refonte R1 + R3, 14 oct. 2026, `../docs/design/REFONTE-UI-2026-10.md` §3.5)** : **plus
  aucun `<select>` ni champ `type="date|time|month|datetime-local"` natif dans un nouvel écran** (liste aux couleurs du
  système, format américain sur un poste en anglais, libellés coupés). Utiliser :
  - `Select` (`components/ui/select.tsx`) : `options: {value,label,hint?,icon?,disabled?}[]`,
    `value`/`defaultValue`/`onValueChange`, `placeholder`, `clearable` (option vide en tête = « Tous »), `name`,
    `disabled`, `label` (titre de la feuille mobile ; sinon le texte du `<label>`, sans l'option choisie). **Lot R5
    (14 oct. 2026)** : toutes les listes courtes migrées (même `name`, mêmes valeurs ; une option `""` « Tous » se met
    dans `options`, `onValueChange` reçoit `T | ""` → `v && set(v)` pour une liste sans option vide). Le `Select` natif
    d'`input.tsx` (ancien) ne reste que pour les districts et les listes longues (société, chauffeur, ligne, gares :
    lots R2 / R4) ; dans un fichier qui garde les deux, le personnalisé est importé `as CustomSelect`. E2E : plus de
    `selectOption`, helper **`chooseOption(page, libellé | Locator, option)`** (`e2e/helpers.ts`) ;
  - `Segmented` (`form-kit.tsx`, **R6**) : grille de 2 colonnes et libellés sur plusieurs lignes quand la rangée ne tient
    pas (mesure d'une rangée invisible, `segmentedNeedsWrap`), boutons en `flex-auto` (largeur selon le libellé) ;
    contrôlé (`value` + `onChange`) ou non (`defaultValue`) ; `name` → champ caché + `change` (formulaires GET) ;
  - `Switch` à la forme du thème (`rounded-control`, zone de 44 px en `pointer: coarse`) ; avec un libellé :
    **`SwitchField`** (`label`, `hint`, `reverse` : `<label>` englobant, 44 px de haut) ;
  - `DateField` (`date-field.tsx`, `jj/mm/aaaa`, `min`/`max`), `TimeField` (`time-field.tsx`, `HH:MM`, `step` = 5,
    `pending` « À confirmer », bouton « Maintenant »), `DateRangePicker` (`nameFrom`/`nameTo`, `defaultFrom`/`defaultTo`,
    `presets` `today|tomorrow|7d|last7|week`, `fieldClassName`), `MonthField` (`month-field.tsx`, `AAAA-MM`) ;
    `Calendar` (`calendar.tsx`, grille APG, fériés belges) ; logique pure `lib/dates/calendar.ts` (testée : saisie
    libre, Pâques, fériés, grille du lundi, heures, mois) ;
  - socle : `Popover` + `PickerSurface` (`popover.tsx` : Popover ancré en desktop, **feuille du bas Vaul** si
    `(max-width: 767px), (pointer: coarse)`), `Listbox` (`listbox.tsx`, motif APG, `listboxNavigate`, `useTypeahead`),
    pont formulaire (`form-bridge.tsx`) : valeur **ISO** dans un `<input type="hidden" name>` + `change` natif émis
    après un choix de l'agent seulement → `FormAutoSubmit` / `next/form` / Server Actions inchangés. Le champ texte
    visible n'a pas de `name` et son `change` natif est arrêté (`useStopNativeChange`) : une date tapée à moitié ne
    soumet rien. `Field` fournit `id` / `aria-*` au déclencheur ou au champ texte.
  - Tests : `select.test.tsx`, `pickers.test.tsx` (utilitaires jsdom `picker-test-utils.tsx` : matchMedia,
    ResizeObserver). E2E : `fill()` sur un TimeField accepte « 14:30 » ; un DateField attend `jj/mm/aaaa`
    (`frDate(iso)` dans `e2e/helpers.ts`). Démo et états dans `/design` (section « Listes, dates et heures »).
- **Recherche et choix multiples (refonte R2 + R4, 14 oct. 2026)** : plus de `datalist`, de `<select>` de liste longue
  (société, chauffeur, ligne) ni de `<select>` « district » ni de case native dans un nouvel écran. Utiliser :
  - `Combobox` (`components/ui/combobox.tsx`, motif APG « combobox with listbox popup, autocomplete list ») : `options`
    ou `loadOptions(q)` (synchrone ou Server Action : `aria-busy`, réponses périmées ignorées ; **mémoïser** la fonction),
    `value`/`defaultValue`/`onValueChange`, `filter` (défaut `comboboxMatch` : chaque mot, `foldStation`), `allowFree`
    (la valeur EST le texte, mise à jour à chaque frappe ; `change` du pont émis seulement à la validation : Entrée,
    sortie du champ, option), `normalize` (correction à la sortie), `createLabel` (+ `onCreate` sans saisie libre),
    `emptyText`, `openOnFocus`, `max`, `name`. Liste fermée en mobile / tactile = bouton + feuille du bas avec recherche ;
    saisie libre = liste sous le champ partout. Le champ visible n'a pas de `name` et son `change` natif est arrêté
    (`useStopNativeChange`) : dans les tests, taper avec `fireEvent.input`. `filterOptions` / `comboboxMatch` exportés.
  - `StationInput` (`components/orders/station-input.tsx`) = `Combobox allowFree` + `loadOptions` (`stationCandidates(q,
    refs, 8, true)`, sans la gare déjà saisie) + `normalize` (`canonicalStation`) ; contrôlé (`value`/`onChange`) ou non
    (`name`/`defaultValue`, filtres GET : Ressources › Trains « Dessert la gare » et « Par gare », refs `allStationRefs()`).
  - `DistrictPicker` (`components/ui/district-picker.tsx`) : puces `aria-pressed` dans un `role="group"`, `options`
    (`DISTRICT_CODE_OPTIONS` défaut, `DISTRICT_NAME_OPTIONS` pour les noms Sud-Ouest…), `values`/`defaultValues`/
    `onValuesChange`, `allLabel` (`null` = pas de « Tous »), `emptyValue` (« tous » : lève un filtre par défaut), `mine`
    (puce « Mes districts »), `layout="stack"`, `showHint`. `admin/district-picker.tsx` l'enveloppe (comptes).
  - `MultiSelect` (`multi-select.tsx`) : `Listbox multiselectable`, « Tout / Aucun », `searchable`, `noun`/`nouns` pour le
    résumé (`multiSummary`), `emptyValue` ; un seul `change` à la fermeture si les valeurs ont changé.
  - `CheckboxGroup` (`checkbox-group.tsx`) : `fieldset` + `legend` (`hideLegend`), `Checkbox` Radix, `checkAll`,
    `orientation`.
  - Pont multi-valeurs `useMultiFormBridge(values)` (`form-bridge.tsx`) : champs cachés **répétés** rendus par le contrôle
    + sentinelle qui émet `change` (`markUserChange()` au prochain rendu, `dispatch()` tout de suite). `Listbox` accepte
    `selected` en liste, `multiselectable`, `emptyText`, `busy`.
  - **Lecture serveur multi-districts** : `lib/district-param.ts` (pur, testé) → `districtTokens`, `isAllDistricts`
    (« tous » / vide), `parseDistricts(raw, permis)` (répété ou « DSO,DSE », codes ↔ noms, inconnus écartés),
    `anyDistrictFilter(pb, champ(s), valeurs, "=" | "~")` (OU lié), `appendDistricts(params, valeurs)` (liens). Chaque
    schéma zod de liste accepte `z.union([z.string(), z.array(z.string())])` ; `normalizeDistricts` / `effectiveDistricts`
    (PMR) et `handoverDistricts` (Relève, Ma journée, /tv) acceptent le paramètre répété. Une route qui lit
    `Object.fromEntries(searchParams)` perd les répétitions : passer `district: params.getAll("district")`.
  - Tests : `combobox.test.tsx`, `multi.test.tsx`, `lib/district-param.test.ts`. E2E : une société se choisit par
    `getByTestId("bus-company" | "taxi-company").fill(nom)` puis clic sur l'option ; une puce district par
    `getByRole("group", { name: "District" }).getByRole("button", { name: /DSO/ })`. Démo : `/design` › « Recherche et
    choix multiples » (`search-demo.tsx`).
- E2E `e2e/design.spec.ts` : `/design` dans les thèmes × 2 formats (captures `test-results/design-*.png`, pas de
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

- Formulaires de filtres : `next/form` via `FilterForm` (voir plus bas), jamais `<form method="get">` : navigation
  côté client, pas de rechargement. `FormAutoSubmit` reste valable.
- Keyframes : animer `transform`, `opacity` ; jamais la propriété `translate` (elle porte le centrage Tailwind
  `-translate-x-1/2`).
- Trait d'onglet : `useSlideIndicator(listRef, barRef, sélecteur)` (`lib/motion-core.ts`), trait `w-px origin-left` : largeur
  finale posée d'un coup, glissement en `transform` seulement (FLIP `translateX` + `scaleX`, Web Animations).
- **Lot 5 (refonte v4, 15 oct. 2026) — mouvement sans GSAP** : `lib/motion-core.ts` (aucun import de `gsap`) = `MOTION`,
  `EASE`, `CASCADE`, `reducedMotion()`, `playEnter(els, { cascade })` (classe `.motion-enter` de `globals.css` : fondu + 6 px,
  320 ms, `--ease-out`, `--enter-delay` 40 ms × 4 blocs au plus, classe retirée à la fin), `useStaggerIn`, `useSlideIndicator`,
  `highlightElements` et `ghostFlip` (Web Animations ; le fantôme est posé à sa place finale et animé en `transform`),
  `animateFrom(els, from, { duration, delay, stagger, maxDelay })` (équivalent de `gsap.from`). **Shell, `components/ui` et
  tout composant monté sur de nombreuses pages importent `@/lib/motion-core`, jamais `@/lib/motion`** (qui ajoute GSAP,
  ≈ 40 Ko compressés, au bundle de la page ; il réexporte les primitives pour les anciens imports). `PageTransition` et
  l'intro de connexion sont en CSS ; `BrandMark` charge GSAP par `import()` à l'apparition. E2E `motion.spec.ts` : arrivée
  CSS jouée puis retirée, rien en mouvement réduit, `window.gsapVersions` absent sur un bon bus.
- **CLS** : une liste personnalisée (`Combobox`, `Select`, `MultiSelect`) est un champ au rendu serveur et devient un bouton
  (feuille du bas) une fois hydratée en mobile : dans une barre de filtres, **fixer la largeur de son `<label>`** (`w-36`,
  `w-full sm:w-72`), sinon les filtres suivants changent de rangée. Un texte qui change après l'hydratation (« Connexion… » →
  « En direct ») réserve la largeur du plus long (`LiveRefresh`). Ne pas ajouter de `loading.tsx` sans mesure : essayé au
  lot 5, il dégradait le LCP au chargement complet (Lignes 340 → 504 ms, Suivi 420 → 516 ms), ajoutait du CLS, rendait
  200 au lieu de 404 pour une page gardée et laissait un instant le contenu en double (`div[hidden]` du streaming : les
  E2E en mode strict échouaient).
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
  (`app/search-actions.ts`, droits de l'agent ; **granulaire depuis le 14 oct. 2026** : renvoie `SearchGroup[]` — un groupe
  par type, en-tête « Module › Type », 5 résultats, `more` = « Voir tout » vers `?q=` de la page —, chaque groupe gardé par
  `can()` ou `routeOk()` (onglet de `visibleModules`, comme `requireRoute`), requêtes `getList(…, ≤ 20)` + `fields`, filtres
  liés, `Promise.allSettled`. Lecture de la saisie, ordre des groupes, rang des gares : `lib/search/palette.ts`
  (`parsePaletteQuery`, `paletteGroupOrder`, `rankStations`, testés). Tout nouveau groupe : entrée dans `PALETTE_GROUPS` +
  icône `HIT_ICON` (`command-palette.tsx`), jamais de donnée nominative PMR. Résultat actif contrôlé (premier résultat à
  l'arrivée). `data-testid="palette-group-<id>"` ; E2E `e2e/palette.spec.ts` (données fictives IC96 / 99961 / L.996 / ZPQ,
  IC95 / 99951 / L.995 / ZPR en mobile)) ; `PageShortcuts` (« / », « N » via
  `data-shortcut="new"`) ; Journal `markAllRead`. E2E `e2e/ux.spec.ts`.
- Lot 4 : `<LiveHighlight scope sigs context />` + `data-hl-scope` sur le conteneur et `data-hl` sur l'élément visible
  (la carte, pas un `<li>` transparent) ; `useCopy()` / `CopyButton` / `CopyIcon` (`components/pmr/copy.tsx`) pour
  toute copie ; ligne active via `Tr selected`.
- Formulaires de filtres : **`FilterForm`** (`components/ui/filter-form.tsx`, `next/form` avec `key` = paramètres
  d'URL) et jamais `Form` directement. Transition de page : `PageTransition` (shell) anime `[data-page-body]`
  (posé par `ModuleLayout`). Raccourcis à une touche : `shortcutsEnabled()` (réglage « Affichage »).
- **Tutoiement** dans toute l'interface (décision du 9 oct. 2026) ; seuls les e-mails aux fournisseurs
  (`lib/orders/mail.ts`) vouvoient. Barre mobile : 5 modules (`mobile: true`, `shortLabel`) + « Plus ».
- E2E `e2e/motion.spec.ts` : palette sans glissement, aucune animation infinie (hors `animate-pulse-dot` /
  `animate-spin`), accueil sans flash, filtre sans rechargement.
- **Extension DICOS** (`/extension`) : paquets lus dans `downloads/dicos-connector/` (`server/extension.ts`,
  `release.json` validé par zod), servis par `api/pmr/extension/[file]` ; `next.config.ts` → `outputFileTracingIncludes`
  (sinon absents du standalone). Nouvelle version de l'extension : manifests + `lib/pmr/extension-releases.ts` +
  `../extension/build-zips.sh` (test `extension-releases.test.ts`).
- **Jetons de connecteur** : `server/dicos-service.ts` → `authenticateConnector(jeton, version)` (personnel `csmc_…` ou
  partagé), `ingestConfigured()`, `extensionVersion()` ; actions `pmr/extension/actions.ts` (`createConnectorToken`,
  `revokeConnectorToken`, jeton en clair renvoyé une fois) ; `components/pmr/extension-connect.tsx` (dialogue
  `postMessage` avec `csm-link.js` : `ping` / `hello` / `configure` / `configured`). `SyncStatus` reçoit `partialAt`
  et `by` de `dicosSyncState()`. `isNewer()` dans `lib/pmr/extension-releases.ts`.
- Pied de page : `StudioCredit` (`components/shell/studio-credit.tsx`) dans `AppShell` (le `footer` porte la marge basse
  de la barre d'onglets mobile, plus `main`) et sur `/connexion`.
  Mention « CM Interactive · une division de CARDOR Media » ; emblèmes animés `BrandMark` (`brand-mark.tsx` : Dragon
  `public/brand/occ-interactive.svg`, roue `cardor-monogram.svg`, repris du dépôt `mons-corp`) chargés puis insérés,
  glitch / tour au survol de `[data-brand-host]`, monochromes au repos et couleurs de la charte au survol (`globals.css`).
- Filtres PMR / Groupes : `hideCancelled(f)` (`components/pmr/filter-bar.tsx`, `?annulees=masquees`) → option
  `hideCancelled` de `listAssists` / `listGroups`. Fichiers statiques publics sans session : `public/brand/`
  (`PUBLIC` dans `middleware.ts`).
- « Masquer les annulées » mémorisé : `resolveCancelledPref(user, param)` (`server/pmr-prefs.ts`) lit / enregistre
  `users.preferences.pmr.cancelled` ; logique pure dans `lib/pmr/cancelled-pref.ts` ; la barre de filtres envoie
  toujours la valeur explicite.
- Firefox signé : le job CI `sign-firefox` commite `downloads/dicos-connector/csm-dicos-connector-firefox-v<version>.xpi`
  (+ `release.json`) ; la page propose alors « Installer dans Firefox ». Premier `.xpi` signé : v1.7.0 (9 oct. 2026).
  Jamais de marqueur d'omission de CI dans ce commit (ni ailleurs, même cité) : Coolify ne redéploierait pas `csm-web`.
- Admin « Appareils connectés » : `/admin/extension` (`listAllConnectorTokens`, propriétaire en expand) et fiche d'un
  compte (`listMyConnectorTokens(id)`) ; `TokenList` exporté (`admin` → action `revokeAgentConnectorToken`).
- **Retards des trains de mission** : `lib/pmr/train-delay.ts` (`trainKey`, `stopAt`, `missionImpact`, testé, miroir du hook),
  `listTrainStates(du, au)` (`server/data/pmr.ts`), `DelayBadge` (`components/pmr/train-chip.tsx`, « +12 » ambre / rouge
  dès 15 min, « Supprimé ») à côté du train dans Missions PMR et Groupes (prop `delays`), sujet SSE `mission_trains`.
  Widget d'accueil **« Missions impactées »** (`impacts`, `server/data/impacts.ts` : districts du jour de l'agent).
- **ALEA « encodé »** : actions `aleaMarks` / `setAleaMark` (`pmr/actions.ts`) ; `AleaButton` reçoit `kind` et `canMark`,
  bouton « Encodé » par bloc (auteur au survol), filtre « À encoder », SSE `alea_marks` pendant que la modale est ouverte.
- **Journal v2** : réponses (`replyTo` / `replyCount` dans `LogEntry`, `listReplies`, panneau « Réponses », citation
  cliquable `log-quote`, bouton `log-reply`, barre `log-replying`) ; recherche plein texte (chaque mot dans le texte,
  l'auteur ou le train) avec surlignage (`ChatMarkdown highlight`) ; image collée → pièce jointe (`onPaste`) ; suggestions
  `@DSO` / `@DSE` / `@DCE` ; mobile : catégorie en liste déroulante, méta compacte (heure seule), actions en icônes, fil
  bord à bord. Tri automatique : `lib/ops/journal-rules.ts` (`ruleCategory`, miroir du hook, testé), page
  `/admin/journal` (`JournalRulesEditor`, `saveJournalRules`, `reclassBacoMessages`).
- **Temps réel partagé** : `lib/live.ts` (`subscribeLive(topics, onChange, onState)`) = UNE connexion SSE par onglet (union
  des sujets). Ne jamais ouvrir un `EventSource` directement : en HTTP/1.1 le navigateur limite à 6 connexions par domaine
  et l'accueil (widgets en direct + cloche) bloquait la navigation. `LiveRefresh`, la cloche et l'ALEA passent par le hub.
- Continuité ligne → panneau : `ghostFlip` (`lib/motion.ts`) déclenché par `Sheet` à l'ouverture depuis la dernière ligne
  cliquée (< 800 ms) ; rien en mouvement réduit.
- Widgets d'accueil : `pmr-jour` (« Aujourd'hui en PMR », `todayPmr`) et `mentions` (« Mentions et alertes », même source
  que la cloche). 11 widgets dans `WIDGET_IDS`, 9 affichés depuis le 11 oct. 2026 (l'E2E shell en compte 9).
- Impression : `@media print` dans `globals.css` (thème clair forcé, shell / filtres / actions masqués via
  `data-print="hide"`, `FilterForm` et `ChipRow` masqués, vue tableau imprimée, fil du Journal en entier) ; bouton
  « Imprimer » dans le Journal.
- E2E Admin : `e2e/admin.spec.ts` (compte `E2E_ADMIN_IDENTITY` / `E2E_ADMIN_PASSWORD`, créé par la CI).
- **B201** (15 oct. 2026, `/operations/b201`, onglet `anyOf: [journal:read, b201:read]` ; `/operations/releve`,
  `/ressources/b201`, `/commandes/b201` redirigent en 308) : la Relève renommée, qui remplace l'ancienne remise B201 de
  Ressources. Un jour (`?jour=`, ← / → / T par `B201Keys`) et des districts (codes ou noms, ceux du jour par défaut,
  `tous`) ; sommaire en puces ; **Synthèse de la relève** (`HandoverView`, aujourd'hui seulement : c'est un instantané ;
  « Copier » / « Épingler » = la synthèse SEULE, sans les notes : `handoverText` n'a plus d'option `notes`, décision du
  15 oct.) ; **Notes et commentaires du jour PAR DISTRICT** (`b201_notes`, une fiche par jour + district DSO / DSE / DCE ;
  districts montrés = `notesDistricts(codes)` des districts de la page, « tous » = les trois) : `components/ops/b201-board.tsx`
  → `DistrictNotesEditor` par district (`data-testid` `b201-notes-<D>`, son `useAutosave`, son verrou optimiste, « Modifié à …
  par … », ses versions, dialogue « Versions du jour · <D> ») → `MarkdownEditor` (`components/ops/markdown-editor.tsx` : barre
  d'outils gras / italique / titre / listes / lien, Ctrl+B / I, aperçu `ChatMarkdown`, côte à côte dès 1024 px, onglets Écrire /
  Aperçu plus étroit). Plusieurs districts : éditeurs l'un sous l'autre dès 768 px, **onglets** en dessous (`b201-notes-tab-<D>`,
  panneaux masqués mais montés : saisie et enregistrement gardés). Notes d'avant le 15 oct. (fiche du jour `b201_reports`, sans
  district) : bloc `CommonNotes` (`b201-common`, « Notes communes (avant le 15 oct.) », lecture seule, Copier), une fois
  au-dessus des districts. **Transports du jour** (commandes + saisies hors outil, fiche du jour, autosave à part). Logique pure
  `lib/ops/b201.ts` (`B201_DISTRICTS`, `B201_DISTRICT_LABEL`, `COMMON_NOTES_TITLE`, `notesDistricts`, `noteSections`,
  `legacyNotesToMarkdown`, `b201NotesOf` : relit `notes` si `content` est vide, `applyFormat`, `markdownToPdfLines`,
  `parseVersions` ; testée, avec le hook `pocketbase/pb_hooks/lib/b201.js`). `b201Data(day, noms, user, codes)` → `notes`
  (`DistrictNotes[]`), `common`, `manual`, `updated` (fiche du jour). Actions (`commandes/actions.ts`) : `saveB201`
  `{ day, manual, expectedUpdated }` (fiche du jour, plus jamais `content`) et `saveB201Notes` `{ day, district, content,
  expectedUpdated }` (création concurrente = conflit, jamais d'écrasement). PDF `/api/commandes/b201/{jour}/pdf` : notes
  communes puis une section « Notes DSO · Sud-Ouest » par district demandé (même vide), synthèse de la relève (jour même,
  `journal:read`), transports par période. Sujet SSE `b201_notes`. E2E `e2e/b201.spec.ts` (deux districts, notes séparées,
  Copier sans notes, notes communes ; `E2E_SHOTS_DIR`).
- **Synthèse de la relève** (ex-« Relève de service », dans la B201, `journal:read`) : `server/data/handover.ts` (`buildHandover`, districts du jour
  ou `?district=DSO|DSE|DCE|tous`) → bons bus / taxi terminés à envoyer, en cours ; missions et groupes
  à venir (jusqu'à demain 10 h) ; trains en retard ; ALEA du jour non encodés ; urgences 12 h + consignes ; perturbations
  iRail 12 h. Texte copiable `handoverText` (`lib/ops/handover.ts`, testé), « Épingler au Journal » (`pinHandover` :
  consigne épinglée 12 h). Trajets et bouts ALEA partagés : **`lib/pmr/legs.ts`** (`legOf`, `groupLegOf`, `aleaEnds`,
  `groupEnds`) — plus dans les composants.
- **Frise « Ma journée »** (`/operations/journee`, `journal:read`, chaque type selon ses droits) : `server/data/timeline.ts`
  (`buildTimeline` : bouts IN / OUT, retard par bout via `missionImpact` sur une copie IN seul / OUT seul, bons du jour hors
  annulé), placement pur `lib/ops/timeline.ts` (`span` retard compris, `packLanes`, `hourRange` 6 h – 22 h au
  moins, `nextIndex` ; testé), composant `components/ops/day-timeline.tsx` (desktop horizontal `hidden md:block`, mobile
  agenda `md:hidden` : les deux sont dans le DOM, viser `timeline-desktop` / `timeline-mobile` dans les tests).
- **Notifications du navigateur** : `lib/browser-notify.ts` (préférence `csm-notifications-navigateur`, types `urgent` /
  `mention` / `train`, `notificationBody` sans texte de message, testé), déclenchées par `NotificationBell` ; réglage
  `BrowserNotifyToggle` dans `theme-switcher.tsx`. Chromium headless refuse la permission : tester avec un `Notification`
  simulé (`addInitScript`).
- **Feuille de route** : `server/data/roadmap.ts` (`buildRoadmap`, gare comparée par `stationKey`, PtCar → abréviation
  du matériel) + `roadmapPdf` (`server/pdf/order-pdf.ts`, `gridTable` générique). **ALEA commun** : `mergeAleaBlocks`
  (`lib/pmr/model.ts`, `parts` / `totalLabel`, testé), `AleaButton kind="commun"` (marques chargées par liste, clé
  `liste|bloc`).
- **Avatar** : fichier protégé, jamais d'URL PocketBase au navigateur : `/api/avatar/<id>?v=<fichier>[&t=256]` (jeton de
  fichier de l'agent, `Cache-Control: private`, CSP sandbox). `Avatar` (`components/shell/avatar.tsx`) prend `id` + `avatar`
  (repli initiales) ; `TeamMember.avatar` / `workPhone`, `LogEntry.authorAvatar`, `ShellUser.avatar`.
- **Mot de passe oublié** : `app/connexion/reset-actions.ts` (`passwordResetEnabled` lit `/api/csm/password-reset` de
  PocketBase), pages `/connexion/mot-de-passe-oublie` et `/connexion/nouveau-mot-de-passe` (publiques par le préfixe
  `/connexion`). **Passkeys** : `server/passkeys.ts` (identité WebAuthn, défis, routes internes), `app/passkey-actions.ts`,
  `components/team/passkeys.tsx` (`PasskeyLoginButton`, `PasskeysCard`), `components/admin/user-passkeys.tsx`. Variables :
  `CSM_INTERNAL_SECRET` et `CSM_PUBLIC_URL` (obligatoires pour les passkeys ; en local `http://localhost:3000`). E2E : le bouton de connexion se vise par
  `{ name: "Se connecter", exact: true }` (le bouton passkey contient « Connexion »).
- **PWA** : `app/manifest.ts`, `public/sw.js` (navigation : réseau puis `offline.html` ; jamais de cache de données),
  `components/pwa-register.tsx` (production seulement). Tout nouveau fichier statique chargé sans cookie (manifeste,
  icônes) doit être ajouté à `PUBLIC` dans `middleware.ts`. **Écran commun** : `app/tv/page.tsx` (hors `(app)`, donc sans
  shell ; `requireUser({ screen: true })` + `journal:read` ou rôle « Écran »), `components/ops/tv-board.tsx` (réutilise `buildHandover`).
- **Sessions** : `server/sessions.ts` (`startSession` après connexion mot de passe / passkey, `sessionAlive` appelé par
  `getCurrentUser` : cookie `csm_sid` **absent** ou inconnu → déconnecté ; erreur réseau ou collection absente ≠ déconnexion ;
  le flux SSE revérifie la session à l'ouverture puis toutes les ~2 min ; tout est coupé sans `CSM_INTERNAL_SECRET` ≥ 32 car.,
  `sessionsEnabled()`, CI et local), `endSession` à la déconnexion ;
  `lib/sessions.ts` (`deviceLabel`, `maskIp`, testés) ; actions `listMySessions` / `revokeMySession` / `logoutOtherDevices`
  (`equipe/actions.ts`). **Statut** : `setMyStatus`, `statusOf` (`lib/team.ts`), `LogEntry.authorStatus`,
  `TeamMember.status`. **Accueil** : `lib/home.ts` (`HOME_CHOICES`, `homeOf`), `setMyHome`, redirection dans `login` et
  `passkeyLogin` (le paramètre `suite` reste prioritaire). Cartes `components/team/profile-extras.tsx`.
- **Campagnes** : `lib/mail/campaign.ts` (`renderCampaign`, `parseCampaign`, `CAMPAIGN_TEMPLATES`, `DEFAULT_CAMPAIGN`, testé),
  `app/(app)/admin/campaign-actions.ts`, `components/admin/campaigns.tsx`, page `/admin/campagnes`. Destinataires filtrés en JS
  (PocketBase refuse le filtre sur `email`). **Modèles** (15 oct. 2026) : « Basculement BACO → CSM (jour J) » (défaut, `jour-j`)
  et l'annonce du 10 oct. (`annonce`), choisis par la liste « Modèle » d'une nouvelle campagne. **Blocs de mise en page** en plus
  du Markdown du Journal (ligne `::: nom` … ligne `:::`, fin du texte sinon ; nom inconnu = texte) : `bandeau` (`# Titre` puis
  accroche ; en tête, remplace le titre = objet et sert de texte d'aperçu caché), `bouton [Libellé](https://…)` (une ligne ; sans
  bouton, « Ouvrir CSM » est ajouté en fin d'e-mail comme avant), `cartes` (`### 🧭 Titre` par carte, emoji de tête = icône
  `aria-hidden`, colonnes « hybrides » de 270 px : 2 en bureau, 1 sur téléphone, tableau fantôme `<!--[if mso]>` pour Outlook),
  `etapes` (« 1. … » ou « - … »), `encadre Titre`. Couleurs du thème Signal · Jour (pétrole), `@media (prefers-color-scheme:
  dark)` par classes `csm-*` (`csm-text` sur toute cellule de texte hors `<p>` / `<li>`, sinon invisible en sombre),
  `@media (max-width:520px)`. Aucune image, aucun script, aucune police web ; tout est échappé (`esc`, `safeHref`), un prénom
  perd `: #` (ne peut ouvrir ni bloc ni titre). Aperçu : iframe `sandbox` en 640 ou 375 px.
- **Prod** : `middleware.ts` pose `Cache-Control: … no-transform` sur les pages (Cloudflare réécrivait les e-mails du HTML).
- **Indexation / partage** : outil interne jamais indexé : `X-Robots-Tag: noindex, nofollow` (middleware + `next.config.ts`),
  `robots: { index: false }` dans le layout racine, `app/robots.ts` (`Disallow: /`, public dans `PUBLIC` ; robots d'aperçu
  de lien autorisés sur `/`, `/connexion` et l'image), pas de sitemap. Carte de partage sur `/connexion` (Open Graph +
  Twitter, `metadataBase` = `CSM_PUBLIC_URL`) ; image `public/brand/og-csm.png` régénérée par `node scripts/og-image.mjs`.
- **Présence en direct** (barre du haut, `components/shell/online-presence.tsx`) : registre en mémoire du serveur Next
  (`server/presence.ts`, testé) alimenté par les flux `/api/events` ouverts (un onglet = un flux, la cloche s'y abonne
  partout), délai de grâce de 20 s (changement de page = flux rouvert), registre sur `globalThis` (la route et les actions
  chargent deux copies du module) ; sujet SSE **`presence`** produit par Next (jamais
  envoyé à PocketBase), action `onlineAgents()` (`equipe/actions.ts` → `listOnline`, champs de l'annuaire seulement).
  Une seule instance Next par environnement : si un jour plusieurs répliques, passer par PocketBase.
- **Rôles v2** (11 oct. 2026) : `lib/permissions.ts` = source unique côté web. Rôles `admin`, `sysop`, `moderator` (Modérateur : tout le catalogue, suppression comprise, Nouveautés via
  `canEditChangelog`, pas l'administration), `paco` (PACO/RCCA),
  `guest` (Invité) ; `PERMISSION_MODULES` (catalogue : module × actions `read` / `write` = création / `update` =
  modification / `delete`), `ROLE_DEFAULTS` (paco : tout sauf `:delete` ; guest : `otto:read`, `generate_taxi:read`),
  `isCoordinator()` remplace les anciens tests `role === "moderator"`. Toujours tester **`X:update`** pour modifier un
  enregistrement existant et **`X:delete`** pour supprimer (les règles PocketBase le font). Matrice admin :
  `components/admin/permission-matrix.tsx` (un clic : hérité → accordé → retiré). Districts permanents
  `users.districts` (`DistrictPicker`) ; `userDistricts()` (`lib/team.ts`) = jour coché → permanents → `district`.
- **Rôles v3, lots L0-L1** (14 oct. 2026, `../docs/design/CADRAGE-ROLES-V3.md`) : **catalogue des permissions**
  `lib/permissions/catalog.ts` = source unique (clé, tâche, libellé, phrase « Peut… », niveau, `requires`, `legacy`,
  rôles par défaut `roles` ; 56 clés v2 + 13 nouvelles qui remplaceront des tests de rôle au lot L2 : `bus:reopen`,
  `taxi:reopen`, `suppliers:read`, `pmr_equipment:manage`, `pmr_zones:read`, `journal:moderate`, `spi:read`,
  `timetable:read`, `team:read`, `quinyx:read`, `presence:read`, `changelog:read`, `changelog:write`). Lu par Node sans
  compilation : aucune importation, syntaxe effaçable seulement. `roleDefaults(role)` remplace l'ancien `ROLE_DEFAULTS`.
  **`npm run catalog`** (aussi en `prebuild`) écrit la copie des hooks `../pocketbase/pb_hooks/lib/catalog.js`
  (`catalog-module.ts`) ; `catalog.test.ts` échoue si elle est périmée, si les clés v2 ou leurs rôles par défaut changent,
  ou si `lib/permissions/compute.ts` (`computePerms`) et `pb_hooks/lib/perms.js` divergent. **`users.perms`** (écrit par
  PocketBase seul) est lu par `getCurrentUser` (`SessionUser.perms`, `ShellUser.perms`) : `can()` le suit pour toute clé du
  catalogue, sinon ancien calcul (instance sans le champ, droit hors catalogue comme `dicos:write`). Le compte de service
  lit `expand.user.perms` du propriétaire d'un jeton (`dicos-service.ts`) : grants / denies d'un autre agent sont masqués
  aux non-admins. Nouvelle permission : entrée du catalogue + `npm run catalog` + contrôle `test-rules`.
- **Rôles v3, lots L2-L3** (14 oct. 2026) : plus aucun test de rôle pour un droit de module : `can(user, clé)` partout —
  `bus:reopen` / `taxi:reopen` (prop `coordinator` des bons ; `TrackingBoard` reçoit `{ bus, taxi }`), `pmr_equipment:manage`
  (matériel complet, zones), `journal:moderate`, `changelog:read` / `changelog:write`, `presence:read`, `quinyx:read`,
  `team:read` (agents mentionnables : filtre `perms ~ '"team:read"'`), `timetable:read` (onglets Lignes / Trains / Gares, export
  des gares), `suppliers:read` (onglet Fournisseurs : `permission: ["otto:read", "suppliers:read"]`, un onglet peut exiger
  plusieurs clés). `isCoordinator`, `isJournalModerator`, `canEditChangelog`, `roleHas`, `ROLE_LABEL` supprimés ; `hideFor` ne
  sert plus qu'à l'Écran (« Mon profil »). Restent en dur : `isAdmin` (admin / sysop), `isScreen`, désactivé, connecteur.
  `Role` = identifiant texte d'une fiche `roles` (`SystemRole | string`) ; `getCurrentUser` accepte tout identifiant bien formé.
  **Rôles en base** : `lib/roles.ts` (`RoleMeta`, `DEFAULT_ROLES` = copie des rôles système de la migration, `roleLabel`,
  `avatarRing(role, roles)` — couleur du rôle, anneau doublé pour admin / sysop —, `assignableRoles`), `server/data/roles.ts`
  (`listRoles` en cache par requête, `getRole`, `roleKeys`, `roleUsage` ; repli sur `DEFAULT_ROLES`), `RolesProvider` /
  `useRoles` / `useRoleLabel` (`components/shell/roles-context.tsx`, monté par `AppShell` depuis `(app)/layout.tsx`) ; `Avatar`
  est un composant client (`useAvatarRing`). Admin : rôles proposés = `assignableRoles(listRoles())`, Administrateur / Sysop
  seulement pour un admin (`canAssignFull`, revérifié par `assertAssignable` et par le hook), matrice des droits = permissions du
  rôle (`PermissionMatrix role={RoleMeta}`).
- **Rôles v3, lots L4-L5** (14 oct. 2026) : logique pure **`lib/roles-editor.ts`** (testée) : `VISIBLE` / `TASK_GROUPS` (catalogue
  sans les lectures BACO cachées), `toggle` / `setTask` (dépendances ajoutées à l'activation, dépendants coupés),
  `taskSummary` (Tout / Voir seulement / Aucun / « 2 sur 4 »), `diffPerms`, `preview`, `impactSentence`, `searchEntries`
  (sans accents), `roleKeyFromLabel`, `historySentences` / `revertPatch` (journal d'audit `roles`), ajustements d'un agent
  (`adjustmentsOf`, `addAdjustment` qui accorde aussi les dépendances absentes du rôle, `effectivePerms` = `computePerms`,
  `adjustmentSignature`). **Administration › Rôles** (`/admin/roles`, onglet « Rôles » du groupe Comptes) : cartes,
  `NewRoleDialog` (modèle puis nom ; `?depuis=<agent>` = rôle tiré des ajustements d'un agent), éditeur
  `/admin/roles/[clé]` (`components/admin/roles/role-editor.tsx` : sections par tâche, `Switch` en phrases, badge
  « Sensible », aperçu `PermPreview`, « Comparer avec », `ActionBar`, récapitulatif + case de confirmation pour un droit
  sensible, toast « Annuler » = `saveRole` de l'état d'avant, historique + « Annuler ce changement », `DeleteRole` avec
  réaffectation). Actions `app/(app)/admin/roles/actions.ts` (`createRole`, `saveRole` avec verrou `expectedUpdated`,
  `revertRoleChange`, `deleteRole`, `reassignRole` ; le hook fait foi). Données : `listRolesAdmin`, `roleAgents`,
  `roleHistory`, `adjustmentPeers` (`server/data/roles.ts`). **Fiche d'un agent** : `AgentRights`
  (`components/admin/agent-rights.tsx`) — ajustements en phrases, « Ajouter un ajustement » (recherche), « X peut… »,
  suggestion de rôle, matrice 3 états en « Vue experte » repliée ; `setPermissions` accepte toutes les clés visibles du
  catalogue v3. Mobile : onglets « Droits / Ajustements » ↔ « Résultat ». E2E `e2e/roles.spec.ts` (`E2E_SHOTS_DIR`).
- **Suppression d'un bon** : Server Action `deleteOrder(kind, id)` (`commandes/actions.ts`, droits revérifiés par
  `canDeleteOrder` de `lib/orders/status.ts`, miroir du hook `checkDelete`, puis redirection vers `/commandes` ou
  `/commandes/taxi`) : droit de suppression du module, ou créateur avec droit d'écriture pendant 8 h, bon jamais envoyé
  (`wasSent` = un événement vers `envoye` dans l'historique). **Bouton** (14 oct. 2026) : `deletionFor(can, userId, meta, events,
  relation)` (server/data/orders.ts → `orderDeletion` de status.ts : `{ until }` = fin des 8 h, `null` = sans limite) passé aux
  formulaires (`deletion`) et au panneau du Suivi (`OrderPanel.deletion`) ; `useFormDeletion` (bon créé à l'instant dans le même
  écran), `useDeleteOrder` / `DeleteOrderButton` / `useRemaining` (`components/orders/delete-order.tsx`) : menu « ⋯ » desktop
  (`menu-delete-order`), feuille mobile sous « Annuler la commande » (`sheet-delete-order`), « Supprimable encore 7h05 »,
  confirmation « Supprimer définitivement le bon TC_… / taxi n° N ? » (`delete-order-confirm`) ; `deleteOrder(…, { redirect:
  false })` depuis le Suivi.
- **Taxi : gares via et n° de dossier** (14 oct. 2026) : `TaxiDraft.via_stations` (liste ordonnée ; `z.preprocess` reprend
  l'ancien `via_station` des brouillons / modèles), logique `lib/orders/via.ts` (`viaList` : JSON sinon ancien texte = une
  étape, `cleanVias`, `viaText` « A · B », `routeWithVias`, `moveVia`, testés) ; écrit `via_stations` + copie `via_station`
  (recherche liste et ⌘K). Champ `ViaStationsField` (`via-add`, `via-input-<i>`, `via-up/down/remove-<i>`). Taxi PMR :
  « Numéro de dossier » = `pmr_file` (`TaxiDraft.pmr_file`, masqué sans `pmr:read` par `redactPmr`, vidé à la duplication et
  dans les modèles), `normalizeDossier` (`lib/orders/dossier.ts`, AAAA-MM-JJ-NNNN, « 20261014134 » / « 2026-10-14-134 » remis au
  format, sinon message non bloquant), `DossierField` + Server Action `suggestDossiers` (missions `pmr_assists` du client ou du
  jour ±1 à la gare de départ / d'arrivée, taxis d'abord, sans nom). « Référence / relation » : taxis standard (et anciens PMR qui
  en ont une). PDF / e-mail : « Via 1, Via 2… », « N° de dossier ». Transition taxi brouillon → terminé : « Terminer »
  (`transitionsFor(…, { kind })`).
- **Archivage à 30 jours** (14 oct. 2026) : `lib/orders/archive.ts` (`isArchivedOrder` : envoyé depuis > 30 j sur `sent_at`,
  annulé sur `cancelled_at`, repli `ended_at` / `updated` pour BACO ; testé) ; `listSchema.archived` = `exclude` (défaut : listes
  bus, taxi, Suivi, compteurs), `only` (Commandes › Archives, vue « Bons archivés », `OrderList pdfFor` + `archivePdfIndex`),
  `include` (B201). Filtres PocketBase `archiveFilter` / `activeFilter` (complément explicite : pas de négation de groupe dans
  les filtres PocketBase). `OrderMeta.archived`, `OrderRow.archived` → `ArchivedBadge` (fiche, listes, ⌘K « Archivé »). Vue
  « PDF des bons » = `?vue=pdf`.
- **Avatars** : `avatarRing(role, roles)` (`lib/roles.ts`, `useAvatarRing` côté client) : couleur du rôle (neutre par défaut),
  anneau doublé pour admin / sysop ; passer `role` à `<Avatar>` partout (Journal compris).
- **Documents** (Ressources › Procédures et documents) : envoi par **`POST /api/referentiels/documents`** (30 Mo, type
  détecté par les octets, `lib/referentiels/detect.ts`) — jamais par Server Action (limitée à 1 Mo par Next). Lecture
  `/api/referentiels/documents/<id>` : image en aperçu, `?vue=1` PDF inline **sans `sandbox`** (sinon le lecteur PDF de
  Chrome ne s'ouvre pas), `?dl=1` téléchargement. Visionneuse `/ressources/documents/voir/<id>` (cadre même origine) :
  `next.config.ts` ne pose pas `X-Frame-Options: DENY` et le middleware ne pose pas sa CSP sur ce seul chemin (la route
  pose `SAMEORIGIN` + `frame-ancestors 'self'`). Envoi possible depuis le formulaire d'une procédure (document lié).
- **Archives des bons** : `server/archives.ts` (`archiveOrder` appelé par `transitionOrder` quand le bon passe « envoyé / finalisé » ;
  ne bloque jamais la clôture ; taxi archivé avec `redactPmr`), page `/commandes/archives` (`archives:read`), routes de
  téléchargement `/api/commandes/archives/<id>` (`?dl=1`) et `/api/commandes/archives/sauvegardes/<id>`, actions admin
  `archivePending` / `backupNow`, suppression `archives:delete`.
- **Shell v3 (11 oct. 2026)** : `Topbar` affiche le module courant et `ModuleTabs variant="bar"` (desktop) ; `ModuleLayout`
  garde le `h1` en `sr-only`, n'affiche qu'une ligne `eyebrow` / `actions` si présentes et les onglets sous 768 px.
  Puce des districts : `DutyChip` dans la barre du haut (`ShellUser.duty`, calculé dans `(app)/layout.tsx`) ; `DutyBanner`
  n'est plus monté. Compteurs et état des flux : `ShellStatusProvider` / `useShellStatus()` (`components/shell/shell-status.tsx`,
  relu au changement en direct, toutes les 60 s, onglet visible seulement) → action `shellStatus()` (`app/shell-actions.ts`,
  droits de l'agent, débit 40/min, `null` si dépassé). Accueil : `components/dashboard/todo.tsx` (`todoItems` testé,
  `TodoQueue`, `KpiStrip`) ; widgets `commandes` / `a-confirmer` gardés dans `WIDGET_IDS` mais non affichés (8 widgets) ;
  « Monter / Descendre » échangent avec le voisin affiché. États vides compacts : `data-compact-empty` sur un parent
  (CSS dans `globals.css`, `EmptyState` porte `data-slot`). Filtres : `FilterSubmit` (soumission auto + bouton invisible
  pour Entrée) et `ClearFilters` (`components/ui/filters.tsx`). `Sheet` : `modal={false}` et ancré (`top-12`, 28 rem)
  dès 1280 px, `html[data-sheet-docked]` resserre `#contenu`. `LiveRefresh quiet` : rien de visible en direct.

- **Rôle « Écran »** (`screen`, 11 oct. 2026) : compte du poste partagé, ne voit que `/tv`. `can()` renvoie toujours faux
  pour lui (droits accordés compris, `ROLE_DEFAULTS.screen = []`) ; `requireUser()` le renvoie vers `/tv` (307 pour une
  page, redirection pour une action) sauf `requireUser({ screen: true })`, appelé par `/tv` seul ; la connexion l'envoie
  sur `/tv`. `/tv` lit avec `buildHandover(user, codes, { screen: true })` (bons bus ouverts, missions PMR sans nom, trains,
  ALEA, urgences du Journal ; ni taxis ni groupes : règles PocketBase `1760003000`) ; districts = ceux de son compte.
  Exclu de l'annuaire Équipe, de « En ligne maintenant » (`listOnline` + le flux `/api/events` ne le compte pas), des
  mentions et des campagnes. Admin : rôle « Écran » dans les listes, matrice des droits remplacée par une note.
  `isScreen()` dans `lib/permissions.ts`.
- **Absente de DICOS** : l'ingestion envoie les identifiants vus (`seen`) avec chaque `dicos_syncs` ; `isAbsentFromDicos` /
  `latestSessions` (`lib/pmr/sync-state.ts`, testés) ; `dicosSessions()` + `Assist.absent` / `GroupMission.absent` posés par
  `listAssists` / `listGroups` (une requête `dicos_syncs` de plus, vide sans `pmr:read`) ; `AbsentBadge`
  (`components/pmr/absent-badge.tsx`) dans Missions PMR, Groupes et la Relève ; exclues de l'ALEA (`aleaEnds` /
  `groupEnds`) et des « Trains en retard » ; signalées dans la feuille de route (« ABSENTE DE DICOS, à vérifier ») et sur
  `/tv` (« Absente DICOS »).
- **Notifications `dicos`** (changement DICOS de dernière minute, sans nom) : icône dans la cloche, notification du
  navigateur avec le corps (gare, heure, train, type). Logique pure miroir du hook : `lib/pmr/dicos-changes.ts` (testée).
- **Fournisseurs** (Commandes › Fournisseurs, `/commandes/fournisseurs?type=bus|taxi&q=`, 11 oct. 2026) :
  `server/data/suppliers.ts` (liste filtrée en mémoire, fiches avec chauffeurs / contacts / lignes et nombre de bons),
  actions `commandes/fournisseurs/actions.ts` (création `:write`, modification `:update`, suppression `:delete`, listes
  taxi saisies une valeur par ligne), composant `components/orders/supplier-board.tsx` (liste, panneau, dialogues). Le
  bouton Supprimer est grisé si un bon cite la société (le hook PocketBase refuse de toute façon).
  **Lignes desservies** (15 oct. 2026) : `CompanyLines` = `MultiSelect` (recherche) alimenté par `railLineOptions()`
  (`rail_lines` → « L.96 — extrémités », `server/data/suppliers.ts`), enregistrement en masse par `setBusCompanyLines`
  (ajouts `otto:write` et seulement des lignes du référentiel, écrites « L.96 » ; retraits `otto:delete`) ; plus de saisie
  libre (`saveBusChild` « line » refuse une ligne hors référentiel). Anciennes valeurs : reconnues par numéro (« 96 » =
  « L.96 ») sinon gardées « hors référentiel » (retirables). Logique pure `lib/orders/company-lines.ts` (testée). E2E
  `e2e/fournisseurs.spec.ts`.
- **Supervision** (Admin › Santé) : `server/supervision.ts` (`readSupervision` → route interne PocketBase
  `/api/csm/health`, secret `CSM_INTERNAL_SECRET`, page `requireAdmin()` seulement), verdicts purs `lib/supervision.ts`
  (`cronVerdict` : en retard au-delà de 2 périodes + 5 min, `backupVerdict` : < 26 h / < 50 h, `archivesVerdict` ;
  testés). Cartes : dernière sauvegarde, SMTP, archives en attente de R2, Journal (conservation), tâches planifiées
  (tableau desktop, liste mobile), versions de l'extension (comparées à `release.json` par `isNewer`).
- **Recherche de gare tolérante** (11 oct. 2026) : `lib/stations/search.ts` (pur, testé : `foldStation`, `stationMatches`,
  `stationCandidates` — abréviation PtCar exacte, puis préfixe, puis contenu —, `stationTerms`, `stationMatchesAny`) et
  `server/stations.ts` (`resolveStationTerms(q)` : saisie + noms candidats tirés de `ptcar` (avec `ptcar:read`) et de
  `line_stations`, référentiels gardés 10 min en mémoire ; `stationFilter(pb, champs, termes, { fields, q })` : OU lié
  `~` sur chaque terme + champs « bruts » comme le train ou le n° de dossier). Le `~` de PocketBase est sensible aux
  accents : toujours passer par ces deux fonctions pour un champ de gare (Missions PMR, Groupes, Commandes bus / taxi,
  Ma journée, ⌘K, Ressources › PtCar et Lignes `?gare=`).
- **Filtres par défaut** : Missions PMR et Groupes filtrent sans `?district=` sur les districts du jour de l'agent
  (`effectiveDistricts`, `lib/pmr/district-filter.ts` ; plusieurs codes « DSO,DSE » acceptés partout : `inDistricts`
  dans `legs.ts` et les tableaux, `districtFilter` côté serveur) ; `?district=tous` (ou vide) lève le filtre ; depuis la
  refonte R4, `DistrictPicker` (« Tous », « Mes districts » = `PmrFilterBar myDistricts`, DSO / DSE / DCE cumulables,
  paramètre répété) dans la barre de filtres, statuts en `CheckboxGroup`. Un lien vers UNE mission précise (⌘K, Ma
  journée, Journal) porte `district=tous`. Bons bus : période par défaut J-1 → J+6 sans `du` ni `au`
  (`resolveBusPeriod`, `lib/orders/period.ts`), puces « Semaine » et « Toutes les dates » (`?du=&au=`).
- **Champ de gare** (`components/orders/station-input.tsx`, 11 oct. 2026, bons bus et taxi) : `StationInput` remplace les
  `datalist` natives (rien de visible pour l'utilisateur) : liste filtrée à la frappe (`stationCandidates`, accents / casse
  / tirets ignorés, abréviation PtCar via `reference.abbrs`), clavier (flèches, Entrée, Échap), nom corrigé vers celui du
  référentiel à la sortie du champ (`canonicalStation`) : lignes et arrêts intermédiaires se trouvent alors : `routeBetween` (`lib/orders/stops.ts`) = plus court chemin à travers
  le réseau (1 par arrêt, 4 par changement de ligne), sur plusieurs lignes au besoin (Mons → Charleroi-Central = L.118 →
  L.112 → L.124), lignes empruntées cochées d'office ; cocher / décocher limite l'itinéraire aux lignes cochées. **Bus direct** : seulement
  les gares de correspondance (`Route.transfers` : Mons → Charleroi-Central direct = La Louvière-Sud, Marchienne-au-Pont),
  les autres arrêts restent en puces pour en ajouter ; basculer Omnibus / Direct recalcule (`setDirect`). **Choix libre des arrêts** : section « Toutes les gares des lignes
  cochées » (`lineStations`, puces par ligne, ouverte d'office sans itinéraire) ; un arrêt coché est rangé dans l'ordre de
  l'itinéraire puis des lignes (`toggleStop`). Un direct avec arrêts les imprime (PDF « DIRECT », e-mail « Direct, arrêts : … ») ;
  sans arrêt : « Direct (sans arrêt) ». Lignes affichées par `lineLabel()` (`lib/lines.ts`) : jamais « L.L.132 ».
- **Bons et référentiel des trains** (14 oct. 2026) : `StationInput` ne prend plus que `refs` (`reference.stationRefs`,
  `orderStationRefs` dans `server/data/orders.ts` : `stations` d'abord — premier nom = FR retenu, puis NL et alias, abréviation
  —, puis les gares de `line_stations` absentes ; sans `stations`, gares des lignes + PtCar) ; `stationCandidates(q, refs, max,
  true)` et `canonicalStation(value, refs)` (`lib/stations/search.ts`) renvoient le nom FR. Trajet : Server Actions
  `commandes/train-actions.ts` (`orderTrainRoute` : `exactStationKeys` + `trainsThrough` (400 trains au plus, `stations_key` /
  `pass_key`) ; `orderTrain` : `trainVariants` + `pickVariant` selon le jour ; débit 240/min) ; logique pure
  `lib/orders/train-route.ts` (`legOf`, `reverseLegOf`, `trainRoute`, `mergeOrder`, `dayBit`, `stationsFromTrain`, testés). La
  ligne d'un arrêt (`l`) est celle du tronçon qui en part : lignes d'un trajet = `l` du départ à la veille de l'arrivée.
  `bus-form.tsx` : `trainInfo` (clé gares + jour), `applyPending` (posé par `setPlace`, consommé à la réponse ; une simple
  correction de casse ne touche à rien) ; avec un trajet tiré des trains, cocher une ligne ne recalcule pas les arrêts et
  Omnibus / Direct prend le train omnibus / direct. Lignes comparées par `lineId` / `sameLine` (`lib/orders/stops.ts` :
  « L.96 » = « 96 »). `TrainNumberField` (`components/orders/train-field.tsx`, `data-testid` `train-number`, `train-info`,
  `train-apply`, `train-undo`) : reprise d'office si la gare d'arrivée est vide, jamais pour un bon rouvert ; `train_number`
  dans les brouillons (chiffres seulement, saisie partielle nettoyée par zod). E2E : fixtures « Alpha / Bravo / Charlie /
  Delta E2E <format> », trains 99831 / 99832. `E2E_BASE_URL` change le port de Playwright en local.
- **Widget « Fin de service »** (`service`, 11 oct. 2026) : `lib/shift.ts` (AM 06–14, PM 14–22, Nuit 22–06, Extra 08–16,
  heures de Bruxelles ; `shiftDayFor` : nuit choisie après minuit = nuit de la veille ; `shiftState`, `isStale` après 6 h ;
  testés), choix dans `users.preferences.shift` (`saveShift`, `dashboard-actions.ts`), `components/dashboard/shift-widget.tsx`
  (premier rendu à l'heure du serveur `renderedAt`, identique serveur / hydratation, puis chaque seconde, arrêté onglet
  caché ; l'ancien espace réservé de 72 px faisait sauter l'accueil mobile de 54 px, 15 oct. 2026). `normalizeLayout` le place en tête des dispositions
  existantes ; les autres nouveaux widgets vont à la fin.
- **Statut par bout (IN / OUT)** (12 oct. 2026) : `pmr_assists` / `group_missions` ont `in_status` et `out_status`
  (`1760003300`). `endStatus`, `combineStatus`, `mergeEnds` (`lib/pmr/dicos-mission.ts`, testés) : un trajet n'est
  « réalisé » que si **chaque bout assisté** l'est ; un bout absent du lot (vue DICOS limitée à une gare) garde le statut
  déjà stocké, inconnu = à faire. L'ingestion recalcule `status` après fusion (`train_cancelled` n'est jamais stocké).
  `Leg.inDone` / `outDone` → badge IN / OUT coché (`IoBadges`). **Filtre de statut à cases multiples** (Missions PMR,
  Groupes, Historique) : `statut=a&statut=b` ou « a,b », `parseStatuses` (`lib/pmr/model.ts`), `statusFilter`
  (`server/data/pmr.ts`) ; aucune case = tous (« Masquer les annulées » s'applique alors).
- **Barre d'actions des bons (refonte R6, 14 oct. 2026)** : `OrderActionBar` (`components/orders/order-action-bar.tsx`,
  `data-testid="order-action-bar"`) dans `bus-form.tsx` et `taxi-form.tsx`. Desktop inchangé. Mobile (< 768 px) : une seule
  action principale pleine largeur (`mainActionOf` dans `lib/orders/status.ts`, testé : Valider l'envoi > Créer le bon >
  transition principale > retour, jamais l'annulation) + « ⋯ » (`order-more`) qui ouvre une `Sheet` (`order-actions-sheet` :
  transitions secondaires `sheet-transition-<statut>`, PDF, dupliquer, modèle, retour ; « Annuler la commande » à part en bas,
  en `danger`). Les transitions passent par **`useOrderTransitions`** (`transitions.tsx`, logique + `dialog`) : le dialogue
  de motif est rendu hors de la feuille (la fermer ne le démonte pas) ; `TransitionButtons` (panneau du Suivi) l'utilise
  aussi. `ActionBar` collée à la barre d'onglets (56 px + bordure) : hauteur fixe en bas d'écran ≈ 118 px (≈ 193 avant).
  E2E « barre d'actions mobile » dans `e2e/commandes.spec.ts`.
- **Cycle des bons v3** (14 oct. 2026, `lib/orders/status.ts`, miroir du hook) : `brouillon` « Brouillon / en cours » →
  `termine` « Terminé » (bus démobilisés ; `TransitionButtons` ouvre le dialogue des heures de démobilisation) → `envoye`
  « Envoyé / finalisé » (verrouillé : `isEditable` faux ; « Rouvrir » = coordinateurs) ; `annule`. « Valider l'envoi »
  (`send-dialog.tsx`, bouton `validate-send`, affiché seulement sur un bon terminé : `prepare-send`) enregistre, télécharge
  le brouillon Outlook (`/eml` : X-Unsent, adresse du fournisseur, récapitulatif, PDF joint ; sans adresse : PDF seul) puis
  passe le bon en envoyé ; depuis le panneau du Suivi, `TransitionButtons` télécharge le `.eml` avant la transition.
  Archive PDF au passage → envoyé (`server/archives.ts` exige `envoye`). Bon neuf : bouton `create-order` « Créer le bon ».
  `historyLabel()` affiche les anciens statuts (Confirmé, En cours) de l'historique. Suivi : vues `a-envoyer` (défaut,
  terminés par `ended_at`), `aujourdhui`, `en-cours`, `toutes`. Accueil (`todo.tsx`) : « Bon bus terminé à envoyer »,
  KPI « Bons à envoyer » ; Relève `Handover { toSend, running }` ; barre latérale : bons terminés. Plus d'alerte H-2
  (`urgency.ts` supprimé) ni de relance fournisseur. Bons pris en compte par B201 et Ma journée : tout sauf annulé.
- **Référentiel des relations de trains** (Ressources › Trains, `/reseau/horaires`, 14 oct. 2026) : logique pure
  `lib/timetable/` (`model.ts` : relation, type, série demi-bloc, jours, `relationKey`, `referenceWeek` avec fériés belges ;
  `csv.ts` ; `infrabel.ts` : `pathCollector` ; `gtfs.ts` : `timetableBuilder` → services + relations, chemin Infrabel retenu
  si ≥ 60 % des arrêts connus s'y retrouvent ; testés), import `server/timetable/import.ts` (GTFS sur disque, lecteur zip
  maison `zip.ts`, Infrabel J-1 + fin du fichier mensuel par requête partielle, routes internes PocketBase), planification
  `scheduler.ts` démarrée par **`src/instrumentation.ts`** (condition `NEXT_RUNTIME === "nodejs"` en bloc, sinon le build edge
  échoue ; actif en production ou `CSM_TIMETABLE=on`, jamais sans `CSM_INTERNAL_SECRET`), données `server/data/timetable.ts`,
  page + `components/referentiels/trains.tsx`, bouton admin « Mettre à jour » (`after()`). Variables : `CSM_TIMETABLE`,
  `CSM_GTFS_URL`. E2E `e2e/trains.spec.ts` (données fictives IC98 / IC97). En local : `NODE_USE_ENV_PROXY=1` pour l'import.
- **Référentiel des gares** (Ressources › Gares, `/reseau/gares`, 14 oct. 2026) : `lib/timetable/stations.ts`
  (`buildStations`, `countryOf`, `aliasesOf`, testés) construit à l'import ; district par `StationDistrict` (action
  `referentiels/gares/actions.ts`, `ptcar:update`) ; `districtForStation` consulte d'abord `setDistrictOverrides` chargé par
  `server/station-districts.ts` (`loadStationDistricts()` en tête de l'ingestion DICOS) ; `resolveStationTerms` lit aussi
  `stations` (noms NL, alias des gares frontière). E2E dans `e2e/trains.spec.ts` (mode série : fixtures partagées).

## Changelog / Nouveautés (14 oct. 2026)

- Source : `../CHANGELOG.md` (racine). L'image Docker est construite depuis `web/` seul : **copie embarquée**
  `src/generated/changelog-source.ts` écrite par `npm run changelog` (`scripts/changelog.mjs`, aussi en `prebuild` ; garde la
  copie si la racine est absente). `src/lib/changelog.test.ts` échoue si la copie est périmée ou si une version est mal formée.
- Logique pure `lib/changelog.ts` (`parseChangelog`, `compareVersions`, `pendingRelease`, `seenVersion`, `releaseSummary` ;
  testés), lecture serveur `server/changelog.ts` (`releases()`, `currentVersion()` ; jamais dans le bundle client).
- Page `app/(app)/changelog/page.tsx` (hors module : `requireUser()`, l'Écran part sur /tv ; onglets « Mises à jour » et
  « Annonces de l'équipe » = `ChangelogBoard`, masqué à l'invité). `/equipe/nouveautes` → `permanentRedirect`. Lien unique
  `CHANGELOG_LINK` (`navigation.ts`) : pied de `Sidebar` (version), « Plus » mobile, ⌘K, libellé de la barre du haut.
  Rendu : `components/changelog/release-notes.tsx` (`MarkdownInline` de `markdown-view.tsx` : gras et liens seulement).
- Fenêtre « CSM a été mis à jour » : `(app)/layout.tsx` passe `update` (dernière version non vue, résumé 3 puces par section)
  à `AppShell` → `UpdateDialog` (portail Radix, rien dans le HTML serveur) ; fermer / OK / « Voir tout » / arriver sur
  `/changelog` appellent `acknowledgeChangelog` (`app/changelog-actions.ts` : `preferences.changelogSeen`, jamais en arrière ni
  au-delà de la version livrée). E2E : `e2e/global-setup.ts` met `changelogSeen = 9999.12.31` aux comptes E2E communs ;
  `e2e/changelog.spec.ts` crée ses comptes jetables. `E2E_BASE_URL` change le port de Playwright en local.
- **Ressources › Lignes** (`/reseau/lignes`, 14 oct. 2026) : lit `rail_lines` (plus `line_stations`). Ordre pur
  `lib/timetable/lines.ts` (`buildRailLines`, `sectionsFrom`, `stationIndex`, `lineDistrict` ; testé : sens inverse,
  raccourci, embranchement, bifurcation entre deux gares, trou kilométrique, point non voyageur) appelé par l'import après les
  gares (`readSections` : « lijnsecties » Infrabel, échec = avertissement, ordre gardé sans sens). Données
  `server/data/referentiels.ts` : `listLines(gare)` (district majoritaire calculé depuis `stations`, recherche
  `resolveStationTerms` + abréviation exacte) et `getLineDetail(ligne)` (« L.96 » ou « 96 » via `normLine` ; PN et SPI
  cherchés sous « 96 », « L.96 », « L96 », « L 96 »). `lineBoard` (Trains › par ligne) ordonne par `rail_lines`.
  `line_stations` reste lue par les bons bus (`lib/orders/stops.ts`, `server/data/orders.ts`), `resolveStationTerms`,
  `districtStations` (ops) et Admin › Lignes et arrêts (note : ne touche pas Ressources › Lignes). E2E : test « lignes » de
  `e2e/trains.spec.ts` (ligne fictive 998 / 997) ; `E2E_BASE_URL` change le port de Playwright en local.
- **Gares v2** (14 oct. 2026) : `StationsBoard` (`components/referentiels/stations-board.tsx` : sélection multiple,
  attribution en masse, validation des propositions, lignes et type) ; actions `applyDistricts` (400 au plus, par 8),
  `setStationLines`, `setStationKind` (`referentiels/gares/actions.ts`, puis recalcul des propositions) ; `STATION_DISTRICTS`
  (5) dans `lib/timetable/stations.ts` (les filtres d'équipe restent sur `DISTRICTS`, 3). Nouveau GTFS : `remoteGtfsModified()`
  (HEAD) dans `scheduler.ts` toutes les 3 h, comparé à `gtfsModified` de l'état.
- **Recherche pendant la frappe** : `<FormAutoSubmit live />` (debounce 450 ms sur les champs texte, focus et curseur rendus
  après la navigation via `globalThis.__csmLiveFocus`) dans Ressources › Gares, Lignes et Trains.
  **Piège (15 oct. 2026)** : au remontage de `FilterForm`, React retire l'ancien formulaire avec le champ encore focalisé ;
  Chrome émet `blur` puis `change` pendant le commit, et un `requestSubmit()` lancé à ce moment n'est pas intercepté par
  `next/form` → soumission native, navigation document complète. `FormAutoSubmit` pose donc ses écouteurs en
  **`useLayoutEffect`** (nettoyés avant le retrait du DOM), ignore `change` des champs texte en mode `live` et vérifie
  `form.isConnected`. Un nouvel écouteur qui soumet un `FilterForm` doit suivre la même règle. E2E « recherche pendant la
  frappe » de `e2e/motion.spec.ts` (marque sur `window` + aucune requête de navigation).
- **Cloche par districts du jour** : `notificationScope()` (`server/data/ops.ts`) filtre `listNotifications` et « Tout marquer
  lu » ; `DUTY_CHANGED` (`lib/team.ts`) émis par `DutyDialog` et le profil après `setDutyDistricts`, la cloche recharge et
  ré-amorce (pas de notification du navigateur pour celles qui réapparaissent).
- **District d'une ligne** : `lineDistrict` (`lib/timetable/lines.ts`) = districts à ≥ 30 % de toutes les gares
  (`LineRef.districts`) ; filtre Lignes : 5 districts + « Sans district ».
- **Lignes des bons et éditeur de lignes** (14 oct. 2026) : `orderLines()` (`server/data/orders.ts`) lit `rail_lines` via
  `railLineInfo` (`lib/timetable/rail-segments.ts` : « L.96 », `segments` = tronc + embranchements depuis leur bifurcation ;
  `segmentsOf` dans `lib/orders/stops.ts` pour `routeBetween` / `stopsBetween`). Éditeur `components/referentiels/line-editor.tsx`
  (`LineEditToggle` dans la fiche de Ressources › Lignes si `ptcar:update`), actions `referentiels/lignes/actions.ts`
  (`saveLineStations`, `resetLine`). `/admin/lignes` redirige (308) ; `LineBoard` et les actions `line_stations` supprimés.
- **Référentiel des gares par défaut** : `src/data/station-seed.json` (`stationSeed(key)`, test de validité), régénéré par
  `node scripts/station-seed.mjs <export.json>` depuis `/api/referentiels/gares/export?format=json` de la préversion.

## Horaires Quinyx (14 oct. 2026)

- Cadrage : `../docs/design/CADRAGE-QUINYX.md`. Logique pure `lib/quinyx/model.ts` (testée) : `quinyxBatchSchema`
  (lot de l'extension : un groupe, une période ≤ 62 j), `isCapturedCode` (PACO_ / RCCA_ / EXTRA seulement),
  `shiftKind`, `placeDistrict` (motif le plus long en mots entiers), `mapQuinyxBatch` (affectées, captées, jour <
  `publishedUntil` **inclus**, heures de Bruxelles → UTC par `brusselsToUtc`), `suggestUser` (nom complet identique,
  une seule correspondance), `weekDays`, `weekRows`, `brusselsClock`, `DUTY_NAME` (DSO → « Sud-Ouest »…).
- Ingestion : `server/quinyx-ingest.ts` (`connectorRequest` = jeton de connecteur + débit + compte de service,
  réutilisable ; `ingestQuinyx` : groupe configuré et activé sinon 404, agents créés / mis à jour avec proposition,
  upsert par `quinyx_id` (recherche par paquets dans le groupe, création concurrente relue), retrait des prestations
  disparues sur un lot `complete` sans erreur, limité aux agents `visible`, aux sections reçues et à 30 % (`removalAllowed`),
  un lot à la fois par groupe, `last_sync` posé seulement sans erreur ; prestations gardées seulement si l'agent est
  rattaché, ou proposé, à un compte de l'équipe : `isTeamAccount`, `TEAM_ROLES` ; les autres comptent dans `notTeam`) ;
  routes `api/equipe/quinyx/ingest` (2 Mo, 20 / min / jeton) et `api/equipe/quinyx/config` (groupes activés).
- Données : `server/data/quinyx.ts` (`listPlanning`, `myShifts` / `todayShiftOf` / `dutyShiftOf` = rattachement validé, ou proposé (`user_suggested`) tant que l'admin n'a rien validé,
  `quinyxSyncs`, `adminQuinyx`). Écrans : `/ressources/planning` (`components/team/planning.tsx` : `PlanningDay`,
  `PlanningWeek` — grille `planning-grid` en desktop, `planning-week-list` en mobile —, `QuinyxFreshness`) ;
  `/admin/quinyx` (`components/admin/quinyx-admin.tsx`, actions `admin/quinyx/actions.ts`, l'adresse
  `…/schedule/<n°>` collée est réduite au numéro, un compte CSM = un agent Quinyx).
- **Districts du jour posés d'office** (15 oct. 2026) : `getCurrentUser` → `applyQuinyxDuty` (`server/auth.ts`) : sans choix de
  l'agent aujourd'hui, `duty_day` / `duty_districts` pris de la prestation (`pickDutyShift`, `lib/quinyx/model.ts`, testé : en
  cours, sinon prochaine du jour, sinon dernière du jour) et `SessionUser.dutyFromQuinyx` = libellé ; à la requête seulement,
  rien en base. `DutyChip auto` (barre du haut et Journal : `data-auto="quinyx"`, infobulle, phrase dans la fenêtre). Widget « Fin de service » : prop `quinyx`
  (`windowState` de `lib/shift.ts`), un choix manuel reste prioritaire.
- Extension 1.8.0 : `src/quinyx.js` (onglet Quinyx, tri avant envoi), `src/quinyx-inject.js` (relève `x-app-version`),
  service worker `syncQuinyx` (bouton du popup ou ouverture d'une page `/schedule/`, au plus toutes les 3 h).
- E2E `e2e/quinyx.spec.ts` (groupes fictifs 990001 / 990002, agents « E2E Quinyx <format> », le compte E2E rattaché).
- **Groupes « gares »** (planificateur PMR, 15 oct. 2026) : `quinyx_groups.purpose` (`equipe` | `gares`, Admin › Quinyx,
  renvoyé par `/api/equipe/quinyx/config`, l'extension trie selon lui). `mapQuinyxBatch(batch, places, district, { purpose,
  bases })` : groupe `gares` → `isStationCode` (CPI / SPI / OPI / PA / EXTRA en tête du type), `stationPost`, `stationBase`
  (section, sinon type, sinon unité ; comparaison tolérante avec `planner_bases`, une seule base possible sinon rien),
  district = celui de la base ; heures réelles de la prestation. Ingestion : prestations de **tous** les agents (pas de
  filtre « équipe », pas de compte proposé), `quinyx_agents.purpose = gares`. `listPlanning` (`post = ""`), `quinyxSyncs`
  et l'admin (agents comptés à part, `stationAgents`) ignorent les agents de gare.

## Planificateur de tâches PMR (lot P0, 15 oct. 2026, `../docs/design/CADRAGE-PLANIFICATEUR-PMR.md`)

- Droits : `planner:read` / `planner:write` (PACO/RCCA et au-dessus), `planner:manage` (admin / sysop, sensible :
  référentiels, suppression d'une tâche DICOS). Onglet `/pmr/planificateur` (`requireRoute`, page minimale au P0).
- **Dossiers DICOS en attente** : l'extension 1.9.0 lit `GET /api/reservations/disableds/to-check` (identifiants de gare
  répétés) après chaque synchro (`withPending` dans `content.js`), réduit chaque dossier (`pickPending` : jamais client,
  remarques ni point de rencontre) et l'envoie à `POST /api/pmr/pending/ingest` (`connectorRequest`, 20 / min, 2 Mo,
  jours J-2 → J+60). Mapping pur `lib/pmr/dicos-pending.ts` (testé) : `mapPendingDossier` → une tâche par bout assisté
  (IN départ, OUT arrivée), clé `<journey.id>:IN|OUT`, type par `DICOS_SYMBOL` (fauteuil prioritaire), `pax` = somme des
  quantités, `light` = aucune « Full », `dicos_status` proposal / cancelled (train supprimé = annulé), `station_ok`.
  **`start = end = heure du train`** : la fenêtre (T−15 → T+5…) est calculée à l'affichage par `lib/planner/` (autre lot).
- **Missions acceptées** : fin de `POST /api/pmr/missions/ingest` → `syncPlannerFromAssists(pb, jour, ids)`
  (`server/planner-sync.ts`, jamais bloquant, compteur `planner` dans la réponse) : `tasksFromAssist` (même clé que le
  dossier en attente) relie la tâche (source `dicos_mission`, `accepted`, `assist`) ou la crée. `nextPlannerStatus` : une
  annulation passe la tâche en `annulee` **en gardant l'agent** ; rétablie = `attribuee` si une destination est posée,
  sinon `a_attribuer` ; `faite` reste. L'attribution n'est jamais touchée par une synchro ; tâche manuelle / de modèle
  jamais réécrite ; aucune suppression.
- Données : `server/data/planner.ts` → `plannerDay(day, districts)` = `{ day, bases, agents, tasks, bcs, templates }`
  (agents = prestations de gare du jour et nuit de la veille qui déborde ; `PlannerTask.district` déduit des bases ;
  `updated` = verrou optimiste). Actions `app/(app)/pmr/planificateur/actions.ts` : `assignTask(id, { kind, agentId?,
  label? }, expectedUpdated)`, `unassignTask(id, expectedUpdated)`, `createManualTasks(day, lines)` (lignes du parseur,
  heures « HH:MM » ou ISO, fin avant début = lendemain, 200 au plus), `deleteTask(id)` ; résultat `{ ok, … } | { ok:
  false, error, conflict? }`. Un fichier `"use server"` n'exporte que des fonctions async (le schéma zod reste local).

## « Voir en tant que » (Administration, 14 oct. 2026)

- Fiche d'un compte → « Voir en tant que » (`components/admin/impersonate-card.tsx`, action `impersonate` de
  `app/(app)/admin/impersonation-actions.ts`, `requireAdmin` + `impersonationRefusal`) ; absent pour admin / sysop, service,
  soi-même, et sans `CSM_INTERNAL_SECRET`. `server/impersonation.ts` appelle la route interne PocketBase avec le jeton de
  l'admin et pose **`csm_as`** = `<id admin>~<jeton statique de la cible>` (httpOnly, `SameSite=Strict`, `Secure` en prod,
  35 min ; jeton 30 min) ; `csm_session` / `csm_sid` de l'admin restent intacts. Logique pure : `lib/impersonation.ts` (testée,
  sans import : lue par le middleware).
- **`readSessionToken()` = jeton effectif** (celui de la cible pendant le mode) via `resolveActing()` (`server/session.ts`,
  par requête : cookie au même admin, admin encore admin / sysop, jeton non expiré, cible lisible ; sinon ignoré et effacé
  si possible, `stale`). Le jeton brut de la session : `readOwnSessionToken()` (déconnexion, `sessionAlive`). `getCurrentUser`
  rend la cible avec `impersonatedBy = { id, name }` et vérifie la session de l'admin ; `/api/events` s'abonne avec le jeton de la
  cible, revérifie la session de l'admin et coupe à l'expiration ; l'admin n'est **jamais compté « en ligne »** pendant le mode.
- **Lecture seule, deux barrières** : (1) `middleware.ts` refuse (403 + `x-csm-readonly`) toute méthode autre que GET / HEAD /
  OPTIONS, routes `/api` comprises, sauf `POST /api/admin/en-tant-que/fin` et les **Server Actions** (beaucoup ne font que lire :
  palette, compteurs, panneaux) ; il refuse aussi les exports nominatifs en GET (`isBlockedRead` : exports CSV, PDF, .eml, B201,
  feuille de route, archives, pièces jointes du Journal) ; (2) tout client `createPb(jeton de la cible)` est **en lecture seule**
  (`markReadOnlyToken`, `beforeSend` : seules GET / HEAD et `POST /api/files/token` partent ; sinon `ClientResponseError` 403
  « Lecture seule… » avant tout appel réseau, et cookie `csm_ro_hit` pour le toast du navigateur). Écritures hors PocketBase :
  `assertNotActing()` (passkey `register`, rotation de session, propositions de districts, archives). Neutralisés à l'affichage :
  fenêtre « CSM a été mis à jour » et `acknowledgeChangelog`, préférence « masquer les annulées ». Nouvelle écriture par route
  interne (secret) depuis une action d'agent : **appeler `assertNotActing()`**.
- Bandeau `components/shell/acting-banner.tsx` (root layout : shell, `/tv`, maintenance ; `html[data-acting]` décale le corps,
  les éléments `.sticky.top-0` et les panneaux plein-hauteur de `--acting-h` = 3 rem, `globals.css`) : toast « Lecture seule » sur
  un 403 `x-csm-readonly` ou `csm_ro_hit`, liens d'export bloqués au clic, rechargement à l'expiration. « Revenir à mon compte »
  = formulaire HTML → route de fin (audit `impersonate_stop`, cookie effacé, retour sur la fiche). Expiration constatée par le
  middleware : fin tracée aussi. La déconnexion termine le mode. E2E : `e2e/impersonate.spec.ts` (`E2E_SHOTS_DIR` pour les captures).

## Réseau : PN Infrabel et zones SPI (lot A, 15 oct. 2026)

- Logique pure `src/lib/network/` (testée : `network.test.ts`, `pn.test.ts`) : `geo.ts` (haversine, plan local km),
  `crossings.ts` (`parseInfrabelCrossing` du CSV « geoow », `matchCrossings` : n° Infrabel → ligne + numéro → proximité
  150 m même ligne ; `estimateBk` : BK interpolée entre gares à km connus de `rail_lines`, écart médian 0,2 km / p90
  0,9 km contre les BK BACO), `spi.ts` (`assignStationZones` : manuel > carte (`spi-seed.ts` → `src/data/spi-zone-seed.json`,
  relevé de la carte COI interne — jamais le PDF dans Git) > graphe des lignes ≤ 25 km > proximité ; `crossingZone`),
  `voronoi.ts` (cellules de Voronoï bornées à 6 km, frontières entre zones), `pn.ts` (recherche, tris, `bkLabel`,
  `pnNumber` / `PN_NUMBER_RE`, `clusterPoints`).
- Calcul `src/server/network/import.ts` (`runNetworkImport({ crossings })`, un à la fois, ne lève jamais : `error` dans
  le résumé, posé dans `app_settings.timetable.network`) : appelé à la fin de l'import quotidien (`step: "reseau"`) et
  par Administration › Référentiels › Zones SPI (`zones-actions.ts`). Routes internes `/api/csm/network/*`.
- Données `server/data/network.ts` (`listSpiZones`, `spiShapes` gardé 5 min, `listZoneStations`) ; route
  `GET /api/reseau/zones-spi` (`carte_pn:read` ou `referentiels:manage`). Tuiles ouvertes aussi à `referentiels:manage`.
- **BK des PN** (suite du 15 oct.) : `kmPostsFrom` / `bkFromPosts` (`crossings.ts`) interpolent la BK entre les bornes
  kilométriques Infrabel de la ligne (jeu « relatie-tussen-kilometerpalen-en-lijnen », CC0 ; écart médian 5 m, p90 92 m
  contre les BK BACO ; > 300 m du tracé = repli `estimateBk` « ≈ ») ; `level_crossings.bk_source` = bornes / estimee / « »
  (relevée) ; `bkLabel` / `bkNote` (`pn.ts`). PN BACO sans pendant Infrabel : désactivés par l'import (`retire`).
- **Fond de carte** : tuiles OpenStreetMap relayées (`/api/operations/tuiles`), zones en polygones semi-transparents avec
  contour (`ZoneShapes.outlines`) et frontières en tirets, échelle métrique ; animations Leaflet coupées en mouvement réduit.
- Écrans : `/reseau/pn` (`PnBoard` + `PnMap` réutilisable : `points`, `zones`, `showZones`, `fitKey`, survol croisé ;
  URL `?q=&district=&zone=&ligne=&pn=&zones=1&vue=carte` par `history.replaceState`), fiche de ligne (section PN triée
  par BK, `data-testid="line-crossings"`), `/admin/referentiels/zones-spi` (`SpiZonesAdmin`). E2E `e2e/reseau-pn.spec.ts`.

## Design v4 « Signal / Quai / Cabine » (lots 0-2, 15 oct. 2026, `../docs/design/REFONTE-DESIGN-V4.md`)

- **Thèmes** (`src/design/tokens.ts`) : `DIRECTIONS` (Signal = `jour` / `nuit` / `auto`, Quai = `quai-jour` / `quai-nuit` /
  `quai-auto`, Cabine = `cabine-jour` / `cabine-nuit` / `cabine-auto`), `THEME_CHOICES` (valeurs du cookie `csm_ui`),
  `isAutoChoice`, `autoThemes(choice)`, `choiceScheme(choice)` (pas de `data-scheme` pour un automatique : **ne jamais tester
  `theme === "auto"`**, il y en a trois). Un thème porte en plus `direction`, `shadows`, `tint`, `style` (variables de
  composant : `--th-bg|fg|weight|rule`, `--title-rule`, `--strip-rule`, `--chip-on-*`, `--card-frame`, `--theme-row-h`,
  `--theme-control-h`, `--theme-field-h`) ; `surface-3` est dérivé (`deriveSurface3`) quand il manque. Variables générées en
  plus : `--surface-3`, `--shadow-1` / `--shadow-2`, `--tint`, `--r-pill`, `--control-bg`, `--control-on`, `--badge-ring`,
  `--figures-*`, `--fs-h1` / `--lh-h1`, `--font-features`.
- **Polices** : Inter Tight (`--font-inter-tight`) et JetBrains Mono (`--font-jetbrains-mono`) par `next/font/google`,
  `preload: false` comme Plex (Cabine seulement).
- **Utilitaires** : `bg-surface-3`, `shadow-rest`, `shadow-float`, `rounded-pill`, `h-field` / `min-h-field` (38 / 32 / 44 px),
  `text-kpi`, `text-panel`, `.figures` (chiffres des compteurs), `.focus-halo` (halo de focus des champs), `.title-rule`. Tous
  déclarés dans `cn()` (`src/lib/utils.ts`).
- **Composants** : `StatStrip` + `Stat` (`ui/stat-card.tsx`, bande de compteurs ; `StatCard` gardé pour un indicateur isolé),
  `Count` (`ui/card.tsx`, compteur en pilule ; `CardHeader count`), `fieldBase` / `triggerBase` (`ui/input.tsx`), styles de
  puces partagés `CHIP_BASE` / `CHIP_ON` / `CHIP_OFF` (`ui/chip-styles.ts` : `FilterChip`, `DistrictPicker`, `ToggleChip`),
  `EmptyState variant="compact" | "first"`, **`TrainChip`** dans `ui/train-chip.tsx` (`size` md / sm ; `DelayBadge` reste dans
  `components/pmr/train-chip.tsx`). Sélecteur de thème : `data-testid` `direction-<id>` et `theme-<choix>`.
- E2E : les cookies `csm_ui` posés par les tests utilisent `E2E_BASE_URL` (port local).
- **Lot 4 « Écrans clés »** : accueil `components/dashboard/todo.tsx` (`todoItems` → `group` / `kind` / `train` / `delay` /
  `code`, `groupTodo`, `primaryTodo`, `ageLabel`, `NextPickups` ; `data-testid` `todo-item`, `todo-action`, `todo-group-<id>`,
  `next-pickups`, `home-aside`), `serviceLabel` (`lib/shift.ts`). Listes PMR : `PmrFilterBar actions` (barre d'outils
  `pmr-toolbar`, période `SegmentedNav` dans `ui/filters.tsx`, `DistrictMenu` dans `ui/district-picker.tsx` — `change` émis à
  la fermeture —, `CollapsibleFilters always` = puce `filters-toggle` + panneau `filters-panel`, « Masquer les annulées »
  dedans), `ListStatus` (`components/pmr/list-status.tsx`), ALEA rendu par la page (`AssistAlea`, `GroupAlea` ; bouton
  `type="button"` car dans le formulaire), cellules `StationCell` / `CardStation` / `SensChip` (`assist-board.tsx`). Bons :
  `OrderSteps` (`order-steps`), `OrderTicket` (`order-ticket`, `compact`), `lib/orders/steps.ts` (`stepStates`,
  `sectionState`, `BUS_STEPS`, `TAXI_STEPS` ; sections `id="bon-…"`), barre d'actions flottante en desktop. `EmptyState framed`.
- **Lot 6 « Reste des écrans »** : barre d'outils des listes = `FilterForm className={TOOLBAR}` + `ToolbarSearch` (loupe,
  `label` en sr-only, pleine largeur en mobile) + filtre principal + `CollapsibleFilters always` + action `ml-auto` ; ligne
  d'état `ListStatus` / `ListCount` (`components/ui/list-toolbar.tsx` ; `components/pmr/list-status.tsx` ré-exporte).
  Recherche pendant la frappe (`FormAutoSubmit live` ou `FilterSubmit`) + bouton de soumission `sr-only` pour Entrée, plus de
  bouton « Afficher » visible. `SegmentedNav` : `count` par segment, `scroll` (mobile : défile au lieu de tronquer).
  `RefSearchBar` (`referentiels/ref-ui.tsx`) : prop `lead` (vue en tête de barre). `CardDisclosure` (`ui/card.tsx`) : carte
  repliable à en-tête compact (`data-testid` passe sur le `<details>`, E2E : `locator("summary").click()`). `FilterBar`
  (bons) : `actions` (« Nouveau bon ») ; période « Aujourd'hui / Demain / Semaine / Toutes » (`all-dates`), Hier et 7 jours
  dans « Filtres ». `SupplierBoard` / `ClientBoard` : prop `status` (nombre à gauche du bouton de création). Un bouton qui
  ouvre un dialogue reste **hors** du formulaire de filtres (sinon `type=submit` par défaut : Admin › Utilisateurs). E2E :
  Collègues filtre par `DistrictMenu` (`district-picker` puis `district-picker-list`, le filtre part à la fermeture).

## Planificateur — moteur (15 oct. 2026, `../docs/design/CADRAGE-PLANIFICATEUR-PMR.md`, `REGLES-PLANIFICATEUR-PMR.md`)

- **`src/lib/planner/`** : logique pure (aucun réseau, aucune horloge cachée), importée par `@/lib/planner` (`index.ts`),
  partagée par les actions et l'UI. Types `types.ts` (`PlannerTask`, `PlannerAgent`, `PlannerBase`, `BcsCounter`,
  `PlannerContext`, `DEFAULT_PLANNER_SETTINGS`). Heures de Bruxelles par `time.ts` (un seul `Intl.DateTimeFormat`, cache par
  minute : ne pas appeler `brusselsTime` de `lib/orders/time.ts` dans une boucle).
- `window.ts` : `taskWindow` (light IN T−15/+5, OUT T−5/+15 ; fauteuil −20/+10, −10/+20 ; type inconnu = light sauf
  `light: false`), `linkConnections` (correspondance OUT → IN même dossier + même gare `foldStation` < 30 min : `cx:<id OUT>` ;
  même train + gare + heure : `tr:…` ; renvoie des copies). `travel.ts` : `travelMinutes` / `coverage` (matrice des bases
  symétrique, `covers` = bases voisines atteintes par leur gare ; rien d'autre : « jamais Mons → Charleroi » découle des
  données). `timeline.ts` : `agentTimeline` (trajets « Départ vers / Trajet vers / Retour à », libres, occupation).
  `assign.ts` : `checkAssign` (ok / warn / block + phrases), `suggestAgents`, `autoAssign` (glouton par heure de train,
  groupes liés ensemble, B-CS d'abord, ~60 ms pour 60 agents × 300 tâches), `bcsLoad`. `parse-task.ts` : `parseTaskLines`
  (format ALEA / classeurs ; nom et téléphone **jamais renvoyés**, seulement `ignoredPersonal`).
- **Tâches et contextes immuables** : `norm()` et l'état préparé de `checkAssign` / `suggestAgents` sont mis en cache par
  objet (`WeakMap` sur la tâche et sur `ctx.tasks`). Toujours passer de nouveaux objets / tableaux après un changement.
- Tests : `*.test.ts` du dossier, données fictives `test-fixtures.ts` (bases DSO de la matrice des classeurs, aucun nom réel).

## Planificateur — écran, vue Jour (lot P1, 15 oct. 2026)

- **Adaptateur unique** `lib/planner/adapt.ts` (testé) : `adaptDay(plannerDay)` → `{ ctx, byId, server }` (nouveaux objets à
  chaque appel) ; PMR dont la fin ne suit pas le début (DICOS, saisie de l'écran) → `trainAt = start`, fenêtre par
  `linkConnections` ; base de l'agent = nom Quinyx → code (`baseCodeOf`) ; sources `dicos_mission` / `dicos_pending` →
  `dicos` / `dicos_attente` ; `findDuplicates` (saisie manuelle = même dossier + train + sens + gare qu'une tâche DICOS).
- **Logique d'écran** `lib/planner/board.ts` (testée) : `groupAgents`, `dayBounds` (4 h → 24 h, nuit jusqu'à 8 h le
  lendemain), `SCALES` (72 / 150 / 280 px par heure), `rowBlocks` (même train + gare + heure = un bloc, pistes),
  `conflictsOf` / `boardCounters`, `linkedIds`, `dropVerdict` / `isBusyRefusal` / `assigneeOf`, `applyOverrides` /
  `settledOverrides` (attributions optimistes oubliées quand le serveur renvoie le `updated` attendu), `filterTodo`,
  `stationZones`, `bcsOpen` (semaine / week-end-férié), `taskName` (nom accessible complet).
- **Composants** `components/planner/` : `planner-screen.tsx` (état, glisser-déposer en pointer events — souris sur la carte
  ou le bloc, doigt sur la poignée `data-drag-handle` seulement —, `commit()` optimiste + toast « Annuler », SSE
  `planner_tasks` par `subscribeLive` sans rafraîchir pendant un glisser, auto, `?tache=` par `history.replaceState`),
  `day-gantt.tsx` (rangées `data-drop-key` = `agent:<id>` | `bcs:<clé de gare>` | `taxi` | `cdb`, `data-drop` ok/warn/block
  pendant un glisser, blocs `data-task-block` = ids, `planner-proposed` pour l'aperçu auto), `todo-panel.tsx` (liste
  `data-drop-key="todo"` = retirer l'agent ; `AutoPreview`), `task-sheet.tsx`, `assign-picker.tsx` (Dialog desktop / Sheet
  mobile), `add-task-dialog.tsx` (seuls les champs analysés partent : `parsedToInput`), `mobile-agenda.tsx`.
  Disposition par requête de conteneur (`@container/planner`, colonne « À attribuer » à droite dès 60 rem de contenu :
  le panneau ancré resserre la page). Gantt et mobile sont tous deux dans le DOM (viser `planner-aside` / `planner-mobile`).
- Actions ajoutées : `assignTasks(items, auto)` (300 au plus, verrou par tâche, résultat par tâche, `origin = auto`) et
  `resolveDuplicate(manualId, dicosId)` (correspondance revérifiée, attribution reportée sur la tâche DICOS). Sujet SSE
  `planner_tasks` ajouté au relais `/api/events`.
- E2E `e2e/planificateur.spec.ts` : desktop (district DSO, Mons, trains 991xx) et mobile (DSE, Namur, 992xx) en parallèle,
  groupes Quinyx fictifs 990101 / 990102 ; `E2E_SHOTS_DIR` pour les captures. Le compte E2E doit avoir `planner:write`.

## Planificateur — audit sécurité + revue adversariale (15 oct. 2026)

- **Saisie ALEA** (`parse-task.ts`) : avec `stations` (l'écran le fournit TOUJOURS : `plannerStationRefs()` de
  `server/data/planner.ts` = référentiel `stations` + bases et gares de leurs matrices, prop `stations` de `PlannerScreen`),
  gare assistée ET autre gare = plus longue suite de mots reconnue (`resolveStation`, nom FR retenu), reste écarté ;
  aucune suite reconnue → erreur « gare inconnue : vérifie l'orthographe » (aucun repli). Sans référentiel : ancienne
  découpe (repli des tests). « NUIT 00h00-05h59 » = train le lendemain, `day` = jour de la feuille. Ligne « TAXI » :
  `parsedToInput` envoie `assignee_kind: "taxi"` (seule destination acceptée par `manualTaskSchema`, tâche créée
  `attribuee`), `train` vide.
- **Contrôles serveur** (`lib/planner/server-check.ts`, testé) : `assignTask` / `assignTasks` rejouent `checkAssign` sur
  `plannerDay(jour)` (tous districts ; refus `block` avec la raison, `warn` accepté ; lot cumulé par jour) ; guichet B-CS
  = celui de la gare de la tâche ; `createManualTasks` : jour J-2 → J+60 (`manualDayAllowed`), gares dans
  `plannerStationNames()` (`manualStationIssue`, messages avec le n° de ligne, jamais son contenu) ; `unassignTask` refuse
  une tâche « faite » (le toast « Annuler » ne la renvoie pas dans « À attribuer ») ; `resolveDuplicate(manualId, dicosId,
  manualUpdated, dicosUpdated)` vérifie les deux verrous.
- **Moteur** : `autoAssign` pose chaque tâche d'un groupe dans le plan avant de contrôler la suivante (tout retiré si
  refus) ; groupe réuni par un même train mais intenable par un seul destinataire → chaque unité (même `linkKey`) retentée
  à part. `dropVerdict` cumule les tâches déposées. `checkBcs` : `Ce guichet est à <gare>`. `trainNorm("TAXI") = ""`
  (jamais un n° de train : ni `tr:`, ni `sameTrainStop`). `dayBounds` en heure de Bruxelles (`brusselsToUtc`, jour de 23 /
  25 h). `boardCounters(ctx, conflicts, day)` : compte le seul jour de planification.
- **Jours voisins** : `plannerDay(D)` charge aussi les tâches ATTRIBUÉES de D−1 à partir de 18 h et toutes celles de D+1
  avant 8 h (nuit de D, visibles dans « À attribuer » mais comptées sur D+1).
- **Synchro DICOS** (`server/planner-sync.ts`, testé avec un PocketBase simulé) : champs relus explicites (jamais `note` ni
  `label`) ; tâche attribuée dont gare / heure / jour change → `dicos_changed` (« Modifiée par DICOS » : icône du bloc,
  badge du panneau, `taskName`) ; lot de missions complet (`final`, sans erreur) : bout `in_assist` / `out_assist` faux →
  tâche annulée (`unassistedKeys`) ; dossier en attente toujours présent dont un trajet a disparu → annulée ; jamais de
  suppression ; `synced_by` = propriétaire du jeton personnel. Dossiers en attente : `countPendingTasks` +
  `reservePendingQuota` (2 000 tâches par requête, 6 000 par jeton et par jour, mémoire `globalThis`, 429).
  `tasksFromAssist` : type inconnu = light. `mapPendingDossier` : `disableds` OU `traveler.disableds` (le premier non vide).
- **Missions DICOS → « À attribuer » et annulées retirées** (demande du 15 oct. 2026) : `server/planner-scheduler.ts`
  (démarré par `instrumentation.ts`, production ou `CSM_PLANNER_SYNC=on`, compte de service requis) rejoue toutes les 5 min
  `syncPlannerFromAssists` sur J-1 → J+2 : toute mission acceptée (même ingérée avant le planificateur) a sa tâche ; une
  mission ou un dossier annulé passe la tâche en `annulee`. `plannerDay` **n'affiche plus les tâches annulées** (filtre
  `status != 'annulee'`, ni dans le Gantt ni dans « À attribuer » ni dans les compteurs) ; la fiche reste en base avec son
  agent et revient si DICOS rétablit la mission. Remplace « annulée barrée, agent gardé » de l'audit.

