# CSM v2 — Références UI et spécifications des composants

> Complète `docs/DESIGN-DIRECTION.md` (« Tactical premium »), qui reste la référence. Ce document chiffre les composants de `web/src/components/ui`.
> Les écarts par rapport à DESIGN-DIRECTION sont signalés par **⚠ Écart proposé**. Un récapitulatif figure au §7.
> Unité de base : 4 px. Les valeurs sont données pour le thème par défaut. Tous les composants utilisent les tokens et aucune couleur en dur.

## 0. Méthode et limites

Le proxy réseau a **bloqué l'accès direct** à linear.app, vercel.com, attio.com, raycast.com, docs.stripe.com, edge-docs.stripe.com et forum.plane.so (`EGRESS_BLOCKED`). Les constats viennent des **extraits de recherche web** sur les pages listées, du **code source public** de Supabase Studio (`packages/ui`, lu sur raw.githubusercontent.com) et de l'observation générale de ces produits. Aucune valeur n'est copiée : les chiffres sont **nos** spécifications.

## 1. Ce qu'on retient de chaque référence

| Réf. | URL consultée | À retenir pour CSM |
|---|---|---|
| **Linear** | linear.app/now/how-we-redesigned-the-linear-ui · linear.app/now/behind-the-latest-design-refresh · linear.app/changelog/2024-03-20-new-linear-ui (via recherche) | 1. Les éléments n'ont pas tous le même poids : chrome (sidebar, en-têtes) en `fg-muted`, contenu en `fg`. 2. Les actions d'en-tête sont toujours au même endroit, en haut à droite, dans le même ordre. 3. Le contraste a été **relevé** et le gris est passé d'un ton froid à un ton chaud : cela confirme notre fond noir chaud. 4. Les infobulles affichent le raccourci clavier : c'est notre Kbd dans Tooltip. |
| **Vercel / Geist** | vercel.com/geist · vercel.com/geist/materials (via recherche) | 1. Les surfaces sont classées par usage (infobulle, menu, modale, plein écran) avec une élévation par matériau : on en fait 3 niveaux, `surface`, `surface-2` et overlay. 2. La bordure est un trait de 1 px, et non une ombre : c'est déjà notre règle. 3. Le focus est un anneau de 2 px d'une seule couleur, identique sur tous les contrôles. 4. Les durées vont de 150 à 200 ms pour les états. |
| **Attio** | attio.com/help/reference/managing-your-data/views/create-and-manage-table-views.md (via recherche) | 1. Le tableau est la vue principale, et la même donnée existe en table, en kanban et en page : on fait de même avec BC en table, cartes mobiles et drawer. 2. Les vues (filtres, tri) sont **personnelles par défaut** et partageables seulement si on l'enregistre : on l'applique aux filtres des Commandes. 3. Les cellules colorées signalent une donnée enrichie ou calculée : chez nous, ce sera une teinte `info` à 8 % pour les champs calculés (montants, durées). |
| **Raycast** | developers.raycast.com/api-reference/user-interface/action-panel · manual.raycast.com/keyboard-shortcuts (via recherche) | 1. ↵ lance l'action principale et ⌘↵ l'action secondaire. ⌘K ouvre « toutes les actions » sur l'élément sélectionné. 2. Les actions sont regroupées en sections nommées, la plus importante en premier. 3. Échap revient toujours au niveau précédent. 4. Les raccourcis sont **visibles** dans la liste, pas cachés dans une doc. |
| **Stripe** | docs.stripe.com/stripe-apps/components/badge · …/tooltip (via recherche) | 1. Le badge est en lecture seule, jamais cliquable. Son type porte une sémantique : neutre, info, positif, négatif, attention, urgent. On calque les statuts de BC sur cette grille. 2. Une infobulle s'ouvre avec un délai au survol et **immédiatement** au focus clavier. 3. Une tâche longue se fait en vue focus, qui masque l'arrière-plan : nos formulaires de BC s'ouvrent en sheet plein écran sur mobile. |
| **Supabase Studio** | raw.githubusercontent.com/supabase/supabase/master/packages/ui/src/lib/constants.ts, …/components/Button/Button.tsx, …/shadcn/ui/{input,badge,table,tooltip}.tsx | 1. Les contrôles ont une échelle de hauteurs nette, de 26 à 50 px, et une taille par défaut « small » à 34 px : la densité vient de la taille par défaut, pas de la police. 2. L'input mesure 40 px et 14 px de texte, avec une bordure qui change au survol puis au focus, en 200 ms. 3. L'en-tête de tableau mesure 40 px, en style « meta » atténué. 4. Le badge est en capitales de 9 px : **trop petit** pour nous, d'où le minimum de 11 px. |
| **Plane** | docs.plane.so/core-concepts/issues/layouts · forum.plane.so/t/the-work-item-detail-page-redesigned/106 (via recherche) | 1. La vue liste est compacte et groupable par propriété (statut, priorité). 2. Un « ajout rapide » sert de dernière ligne de chaque groupe. 3. La page de détail est refondue en 3 sections de propriétés repliables, avec « voir plus » sur les descriptions longues : c'est le modèle de notre drawer BC. |

## 2. Échelles, densité, grille, z-index

**Espacements (px)** : 2 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64. Le padding interne des contrôles est de 8 à 16 px, celui des cartes de 16 à 20 px et celui des sections de 24 à 32 px.

**Hauteurs de contrôle** (réponse à « 32/36/40/44 ? » : oui, avec 28 en plus pour les tableaux) :

| Taille | Hauteur | Texte | Padding X | Icône | Usage |
|---|---|---|---|---|---|
| xs | 28 | 13/16 | 8 | 14 | Actions dans une ligne de tableau compact uniquement |
| sm | 32 | 14/20 | 12 | 16 | Barres d'outils, filtres, tabs denses |
| **md** (défaut desktop) | **36** | 14/20 | 14 | 16 | Formulaires, en-têtes de page |
| lg | 40 | 16/24 | 16 | 18 | Action principale d'un écran, dialogues |
| touch | 44 | 16/24 | 16 | 20 | Automatique sous `@media (pointer: coarse)` : sm et md passent à 44 |

**Densité** (réglage utilisateur, attribut `data-density` sur `<html>`) :

| | Confortable (défaut) | Compacte |
|---|---|---|
| Ligne de tableau | 40 | 32 |
| Contrôle par défaut | md 36 | sm 32 |
| Padding des cartes | 16 | 12 |
| Gap de la grille | 16 | 12 |
| Body | 14/20 | 14/20 (**jamais en dessous**) |

La densité réduit les espacements, jamais la taille du texte. Sur mobile, on force le mode confortable.

**Grille de page** :
- **Desktop** : sidebar de 240 px (56 repliée), contenu jusqu'à 1440 px, padding de 24 px (32 dès 1440), 12 colonnes, gap de 16. Widgets en container queries, paliers à 320, 480 et 720 px.
- **Mobile (390 px)** : gouttière de 16 px, une colonne, header sticky de 48 px, bottom bar de 56 px + `env(safe-area-inset-bottom)`, FAB de 56 × 56 à 16 px au-dessus. **Tablette** (768–1023) : sidebar à 56 px, gouttière de 24.

**Z-index** (tokens `--z-*`) :

| Couche | Valeur |
|---|---|
| Base | 0 |
| En-tête de tableau sticky | 10 |
| Header de page sticky | 20 |
| Sidebar | 30 |
| Bottom bar mobile | 40 |
| FAB | 45 |
| Popover, menu, select | 50 |
| Drawer (overlay et panneau) | 60 |
| Dialog | 70 |
| Command palette | 80 |
| Toast | 90 |
| Tooltip | 100 |

## 3. Spécifications par composant

**Typographie des contrôles** : Geist 14/20 500, en **casse de phrase**. Les capitales mono sont réservées à l'eyebrow, à l'en-tête de tableau, au badge et au label de StatCard (une seule par groupe visuel). Le Kbd est en mono. Minimum de 11 px partout.

**Construction des chanfreins.** L'élément (`<button>`, carte) n'est **pas** clippé : `::before` chanfreiné à la couleur `border`, `::after` en `inset: 1px` (chanfrein `c − 0.5px`) au fond voulu, contenu au-dessus. L'`outline` de focus n'est donc pas coupé par `clip-path` (précision de la méthode « wrapper » de DESIGN-DIRECTION).

### Button

| Variante | Repos | Survol (120 ms) | Pressé | Désactivé |
|---|---|---|---|---|
| **Primaire**, chanfrein de 6 px | fond `accent`, texte `accent-fg` (nouveau token : `bg` en sombre, `surface` en clair) | fond `color-mix(in oklch, accent 88%, fg)` | `scale(0.98)` en 100 ms | opacité 0.45, `cursor: not-allowed` |
| Secondaire | fond `surface-2`, bordure 1 px `border` | bordure `fg-muted` | fond `color-mix(surface-2 90%, fg)` | idem |
| Ghost | transparent, texte `fg-muted` | fond `surface-2`, texte `fg` | idem pressé | idem |
| Danger | transparent, bordure `danger` 40 %, texte `danger` | fond `danger` 12 % | idem | idem |
| Danger plein | fond `danger`, texte `bg` | `mix(danger 88%, fg)` | idem | idem |
| Icône | carré de la hauteur du bouton (32, 36 ou 44), icône de 16 px | comme Ghost | idem | idem |

- **Un seul primaire par vue**, à droite en pied de dialogue. Icône à gauche, gap de 6 px. Bouton icône seul : barres d'outils uniquement, avec `aria-label`, Tooltip et Kbd.
- **Chargement** : spinner de 16 px à la place de l'icône (après 150 ms), libellé conservé, largeur figée, `aria-busy="true"`, clics ignorés.
- Danger plein : uniquement pour confirmer une suppression ou l'annulation d'un BC, dans un Dialog.

### Input, Textarea, Select, Checkbox, Switch

- **Input et Select** : md 36 px, padding X de 12, texte 14 (16 sous `pointer: coarse`), fond `bg`, bordure 1 px `border`, rayon 0. Survol : bordure `fg-muted`. Focus : bordure `accent` + anneau global (§4). Invalide : bordure `danger` + `aria-invalid`. Désactivé : fond `surface`, texte `fg-muted`, opacité 0.6. Lecture seule : fond `surface-2` sans bordure, texte sélectionnable.
- Placeholder en `fg-muted`, **jamais** à la place du label. Icônes préfixe/suffixe de 16 px à 12 px du bord. Nombres, heures et n° de BC en Geist Mono 14 `tabular-nums`.
- **Textarea** : 3 lignes minimum (80 px), auto-croissance jusqu'à 240 px, puis défilement. Le compteur de caractères est en mono 11, en bas à droite, quand une limite existe.
- **Select** : chevron de 16 px. Le menu fait au maximum 320 px de haut, ses items 32 px (44 px en tactile), et l'item actif reçoit un trait ambre de 2 px à gauche. Au-delà de 8 options, on utilise un Combobox avec recherche.
- **Checkbox** : carré de 16 px, bordure 1 px `fg-muted`. Coché : fond `accent` et coche de 12 px en `accent-fg`. État indéterminé : un tiret. La zone cliquable s'étend au label, avec 44 px de haut en tactile.
- **Switch** : piste de 32 × 18 px carrée, pouce de 12 px carré avec un décalage de 3 px. Activé : piste `accent`. La transition du pouce dure 140 ms. Le libellé est toujours à droite, et le Switch sert uniquement à un effet **immédiat**. Dans un formulaire validé par un bouton, on utilise une Checkbox.

### Field (label, aide, erreur)

- **Label** : Geist 14/20, poids 500, `fg`, à 6 px au-dessus du contrôle. Un champ facultatif porte « (facultatif) » en `fg-muted`. On ne met pas d'astérisque rouge seul.
- **Aide** : texte de 13/18 en `fg-muted`, à 6 px sous le contrôle. **⚠ Écart proposé** : ajouter le palier 13/18 à l'échelle de DESIGN-DIRECTION. Le palier 12/16 est trop petit pour huit heures de lecture.
- **Erreur** : texte de 13/18 en `danger`, avec une icône `CircleAlert` de 14 px. Le message **remplace** l'aide pendant l'erreur et il est relié au contrôle par `aria-describedby`.
- Espace vertical entre deux champs : 16 px (12 px en mode compact). Les formulaires desktop font 2 colonnes à partir de 720 px de conteneur, et une seule colonne sur mobile.

### Card et Panel

- **Card** : chanfrein de 8 px, fond `surface`, bordure 1 px `border`, padding de 16 px (12 px en compact). Une carte cliquable a une bordure `fg-muted` au survol et `accent` quand elle est sélectionnée. La carte entière est un `<a>` ou un `<button>`.
- **Panel** (un bloc de page, pas un élément de liste) : rectangle **sans chanfrein**, avec un en-tête de 44 px (eyebrow mono et actions sm à droite), un séparateur de 1 px et un padding de 16 px. Le chanfrein est réservé aux objets (cartes, boutons, dialogues) : trop de coins coupés brouillent la lecture.

### StatCard

- Bande de 2 px en haut, label mono 11/16 en capitales `fg-muted`.
- Valeur en Saira Condensed 600, 40/40 sur desktop, 32 si le widget fait moins de 320 px, 28 sur mobile, avec `tabular-nums`.
- Delta en mono 12/16, préfixé par ▲ ou ▼ et coloré `ok` ou `danger`. Il n'est **jamais** signalé par la seule couleur.
- Padding de 16 px, hauteur minimale de 104 px. Comme filtre : `aria-pressed`, bordure `accent` quand le filtre est actif, et un bouton « Effacer le filtre » dans la barre de filtres.

### StatusBadge (statuts de commande)

Hauteur de 20 px, padding X de 6, mono 11/16 en capitales (tracking 0.06em), pastille carrée de 6 px (gap 6), fond du statut à 12 %, bordure à 40 % (**⚠ Écart proposé** : 11 px minimum au lieu de 10–11). La pastille est **pleine** ou **en contour** : la forme double la couleur (daltonisme).

| Statut | Couleur | Pastille | Sens (grille Stripe) |
|---|---|---|---|
| BROUILLON | `fg-muted` (neutre) | contour | À compléter |
| ENVOYÉ | `warn` | contour | En attente du transporteur : à relancer si rien ne vient |
| CONFIRMÉ | `info` | pleine | Information clé, aucune action |
| EN COURS | `ok` | pleine | Actif, tout va bien |
| TERMINÉ | `fg` (neutre fort) | pleine | Fait, reste à facturer |
| FACTURÉ | `fg-muted` | pleine | Archivé |
| ANNULÉ | `danger` | contour | Issue négative, sans action |

**⚠ Écart proposé** : DESIGN-DIRECTION liste le statut CLÔTURÉ. Ce document le remplace par TERMINÉ et FACTURÉ, comme le demande la mission. La liste est à valider avec le métier. L'ambre (`accent`) n'est **jamais** un statut : il reste réservé à la sélection.

### Tabs (segmented)

- Conteneur bordé 1 px `border`, fond `surface`. Onglet de 32 (sm) ou 36 px (md), padding X de 12, Geist 14/500 en **casse de phrase**. Actif : fond `surface-2`, texte `fg`, trait `accent` de 2 px en bas. Inactif : `fg-muted`, `fg` au survol. Compteur : chip mono 11, 18 px de haut, fond `bg`.
- Flèches ←→ (Radix). Mobile : défilement horizontal, `scroll-snap`, fondu de 16 px aux bords, jamais de retour à la ligne.

### Table dense et cartes mobiles

- **En-tête** : 32 px, mono 11 en capitales `fg-muted`, sticky, fond `surface`. L'icône de tri (12 px) n'apparaît que sur la colonne triée et au survol.
- **Ligne** : 40 px (32 en compact), Geist 14, padding X de 12, séparateur 1 px, bordure gauche de statut de 3 px. Survol : `surface-2`. Sélection : fond `accent` 8 % + Checkbox (la bordure de statut reste). Focus : anneau global en `outline-offset: -2px`.
- Nombres à droite en mono `tabular-nums` ; texte long tronqué + infobulle. Action « ⋯ » xs **toujours visible** ; ↵ ouvre le drawer. Barre d'actions groupées sticky de 48 px en bas dès qu'une ligne est sélectionnée.
- **Mobile** : carte de 64 px minimum, padding de 12, bordure de statut. Ligne 1 : n° de BC en mono 14 + StatusBadge à droite. Ligne 2 : trajet ou gare en Geist 14, heure en mono `fg-muted`. Le tap ouvre une sheet.

### Dialog

- Largeurs de 400 / 560 / 720 px (sm/md/lg), sheet plein écran sur mobile pour les formulaires. Chanfrein de 10 px, fond `surface`, overlay `bg` à 70 % **sans flou**. En-tête : eyebrow mono + titre Saira 20/24, padding de 24. Pied : séparateur, actions à droite (primaire en dernier), padding 16 × 24.
- Échap ferme ; clic sur l'overlay aussi, **sauf** formulaire modifié (confirmation). Focus initial sur le premier champ (sur « Annuler » pour une confirmation destructive), rendu au déclencheur à la fermeture.

### Drawer et Sheet

- **Desktop** : panneau droit de 480 px (640 en lg), pleine hauteur, bordure gauche 1 px, sans ombre. En-tête de 56 px : eyebrow, n° de BC, « précédent/suivant » (J/K). Corps en sections repliables (modèle Plane). Le drawer de détail est **non modal** (table utilisable derrière) ; celui d'édition est modal.
- **Mobile** : bottom sheet (Vaul) de 92 dvh maximum, poignée de 32 × 4 px à 8 px du haut ; sheet plein écran pour les formulaires.

### Toast (Sonner)

- 360 px de large ; desktop en bas à droite (à 16 px) ; mobile en haut sous le header (ne masque ni la bottom bar ni le FAB). Bordure de statut de 3 px, titre Geist 14/500 (**⚠ Écart proposé** : pas de titre mono), texte 13 px `fg-muted`. 3 visibles au maximum.
- 4 s pour succès et info, avec « Annuler » si réversible. **⚠ Écart proposé** : l'erreur reste jusqu'à fermeture, avec « Réessayer ». Pause au survol et au focus ; `aria-live="polite"` (`assertive` pour les erreurs).

### EmptyState

- Pointillés 1 px `border`, padding de 32 (24 sur mobile), centré, 160 px minimum. Icône de 20 px, label mono 11 (`AUCUNE COMMANDE`), une phrase Geist 14 `fg-muted` qui dit quoi faire, un bouton md.
- Trois variantes : premier usage (« Créez votre premier BC »), filtre sans résultat (« Effacer les filtres »), erreur (« Réessayer »).

### PageHeader

- Eyebrow mono 11 à 4 px au-dessus du H1 (Saira 28/32 ; 40/40 sur l'Accueil seulement). Sous-titre facultatif Geist 14 `fg-muted`, une ligne. Actions à droite dans un ordre fixe (secondaires puis primaire), alignées sur le H1. Onglets 16 px dessous ; padding vertical de 24.
- Mobile : H1 en 24/28, secondaires dans « ⋯ », primaire en FAB.

### Kbd

20 × 20 px minimum, padding X de 4, Geist Mono 11/16 500, fond `surface-2`, bordure 1 px, texte `fg-muted`. Une chip par touche (`⌘` `K`) ; symboles sur Mac, « Ctrl » ailleurs ; masqué sous `pointer: coarse`.

### Tooltip

Fond `surface-2`, bordure 1 px, Geist 13/18 `fg`, padding 6 × 8, 240 px maximum, décalage de 6. Délai de 400 ms au survol, **0 ms au focus**, `skipDelayDuration` 300 ms. Libellé puis Kbd à droite. Jamais d'information indispensable seulement en infobulle (rien en tactile).

### Skeleton

Fond `surface-2`, rayon 0, dimensions exactes du contenu final (lignes de 40 px, barres de 12 px à 60–90 % de largeur). Apparaît **après 200 ms**, reste au moins 300 ms. **⚠ Écart proposé** : boucle d'opacité 1 → 0,6 sur 1,6 s (hors budget de 600 ms, car c'est une boucle) ; statique en mouvement réduit, ou toujours statique sans accord.

### Command palette (cmdk)

- 640 px de large, à 15 vh du haut, chanfrein de 10. Input de 48 px en Geist 16, liste de 400 px maximum, items de 40 px (icône 16, libellé 14, méta `fg-muted`, Kbd). Groupes mono 11 : « Aller à », « Créer », « Rechercher un BC ou une gare », « Actions sur la sélection ». Actif : `surface-2` + trait ambre de 2 px à gauche. Pied de 32 px : `↵ Ouvrir`, `⌘↵ Ouvrir dans un drawer`, `Échap Fermer`.
- Un numéro tapé seul (`\d{4,}`) remonte le BC en tête. ⌘K sur une ligne sélectionnée ouvre ses actions (modèle Raycast). Échap remonte d'un niveau avant de fermer.

## 4. Focus, chargement et erreurs

**Focus visible**
- Un style unique sur `:focus-visible` : `outline: 2px solid var(--accent); outline-offset: 2px` (`-2px` dans les tables et listes, 3 px en Contraste élevé). Rien au clic souris.
- Les éléments chanfreinés gardent un hôte rectangulaire non clippé (§3) : le rectangle encadre le chanfrein, comme une visée HUD.
- Ordre : header, onglets, filtres, contenu, drawer. Lien « Aller au contenu » au premier Tab.

**Chargement**

| Durée | Affichage |
|---|---|
| Moins de 200 ms | Rien |
| De 200 ms à 1 s | Skeleton à l'emplacement exact, ou spinner dans le bouton |
| Plus de 1 s | Texte d'état (« Chargement des commandes… ») |
| Plus de 10 s | Message et bouton « Annuler » ou « Réessayer » |

- Pendant un rafraîchissement, on garde les données précédentes (TanStack `placeholderData: keepPreviousData`), surmontées d'une barre indéterminée de 2 px `accent` en haut de la table. On ne vide jamais une liste déjà affichée.
- **Mises à jour optimistes** pour les changements de statut. En cas d'échec, l'état précédent est rétabli et un toast d'erreur affiche « Réessayer ».
- Le temps réel (SSE) met à jour les lignes en place, sans déplacer la ligne sous le curseur. Les nouvelles lignes s'insèrent en haut, et un badge « 3 nouvelles » apparaît si l'utilisateur a fait défiler la page.

**Erreurs**
- Un message dit **ce qui s'est passé et quoi faire** (« Gare inconnue. Choisissez une gare dans la liste. »). Pas de code technique, sauf dans un détail repliable.
- Validation au `blur`, puis à chaque frappe une fois qu'une erreur est affichée. À la soumission, on affiche un résumé en haut du formulaire (Alert `danger` avec des liens vers les champs), et le focus va au premier champ invalide.
- Une erreur n'est jamais signalée par la seule couleur : icône et texte sont obligatoires.
- Erreur réseau ou serveur : un toast persistant avec « Réessayer ». Un écran vide en erreur devient un EmptyState en variante erreur.
- Une session expirée ouvre un Dialog de reconnexion **sans perdre la saisie**. Le brouillon du formulaire est sauvegardé en local.

## 5. Recettes de motion (GSAP)

Tout passe par `gsap.matchMedia()` + `(prefers-reduced-motion: no-preference)`. Ease « hud » `0.2, 0, 0, 1`, sorties en `power2.in`. **Survol et focus en transitions CSS** (120–140 ms, `--ease-hud`) ; GSAP pour les entrées, sorties, Flip et compteurs.

| Composant | Recette | Durée / ease |
|---|---|---|
| Button pressé | `scale: 0.98`, puis retour à 1 | 0,10 s in, 0,14 s out, hud (ou CSS `:active`) |
| Spinner | rotation linéaire continue | 0,8 s par tour, **⚠ Écart proposé** : boucle hors budget (comme pour le Skeleton) |
| Dialog | overlay `autoAlpha 0→1` ; panneau `autoAlpha` et `scale 0.98→1`, `y 8→0` | entrée 0,22 s hud, sortie 0,16 s power2.in |
| Drawer desktop | `xPercent 100→0`, overlay 0,16 s | 0,22 s hud / 0,16 s power2.in |
| Sheet mobile | `yPercent 100→0` (geste Vaul natif) | 0,24 s hud / 0,18 s |
| Popover, Select, menu | `autoAlpha` et `y -4→0` | 0,14 s hud / 0,10 s |
| Tooltip | `autoAlpha` seul | 0,12 s |
| Toast | entrée `y 12→0` et `autoAlpha` ; sortie `x 24` et `autoAlpha` ; les toasts empilés se repositionnent par Flip | 0,22 s / 0,16 s / 0,2 s |
| Tabs | l'indicateur glisse par `Flip.from` | 0,24 s hud |
| Table : tri ou filtre | `Flip.from` sur les 30 premières lignes visibles, sans animation au-delà | 0,3 s hud |
| Table : nouvelle ligne live | `height 0→auto` et `autoAlpha`, puis fond `accent` 10 % qui s'estompe | 0,2 s, puis 1,2 s |
| Changement de statut | flash de la bordure gauche, de `accent` à la couleur du statut | 0,4 s hud |
| StatCard | compteur `{ v }` avec `snap: 1`, rien si le delta est nul ; au plus une fois toutes les 5 s par carte pendant le live | 0,6 s power3.out |
| Arrivée de page | stagger `y 8→0` et `autoAlpha`, plafonné à 8 éléments | 0,24 s, stagger 0,03 |
| Command palette | `autoAlpha` et `y -8→0`, sans animation de l'item actif (vitesse du clavier) | 0,16 s hud / 0,12 s |
| Skeleton → contenu | fondu croisé en `autoAlpha` | 0,16 s |
| Switch, Checkbox | CSS uniquement | 0,14 s |

En mouvement réduit, seuls les fondus `autoAlpha` sont conservés, en 0,1 s au maximum. Les compteurs s'affichent directement et Flip est désactivé.

## 6. À éviter (anti-patterns des références, inadaptés à un outil d'opérations)

1. **Texte de 12 à 13 px comme corps** (Linear, Raycast) : notre body fait 14 px minimum et 16 px dans les inputs mobiles.
2. **Actions visibles au survol seulement** (lignes de Linear et d'Attio) : elles sont invisibles en tactile et pour la découverte. Le « ⋯ » reste toujours visible.
3. **Barres d'outils en icônes seules** : ajouter un libellé, ou au minimum une Tooltip et un Kbd.
4. **Badges pilule de 9 à 10 px en capitales** (Supabase) : nos badges sont carrés, 11 px au minimum.
5. **Édition inline façon tableur partout** (Attio, Plane) : une erreur de frappe sur un BC envoyé coûte cher. L'édition passe par le drawer avec « Enregistrer ». L'édition inline est limitée aux champs sans risque (note, assigné).
6. **Changer un statut par glisser-déposer en kanban** : une transition de statut métier se fait par une action explicite, avec confirmation pour « Annuler ».
7. **Palette ⌘K comme seule navigation** (Raycast) : la sidebar de 6 entrées et les onglets restent visibles. La palette accélère, elle ne remplace pas.
8. **Verre, flou, glow, dégradés maillés, ombres diffuses** (marketing de Vercel, Aceternity, panneaux en verre de fs0ciety) : ils nuisent au contraste et aux performances. On utilise des surfaces pleines.
9. **Toasts d'erreur qui disparaissent** et confirmations seulement en toast pour les actions critiques.
10. **Compteurs animés à chaque événement SSE**, shimmer infini, animations au scroll dans l'app.
11. **Statut porté par la seule couleur** ou **ambre utilisé comme statut** : l'ambre est réservé à la sélection et au focus.
12. **Dialogues imbriqués** : on en ouvre un seul à la fois. Un sous-choix devient un Popover ou une étape.
13. **Placeholder utilisé comme label**, astérisque rouge seul, et message « Erreur inconnue ».
14. **Couleurs de marque des références** (violet de Linear, vert de Supabase) : seuls nos tokens s'appliquent.

## 7. Récapitulatif des écarts proposés

| # | Écart | Raison |
|---|---|---|
| E1 | Ajouter le palier de texte **13/18** (aide, erreur, tooltip, texte de toast) | Le 12/16 est trop petit pour 8 h d'usage (retour v1) |
| E2 | Minimum de **11 px** pour tout texte mono, y compris le badge et la bottom bar (DESIGN-DIRECTION : 10 px) | « Moins de libellés en majuscules de 10 px » (CSM-V2 §2) |
| E3 | Statuts de BC : CLÔTURÉ remplacé par **TERMINÉ et FACTURÉ** | Liste de la mission, à valider avec le métier |
| E4 | Toasts d'**erreur persistants**, les autres restent à 4 s | Une erreur ne doit pas passer inaperçue |
| E5 | **Boucles** de spinner (0,8 s) et de skeleton (1,6 s) hors du budget de 600 ms | Ce sont des boucles, pas des transitions ; statiques en mouvement réduit |
| E6 | **Panel** sans chanfrein, le chanfrein étant réservé aux objets (cartes, boutons, dialogues) | Lisibilité des écrans très chargés |
| E7 | Titres de toast en Geist et non en mono ; tabs en casse de phrase | Moins de capitales mono (CSM-V2 §2) |
| E8 | Nouveau token **`accent-fg`** | Texte des boutons primaires dans les 5 thèmes |
