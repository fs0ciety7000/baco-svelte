# Refonte du design CSM v4 : plan et ébauche (15 oct. 2026)

> Statut : **validé le 15 oct. 2026** (« Signal, défauts » + les trois directions Signal, Quai, Cabine) ; lots 0, 1 et 2 faits le 15 oct. (voir `docs/DESIGN-DIRECTION.md`).
> Demande : « Refonte du design en utilisant agents et skills (ui-ux-pro-max ; leonxlnx/taste-skill ;
> heygen-com/hyperframes ; anthropics/skills). Plateforme moderne, premium, performante, intuitive. »
> Ce qui est livré : ce document, `ebauche.html` (autonome, données fictives) et 12 rendus
> `ebauche-{accueil,pmr,bon}-{jour,nuit}-{1440,390}.png`. Les captures de l'existant sont dans `shots/`.
> Outil de contrôle des palettes : `tools/palette.mjs` (OKLCH → hex, contraste WCAG, ΔE OKLab, mêmes seuils que
> `src/design/tokens.test.ts`).

---

## 0. Sources lues

`CLAUDE.md`, `web/CLAUDE.md`, `docs/DESIGN-DIRECTION.md`, `docs/design/AUDIT-INTERFACE.md`,
`docs/design/REFONTE-UI-2026-10.md`, `docs/design/AUDIT-NAVIGATION.md`, `web/src/design/tokens.ts`,
`web/src/app/globals.css`, `web/src/app/layout.tsx`, `web/src/components/ui/{button,table,status-badge}.tsx`,
`web/src/navigation.ts`, le shell (`components/shell/*`).

**Captures** : l'instance locale `localhost:3000` ne servait plus ses fichiers statiques pendant ce travail (une
reconstruction de `.next` a eu lieu à 21:59 après le démarrage du serveur : CSS en 400, puis page « CSM est
momentanément indisponible »). Je n'ai pas relancé de serveur (le lancement d'une copie privée avec les variables du
serveur a été refusé par le garde-fou, à juste titre). Les constats s'appuient donc sur le code et sur les captures
locales les plus récentes des sessions précédentes (11 et 14 oct., base locale, compte E2E), copiées dans `shots/` :
`actuel-accueil-jour-1440_14oct.png`, `actuel-bon-jour-1440_14oct.png`, `actuel-bon-jour-390_14oct.png`,
`actuel-pmr-jour-1440_11oct.png`, `actuel-pmr-jour-360_11oct.png`, `actuel-onglets-1440_14oct.png`.
Aucune capture Nuit récente n'existait : à refaire quand le serveur local sera relancé (`npm run start:standalone`).

---

## 1. Ce que chaque skill apporte (pour un outil métier dense, pas un site vitrine)

Les quatre dépôts ont été clonés (aucun 403) dans `skills/`, **lus seulement** (aucun script exécuté, ni
`search.py`, ni `draw.mjs`, ni `inspect.mjs`).

| Skill | Ce qui sert à CSM | Ce qui ne sert pas |
|---|---|---|
| **ui-ux-pro-max** (`nextlevelbuilder`) | Grille de priorités (accessibilité > tactile > perf > style…), règles chiffrées : contraste 4,5:1, cibles 44 px, CLS < 0,1, `font-display: swap` + préchargement limité, `transform`/`opacity` seulement, « exit plus rapide que l'entrée », listes > 50 lignes virtualisées, annonce des compteurs en direct (`contextual-live-badge-updates`), focus non masqué par les barres collantes (WCAG 2.2). Base de données : pour « Data-Dense Dashboard » et « Government/Public Service », style **Minimalism & Swiss** + couleurs de données sémantiques ; paires typo « Minimal Swiss » / « Dashboard Data » (sans + chiffres). | Les palettes « produit » génériques (bleu confiance), le « glassmorphism » recommandé pour le SaaS. |
| **taste-skill** (`leonxlnx`) — `taste-skill`, `redesign-skill`, `minimalist-skill` | Liste des tics « générés » à éliminer : sourcils en capitales espacées, mono pour les petits libellés, numérotation 01/02 décorative, cartes identiques en rangées, ombres au repos, dégradés, une seule taille de rayon partout, gris chauds et froids mélangés. Règles utiles : **une famille de gris teintée**, **surfaces séparées par un pas de ton plutôt que par un trait**, ombres seulement sur ce qui flotte (menu, dialogue, panneau, barre d'actions), deux polices au plus, chiffres tabulaires, texte courant dans l'encre pleine, `text-wrap: balance`, états vides / erreur / chargement composés. Démarche de refonte : *scanner → diagnostiquer → corriger dans la pile existante, sans réécrire*. | L'essentiel du skill principal vise des pages vitrines (photos d'archives, « héros », 8 éléments animés au défilement, sections de 120 px). Contraire aux contraintes de CSM : **non retenu**. Certaines règles (pas de mono, pas de lignes) s'appliquent mal aux tableaux : le skill lui-même exempte « les vrais tableaux et champs de formulaire ». |
| **HyperFrames** (`heygen-com`) — `hyperframes-animation`, `hyperframes-creative/motion-principles` | Doctrine du mouvement transposable à l'UI : **« smooth beats bouncy »** (pas de `back`/`elastic` par défaut), courbe d'entrée à longue traîne (`power3.out` ≈ notre `--ease-hud`) ou ressort critique (ζ = 1), sorties en `.in` plus courtes que les entrées, **positions calculées une fois** (jamais `getBoundingClientRect` pendant un tween), transformations seulement, groupes échelonnés plafonnés (`n × stagger ≤ 0,5 s`), valeurs absolues (`fromTo`) pour que l'état reste juste si l'animation est interrompue, compteurs `tabular-nums` + arrondi. Recettes « stat-bars-and-fills » (barre en `scaleX`), « control-target-sync » (le contrôle et sa cible changent dans le même temps). | Tout le reste : rendu vidéo déterministe, scènes, transitions de plans, Lottie / Three.js / WebGPU. |
| **anthropics/skills** — `frontend-design`, `theme-factory`, `web-artifacts-builder` | `frontend-design` : ancrer le design dans le **sujet** (ici : l'horaire, le n° de train, le bon papier), dépenser l'audace **à un seul endroit**, structure = information (une numérotation seulement si la suite est réelle), écrire avec les mots de l'utilisateur, plan → relecture contre les clichés → construction → critique sur captures. Liste des clichés actuels : quasi-noir teinté + un accent vif, filets et rayon 0 façon journal, kit de cartes SaaS, sourcils en capitales, mono pour les petites données. `theme-factory` : un thème = palette + paire de polices cohérentes (confirme la structure de `tokens.ts`). | Les 10 thèmes prêts de `theme-factory` (pensés pour des présentations). |

**Synthèse** : les skills convergent sur ce qui manque à CSM pour paraître « premium » : *moins de traits, plus de
profondeur par le ton, une hiérarchie typographique franche, des chiffres lisibles, une couleur rare et un seul
mouvement juste*. Aucun ne justifie un changement de pile ni une nouvelle dépendance.

---

## 2. Constats : ce qui fait « pas premium » aujourd'hui

Référence : thème Jour (défaut clair), captures `shots/`. Le socle est solide (jetons, AA testé, densité, raccourcis,
panneau ancré, contrôles personnalisés R1-R6) ; ce qui manque est du **raffinement** et de la **hiérarchie**.

| # | Constat | Où (capture / fichier) | Effet |
|---|---|---|---|
| 1 | **Tout est encadré d'un trait de 1 px** : cartes, sections, champs, puces, cellules de compteurs, boutons secondaires, sections de bon numérotées dans un carré. Des boîtes dans des boîtes, toutes au même poids. | `actuel-bon-jour-1440`, `actuel-accueil`, `card.tsx`, `table.tsx` (`border border-border`) | Aspect « formulaire administratif », pas de profondeur, l'œil ne sait pas où se poser. |
| 2 | **Chiffres en Geist Mono avec zéro barré** : les compteurs d'accueil affichent « Ø », à 20 px, même poids que leur libellé, zéros aussi visibles que les valeurs utiles. | `actuel-accueil` (bande de compteurs) | Les KPI ne se lisent pas d'un coup d'œil ; « 0 » ressemble à « ensemble vide ». |
| 3 | **File « À traiter » monotone** : 8 lignes identiques (même filet ambre, même bouton « Lire », même sous-titre), pas de regroupement par gravité visible, pas d'icône de nature, horodatage en mono. | `actuel-accueil` | La gravité, raison d'être de l'écran, ne se voit pas. |
| 4 | **Barre latérale creuse** : 6 entrées puis un grand vide blanc, icônes 16 px trait fin, actif = simple aplat gris, compteurs peu contrastés, pas de regroupement (travail / référence). | `actuel-accueil`, `sidebar.tsx` | Elle n'a pas de rôle visuel ; le shell paraît inachevé. |
| 5 | **Barre du haut chargée et plate** : 5 à 6 boutons-cadres de même poids (district, recherche, présence, cloche, profil avec nom + rôle sur deux lignes). | `actuel-onglets-1440`, `topbar.tsx` | Bruit permanent sur l'écran le plus regardé. |
| 6 | **Bon de commande en une colonne de 2 000 px** sans repère de progression ; la barre d'actions collante se pose sur le contenu (elle coupe les puces « Arrêts intermédiaires ») ; toutes les puces de lignes et d'arrêts en accent plein → l'accent redevient omniprésent. | `actuel-bon-jour-1440` | Long, fatigant, l'action principale est noyée. |
| 7 | **États vides surdimensionnés** : grand cadre pointillé au milieu de la page pour « Pas encore synchronisé ». | `actuel-pmr-jour-1440` | Beaucoup de surface pour peu d'information. |
| 8 | **Mobile : 4 rangées de filtres avant le premier résultat**, onglets coupés (« Historique » tronqué), barre d'onglets du bas sans hiérarchie (badges carrés). | `actuel-pmr-jour-360` | Le premier résultat arrive tard. |
| 9 | **Typographie à une seule voix sans contraste** : titres 28 px / 600, corps 15 px / 400, presque tout en 500 ; pas d'échelle « très grand / petit » ; tracking neutre. | `tokens.ts` (typeset `pro`), `globals.css` | Lisible mais sans caractère : « propre et générique ». |
| 10 | **Gris non teintés et peu de paliers de surface** : Jour `#F2F3F1 / #FFFFFF / #EBEDEA`, Nuit `#0F1012 / #16181B / #1F2226` ; pas de surface « élevée » ni d'ombre de flottement cohérente ; panneau et barre d'actions ne se détachent pas. | `tokens.ts` | Les couches (page, carte, panneau, menu) se confondent, surtout en Nuit. |
| 11 | Héritage HUD encore visible : `label-mono` en capitales dans les thèmes « Autres », chanfrein, eyebrows `//`. Normal pour ces thèmes, mais certains composants gardent des capitales mono quand le thème de référence ne les demande pas (horodatages, `kbd`). | `globals.css` `.label-mono` | Tics « générés » relevés par taste-skill et frontend-design. |

---

## 3. Trois directions

Toutes gardent : jetons sémantiques, **les 15 jetons de couleur existants** (+ 1 nouveau `surface-3`), l'accent réservé à
l'action, les statuts `ok / warn / danger / info / progress`, densité confortable / compacte, 44 px au tactile,
`prefers-reduced-motion`. Palettes vérifiées par `tools/palette.mjs` : `fg` ≥ 7:1, `fg-muted` ≥ 4,5:1, `fg-subtle` ≥ 3:1,
accent et statuts ≥ 4,5:1 sur `bg`, `surface` et `surface-2`, `accent-fg` sur accent ≥ 4,5:1, `border-strong` ≥ 3:1,
ΔE OKLab ≥ 0,1 entre accent et statuts et entre statuts. **Les six palettes passent.**

### A. « Signal » — recommandée

*L'horaire de gare comme modèle* : calme, net, des chiffres qui se lisent de loin, une seule couleur d'action.
Évolution de la v3 (« poste d'exploitation ») plutôt que rupture : on garde les accents connus (pétrole le jour, ambre
la nuit), on change la matière.

**Palette (OKLCH, sortie hex)** — gris teintés d'une seule famille (Jour : teinte 200 de l'accent ; Nuit : bleu-noir 260).

| Jeton | Jour | Nuit |
|---|---|---|
| bg | `oklch(.975 .004 200)` `#F4F8F8` | `oklch(.165 .008 260)` `#0C0E12` |
| surface | `oklch(1 0 0)` `#FFFFFF` | `oklch(.2 .009 260)` `#14161A` |
| surface-2 | `oklch(.955 .005 200)` `#ECF1F1` | `oklch(.237 .01 260)` `#1C1F23` |
| **surface-3** (nouveau : survol, actif, élevé) | `oklch(.93 .006 200)` `#E3E9E9` | `oklch(.272 .011 260)` `#24272C` |
| border | `oklch(.9 .006 200)` `#DADFDF` | `oklch(.305 .011 260)` `#2C2F35` |
| border-strong | `oklch(.6 .01 200)` `#7A8282` | `oklch(.53 .012 260)` `#686C73` |
| fg | `oklch(.21 .01 230)` `#14191C` | `oklch(.945 .005 260)` `#EBEDF0` |
| fg-muted | `oklch(.45 .012 230)` `#4F575B` (6,5:1) | `oklch(.765 .01 260)` `#AFB3B9` (7,9:1) |
| fg-subtle | `oklch(.555 .01 230)` `#6D7478` | `oklch(.655 .01 260)` `#8D9197` |
| accent | `oklch(.46 .085 200)` `#00666B` (pétrole) | `oklch(.83 .145 80)` `#F8BC49` (ambre) |
| accent-fg | `#FFFFFF` (6,8:1) | `oklch(.19 .02 80)` `#191309` (10,8:1) |
| ok | `oklch(.47 .12 145)` `#256C2C` | `oklch(.79 .15 150)` `#6BD586` |
| warn | `oklch(.52 .115 70)` `#925B00` | `oklch(.73 .16 50)` `#F5853E` |
| danger | `oklch(.52 .18 27)` `#BA2B28` | `oklch(.71 .18 12)` `#FC6983` |
| info | `oklch(.48 .14 262)` `#2F59AB` | `oklch(.77 .11 240)` `#6EBDF3` |
| progress | `oklch(.48 .15 325)` `#86398B` | `oklch(.77 .13 320)` `#D998E8` |

- **Typographie** : **Geist** (interface, déjà auto-hébergée, variable) en 400 / 500 / 600 ; **chiffres tabulaires de
  Geist** (`tnum`) pour compteurs, heures en tableau et montants — *plus de mono pour les KPI* (fin du zéro barré).
  **Geist Mono 500** réservée aux **codes** : n° de train (puce), références TC_, n° de dossier, heures d'un horaire.
  Échelle à 6 pas : 12 (méta) · 13 (secondaire, libellés) · 15 (corps) · 17 (titre de panneau) · 24 (titre de page,
  −0,02 em) · 30 (KPI, −0,03 em, 600). Rien sous 12 px ; casse normale partout (thèmes de référence).
- **Densité** : inchangée (lignes 40 / 32 / 44, contrôles 36 / 32 / 44) ; champs de formulaire 38 px.
- **Rayons** : 2 valeurs, hiérarchisées (taste-skill) : boîtes 8 px, contrôles 6 px, puces de filtre en pilule
  (17 px), puce de train 5 px. Forme `net` élargie (aujourd'hui 4 / 4).
- **Profondeur** : séparation **par le ton** (page `bg` → carte `surface` → zone `surface-2`), trait de 1 px gardé seulement
  pour le contour des cartes en Jour et les séparateurs de lignes à 70 % ; **deux ombres** : `shadow-1` (repos, quasi
  invisible) et `shadow-float` (panneau ancré, barre d'actions, menus, ⌘K, dialogues). En Nuit, la profondeur vient d'un
  liseré clair interne (`inset 0 1px 0 #fff 4-6 %`) plutôt que d'ombres noires.
- **Iconographie** : lucide-react gardé (123 fichiers l'importent ; changer coûterait cher pour un gain faible), mais
  **18 px, trait 1,75**, icônes de nature dans des pastilles teintées 32 px (file « À traiter »), aucune icône décorative.
- **Mouvement** (principes HyperFrames / ui-ux-pro-max) : un seul moment orchestré, l'arrivée de page (6 px + opacité,
  320 ms, `cubic-bezier(.16,1,.3,1)`, cascade ≤ 4 blocs × 40 ms) ; les données en direct gardent `highlight` ;
  barres de progression en `scaleX` ; sorties 160 ms en `ease-in` ; aucun `back` / `elastic` ; rien au défilement.
- **Composants signature** (visibles dans l'ébauche) :
  1. **Barre latérale « tableau de service »** : sections *Travail* / *Référence*, compteurs en pastilles teintées
     (warn / danger / info), actif = carte `surface` + trait accent de 3 px, **état des flux** en carte de pied (temps
     réel, DICOS, iRail).
  2. **Barre du haut sur une ligne** : module en gras + onglets à trait accent, puce des districts, recherche large
     « Train, gare, bon, agent… Ctrl K », icônes nues (présence, cloche avec pastille), avatar carré arrondi.
  3. **Bande de compteurs** : une seule boîte, cellules séparées par 1 px, valeur 30 px, détail d'une ligne, zéro en
     `fg-subtle`, cellule « chaude » teintée à 7 % de son statut.
  4. **File « À traiter » par gravité** : groupes *Urgent / À faire aujourd'hui / Pour information*, pastille d'icône de
     nature, puce de train + retard dans la méta, **une action nommée par ligne** (« Ouvrir la mission », « Valider
     l'envoi », « Clôturer »), une seule primaire dans la file.
  5. **Puce de train** : encre inversée (`fg` sur `bg`), mono 12 px — le repère n° 1 de l'opérateur, partout identique.
  6. **Tableau dense** : en-tête `surface-2` sans capitales, sens IN / OUT **dans la cellule de gare** (puce inversée si
     assisté), gare assistée en gras, retard collé au train, bordure de statut 3 px gardée, ligne choisie `accent-soft`.
  7. **Panneau ancré flottant** (`shadow-float`) : en-tête train + trajet, mini-itinéraire avec heure réelle en danger,
     paires clé / valeur, encadré « Copier », chronologie.
  8. **Bon de commande en 3 colonnes** : étapes collantes à gauche (la suite est réelle : numérotation justifiée,
     verte = complète, rouge = à compléter), sections en cartes, **aperçu = le bon lui-même** (billet avec
     perforation, itinéraire en pointillés de gares) — l'idée tirée du sujet (frontend-design / taste-skill), **barre
     d'actions flottante** qui ne recouvre plus le contenu.
  9. **États vides d'une ligne** dans le cadre de la liste (pas de grand pointillé), sauf première utilisation.
  10. **Graphiques** (Statistiques, non dessinés ici) : barres en `info` / statuts, axes `fg-subtle`, valeurs en `tnum`,
      fond `surface`, sans quadrillage complet (une ligne de base + repères) ; tableau équivalent conservé.

### B. « Quai » — institutionnelle ferroviaire

Bleu SNCB comme accent, gris bleutés, **IBM Plex Sans + IBM Plex Mono** (déjà dans le projet pour Rail et Forêt),
angles presque droits (2 / 3 px), titres de section soulignés d'un trait accent, en-têtes de tableau plus marqués.
Jour : accent `#0859AC`, `info` déplacé vers un **cyan** `#007373` pour rester distinct de l'accent ; Nuit : accent
`#67B0F9` sur bleu nuit `#0C121A`. Plus « officielle », très lisible, mais : **`info` change de teinte** (cyan) dans tout
l'outil, la police Plex coûte ~60 Ko de plus au premier chargement, et l'identité ambre / pétrole des thèmes actuels
disparaît. Risque moyen.

### C. « Cabine » — monochrome encre, sombre d'abord

Accent **encre** (quasi-noir `#2A2420` le jour, crème `#EEE9E0` la nuit) au lieu d'une couleur : seuls les statuts
portent de la couleur ; gris chauds ; **Inter Tight** (titres serrés) + **JetBrains Mono** (codes) ; lignes compactes
32 px par défaut ; Nuit très profond `#080706`. Très « premium tech » (Vercel, Linear), mais : l'action principale
se distingue moins d'un bouton secondaire (moins de repères pour un opérateur pressé), deux nouvelles polices, et le
cliché « quasi-noir + accent unique » relevé par frontend-design. Risque élevé pour un outil de 8 h par jour.

| Critère | A Signal | B Quai | C Cabine |
|---|---|---|---|
| Continuité (habitudes, 8 thèmes « Autres ») | forte | moyenne | faible |
| Lisibilité opérateur (action / statut) | forte | forte | moyenne |
| Effet « premium » | bon | moyen | fort |
| Coût perf (polices) | 0 (Geist déjà là) | +60 Ko | +80 Ko |
| Effort | moyen | moyen | élevé |

**Recommandation : A « Signal ».**

---

## 4. Ce qui change (direction A)

### 4.1 Jetons — `web/src/design/tokens.ts`

- Couleurs des thèmes **`jour`** et **`nuit`** remplacées par les valeurs du §3 (exprimées en OKLCH dans un
  commentaire, hex dans le fichier tant que `tokens.test.ts` calcule en hex ; ou ajout d'un convertisseur OKLCH → hex
  dans `npm run tokens`). `net-contraste` : seul `surface-3` ajouté.
- **Nouveau jeton `surface-3`** dans `COLOR_TOKENS` : valeur à fournir pour **les 14 thèmes** — pour les 11 « Autres »,
  dérivée automatiquement (`color-mix(in oklab, surface-2, fg 6 %)`) afin de ne pas toucher leurs couleurs validées.
- **Forme `net`** : boîtes 8 px, contrôles 6 px (les 3 autres formes inchangées).
- **Typeset `pro`** : `weight` 600, `track` −0,02 em pour les titres ; nouvelle clé `figures: "sans"` (chiffres des
  KPI en Geist `tnum`) ; les autres typesets gardent la mono.
- **Ombres par thème** : `shadowRest`, `shadowFloat` (nouvelles variables `--shadow-1`, `--shadow-float` générées dans
  `themes.css`), avec des valeurs neutres pour les thèmes « angle » (aucune ombre : direction d'origine).
- `src/design/tokens.test.ts` : couvrir `surface-3` (texte `fg` ≥ 7:1 dessus, `fg-muted` ≥ 4,5:1) et `accent` sur
  `surface-3`.

### 4.2 Styles globaux — `web/src/app/globals.css` (+ `themes.css` régénéré)

- `--color-surface-3`, `--shadow-1`, `--shadow-float` dans `@theme inline` ; utilitaires `shadow-rest` / `shadow-float`.
- Échelle : ajouter `--text-kpi` (30/36) et `--text-panel` (17/24) ; `--text-h1` 24/30 pour les thèmes de référence
  (les autres gardent 40 via le typeset).
- `.tabular` étendu (`font-feature-settings: "tnum"`) ; `font-feature-settings: "cv11","ss01"` sur `html` pour Geist
  (a et l plus lisibles), à valider à l'œil.
- `--ease-out: cubic-bezier(.16,1,.3,1)` pour l'arrivée de page ; `--d-enter` 320 ms.

### 4.3 Composants — `web/src/components/ui/`

| Fichier | Changement |
|---|---|
| `card.tsx` | Carte = `surface` + `shadow-rest` ; contour 1 px seulement en Jour ; en-tête de carte compact (`CardHeader` titre 15/600 + compteur + action à droite). |
| `stat-card.tsx` | Devient la cellule de **bande de compteurs** (`StatStrip` + `Stat`) : valeur `text-kpi` sans mono, zéro en `fg-subtle`, état « chaud » teinté, lien. |
| `table.tsx` | En-tête `surface-2` sans trait, séparateurs à 70 %, `Th` en 12 px casse normale, `Tr` sélection `accent-soft` (déjà), coins arrondis de l'en-tête ; `ListCard` en carte flottante légère. |
| `status-badge.tsx` | Badge en pilule pleine teintée sans bordure (fond 12 % Jour / 16 % Nuit), pastille ronde. |
| `button.tsx` | `secondary` : fond `surface` / `surface-2` (Nuit), bordure `border-strong` gardée (≥ 3:1) ; `ghost` au survol `surface-3` ; tailles inchangées. |
| `filters.tsx` | `FilterChip` en pilule 34 px ; nouveau `Segmented` « période » (Aujourd'hui / Demain / 7 jours) à fond `surface-2`. |
| `sheet.tsx` | Panneau ancré : `shadow-float`, sans bordure, en-tête avec puce de train ; modal mobile inchangé. |
| `misc.tsx` | `EmptyState` compact (une ligne, dans le cadre de la liste) + variante « première utilisation » ; `Kbd` (touche dessinée). |
| `tabs.tsx` | Trait accent 2 px arrondi, compteur en pastille neutre. |
| `field.tsx`, `input.tsx`, `select.tsx`, `date-field.tsx`, `time-field.tsx` | Hauteur 38 px, fond `surface` (Jour) / `surface-2` (Nuit), halo de focus 3 px accent à 22 %. |
| Nouveau `train-chip.tsx` (ou dans `misc.tsx`) | Puce de train unique (`TrainChip` existe côté PMR : le remonter dans `ui/`). |

### 4.4 Shell et écrans

- `components/shell/sidebar.tsx` : sections *Travail* / *Référence*, actif en carte + trait accent, compteurs en pastilles,
  carte « État des flux » (reprend `shell-status.tsx`).
- `components/shell/topbar.tsx` : icônes nues 34 px, recherche élargie, avatar sans nom ni rôle (dans le menu du compte).
- `components/shell/mobile-tabbar.tsx` : badges ronds, trait accent en haut de l'onglet actif, fond `surface`.
- `components/shell/module-tabs.tsx` : compteurs par onglet.
- `app/(app)/dashboard.tsx` : bande de compteurs + file groupée par gravité (`Urgent / Aujourd'hui / Pour information`),
  une action nommée par ligne ; colonne droite (≥ 1280 px) : Fin de service, Prochaines prises en charge.
- Missions PMR (`app/(app)/pmr/*`, `components/pmr/*`) : barre d'outils sur une ligne (période segmentée, districts,
  recherche, Filtres (n), fraîcheur DICOS, Export ALEA), sens dans la cellule de gare, retard à côté du train.
- Bon bus (`components/orders/*`, `FormSection`, `ActionBar`) : rail d'étapes collant (≥ 1280 px), aperçu en billet,
  barre d'actions flottante qui réserve sa hauteur (`padding-bottom` du conteneur) au lieu de recouvrir le contenu.
- `app/layout.tsx` : aucune police ajoutée (Geist et Geist Mono déjà chargées).

---

## 5. Règles de performance

- **Polices** : aucune nouvelle police pour A ; Geist et Geist Mono via `next/font` (auto-hébergées, `display: swap`,
  `size-adjust` automatique → pas de CLS). Plex reste sans préchargement (thèmes Rail / Forêt). Interdiction de
  charger une police par thème au premier rendu.
- **CLS < 0,1** : hauteurs réservées pour la bande de compteurs, la file et le panneau ; squelettes aux dimensions
  réelles ; la barre d'actions réserve sa place.
- **JS** : aucune dépendance nouvelle ; l'arrivée de page et les barres passent en **CSS** (`@keyframes` +
  `animation-delay`) — GSAP reste chargé à la demande pour `highlight`, `ghostFlip` et le trait d'onglet (objectif :
  GSAP hors du bundle initial des pages sans animation). `backdrop-filter` limité à la barre du haut (une seule zone).
- **Animations GPU** : `transform` et `opacity` seulement ; pas d'animation de `box-shadow`, `height`, `width`, `top` ;
  `will-change` uniquement pendant l'animation.
- **Listes** : au-delà de ~200 lignes (Historique, PtCar, Gares), virtualiser ou paginer (règle ui-ux-pro-max).
- Mesure avant / après : Lighthouse (LCP, CLS, TBT) sur Accueil, Missions PMR et bon bus, desktop et mobile.

## 6. Accessibilité (AA conservée)

- Six palettes contrôlées par `tools/palette.mjs` avec les seuils du test des jetons ; à rejouer dans `tokens.test.ts`
  après intégration (le test fait foi).
- Focus visible 2 px accent + halo sur les champs ; jamais masqué par la barre collante ou la barre d'actions
  (`scroll-padding-bottom`).
- La couleur n'est jamais seule : groupes de gravité titrés, retard écrit (« +12 min »), statut en texte, IN / OUT en
  lettres.
- Cibles ≥ 44 px au tactile (inchangé) ; champs 16 px en mobile ; `prefers-reduced-motion` : aucune translation.
- Compteurs en direct annoncés par une phrase complète (`aria-live="polite"`) comme aujourd'hui.

## 7. Compatibilité avec les 8 « Autres thèmes »

- Leurs couleurs, formes (`angle`, `soft`, `pill`) et typographies **ne changent pas**.
- Les nouveaux jetons ont un repli automatique : `surface-3` dérivé, `shadow-*` à `none` pour la forme `angle`
  (direction d'origine sans ombre), ombres douces pour `soft` / `pill`.
- Les composants lisent `--r-box`, `--r-control`, `--label-*`, `--display-*` comme aujourd'hui : un thème « angle » garde
  ses chanfreins et ses capitales mono.
- Vérification : capture de chaque thème sur Accueil + bon (Playwright, 1440 + 390) avant de livrer le lot 1.

---

## 8. Plan en lots

| Lot | Contenu | Effort | Risque |
|---|---|---|---|
| **0** | Captures « avant » propres (serveur local relancé), Jour + Nuit, 6 écrans, 1440 + 390 ; mesures Lighthouse | ¼ j | nul |
| **1 Jetons** | Palettes Jour / Nuit, `surface-3`, ombres, forme `net` 8/6, échelle typo, chiffres sans mono ; test des jetons étendu ; captures des 14 thèmes | 1 j | faible (tests AA) |
| **2 Composants de base** | `card`, `stat-card` → `StatStrip`, `table`, `status-badge`, `button`, `filters` + `Segmented`, `tabs`, champs, `EmptyState` compact, `TrainChip` dans `ui/`, page `/design` mise à jour | 1,5 j | moyen (tous les écrans en profitent ; E2E à adapter aux libellés) |
| **3 Shell** | Barre latérale (sections, compteurs, flux), barre du haut, barre d'onglets mobile | 1 j | moyen (E2E shell) |
| **4 Écrans clés** | Accueil (file par gravité), Missions PMR + Groupes (barre d'outils, cellules de gare), bon bus / taxi (rail d'étapes, billet, barre d'actions flottante) | 2 j | moyen |
| **5 Mouvement et perf** | Arrivée de page en CSS, GSAP à la demande, mesures après, `prefers-reduced-motion` vérifié (E2E `motion.spec.ts`) | 1 j | faible |
| **6 Reste des écrans** | Journal, Réseau, Ressources, Statistiques (graphiques), Administration — passage aux nouveaux composants | 2 j | faible |

Total ≈ 8,75 j. Chaque lot : captures avant / après soumises (1440 + 390, Jour + Nuit), E2E, revue avant push, entrée
au `CHANGELOG.md`, mise à jour de `docs/DESIGN-DIRECTION.md` (écarts validés) et de `web/CLAUDE.md`.

---

## 9. Questions à valider

1. **Direction** : A « Signal » (recommandée), B « Quai » ou C « Cabine » ? Ou A avec un élément d'une autre
   (ex. le bleu SNCB de B en accent de Jour) ?
2. **Accents** : garder pétrole (Jour) et ambre (Nuit), ou un accent commun aux deux thèmes ?
3. **Gris teintés** : Nuit bleu-noir (`#0C0E12`) au lieu du gris neutre actuel (`#0F1012`) — d'accord ?
4. **Chiffres** : KPI et compteurs en Geist (sans mono), mono réservée aux n° de train, références et heures d'horaire ?
5. **Rayons** 8 / 6 px (au lieu de 4 / 4) pour les thèmes de référence ?
6. **Accueil** : file groupée par gravité avec une action nommée par ligne, et colonne droite « Fin de service +
   Prochaines prises en charge » à la place des widgets en dessous (les widgets restent personnalisables) ?
7. **Bon de commande** : rail d'étapes à gauche et aperçu en forme de billet — oui ? (en mobile, l'aperçu passe en tête
   sous forme compacte).
8. **Barre du haut** : retirer le nom et le rôle à côté de l'avatar (ils restent dans le menu du compte) ?
9. **Icônes** : garder lucide (recommandé, 123 fichiers) ou passer à Phosphor (suggestion de taste-skill, coût élevé) ?
10. **Lots** : commencer par les lots 0-1-2 (jetons + composants, visibles partout) puis valider sur la préversion avant
    le shell et les écrans ?
