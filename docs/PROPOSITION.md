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
| Temps réel | Polling 15–30 s | **Relais SSE côté serveur** (Supabase Realtime → serveur CSM → navigateur), repli sur polling | Les WebSockets vers supabase.co sont bloquées par le pare-feu de l'entreprise |
| UI | Tailwind 4 + composants maison | **Tailwind 4 + tokens CSS + bits-ui** (primitives accessibles, style shadcn-svelte) | Accessibilité clavier/ARIA gratuite, rendu premium |
| Tableaux | Tables maison | **TanStack Table** (+ virtualisation > 200 lignes) | Tri, filtres, colonnes, vues sauvegardées |
| Icônes | lucide-svelte | **@lucide/svelte** | Paquet officiel Svelte 5 |
| Motion | Ad hoc | `svelte/transition` + `animate:flip` + **View Transitions API** + `Spring`/`Tween` | Natif, sans dépendance lourde |
| Toasts | 2 systèmes | **svelte-sonner** seul | Un seul système |
| Markdown | marked sans nettoyage | marked + **DOMPurify** obligatoire | XSS |
| PDF | jspdf + html2canvas (statique) | **jspdf** (mis à jour, chargé à la demande) | Pas de régression des modèles existants |
| Excel | xlsx 0.18.5 (vulnérable) | **exceljs** (chargé à la demande) | Maintenu, sans CVE |
| Cartes | leaflet + mapbox + maplibre | **maplibre-gl** seul | 2 dépendances en moins |
| E-mail | `mailto:` (texte tronqué, pas de pièce jointe) | **Brouillon `.eml` généré** (en-tête `X-Unsent: 1`) : destinataires, objet, corps HTML et **PDF joint**. Outlook l'ouvre comme un nouveau message, l'agent choisit la boîte fonctionnelle et clique sur Envoyer | Pas de jeton Outlook/Graph, envoi manuel obligatoire depuis la boîte fonctionnelle |
| Tests | 1 fichier Vitest | **Vitest** (unitaires) + **Playwright** (parcours bus/taxi/PMR) | Non-régression des parcours critiques |
| Qualité | Prettier | Prettier + **ESLint** + `svelte-check` + CI GitHub Actions | |
| Observabilité | Table `app_error_logs` | Table conservée + `/healthz` + logs JSON (pino) ; Sentry auto-hébergé en option | |
| Déploiement | Vercel | **Docker multi-stage (node:22-alpine, adapter-node)** sur **Coolify**, `csm.fs0ciety.org` | Demande utilisateur |

### Contrainte réseau entreprise (ajoutée le 8 octobre 2026)
Le pare-feu de l'entreprise bloque les WebSockets vers `*.supabase.co`, et probablement aussi `supabase.co` en HTTPS : c'est la raison d'être de l'actuel `api-proxy`. Le service IT n'ouvrira pas d'accès.

**Principe retenu : le navigateur ne parle qu'à `csm.fs0ciety.org`.**
- **Lecture et écriture** : via le serveur SvelteKit (`load` et *form actions*), en HTTPS sur le même domaine. Le proxy générique disparaît.
- **Temps réel** : le serveur CSM, hébergé sur Coolify et donc hors du réseau de l'entreprise, s'abonne à Supabase Realtime et relaie les événements aux navigateurs en **SSE** (Server-Sent Events). Le SSE passe par une simple requête HTTPS, que les proxys d'entreprise laissent généralement passer.
- **Garde-fous** : un battement de cœur toutes les 15 s contre les proxys qui gardent la réponse en mémoire tampon, et un repli automatique sur un rafraîchissement régulier si le SSE échoue.
- **À vérifier** : `*.fs0ciety.org` doit être accessible depuis le réseau de l'entreprise. Ouvrir https://test.fs0ciety.org depuis un poste de travail suffit à le confirmer.

**PocketBase envisagé puis écarté pour l'instant.** Son temps réel fonctionne justement en SSE, mais :
- il faudrait migrer 51 tables, l'authentification (29 comptes), les fichiers, les triggers et les fonctions ;
- BACO, qui reste en ligne pendant la transition, devrait alors fonctionner sur deux bases ;
- le relais SSE décrit ci-dessus donne le même résultat sans migration.

Comme le navigateur n'accède plus directement à la base, passer à PocketBase plus tard ne toucherait que la couche serveur `src/lib/server/repositories`.

### Pourquoi pas Next.js + React ?
- **Performance** : rien à gagner pour ce cas. Svelte compile en JavaScript natif. Son runtime pèse quelques Ko, contre environ 50 à 60 Ko gzip pour React et Next, et ses mises à jour sont plus fines, sans DOM virtuel. Ici, la lenteur ressentie vient du réseau et des requêtes, pas du framework.
- **Coût** : réécrire 28 000 lignes prendrait des mois, avec un risque de régression sur un outil utilisé tous les jours.
- **Écosystème** : c'est le vrai avantage de React (shadcn/ui, recrutement). L'équivalent Svelte (shadcn-svelte, bits-ui) couvre nos besoins.
- **Hébergement** : Next s'auto-héberge très bien sous Docker, mais une partie de ses optimisations est pensée pour Vercel.

### Coexistence BACO ↔ CSM
BACO reste en production sur la **même base** pendant toute la transition. Toute migration doit donc être **rétrocompatible** : on ajoute des colonnes, des tables ou des fonctions, sans rien renommer ni supprimer. Les correctifs de sécurité qui cassent un comportement de BACO s'accompagnent d'un correctif sur `main`. Exemple : retirer la modification directe de `profiles.role` oblige l'administration de BACO à passer par une fonction RPC admin.

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

## 3. Architecture de l'information

Sidebar groupée (repliable), palette ⌘K et bouton global **« + Nouveau »** (Bon bus · Bon taxi · Prestation PMR).

| Section | Contenu (routes actuelles) |
|---|---|
| **Tableau de bord** | Widgets métier uniquement : commandes du jour, PMR du jour, trains perturbés, journal, équipe présente |
| **Commandes** | Bus (`/otto`), Taxi (`/generateTaxi`), **Suivi unifié** (nouveau), Remise de service (B201, générée automatiquement) |
| **PMR** | Prestations du jour + historique (`/deplacements`), Clients (`/clients-pmr`), Rampes et matériel (`/pmr`) |
| **Opérations** | Trains en direct (`/live`), Main courante (`/journal`), Carte PN |
| **Référentiels** | Lignes, PtCar, EBP, **Annuaire unifié** (répertoire, sociétés bus, taxis) |
| **Connaissances** | Procédures et documents fusionnés |
| **Équipe** | Planning et congés, annuaire de l'équipe, nouveautés |
| **Pilotage** | Statistiques |
| **Administration** | Utilisateurs, lignes et arrêts, gares, santé, audit, maintenance |

### Gamification et gadgets : à retirer (**validé le 8 octobre 2026**)
- Le classement et « Champions du mois » : ils récompensent le volume de commandes.
- Les badges et les likes.
- **La « jauge de confiance » calculée à partir des sanctions** : c'est une donnée RH sensible exposée sur les profils.
- Le jeu de fléchettes, la page vitrine à code Konami, le flou anti-capture d'écran, le décorateur saisonnier et 14 des 16 thèmes fantaisie.

---

## 4. Corrections fonctionnelles (constatées à l'audit)

1. **Une commande taxi ne peut jamais être clôturée** : le filtre « Clôturés » existe, mais aucune action n'y mène.
2. **Le statut d'une commande bus est éclaté** en trois (statut, colonne kanban, case « mail envoyé » cochée à la main).
3. **L'envoi d'e-mail passe par `mailto:`** : Outlook tronque le texte et le PDF n'est jamais joint.
4. **Les contrôles de saisie sont quasi inexistants** : date de retour, nombre de PMR, dates passées…
5. **La date des déplacements PMR est calculée en UTC** : entre 0 h et 2 h, l'écran affiche la veille.
6. **Le nom PMR est coupé au premier espace** pour séparer nom et prénom, et le taxi PMR n'est pas relié à la fiche client.
7. **La remise B201 fait ressaisir les transports** déjà commandés, et la page est absente du menu.
8. **L'impression est bloquée globalement** (CSS), et Impr. écran floute l'écran et écrase le presse-papier.
9. **Bug ⌘K** : taper un « K » majuscule dans n'importe quel champ ouvre la palette.
10. **Le menu mobile est incomplet** (bus, taxi, répertoire, planning… inaccessibles), et 15 pages n'ont pas de titre d'onglet.
11. **Accessibilité** : 217 champs pour seulement 11 libellés reliés, des modales qui ne retiennent pas le focus clavier, des toasts non annoncés aux lecteurs d'écran.

---

## 5. Nouveautés proposées

### Commandes (cœur métier)
- **Cycle de vie unifié** bus et taxi : `brouillon → envoyé → confirmé → en cours → terminé → facturé / annulé`, avec un horodatage et un auteur pour chaque transition.
- **Brouillon Outlook en 1 clic** : un fichier `.eml` contient les destinataires, l'objet, le corps HTML mis en forme et le **PDF joint**. L'agent l'envoie depuis la boîte fonctionnelle, puis la commande passe au statut « envoyé » (avec confirmation de l'agent).
- **Modèles et duplication** (« refaire la commande d'hier »), commandes récurrentes.
- **Brouillons enregistrés automatiquement** (on ne perd plus une saisie en quittant la page).
- **Assistant de commande** : la gare d'origine est pré-remplie selon le district de l'agent, et la fiche client PMR est liée (téléphone, besoins, historique).
- **Suivi unifié** : un seul tableau filtrable de toutes les commandes, avec des vues enregistrées (« À confirmer », « Aujourd'hui », « Non facturées »).
- **B201 générée automatiquement** à partir des commandes et prestations du service.
- **Tableau de bord fournisseurs** : délais de confirmation, annulations, coût par société (pour négocier et facturer).

### Opérations
- **Trains en direct** :
  - favoris de gares ;
  - alerte quand un train suivi a plus de X minutes de retard ou est supprimé ;
  - lien direct « commander un bus de substitution » pré-rempli (ligne, gares, horaire).
- **Main courante en temps réel** (relais SSE) avec mentions, épinglage des événements et export du service.
- **Notifications** dans l'app, plus des notifications push PWA en option (commande non confirmée après X minutes).

### Transverse
- **Recherche globale ⌘K** sur tout le contenu métier et les actions.
- **Hors-ligne en lecture** pour l'annuaire et les référentiels (PWA).
- **Journal d'audit lisible** : qui a modifié quoi, avec le différentiel avant/après.
- **Rôles revus** : Agent, Coordinateur, Admin, Sysop, avec des permissions appliquées en RLS.
- **Statistiques métier** : volumes par ligne et par motif, coûts, délais, à exporter vers Excel.

---

## 6. Feuille de route

| Phase | Contenu | Livrable |
|---|---|---|
| **0 · Hotfix sécurité** (urgent, avant tout) | Migration SQL : révoquer UPDATE sur `profiles.role/permissions`, activer RLS sur 11 tables, rôles lus depuis `profiles` et non plus `user_metadata`, révoquer l'accès `anon` aux RPC admin, fixer `search_path`, rendre privés les buckets sensibles, activer la protection des mots de passe compromis ; dans le code, DOMPurify partout | 1 migration relue + 1 PR |
| **1 · Socle** | Renommage en CSM, TypeScript, session en cookie + gardes serveur, suppression du proxy et du gate, nettoyage des dépendances et du code mort, Dockerfile + doc Coolify, CI | App identique, sécurisée et déployable sur `csm.fs0ciety.org` |
| **2 · Design system** | Tokens, 5 thèmes, polices, composants de base (Button, Input, Select, Dialog, Drawer, Table, StatusPill, Toast, Kbd), shell (sidebar, topbar, ⌘K), transitions de page | Nouveau shell, pages existantes intégrées |
| **3 · Commandes** | Bus + Taxi refondus, statuts unifiés (migration), brouillon `.eml` avec PDF, modèles, brouillons, suivi unifié, B201 automatique | Cœur métier v2 |
| **4 · PMR & Opérations** | Déplacements, clients, live, journal en temps réel (relais SSE), notifications | |
| **5 · Référentiels, Équipe, Admin, Stats** | Annuaire unifié, procédures et documents, planning, admin, statistiques | |
| **6 · Durcissement** | Tests Playwright des parcours, audit d'accessibilité, performance, nettoyage de la base (policies dupliquées, index, tables mortes) | |

---

## 7. Décisions & questions ouvertes

**Décidé le 8 octobre 2026**
- Pas de WebSocket côté navigateur : relais SSE par le serveur CSM.
- On garde Svelte : pas de réécriture en Next.js.
- E-mail : envoi manuel depuis la boîte fonctionnelle, via un brouillon `.eml` avec le PDF joint.
- Gamification retirée.
- BACO reste en ligne pendant la transition, donc les migrations doivent être rétrocompatibles.

**Ouvert**
1. Valider la stack révisée : SvelteKit + Supabase hébergé + relais SSE.
2. Autoriser le hotfix de sécurité sur la base de production (fichier SQL relu au préalable).
3. Quelle version d'Outlook est utilisée au travail : *classique* (bureau), *nouveau Outlook* ou *web* ? Le `.eml` en brouillon fonctionne de façon fiable avec la version classique.
4. Est-ce que https://test.fs0ciety.org s'ouvre depuis un poste de l'entreprise ?
5. Accès de test : comptes dédiés, transmis via les secrets de l'environnement, sans les coller dans la conversation.

## 8. Déploiement Coolify

- `Dockerfile` multi-stage : `deps` → `build` → `runtime` (node:22-alpine, utilisateur non-root, `HEALTHCHECK` sur `/healthz`, ~120 Mo).
- `docker-compose.yml` (référence locale et Coolify), `.dockerignore`.
- Variables : `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement), `ORIGIN=https://csm.fs0ciety.org`, `BODY_SIZE_LIMIT`.
- En-têtes de sécurité (CSP, HSTS…) posés par SvelteKit (`kit.csp` + `handle`).
- Doc `docs/DEPLOIEMENT.md` : création de l'app Coolify, DNS `csm.fs0ciety.org`, TLS Let's Encrypt, URLs de redirection Supabase Auth, sauvegardes, rollback.
- CI GitHub Actions : lint, vérification des types, tests, build de l'image ; Coolify redéploie via webhook sur `main`.
