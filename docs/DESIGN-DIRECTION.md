# CSM — Direction design « Tactical premium »

> Références visuelles de l'utilisateur : `docs/references/fs0ciety-game-mobile.jpg` et `docs/references/fs0ciety-decisions-mobile.jpg` (test.fs0ciety.org/game et /decisions).

## Synthèse de la direction

**Tactical premium** = la discipline d'un HUD (grille stricte, labels mono, angles coupés, couleur = information) + la lisibilité des meilleurs SaaS (Linear, Vercel, Stripe). Le HUD donne l'identité, le SaaS donne le confort pour huit heures d'usage par jour. Règle d'arbitrage : en cas de conflit, **la lisibilité gagne**. Le style « science-fiction » reste sur les titres, les labels et les cadres ; les données, les formulaires et le texte courant restent sobres.

## Principes

1. **La couleur sert à informer, pas à décorer.** L'ambre signale ce qui est actif ou sélectionné. Le rouge, l'orange, le vert et le bleu sont réservés aux statuts.
2. **Densité calme.** Beaucoup d'informations, peu de bruit. Tous les éléments n'ont pas le même poids visuel (leçon de Linear).
3. **Trois voix typographiques, pas plus :** une police display condensée, une police UI lisible et une mono pour les labels et les nombres.
4. **Chiffres tabulaires partout** (`font-variant-numeric: tabular-nums`) pour les compteurs, heures, montants et numéros de BC.
5. **Géométrie sèche :** rayon 0, bordures de 1 px, chanfreins de 6 à 10 px. Pas d'ombres diffuses : la profondeur vient du contraste des surfaces.
6. **Le mouvement explique.** Il sert à montrer un changement d'état, une arrivée de donnée ou une hiérarchie. Il dure moins de 300 ms en UI et ne bloque jamais la saisie.
7. **Le clavier d'abord sur desktop** (palette ⌘K, raccourcis), **le pouce d'abord sur mobile** (barre d'onglets, cibles d'au moins 44 px).
8. **Le vide se voit :** les états vides ont une bordure en pointillés, un label mono et une action claire.
9. **Thèmes par tokens uniquement.** Aucune couleur en dur dans les composants.
10. **Accessibilité non négociable :** contraste AA au minimum (AAA pour le texte courant du thème « Contraste élevé »), focus visible en ambre, respect de `prefers-reduced-motion`.

## Typographie

| Rôle | Police | Usage |
|---|---|---|
| Display | **Saira Condensed** 600–700, MAJUSCULES, tracking 0.02em (alternative plus « tech » : Chakra Petch 600) | Titres de page, valeurs des StatCards, sections |
| UI / texte courant | **Geist Sans** (ou Inter) 400–500 | Tout le texte lisible à 14 px, formulaires, tableaux |
| Labels / nombres | **Geist Mono** (ou JetBrains Mono) 500, MAJUSCULES, tracking 0.08–0.12em | Eyebrows, badges, en-têtes de tableau, horodatages |
| Accent rare | Departure Mono ou Geist Pixel | Uniquement les écrans « Live » et le logo, jamais dans les données |

Toutes ces polices sont libres (OFL) et auto-hébergeables via `next/font` (le paquet `geist` sur npm, Google Fonts pour Saira et Chakra).

**Échelle (px / line-height) :** label mono 11/16 · petit 12/16 · body 14/20 · body-lg 16/24 · h3 display 20/24 · h2 display 28/32 · h1 display 40/40 · valeur de stat 32–48/1, en mono ou display tabulaire.

## Couleurs

Sémantique commune : `bg`, `surface`, `surface-2`, `border`, `fg`, `fg-muted`, `accent`, `ok`, `warn`, `danger`, `info`.

| Token | Commandement (défaut) | Ivoire (clair) | Rail | Contraste élevé | Nocturne bleu |
|---|---|---|---|---|---|
| bg | `#0B0A09` | `#F5F1E8` | `#0E1116` | `#000000` | `#070B14` |
| surface | `#141210` | `#FBF8F1` | `#151A21` | `#0A0A0A` | `#0D1424` |
| surface-2 | `#1C1916` | `#EFE9DC` | `#1D242D` | `#141414` | `#131C30` |
| border | `#2E2A25` | `#D8CFBF` | `#2A333F` | `#8A8A8A` | `#22304A` |
| fg | `#EDE6DA` | `#1A1714` | `#E6EBF1` | `#FFFFFF` | `#DCE6F5` |
| fg-muted | `#8F877B` | `#6B6358` | `#8794A3` | `#D0D0D0` | `#7F90AD` |
| accent | `#F2A93B` (ambre) | `#8A5300` | `#3A9BE5` (bleu rail) | `#FFD000` | `#5AA9FF` |
| ok | `#5FBF77` | `#256B3A` | `#3FB27F` | `#00FF7F` | `#4CC38A` |
| warn | `#E8873A` | `#9A4512` | `#F0A030` | `#FF9900` | `#F2B05E` |
| danger | `#F0605F` | `#B0262B` | `#F06A62` | `#FF4040` | `#F06A6A` |
| info | `#4EA1D3` | `#1A5F92` | `#7FB8E6` | `#40C0FF` | `#8AB4FF` |

Contraste vérifié (WCAG AA ≥ 4,5:1) pour `fg-muted`, `accent` et les 4 couleurs d'état sur `bg` **et** `surface-2`, dans les 5 thèmes.

**Bande multicolore** au-dessus des StatCards : `linear-gradient(90deg, accent, warn, danger, info)` sur 2 px, ou une couleur par carte selon la catégorie.

## Formes

- **Rayon 0** partout (`--radius: 0`, à surcharger dans le thème shadcn).
- **Chanfrein** sur cartes, boutons primaires et dialogues :
  `clip-path: polygon(var(--c) 0, 100% 0, 100% calc(100% - var(--c)), calc(100% - var(--c)) 100%, 0 100%, 0 var(--c));` avec `--c: 8px` (cartes) ou `6px` (boutons). Comme `clip-path` coupe aussi la bordure, la bordure se dessine avec un pseudo-élément ou un `drop-shadow` de 1 px. Le plus simple est un wrapper de 1 px à la couleur `border`, et l'élément intérieur chanfreiné à `surface`.
- **Bordures** de 1 px `border`. Au survol : `fg-muted`. Actif ou sélectionné : `accent`.
- **Bordure gauche de statut** de 3 px sur les lignes et cartes (BC, PMR) : la couleur du statut.
- **Pointillés** (`border-dashed`) réservés aux états vides et aux zones de dépôt.
- **Coins de visée** optionnels (4 petites équerres en ::before et ::after) pour l'élément focalisé ou un panneau « Live » uniquement.

## Composants clés

- **PageHeader** : eyebrow mono (`// COMMANDES · 12 ACTIVES`) en `fg-muted`, H1 display, actions à droite, onglets en dessous.
- **StatCard** : bande colorée de 2 px en haut, label mono 11 px, valeur display tabulaire, delta en mono vert ou rouge, sparkline Tremor facultative. L'ensemble est chanfreiné. La carte est cliquable et sert de filtre.
- **Tabs pills** : segmented control carré. L'onglet actif a un fond `surface-2`, un trait ambre de 2 px en bas et un compteur en chip mono. L'indicateur glisse via GSAP Flip.
- **Status badge** : MAJUSCULES mono 10–11 px, pastille carrée de 6 px, fond du statut à 12 % d'opacité, bordure à 40 %. Statuts BC : BROUILLON, ENVOYÉ, CONFIRMÉ, EN COURS, TERMINÉ, ANNULÉ (pas de FACTURÉ : décision du 8 oct.).
- **DataTable** (TanStack Table + shadcn) : en-têtes mono en majuscules, lignes de 40 px (32 px en mode compact), bordure gauche de statut, en-tête sticky, sélection en ambre, nombres alignés à droite. Sur mobile, les lignes deviennent des cartes.
- **Command palette** (cmdk) : ⌘K, groupes « Aller à », « Créer », « Rechercher un BC ou une gare ». Le résultat actif a un fond `surface-2` et un trait ambre à gauche.
- **Bottom tab bar** (mobile) : 5 entrées (Accueil, Commandes, PMR, Départs, Plus), label mono 10 px, badge numérique en `danger`. L'onglet actif a un trait ambre en haut. La barre respecte `safe-area-inset-bottom`.
- **Drawer** (Vaul) : un bottom sheet sur mobile, un panneau latéral droit sur desktop pour le détail d'un BC, avec une poignée et un en-tête eyebrow.
- **Toast** (Sonner) : carré, bordure gauche de statut, titre mono, durée de 4 s, une action « Annuler » quand c'est pertinent.
- **EmptyState** : bordure en pointillés, label mono `AUCUNE DONNÉE`, une phrase d'aide et une action primaire.

## Motion (GSAP)

GSAP est **100 % gratuit depuis 2025**, plugins compris (SplitText, Flip, CustomEase, ScrollTrigger), et la licence standard couvre l'usage commercial. Tout passe par le paquet npm `gsap`.

- **Setup** : `useGSAP()` de `@gsap/react` avec `{ scope: ref }` pour un nettoyage automatique. Chaque animation est enveloppée dans `gsap.matchMedia()` avec la condition `(prefers-reduced-motion: no-preference)`. En mouvement réduit, on n'applique que les changements d'opacité, ou rien.
- **Eases** : `CustomEase.create("hud", "0.2, 0, 0, 1")` pour les entrées, `power2.in` pour les sorties.
- **Recettes :**
  - *Arrivée de page* : stagger des cartes en `y: 8 → 0`, `autoAlpha 0 → 1`, 0,24 s, `stagger: 0.03`, plafonné à 8 éléments.
  - *Titre H1* : SplitText `type: "chars", mask: "chars"`, `yPercent: 100 → 0`, 0,35 s, `stagger: 0.012`. Seulement au premier chargement d'une section, jamais à chaque rafraîchissement.
  - *Compteurs* : tween d'un objet `{ v }` sur 0,6 s avec `power3.out` et `snap: { v: 1 }`, écrit dans un `<span class="tabular-nums">`. Pas de tween si le delta est nul.
  - *Changement de statut* : flash de la bordure gauche (`accent` → couleur du statut) en 0,4 s.
  - *Tabs, filtres et réordonnancement de liste* : `Flip.getState()` puis `Flip.from()` en 0,3 s avec l'ease « hud ».
  - *Nouvelle ligne live* (départs) : `height` et `autoAlpha` en 0,2 s, avec un fond ambre à 10 % qui s'estompe en 1,2 s.
  - *Drawer et dialog* : 0,22 s à l'entrée, 0,16 s à la sortie.
- **Budgets** : micro-interactions de 120 à 180 ms, transitions de 200 à 300 ms, rien au-delà de 600 ms sauf les compteurs. Aucune animation sur le scroll dans l'app (ScrollTrigger reste réservé à une éventuelle page de présentation).

## Mobile

- Barre d'onglets à 5 items, palette ⌘K remplacée par un bouton de recherche dans le header, FAB « Nouveau BC » au-dessus de la barre.
- Tableaux remplacés par des listes de cartes : bordure gauche de statut, numéro du BC en mono, deux lignes au maximum.
- Cibles tactiles d'au moins 44 px, body à 16 px dans les inputs (pour éviter le zoom iOS), sheets en plein écran pour les formulaires.
- StatCards en défilement horizontal avec scroll-snap et des valeurs de 28 px.
- Respect des safe areas, header sticky compact de 48 px.

## Références

- https://linear.app/now/how-we-redesigned-the-linear-ui : thèmes générés en LCH, hiérarchie de densité.
- https://linear.app/now/behind-the-latest-design-refresh : tout n'a pas le même poids visuel, et les actions sont à des places prévisibles.
- https://vercel.com/geist : système de tokens, Geist Sans et Mono, matériaux sobres.
- https://vercel.com/blog/introducing-geist-pixel : une police pixel comme accent, pas comme texte.
- https://www.raycast.com : palette de commandes et raccourcis comme interface principale.
- https://attio.com : tableaux denses mais aérés, chips de statut.
- https://resend.com : noir profond, typographie soignée, peu de couleurs.
- https://supabase.com/dashboard : DataTable et éditeur de données en sombre.
- https://stripe.com/sessions : rigueur des chiffres et des grilles.
- https://rauno.me : micro-interactions et soin des détails (« Interfaces » / craft).
- https://www.palantir.com/platforms/gotham/ : HUD opérationnel sobre, cartes et timelines.
- https://www.anduril.com/lattice : « common operating picture », le commandement temps réel.
- https://teenage.engineering : labels mono, grille stricte, couleur fonctionnelle.
- https://nothing.tech : police pixel et monochrome avec un accent unique.
- https://departuremono.com : police mono pixel OFL, bonne pour les données tabulaires.
- https://webflow.com/blog/gsap-becomes-free et https://gsap.com/blog/3-13/ : GSAP et ses plugins gratuits, SplitText réécrit et accessible.
- https://gsap.com/resources/a11y/ : `matchMedia` combiné à `prefers-reduced-motion`.

## Mise en œuvre (étape 2) et écarts — **validés le 8 octobre 2026**

Implémentation : `web/src/design/tokens.ts` (source unique des couleurs, `npm run tokens` → `web/src/app/themes.css`),
`web/src/app/globals.css`, `web/src/components/ui/*`, page interne `/design`. Un test vérifie le contraste AA
de chaque paire texte/fond dans les 5 thèmes (AAA pour le texte du thème Contraste élevé). Sources des écarts :
`docs/design/REFERENCES-UI.md` (agent UI) et `docs/design/AUDIT-UX-COMMANDES.md` (agent UX).

| Écart | Raison |
|---|---|
| Jeton `border-strong` (bordure des champs, ≥ 3:1) | `border` n'atteint que 1,4:1 : un champ doit rester repérable (WCAG 1.4.11) |
| Jeton `accent-fg` = fond du thème (texte sur l'accent) | 5,6:1 à 14:1 selon le thème |
| Contrôles 36 px (confortable), 32 px (compact), **44 px au tactile** quelle que soit la densité | Références Linear / Vercel ; mobile obligatoire |
| Palier de texte **13/18** pour aides, erreurs, toasts | Plus lisible que 12 px pour des messages à lire |
| Mono minimum 11 px ; capitales mono réservées aux eyebrows, en-têtes de tableau, badges, labels de StatCard | Retour v1 : trop de petits libellés en capitales |
| Chanfrein dessiné par `::before`/`::after` (élément non clippé) | `clip-path` coupait l'anneau de focus |
| Skeleton statique (pas de boucle) ; seule exception animée : la pastille « live » et le spinner de chargement d'un bouton | Budget motion |
| Mode **Automatique** = Commandement (sombre) / Ivoire (clair) selon le système, par CSS (pas de script, pas de flash) | — |



- **shadcn/ui** (MIT) : la base, avec le thème surchargé (radius 0, tokens ci-dessus). Les **blocks** servent de point de départ pour le dashboard et la sidebar.
- **Origin UI / coss.com** (MIT) : variantes de contrôles « produit » (inputs, selects, steppers, command). C'est la plus conforme à shadcn : **priorité 1**.
- **Tremor** (open source, racheté par Vercel en 2025, blocks gratuits) : charts Recharts pour les stats. Les couleurs sont à mapper sur les tokens.
- **cmdk**, **Vaul**, **Sonner**, **TanStack Table** : palette, drawer, toasts, tableaux.
- **Magic UI** (MIT) : à piocher avec parcimonie (NumberTicker, BorderBeam pour le « Live »).
- **Motion Primitives**, **Cult UI**, **Kokonut UI** : idées d'interactions à réécrire en GSAP. Il faut harmoniser leurs radius et leurs couleurs.
- **Aceternity UI** : trop marketing et lourd (glows) pour une app métier. À éviter, sauf pour l'écran de connexion.
- **React Bits** (variantes GSAP) : utile pour l'inspiration sur SplitText et les compteurs. La licence diffère selon les miroirs (MIT ou MIT + Commons Clause), à vérifier sur le dépôt officiel avant de copier.
- **21st.dev** : un registre pour trouver des composants. Vérifier la licence et la date du dernier commit à chaque fois.

## Module Commandes (session 3) — **validé le 8 octobre 2026**

- Formulaires de commande : colonne de 45 rem + aperçu du bon collant à droite (≥ 1024 px) ; sections numérotées
  (`FormSection`) toujours ouvertes en desktop, accordéon avec résumé d'une ligne en mobile ; numéro vert = complet,
  rouge = à compléter après « Préparer l'envoi ».
- `Segmented` (choix de 2 à 3 options : type C3, omnibus / direct, aller / A-R, standard / PMR), `ToggleChip` (lignes,
  arrêts), `AutosaveIndicator` en mono dans l'en-tête, `ActionBar` collante (au-dessus de la barre d'onglets mobile) avec
  une seule action primaire, `Timeline` pour l'historique des statuts (pastille à la couleur du statut).
- Suivi : vues enregistrées en puces avec compteur, table dense desktop, cartes mobiles, détail en panneau latéral
  (bas de l'écran en mobile) ; une commande annulée est barrée.
- B201 : trois colonnes de périodes en desktop (onglets en mobile), transports liés aux commandes (lien), saisie
  manuelle en pointillés.

## Module PMR (session 3) — **validé le 8 octobre 2026**

- Mêmes briques que Commandes : listes en table dense / cartes mobiles avec bordure de statut, détail en panneau
  latéral, historique en `Timeline`, vues enregistrées en puces avec compteur (matériel).
- Prestations groupées par jour (titre mono), statut : prévue (info), réalisée (ok), annulée (danger, barrée),
  client absent (warn). Matériel : en service (ok), hors service (danger), en attente (warn) ; validité en badge
  (dépassée = danger, < 60 jours = warn), clé à molette = réparation demandée.
- « Coller depuis DICOS » : zone de texte + aperçu de ce qui est reconnu avant de remplir le formulaire.
