# Audit UI — CSM v2 (9 oct. 2026)

Périmètre : 29 routes × desktop 1440×900 et mobile 390 (thème Commandement), 16 écrans Ivoire, mesures
`audit/report-commandement.json`, code `web/src`. Aucune donnée personnelle n'est reprise ici : on écrit « nom du
voyageur », « nom d'agent », etc.

## 1. Synthèse (5 lignes)

1. La base est saine et au-dessus de la moyenne des outils métier : jetons respectés (aucun hex en dur hors `/design`, peu de classes arbitraires), 3 voix typographiques tenues, tables denses lisibles, aucun débordement horizontal sur 58 mesures.
2. Le principe n° 1 de la direction (« la couleur informe, l'ambre = actif ») n'est **pas tenu** : l'ambre sert à la fois de bouton primaire, de sélection, de lien, de statut « Confirmé », de n° de train, de surlignage, de barres de graphique et de « non lu ». De plus, dans **les 5 thèmes**, l'accent est presque de la même teinte qu'une couleur d'état.
3. Les briques de liste ne sont pas factorisées : 9 barres de filtres écrites à la main, 5 styles de puces différents, des actions primaires placées à 4 endroits différents. Chaque module paraît « bien fait », mais pas fait par la même main.
4. Le haut de page coûte trop cher : fil d'Ariane, eyebrow, H1 du module et onglet disent quatre fois la même chose (≈ 140 px en desktop). En mobile, le premier élément utile de PMR ou de Commandes apparaît vers 560 px sur 844.
5. Quelques défauts « amateurs » faciles à corriger font baisser la qualité perçue : texte des graphiques qui grandit et rétrécit avec le SVG (≈ 20 px coupé en desktop, ≈ 5 px en mobile), selects tronqués, formats de date mélangés, « mission(s) », émojis dans les messages système.

## 2. Constats

### Critique

**C1. L'ambre est surchargé et entre en collision avec les couleurs d'état, dans les 5 thèmes.**
- *Écrans* : tous. Exemples : PMR et Groupes (n° de train sur fond ambre, gare surlignée en ambre, puce « Aujourd'hui » pleine, onglet actif, nom du groupe en lien ambre), Commandes (statut CONFIRMÉ et bordure de ligne en ambre à côté d'EN COURS orange), Journal (36 messages encadrés d'ambre), Statistiques (toutes les barres en ambre), formulaire bus (4 contrôles segmentés pleins ambre + bouton primaire).
- *Preuve* : `components/ui/status-badge.tsx:21` (`confirme: tone "accent"`) ; `components/pmr/train-chip.tsx` (`bg-accent`) ; `components/pmr/assist-board.tsx:131` (`HIGHLIGHT` ambre à 22 %) ; `components/ops/journal-chat.tsx:386` (non lu = anneau ambre) et `:380` (mes messages = teinte ambre) ; `components/ops/charts.tsx:33` (`fill="var(--accent)"`) ; liens `text-accent` dans `contact-board.tsx:182,428`, `group-board.tsx:129,237`, `markdown-view.tsx:24`, `bus-form.tsx:450`, `taxi-form.tsx:463,691`. Teintes (`design/tokens.ts`) : Commandement accent `#F2A93B` contre warn `#E8873A` ; Ivoire `#8A5300` contre `#9A4512` (quasi identiques, voir `audit-ivoire/accueil-ivoire-d.png`, badge Travaux et bouton Nouveau) ; Rail `#3A9BE5` contre info `#7FB8E6` ; Nocturne `#5AA9FF` contre info `#8AB4FF` ; Contraste `#FFD000` contre `#FF9900`.
- *Conséquence* : un opérateur ne peut plus lire « orange = attention » ni « ambre = sélectionné ». C'est l'inverse de la référence GSAP et de Linear/Vercel, où l'accent est rare et la couleur est une taxonomie.
- *Proposition* :
  1. Réserver l'accent à 3 usages : l'action primaire (une seule par écran), la sélection (onglet, puce, ligne) et le focus.
  2. Liens en `text-fg` souligné au survol (ou `text-info` pour les liens externes, `tel:`, `mailto:`).
  3. `Confirmé` passe sur un ton dédié (par exemple `ok` en contour, `Terminé` en plein) ou sur un nouveau jeton de statut ; le statut ne doit jamais utiliser `accent`.
  4. N° de train : garder la mise en avant demandée le 9 oct., mais en puce **inversée neutre** (`bg-fg text-bg`, gras mono). Elle reste aussi saillante, sans voler l'ambre.
  5. Non lu = pastille de 6 px et titre en gras, pas un cadre ; mes messages = alignement ou fond `surface-2`, pas de teinte ambre.
  6. Ajouter au test des jetons une **distance de teinte OKLCH ≥ 30°** entre `accent` et chaque couleur d'état, puis corriger les 5 thèmes (par exemple Commandement : warn vers `#E5703A` rouge-orangé ou accent vers un jaune plus pur ; Rail/Nocturne : info vers cyan/teal).
- *Effort* : M.

**C2. Le texte des graphiques est mis à l'échelle avec le SVG : illisible en mobile, coupé en desktop.**
- *Écrans* : Opérations › Statistiques (`operations_statistiques-commandement-d.png` : axe en ≈ 20 px, premier libellé coupé « 0/09 » ; en mobile, axe en ≈ 5 px).
- *Preuve* : `components/ops/charts.tsx:24` (`viewBox 640×202`, `w-full h-auto`) et `:40` (`fontSize="11"` en unités du viewBox) ; libellé centré sur la première barre, donc coupé.
- *Autres défauts* : pas de lignes de repère ni d'échelle Y (on ne lit aucune valeur sans survol) ; en desktop, le graphique prend 400 px de haut pour 180 unités ; barres pleines ambre.
- *Proposition* : libellés en HTML ou SVG à hauteur fixe (`height: 200px`, `preserveAspectRatio="none"` pour les barres, texte hors SVG), 3 lignes de repère avec leurs valeurs en mono 11 px, première et dernière étiquette alignées début/fin, barres en `fg-muted`/`info` avec l'accent seulement au survol ou sur la sélection.
- *Effort* : S.

**C3. En mobile, l'en-tête et les filtres occupent le premier écran.**
- *Écrans* : `pmr-commandement-m.png` (première mission vers 590 px), `commandes-commandement-m.png` (première commande vers 560 px), Statistiques (cartes de stats sous 6 champs), Annuaire, Équipe, Admin.
- *Preuve* : `components/pmr/filter-bar.tsx`, `components/orders/order-list.tsx` (lignes 80 à 120 environ : 5 champs empilés + « Filtrer » + « Effacer » + 4 raccourcis).
- *Proposition* : en dessous de `md`, une barre unique collante : champ de recherche + bouton « Filtres (n) » qui ouvre un `Sheet`, puis les raccourcis de jour en `Segmented` défilant. Les filtres actifs s'affichent en puces amovibles sous la barre. Avec le passage en auto-submit (déjà fait par `FormAutoSubmit` en PMR), on supprime « Filtrer ».
- *Effort* : M.

### Important

**I1. En-tête de page redondant (4 répétitions, ≈ 140 px).** Écran PMR : fil d'Ariane « PMR › MISSIONS PMR » + eyebrow « // ASSISTANCE PMR » + H1 « PMR » + onglet « Missions PMR ». Même schéma sur les 6 modules (`components/shell/module-layout.tsx`, `components/ui/misc.tsx:38`). *Proposition* : H1 en `text-h2` (28 px) sur la même ligne que les actions, eyebrow réservé aux métadonnées utiles (« 5 MISSIONS · VEN. 9 OCT. · EN DIRECT »), onglets collés dessous. Fil d'Ariane gardé dans la topbar seulement. On gagne ≈ 60 px en desktop et ≈ 80 px en mobile. Linear et Vercel tiennent l'en-tête sur une seule ligne. *Effort* : S.

**I2. 9 barres de filtres et 5 styles de puces.**
- *Barres de filtres* : `order-list.tsx`, `pmr/filter-bar.tsx`, `referentiels/ref-ui.tsx`, et les pages `admin/page.tsx`, `admin/audit/page.tsx`, `equipe/page.tsx`, `referentiels/page.tsx`, `referentiels/documents/page.tsx`, `pmr/materiel/page.tsx`.
- *Styles de puces* : raccourcis Commandes en boutons bordés neutres ; raccourcis PMR/Statistiques en **ambre plein** ; vues enregistrées Suivi/Matériel en contour ambre + teinte 12 % (`commandes/suivi/page.tsx:65`, `pmr/materiel/page.tsx:51`) ; sous-filtres Suivi et districts B201 en fond `surface-2` ; filtres du Journal en ambre plein. La teinte de sélection varie de 6 à 22 % selon le fichier (`journal-chat.tsx:339` 16 %, `log-composer.tsx:327` 14 %, `duty-districts.tsx:51` 12 % et `:172` 16 %, `form-kit.tsx:287` 14 %).
- *Proposition* : deux composants, `ListToolbar` (recherche, filtres, compteur, « En direct », actions) et `FilterChip`/`Segmented` (un seul état sélectionné : contour accent + `--accent-soft`), plus deux jetons `--accent-soft` (≈ 12 %) et `--accent-faint` (≈ 6 %) pour remplacer les `color-mix` inline. Les raccourcis de jour deviennent un `Segmented` partout.
- *Effort* : M.

**I3. Action primaire sans place fixe, et deux boutons ambre par écran.**
- *Emplacements* : « Nouveau bon » à droite du compteur (Commandes) ; « Nouvelle rampe » et « Nouveau contact » en ambre sous les filtres, à gauche (`equipment-board.tsx:116`, `contact-board.tsx:75`) ; « Nouveau compte » en bouton contour à droite (`admin/user-create.tsx:83`) ; « Export ALEA » seul sur sa ligne (PMR, Groupes) ; « CSV » et « PDF » ailleurs encore.
- *Doublon* : le bouton global « Nouveau » de la topbar est déjà ambre, donc deux boutons ambre se voient en même temps.
- *Proposition* : actions de page dans le slot `actions` du `PageHeader` (à droite, une seule primaire), exports en bouton secondaire au même endroit ; « Nouveau » de la topbar en contour (il est doublé par ⌘K).
- *Effort* : S.

**I4. Formats de date et d'heure mélangés.** On trouve « 2026-10-09 » (aperçu du bon), « jeu. 08/10 », « VEN. 09/10 », « VENDREDI 9 OCTOBRE 2026 », « il y a 220 j » et les champs natifs (`mm/dd/yyyy`, « 05:14 AM » dans le navigateur de capture en anglais). Le résumé des Statistiques affiche « Du 09/10/2026 Au 10/09/2026 » au-dessus de « Du jeu. 10/09 au ven. 09/10 » : c'est ambigu. *Proposition* : un seul module `formatDate`/`formatTime` (fr-BE, 24 h) pour tout l'affichage, `lang="fr-BE"` sur `<html>`, et un résumé de période toujours en toutes lettres. À vérifier sur un poste SNCB ; envisager un sélecteur de date maison si les navigateurs ne sont pas en fr. *Effort* : S à M.

**I5. Champs tronqués.** Carte PN : les selects affichent « Toutes zone: » et « Toutes ligne: » (`operations_carte-pn-commandement-d.png` et version Ivoire). *Proposition* : largeur minimale selon le contenu ou libellés « Zone : toutes ». *Effort* : S.

**I6. Annuaire : une table par groupe, colonnes désalignées.** Les colonnes Catégorie, Zone et Téléphone changent de position d'un groupe à l'autre (`referentiels-commandement-d.png`). L'en-tête est répété à chaque groupe. *Proposition* : une seule table avec des lignes de groupe collantes (`colgroup` fixe), ou `table-layout: fixed` avec des largeurs communes. *Effort* : S.

**I7. StatCard : double décoration et deux styles.** La bande arc-en-ciel danger → warn → accent → info (`components/ui/stat-card.tsx:93`) s'ajoute à la bordure gauche du ton (`:95`). Elle décore sans rien dire, ce qui contredit le principe n° 1. Les cartes « Fiches créées » de Santé ont un autre style (pas de display, pas de bande : `admin_sante-commandement-d.png`). Les 5 cartes des Statistiques ne remplissent pas la ligne. *Proposition* : garder un seul signal (le trait de ton en haut **ou** à gauche), supprimer le dégradé, utiliser `StatCard` partout et une grille `auto-fit`. *Effort* : S.

**I8. Les couleurs d'état servent de taxonomie des zones sur la carte PN.** Les zones sont en bleu, orange, rouge et vert (et brun accent en Ivoire). Une zone n'est ni « en danger » ni « OK ». *Proposition* : une palette catégorielle dédiée (4 à 6 teintes, une par zone, jamais réutilisée pour un état), comme le fait la référence GSAP, avec une légende. Le point sélectionné reste en `fg` avec un halo. *Effort* : S.

**I9. Actions répétées sur chaque ligne.** « Changer l'état » sur les 55 lignes de Matériel (`equipment-board.tsx:187,246`) ; « Marquer lu » + « Détail » sur chaque message du Journal. Cela crée un mur de boutons et fait chuter la lisibilité. *Proposition* : action au survol ou au focus de ligne en desktop (toujours visible en mobile, dans la carte), ou un menu « … » ; dans le Journal, « Tout marquer lu » dans l'en-tête et un marquage implicite à la lecture (au défilement). *Effort* : S à M.

**I10. Cartes mobiles PMR : l'information clé est tronquée et la copie est hors de la carte.** « Mons → 10:00 Charleroi-Cent… » : la destination est coupée, et le bouton Copier flotte à droite dans une colonne à part (`pmr-commandement-m.png`). *Proposition* : deux lignes (départ, puis arrivée avec l'heure), statut en haut à droite, copie dans la carte (icône 44 px en bas à droite). *Effort* : S.

**I11. Le Journal paraît vide et bruyant à la fois.** Les bulles prennent la largeur de leur contenu (largeurs irrégulières, grand vide à droite en desktop). Tout est encadré (C1). Les messages iRail commencent par des émojis (✅ 🚧 ⚠️), qui se mélangent aux icônes lucide et aux badges. Un second en-tête « Fil du journal » s'ajoute sous l'en-tête de page. *Proposition* : colonne de lecture fixe (≈ 46 rem) alignée à gauche, messages sans cadre (filet entre auteurs, bordure de catégorie gardée), icône lucide de catégorie à la place de l'émoji pour les sources système. Les émojis restent permis dans les messages des agents. *Effort* : M.

**I12. « En direct » et compteurs placés au hasard.** Le compteur et « En direct » sont tantôt à droite des onglets, tantôt au-dessus des filtres, tantôt dans l'en-tête de carte. PMR affiche le compteur deux fois (« 5 mission(s) » puis « VEN. 09/10 · 5 MISSION(S) »). *Proposition* : dans `ListToolbar` (I2), toujours au même endroit. *Effort* : S (avec I2).

### Finition

- **F1. Pluriels « (s) »** : « mission(s) », « trajet(s) », « compte(s) », « agent(s) », « annulée(s) », « message(s) ». Ça fait formulaire administratif. Utiliser `Intl.PluralRules` ou un petit `plural(n, "mission")`. *S*.
- **F2. Colonne Heure redondante** en PMR et Groupes : elle répète l'heure de départ déjà dans « Trajet ». La retirer ou ne garder que l'heure de la gare assistée. *S*.
- **F3. Surlignage des gares** : fond ambre + soulignement + heure grisée dans la même cellule, trop chargé. Garder un seul signal (gras + filet `fg` dessous, ou marqueur IN/OUT devant la gare). *S*.
- **F4. Statut + temps relatif empilés** (Suivi) : ligne de 52 px qui casse le rythme des 40 px. Mettre « il y a 4 j » dans sa propre colonne mono, ou en infobulle. *S*.
- **F5. Équipe** : cartes à hauteur et alignement irréguliers (libellé de rôle tantôt sous le badge, tantôt absent) ; badge de district en bleu info (couleur décorative). Rôle en ligne secondaire, district en badge neutre. *S*.
- **F6. B201 vide** : « BUS (0) — » répété 9 fois. Un seul état vide par période (« Aucun transport ») avec « + Transport hors outil » en action. *S*.
- **F7. Destination (formulaire bus)** : flèche de liste native pleine (▼) différente des chevrons des autres selects (`commandes_nouveau-commandement-d.png`). L'aligner sur `Select`. *S*.
- **F8. Volume de petites capitales** : 419 éléments en 11 px sur Commandes (badges, en-têtes, dates mono). C'est conforme au système, mais l'ensemble reste « bruyant HUD ». Passer les dates de cellule en Geist tabulaire 14 px plutôt qu'en mono (garder le mono pour n°, heures, codes) et réduire le tracking des badges de 0,12 à 0,06 em. *S*.
- **F9. Dégradé ambre radial du `body`** (`app/globals.css:144`) : discret, mais c'est un effet sans information, qui donne un voile jaunâtre aux surfaces en Ivoire. À retirer ou à limiter à la connexion. *S*.
- **F10. Barre latérale** : 6 entrées puis 600 px de vide ; « Client Solutions » en pied. C'est bien pour la sobriété. On pourrait y mettre les districts du jour et l'état « En direct » global, ce qui libérerait les pages (I12). *S*.
- **F11. Couleurs ad hoc à jetonner** : 14 `color-mix(...)` inline avec des pourcentages libres (`layout.tsx:35`, `live-board.tsx:423`, `send-dialog.tsx:136`, `bus-form.tsx:469`, `notification-bell.tsx:120`, `charts.tsx:94`…), des tailles `text-[0.6875rem]` (`mobile-tabbar.tsx:51,68`, `misc.tsx:74`) et `text-[11px]` (`notification-bell.tsx:76`) au lieu de `text-label`. À regrouper en jetons `--{tone}-soft` et `text-label`. *S*.
- **F12. Connexion** : propre mais nue ; c'est le seul écran où un peu de caractère est permis (coins de visée, Departure Mono sur « CSM », filet). *S*.

## 3. Les 5 changements au plus grand saut « premium »

1. **Discipline de couleur (C1 + I8 + I7)** : accent rare (une primaire, la sélection, le focus), liens neutres, statuts jamais en accent, teintes séparées et testées dans les 5 thèmes, palette catégorielle pour les zones, plus d'arc-en-ciel. C'est ce qui sépare le plus nettement Linear, Vercel et la référence GSAP d'un tableau de bord « thémé ».
2. **En-tête compact + `ListToolbar` unique (I1 + I2 + I3 + I12 + C3)** : une ligne de titre, les onglets, puis une barre d'outils identique dans les 9 listes (recherche, puces de filtres actifs, « Filtres (n) », compteur, En direct, action primaire à droite) ; en mobile, filtres en `Sheet`. Les modules sembleront faits par la même main et le contenu remontera de 100 à 250 px.
3. **Un seul langage de puce et de segmenté** (I2) : un état sélectionné, un niveau de teinte, des raccourcis de jour identiques partout. Petit en code, grand en cohérence perçue.
4. **Données qui respirent (I9 + F2 + F3 + F4 + F8)** : actions de ligne au survol, une information par cellule, rythme strict de 40 px, mono réservé aux identifiants. C'est la « densité calme » de la direction, aujourd'hui seulement à moitié atteinte.
5. **Finitions de contenu (C2 + I4 + I5 + I11 + F1)** : graphiques lisibles avec repères, un seul format de date fr-BE, plus de champs tronqués, plus de « (s) », pas d'émoji dans les messages système. Ce sont les détails que l'œil remarque en premier comme « pas fini ».

## 4. À garder absolument

- **Les 3 voix typographiques** (Saira Condensed en titres, Geist pour le texte, Geist Mono tabulaire pour les n° et heures) : c'est l'identité, et elle est bien appliquée.
- **La bordure gauche de statut** sur lignes et cartes, les **badges contour + teinte 12 %**, les **états vides en pointillés** : clairs et cohérents d'un module à l'autre.
- **Rayon 0, filets de 1 px, aucune ombre**, chanfreins discrets (à ne pas multiplier). C'est conforme à la référence GSAP (« aucune ombre ») et ça vieillit bien.
- **Tables denses à 40 px**, en-têtes mono, chiffres alignés à droite, et leur bascule en cartes en mobile.
- **Le formulaire de commande** : sections numérotées, aperçu du bon collant, `ActionBar` collante avec une seule primaire, segmentés. C'est le meilleur écran de l'application.
- **Les aides clavier** (J/K/Entrée/Échap en Suivi, ⌘K, Ctrl+Entrée) : la dimension Raycast du produit.
- **La discipline des jetons** : aucun hex dans les composants, test AA sur les 5 thèmes, très peu de classes arbitraires. Les corrections ci-dessus se font presque toutes dans `tokens.ts` et 3 ou 4 composants partagés.
- **Le thème Ivoire** : chaleureux et lisible, et il tient ses contrastes (seule la collision accent/warn est à corriger).
