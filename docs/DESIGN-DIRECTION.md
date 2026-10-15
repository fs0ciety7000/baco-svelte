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

> **Écart validé (refonte v4, lot 5, 15 oct. 2026) — mouvement en CSS d'abord, GSAP à la demande.** L'arrivée de page,
> les cascades simples, le trait d'onglet, `highlight`, la continuité ligne → panneau, les compteurs, la frise « Ma
> journée », l'écran commun et l'intro de connexion sont en `@keyframes` CSS ou en Web Animations
> (`src/lib/motion-core.ts`, **aucun import de GSAP**). Arrivée de page : fondu + 6 px, **320 ms**,
> `cubic-bezier(.16,1,.3,1)` (`--ease-out`), cascade ≤ **4 blocs × 40 ms**, jamais au premier affichage ni sur un changement
> de filtre ; sorties 160 ms `ease-in` ; rien en mouvement réduit. `transform` et `opacity` seulement (jamais `width`,
> `height`, `top`, `left`, `box-shadow`) ; `will-change` posé pendant l'animation et retiré ensuite ; barres de progression en
> `scaleX`. GSAP (`src/lib/motion.ts`) ne sert plus qu'aux mises en scène propres à une page et n'est **jamais importé par le
> shell ni par `components/ui`** ; les emblèmes du pied de page le chargent par `import()` quand ils deviennent visibles.
> Les recettes ci-dessous restent la référence d'intention (durées, courbes) ; leur mise en œuvre suit cette règle.

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
| Contrôles et champs 38 px (confortable, alignés le 15 oct. 2026), 32 px (compact), **44 px au tactile** quelle que soit la densité | Références Linear / Vercel ; mobile obligatoire |
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

## Module Opérations (session 3) — à valider

- Trains en direct : recherche unique gare ou n° de train, gares favorites en puces, tableau dense (cartes en mobile)
  avec bordure de retard (ok / warn ≥ 5 min / danger ≥ 15 min ou supprimé), panneau train (arrêts, composition, section
  PMR), actions Suivre / Bus de substitution / Noter. Source affichée (« iRail, données SNCB ») et heure de mise à jour.
- Main courante : cartes d'entrée avec bordure de catégorie, badges Urgent / Épinglée, liens vers les objets métier en
  puces, « Lu par n », panneau (historique `Timeline`, modification, retrait avec motif). Jamais de HTML saisi.
- Carte PN : liste + carte côte à côte en desktop, bascule Liste / Carte en mobile ; fond OpenStreetMap assombri par
  filtre dans les thèmes sombres ; points colorés par zone, fiche dans le panneau (pas de bulle HTML).
- Statistiques : `StatCard`, barres empilées et barres horizontales en SVG aux couleurs des jetons, tableau équivalent
  pour les lecteurs d'écran.

## Module PMR (session 3) — **validé le 8 octobre 2026**

- Mêmes briques que Commandes : listes en table dense / cartes mobiles avec bordure de statut, détail en panneau
  latéral, historique en `Timeline`, vues enregistrées en puces avec compteur (matériel).
- Prestations groupées par jour (titre mono), statut : prévue (info), réalisée (ok), annulée (danger, barrée),
  client absent (warn). Matériel : en service (ok), hors service (danger), en attente (warn) ; validité en badge
  (dépassée = danger, < 60 jours = warn), clé à molette = réparation demandée.
- « Coller depuis DICOS » : zone de texte + aperçu de ce qui est reconnu avant de remplir le formulaire.


## Écarts validés — étape 7 « Finition » (9 oct. 2026)

Validés par l'utilisateur après l'audit (`docs/design/AUDIT-INTERFACE.md`) et la planche de thèmes :

- **11 thèmes** au lieu de 5, chacun avec sa **forme** et sa **typographie** (source : `web/src/design/tokens.ts`) :
  Commandement (angle, Saira), Craie et Craie de jour (pilule, Geist, **couleur par module**, d'après gsap.com),
  Ivoire (angle, Saira), Porcelaine, Nocturne, Graphite, Prune (doux, Geist), Rail et Forêt (angle, IBM Plex),
  Contraste élevé (angle, Geist). « Automatique » = Commandement / Ivoire.
- **Formes** : *angle* (rayon 0, chanfrein 8 / 6 px — la direction d'origine), *doux* (boîtes 8 px, contrôles 6 px),
  *pilule* (boîtes 12 px, contrôles 999 px). Utilitaires `rounded-box` / `rounded-control` ; `.chamfer` suit le thème.
- **L'accent est réservé à l'action** : bouton primaire, sélection, focus, onglet actif. « Confirmé » prend le jeton
  **`progress`** ; n° de train en puce inversée neutre ; liens neutres soulignés (`.link`, accent au survol) ; sens
  IN / OUT en badges neutres ; graphiques en `info`. Le test des jetons impose ΔE OKLab ≥ 0,1 entre l'accent et chaque
  statut, et entre statuts.
- **Nouveaux jetons** : `fg-subtle` (placeholder, désactivé ; ≥ 3:1), `progress`, `--mod-<module>`.
- **Échelle typographique** : rien sous 12 px ; label 12, small 13, hint 13, **corps 15 px en confortable**
  (14 en compact). Badges, en-têtes de tableau, titres de toast et d'état vide en **casse normale** ; les capitales
  mono restent pour les sourcils et horodatages.
- Bande arc-en-ciel des StatCards **retirée** (décorative).

## Écarts validés — évolution « poste d'exploitation » (11 oct. 2026)

Validés par l'utilisateur après le verdict design et l'ébauche (artefact privé « Ébauche CSM v3 ») ; les 11 thèmes du
9 oct. restent **intacts** (formes, typographies, couleurs), sous « Autres thèmes » dans le sélecteur.

- **Trois thèmes de référence mis en avant** : **Jour** (clair, accent pétrole), **Nuit** (sombre, accent ambre) et
  **Contraste élevé** (noir / blanc / jaune, AAA). « Automatique » = Nuit / Jour. Forme **`net`** (rayon 4 px, sans
  chanfrein) et typographie **`pro`** : une seule voix, Geist en casse normale pour les titres **et les libellés**
  (`.label-mono` suit `--label-font` / `--label-case` / `--label-track`) ; la mono ne sert plus qu'aux n° de train,
  heures, références et colonnes de chiffres. L'ancien « Contraste élevé » (angles) reste disponible.
- **Haut de page sur une ligne** (barre de 48 px) : module courant + onglets dans la barre du haut en desktop (onglets
  sous la barre en mobile), titre de page gardé pour les lecteurs d'écran, districts du jour en **puce** (ambre tant que
  le jour n'est pas coché) au lieu du bandeau pleine largeur.
- **Barre latérale utile** : compteur par module (bons à confirmer en `warn`, missions impactées en `danger`, non lus du
  Journal en `info`) et **état des flux** en pied (temps réel, DICOS) ; « En direct » n'est plus répété sur les cartes.
- **Accueil « À traiter »** : bande de compteurs compacte (un cadre, séparateurs) et file d'actions triée par gravité
  (bande de couleur à gauche) ; les widgets restent personnalisables dessous ; états vides d'une ligne.
- **Listes** : plus de bouton « Filtrer » (filtrage automatique, Entrée conservée) ; « Effacer les filtres » seulement si
  un filtre est actif.
- **Panneau de détail ancré** à droite dès 1280 px (28 rem, sans voile, la page se resserre) ; en dessous, panneau
  modal comme avant.
- **Barre d'onglets mobile** : libellés courts (« Bons », « Opér. », « Annuaire »), nom complet annoncé.

## Contrôles personnalisés — refonte R1 + R3 (14 oct. 2026)

Plan validé : `docs/design/REFONTE-UI-2026-10.md` §3.5 et §4. Plus de `<select>` ni de champ date / heure natif dans un
nouvel écran (liste aux couleurs du système, format mm/dd/yyyy et « 02:50 PM » sur un poste en anglais, libellés coupés).

- **Select** : déclencheur aux mêmes jetons qu'un champ (`surface`, `border-strong`, focus `accent`, erreur `danger`,
  placeholder `fg-subtle`), le libellé choisi **passe à la ligne** ; liste en Popover ancré (largeur du déclencheur,
  12 rem au moins, 18 rem de haut au plus), option survolée / active en `surface-2`, coche `accent` sur l'option
  choisie. Ouverture `pop-in`.
- **Mobile (< 768 px) ou pointeur tactile** : la même liste, ou le calendrier, s'ouvre en **feuille du bas** (titre = libellé
  du champ, options de 48 px, jours de 44 px) ; pas de sélecteur natif, pour garder le format belge.
- **DateField** `jj/mm/aaaa`, **TimeField** `HH:MM` sur 24 h (pas des flèches : 5 min), **MonthField** `mm/aaaa`,
  **DateRangePicker** (raccourcis Aujourd'hui / Demain / 7 jours / Semaine dans le calendrier). Bouton calendrier ou
  horloge (« Maintenant ») à droite du champ, chiffres tabulaires.
- **Calendrier** : semaine du lundi, libellés `fr-BE`, jour choisi en `accent`, aujourd'hui cerclé `border-strong`,
  période en `accent-soft`, **jours fériés belges en `danger` avec un point** (légende « Jour férié »), jours des mois
  voisins en `fg-subtle`.
- **Heure à confirmer** (`pending`) : bordure en pointillés et « À confirmer » en `warn` tant que l'heure est vide.
- Rien ne bouge en mouvement réduit (règle globale).

## Listes courtes et mobile des formulaires — refonte R5 + R6 (14 oct. 2026)

- **R5** : toutes les listes courtes (statut, type, rôle, action, facturation, cause PMR, état / assistance / zone du
  matériel, zone PN, catégories, tri du Journal, Quinyx…) utilisent le `Select` personnalisé. Seuls les districts et les
  listes longues (société, chauffeur, ligne, gares) attendent les lots R2 / R4. Le titre de la feuille mobile est le
  libellé du champ seul.
- **Barre d'actions des bons en mobile** : une seule action principale pleine largeur (Terminer, Valider l'envoi, Créer le
  bon, Rétablir ou Rouvrir) + bouton « ⋯ » carré (secondaire) ; la feuille du bas « Actions du bon » liste les actions
  secondaires (options de 48 px, icône `fg-muted`), puis, **séparée par un filet**, « Annuler la commande » en bouton
  `danger` pleine largeur, qui ouvre le dialogue de motif. Barre collée à la barre d'onglets : ≈ 118 px fixes en bas
  d'écran (≈ 193 px avant). Desktop inchangé.
- **Segmented** : quand une option ne tient pas, grille de 2 colonnes (le dernier bouton d'un nombre impair prend la
  rangée), libellés sur deux lignes, jamais coupés par « … » ; sinon largeur des boutons selon leur libellé.
- **Switch** : rayon du thème (`rounded-control`, pouce au même rayon moins 2 px : carré, arrondi ou rond) ; libellé
  englobant cliquable de 44 px (`SwitchField`) ; zone tactile agrandie à 44 px en `pointer: coarse`.

## Recherche et choix multiples — refonte R2 + R4 (14 oct. 2026)

- **Combobox** (recherche dans une liste longue : sociétés, chauffeurs, lignes, gares, catégories) : champ texte aux
  jetons d'un champ, chevron à droite pour une liste fermée ; la frappe filtre (accents et casse ignorés, chaque mot), le
  libellé qui commence par la saisie passe en tête, la première option est active (`surface-2`). Popover ancré (largeur
  du champ, 14 rem au moins, 18 rem de haut au plus) ; « Aucun résultat » en `fg-muted` ; aide de l'option (lieux,
  « Sans adresse e-mail ») en `text-small fg-muted` sous le libellé. Annonce « N résultats » pour les lecteurs d'écran.
- **Mobile / tactile** : liste fermée → le champ devient un bouton qui ouvre une **feuille du bas** (recherche en haut,
  16 px, options de 48 px). **Saisie libre** (gare, catégorie) → la liste reste sous le champ (le clavier du téléphone
  est déjà ouvert ; une feuille masquerait le champ) : écart assumé au plan §3.5.
- **Saisie libre** : option « Nouvelle catégorie « … » » en fin de liste quand la saisie ne correspond à rien.
- **DistrictPicker** : puces toujours visibles « Tous » + DSO / DSE / DCE (+ « Mes districts » quand l'agent a des
  districts du jour) ; puce cochée = contour `accent` + fond `accent-soft` + case pleine `accent` (jamais la couleur
  seule) ; 44 px au doigt, `h-control-sm` à la souris ; nom complet (Sud-Ouest…) affiché dès 640 px ou toujours
  (`showHint`). Variante empilée (une puce par ligne, nom complet) dans le dialogue des districts du jour.
- **MultiSelect** : déclencheur qui résume (« Tous », « DSO, DSE », « 3 statuts ») ; liste à cases (case `accent` pleine
  si cochée) précédée de « Tout / Aucun » et du compteur `n/N` ; recherche facultative. Utilisé quand il y a plus de
  4 choix (districts DNO / DNE et « Sans district » de Ressources › Gares et Lignes).
- **CheckboxGroup** : `fieldset` + légende `text-small fg-muted`, cases Radix (forme du thème), libellé cliquable de 44 px
  au doigt, « Tout cocher » en lien.
- Rien ne bouge en mouvement réduit (ouverture `pop-in` des Popover seulement).

## Annuaire — refonte du 14 oct. 2026

Principe de refonte validé par l'utilisateur (« plus agréable à utiliser / rechercher ») ; détail et audit :
`docs/design/REFONTE-ANNUAIRE.md`.

- **Recherche en tête** : champ de 48 px (`text-body-lg`, icône 20 px, `Kbd` « / » à droite, croix d'effacement de 40 px),
  aide d'une ligne en `text-small fg-muted` sous le champ (desktop). « Nouveau contact » passe en **secondaire** à droite
  du champ (« + » carré en mobile) : la page n'a plus de bouton primaire.
- **Surlignage** des correspondances : fond `warn` à 30 % (même rendu que la recherche du Journal), texte `fg`.
- **Lignes de liste** (et non tableau) dans un cadre `rounded-box` à filets : étoile (`fg-subtle`, pleine `accent` quand
  favori — état sélectionné), nom en `text-body` medium, ligne d'aide `text-small fg-muted` (catégorie · groupe · zone ;
  le groupe n'est pas répété dans sa section), numéro en **mono tabulaire** de taille courante, actions icônes 32 px
  (copier → coche `ok`, e-mail). Ligne ouverte en `accent-soft`. Catégories en **puces de filtre** avec compteur
  (`fg-subtle`), plus de badge `info` par ligne.
- **Mobile** : lignes de 56 px au moins, numéro sous le nom, **bouton d'appel carré de 44 px** (`border-strong`) à droite.
- **Favoris / Consultés récemment** en deux colonnes dès 1280 px, au-dessus de la liste, seulement sans saisie ni filtre ;
  index des groupes en une rangée de puces qui défile.
- **Fiche** : bloc téléphone sur `surface-2` (numéro en `text-h3` mono, « Appeler » primaire + « Copier le numéro »
  secondaire), puis e-mail, favori, détails.

## Navigation v3 — 14 oct. 2026 (validée, `docs/design/AUDIT-NAVIGATION.md`)

- **Six modules par nature de travail** : Accueil (À traiter · Statistiques), Opérations (Journal · Ma journée · Relève),
  Commandes (Suivi · Bus · Taxi · Archives · Fournisseurs), PMR (Missions · Groupes · Clients · Matériel · Historique),
  **Réseau** (Trains en direct · Horaires · Lignes · Gares · PtCar · EBP · Carte PN), Ressources (Contacts · Collègues ·
  Planning · Procédures et documents · B201). Module Équipe supprimé ; Mon profil et Extension CSM dans le menu du compte.
- Icônes : Opérations `Radio`, Réseau `Train`, Ressources `Library`. Couleurs de module (thèmes « taxonomie ») :
  `--mod-reseau` (ex-`referentiels`), `--mod-ressources` (ex-`equipe`).
- Barre mobile : **Accueil · Opérations · Bons · PMR · Plus** ; « Plus » : Réseau, Ressources, Nouveautés, Administration.
- L'Accueil a des onglets (À traiter · Statistiques) : barre du haut en desktop, onglets sous l'en-tête en mobile.
- **Administration › Référentiels** : barre de puces des écrans (tableau de bord, gares et districts, lignes, PtCar, EBP,
  points SPI, PN, imports) ; tableau de bord en cartes (une par référentiel, anomalies en lignes de 44 px avec icône
  d'état, compteur mono) ; listes de gestion = tableau dense en desktop, `ListCard` + actions en icônes en mobile,
  panneau `Sheet` pour créer / modifier, suppression confirmée par dialogue `danger`.

## Refonte v4 « Signal / Quai / Cabine » — lots 0 à 2 (15 oct. 2026, `docs/design/REFONTE-DESIGN-V4.md`)

Décision de l'utilisateur : **« Signal, défauts »** (direction A, oui aux 10 questions du §9) **et les trois directions
disponibles**. Écarts validés, appliqués aux jetons et aux composants de base (le shell et les écrans suivent aux lots 3 à 6) :

- **Signal = défaut de tous les agents** : les thèmes `jour` / `nuit` (identifiants gardés pour les préférences et le cookie
  `csm_ui`) deviennent « Signal · Jour » (pétrole `#00666B`, gris teintés 200) et « Signal · Nuit » (ambre `#F8BC49`, bleu-noir
  `#0C0E12`). « Automatique » = Signal Nuit / Jour.
- **Quai** (`quai-jour`, `quai-nuit`, `quai-auto`) : bleu SNCB en accent, **`info` en cyan** pour rester distinct, IBM Plex
  (sans préchargement), rayons 3 / 2 px (pilules à 2 px), en-têtes de tableau `surface-3` en gras, trait accent sous les titres
  de carte, filet accent au-dessus de la bande de compteurs. Jour : `warn` assombri à `#955700` (AA sur `surface-3`).
- **Cabine** (`cabine-jour`, `cabine-nuit`, `cabine-auto`) : accent **encre** (la couleur est réservée aux statuts), gris
  chauds, Inter Tight + JetBrains Mono (sans préchargement), rayons 6 / 5 px, **lignes et contrôles 32 px en desktop** (le
  tactile garde 44 px), puce choisie en encre pleine ; la nuit, séparation par un trait fin. Jour : `warn` `#8C5700` ; Nuit :
  `border-strong` `#6C6762` (≥ 3:1 sur `surface-2`).
- **Nouveau jeton `surface-3`** (survol, actif, surélevé) : fixé pour les directions et Contraste élevé, **dérivé** pour les
  11 « Autres thèmes » (`surface-2` poussé de 6 % vers `fg`) sans toucher leurs couleurs.
- **Ombres** : `shadow-rest` (cartes, quasi invisible) et `shadow-float` (popovers, dialogues, panneaux, toasts) — variables
  `--shadow-1` / `--shadow-2` par thème ; **aucune** pour la forme « angle » ; liseré clair interne la nuit.
- **Forme `net` 8 / 6 px**, nouveau rayon **`rounded-pill`** (`--r-pill` : 999 px, 0 pour « angle », 2 px pour Quai) pour
  badges, puces de filtre, compteurs.
- **Typographie des directions** : titres 600 serrés, `text-h1` 24 / 30 (40 ailleurs), **`text-kpi`** 30 / 36 et
  **`text-panel`** 17 / 24 ; chiffres des compteurs en **`.figures`** = police du texte en chiffres tabulaires (fin du zéro barré
  de la mono) ; la mono reste aux n° de train, heures et références. Les « Autres thèmes » gardent leurs titres, chanfreins et
  libellés en capitales mono.
- **Composants** : cartes séparées par le ton (contour du thème `--card-frame`, aucun la nuit dans Signal / Quai) ; **bande de
  compteurs** `StatStrip` + `Stat` (zéro estompé, cellule chaude teintée à 7 %) ; tableaux à en-tête `--th-bg` 12 px et
  séparateurs à 70 % ; badges en pilule teintée (`--tint` : 12 % le jour, 16 % la nuit), sans contour dans les directions ;
  puces en pilule (`--chip-on-*`) ; `Segmented` en relief (segment choisi sur `--control-on`, plus d'accent plein) ; champs
  **38 px** (`h-field`) avec **halo de focus** (`focus-halo`), fond `--control-bg` (surface-2 la nuit) ; **`EmptyState`
  compact** (une ligne sur `surface-2`) par défaut, `variant="first"` pour une première utilisation ; **`TrainChip`** dans
  `components/ui` (encre inversée, `size` md / sm).
- **Shell (lot 3, 15 oct. 2026)** : barre latérale sur `--nav-bg` (Jour : surface-2 ; Nuit : entre bg et surface ; Cabine Nuit :
  noir du fond avec un filet), sections titrées *Travail* / *Référence*, entrée active en carte (`--nav-on`, ombre de repos) avec
  un trait de 3 px collé au bord, compteurs en pastilles teintées (warn = bons à envoyer, danger = missions impactées, info = non
  lus), carte « État des flux » collante en pied. Barre du haut 48 px : module en gras + onglets à trait accent arrondi (inset
  10 px) et compteurs neutres, puce des districts en pilule `surface-2`, recherche d'apparence champ (≥ 1280 px) avec `Kbd`
  « Ctrl K », icônes nues 34 px (44 au tactile), avatar carré arrondi **sans nom ni rôle** (décision de l'utilisateur). Barre du
  bas mobile : fond `surface`, trait arrondi en haut de l'actif, badges ronds teintés. Palette ⌘K : 672 px, `shadow-float`, champ
  56 px, groupes séparés par un filet, résultat actif `surface-3` + trait accent. Les « Autres thèmes » gardent barre `surface`,
  titres de section en capitales mono et coins droits (aucune carte ni ombre pour la forme « angle »).

## Refonte v4 — lot 4 « Écrans clés » (15 oct. 2026)

Composants signature 3, 4, 6, 8 et 9 du plan (`docs/design/REFONTE-DESIGN-V4.md` §3), réponses par défaut validées :

- **Accueil** : titre « Bonjour, prénom » + date et service du jour (`serviceLabel`, `lib/shift.ts`) ; bande de compteurs avec
  détail d'une ligne ; **file « À traiter » par gravité** (titres de groupe Urgent / À faire aujourd'hui / Pour information,
  pastille d'icône de nature teintée `--tint`, puce de train + retard dans la méta, action nommée par ligne, **une seule
  primaire** : premier bon à envoyer, sinon le premier élément) ; colonne droite ≥ 1280 px (Fin de service, Prochaines prises
  en charge), le widget « Fin de service » quitte alors la grille.
- **Barre d'outils des listes PMR** : une ligne en desktop (période `SegmentedNav`, districts en menu `DistrictMenu`, recherche,
  puce « Filtres (n) » qui replie le reste, actions à droite) ; mobile : période, recherche, puis districts / filtres / actions.
  Ligne d'état 13 px dessous (nombre, fraîcheur DICOS, En direct).
- **Tableau dense** : colonnes « Départ · IN » / « Arrivée · OUT » (`StationCell` : heure mono, gare en gras si assistée dans le
  district filtré, puce de sens en encre inversée — verte cochée une fois validée —, district en dessous) ; cartes mobiles avec
  les deux gares sur une grille heure / gare.
- **Bon de commande** : rail d'étapes collant (≥ 1280 px, vert / rouge / accent pour la section à l'écran), sections en cartes
  avec résumé à droite du titre (desktop), **aperçu en billet** (`OrderTicket` : perforation peinte avec `--bg`, itinéraire en
  pointillés, extrémités pleines ; `compact` en tête en mobile), barre d'actions flottante `shadow-float` qui garde sa place
  dans le flux.
- **États vides** : `EmptyState framed` (ligne vide dans le cadre de la liste) ; `variant="first"` seulement quand DICOS n'a
  jamais été synchronisé.
