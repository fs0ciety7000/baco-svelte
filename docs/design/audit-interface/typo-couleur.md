# Audit typographie, couleur et accessibilité — CSM v2

> Périmètre : `web/src/design/tokens.ts` (5 thèmes), `web/src/app/globals.css`, `web/src/app/layout.tsx`, composants `web/src/components/ui/*`,
> captures Commandement (58) et Ivoire (29, desktop seulement), mesures `audit/report-commandement.json`.
> Calculs refaits à la main (script sans dépendance : `scratchpad/typo/color.mjs`, `current.mjs`, `distinct-current.mjs`, `palettes.mjs` ;
> sortie complète `scratchpad/typo/verif.txt`). WCAG 2.x = ratio de luminance ; APCA = Lc (SAPC-W3 0.0.98G, signe négatif = texte clair sur
> fond sombre) ; distance des teintes = ΔE OKLab (≈ 0,02 = à peine perceptible ; < 0,10 = confusion probable à 11–12 px), « d » = même
> distance après simulation deutéranopie (Viénot 1999). Aucun fichier du dépôt modifié, aucune donnée personnelle reprise.

## Synthèse

Le socle est sain : tous les couples testés passent **WCAG AA** dans les 5 thèmes (le test `tokens.test.ts` le garantit), le focus global
(2 px accent, décalage 2 px) est bon, les champs passent à 16 px au tactile, aucune page ne déborde en 390 px. Mais AA ne suffit pas pour
un écran lu huit heures par jour, et l'audit met en évidence trois problèmes structurels :

1. **L'accent se confond avec un statut.** Dans Ivoire, accent et `warn` sont quasi identiques (ΔE 0,046 ; 0,005 en deutéranopie) ;
   dans Commandement, 0,085 ; dans Nocturne, accent et `info` sont à 0,060 (Rail 0,107). Or « Confirmé » utilise le ton `accent` :
   **Confirmé ≈ En cours** (ambre/orange) dans Commandement et Ivoire, **Confirmé ≈ Envoyé** (bleu/bleu) dans Rail et Nocturne.
2. **Le texte secondaire des thèmes sombres est trop faible pour une lecture prolongée.** `fg-muted` passe AA (4,9–6,1:1) mais
   n'atteint que **Lc 37–43** en APCA (seuil de texte courant : Lc 60 ; Lc 75 pour un corps de 14 px). WCAG 2 surestime le contraste
   des fonds sombres ; Ivoire, lui, est à Lc 67–71. Ce gris porte des informations utiles (relation TC, réf. DICOS, sous-lignes des
   widgets, aides, « Pas encore lu »).
3. **L'échelle réelle est trop petite.** 12 px est la 2e taille la plus rendue (8 013 éléments, dont **tous les libellés de champ**,
   les boutons `sm` et les puces de filtre) et 11 px mono majuscules la 3e (2 650 : en-têtes de tableau, badges de statut, barre
   d'onglets mobile). Le corps à 14 px est acceptable sur un bon écran, limite sur un 24″ 1080p ou un portable 1366 px.

Recommandation : **palette A** (évolution de Commandement, effort faible) + **échelle 13/15** + badges en casse normale, puis
proposer B (Craie) comme thème de caractère et C comme nouveau thème de jour remplaçant Ivoire. Passer la source des jetons en
**OKLCH** (sortie hex gardée) pour tenir des paliers de luminance constants entre thèmes.

---

## 1. Constats

### Critique

**C1 — Accent et statuts confondus (Confirmé / En cours / Envoyé).**
- Preuve : `status-badge.tsx` mappe `confirme → accent`, `en_cours → warn`, `envoye → info`. ΔE OKLab mesurés :

  | Thème | accent / warn | accent / info | warn / danger | ok / danger (deutéranopie) |
  |---|---|---|---|---|
  | Commandement | **0,085** (d 0,073) | 0,277 | 0,103 (d 0,062) | 0,289 (**d 0,052**) |
  | Ivoire | **0,046** (d **0,005**) | 0,217 | **0,072** (d 0,017) | 0,251 (d 0,057) |
  | Rail | 0,310 | **0,107** | 0,145 | 0,273 (d 0,056) |
  | Contraste | 0,132 | 0,322 | 0,180 | 0,463 (d 0,203) |
  | Nocturne | 0,285 | **0,060** (d 0,054) | 0,169 | 0,285 (d 0,055) |

  Capture `commandes-commandement-d.png` : la bordure gauche et le badge « CONFIRMÉ » (ambre) et une ligne « En cours » (orange)
  ne se distinguent qu'au libellé. Dans Ivoire, accent `#8A5300` (h 67°) et warn `#9A4512` (h 46°) ont la même luminance (L 0,49).
- Proposition : réserver l'accent à l'interaction (bouton primaire, onglet actif, focus, lien) et **ne plus l'utiliser comme ton de
  statut**. Ajouter un jeton `progress` (violet / orchidée, voir palettes A et C) pour « Confirmé », ou remapper (Confirmé = `ok` en
  pastille creuse, Terminé = `ok` pastille pleine). Dans chaque thème, imposer au test **ΔE ≥ 0,12 entre accent et chaque statut** et
  ≥ 0,10 entre statuts (ajout de 10 lignes dans `tokens.test.ts`).
- Effort : faible (1 mapping + 1 jeton + test), plus la reprise des valeurs (voir palettes).

**C2 — `fg-muted` trop faible en sombre pour huit heures de lecture.**
- Preuve (APCA sur `surface` / `surface-2`) : Commandement `#8F877B` Lc −38 / −37 (5,27 / 4,93:1) ; Rail −43 / −41 ; Nocturne
  −42 / −41. Sur un badge neutre (fond teinté 12 %) : Lc −36,7. Dans le surlignage « gare assistée » (accent 15 % sur surface),
  `fg-muted` tombe à **4,22:1** dans Commandement (sous AA) — c'est l'heure affichée en gris dans la cellule surlignée de
  `pmr-commandement-d.png`.
- Proposition : séparer deux niveaux. `fg-muted` (texte secondaire lisible) à L ≈ 0,74 en sombre (**7,4–8,5:1, Lc ≈ −56**) ; nouveau
  `fg-subtle` (placeholder, désactivé, filigrane) à L ≈ 0,62 (≥ 4,5:1 sur surface-2). Les placeholders ne doivent pas ressembler à une
  valeur saisie : aujourd'hui placeholder = texte secondaire (`placeholder:text-fg-muted`).
- Effort : faible pour les jetons ; moyen pour basculer les placeholders et états désactivés vers `fg-subtle` (≈ 30 classes).

**C3 — Texte de travail à 11–12 px.**
- Preuve (`report-commandement.json`, 58 pages) : 14 px 11 844 éléments, **12 px 8 013**, **11 px 2 650**, 20 px 122, 16 px 112,
  13 px 204 (7 pages), 40 / 28 px 31, 32 px 26, 22 px 2 (carte PN seulement). Dans le code : `text-small` (12 px) 256 occurrences
  contre 112 pour `text-body`. `Label` (`label.tsx`) est en 12 px ; `Th` et `Badge` en `label-mono` 11 px majuscules espacées
  0,1 em ; barre d'onglets mobile en `text-[0.6875rem]` majuscules (« OPÉRATIONS », « COMMANDES » serrés en 390 px).
- Proposition : nouvelle échelle (§4) avec **plancher 12 px pour le décoratif, 13 px pour tout libellé ou donnée**, corps 15 px en
  densité confortable (14 px en compact). En-têtes de tableau et badges en Geist 12–13 px / 500–600 casse normale ; mono majuscules
  gardée pour les sourcils de page et le fil d'Ariane uniquement.
- Effort : moyen (jetons d'échelle dans `globals.css` + revue des 256 `text-small` ; la plupart deviennent `text-label` 13 px).

### Important

**I1 — Badges de statut : 11 px mono majuscules + couleur de ton.** Contraste WCAG OK (≥ 4,5:1 testé) mais APCA Lc −41 (danger),
−45 (info), −37 (neutre) dans Commandement, à 11 px : APCA déconseille tout texte de lecture sous Lc 75 à cette taille. Les capitales
mono suppriment la silhouette des mots (« BROUILLON » / « TERMINÉ » se lisent lettre à lettre). → 12 px Geist 600 casse normale,
tons relevés (palettes : statuts à L 0,72–0,78 en sombre, Lc ≥ 50), pastille de forme différente par statut (pleine, creuse, croix,
demi) pour ne pas dépendre de la couleur. Effort : faible (`status-badge.tsx`).

**I2 — Focus clavier invisible dans les menus.** `user-menu.tsx`, `topbar.tsx` (résultats), `notification-bell.tsx`,
`emoji-picker.tsx` : `outline-none` + seul `data-[highlighted]:bg-surface-2`. Écart surface-2 / surface = **1,07–1,15:1** (WCAG 2.4.7
et 1.4.11 : 3:1 attendu pour l'indicateur). La palette ⌘K (`command.tsx`) fait bien : barre gauche 2 px accent. → reprendre ce
motif partout (`border-l-2 border-accent` ou `inset ring` 2 px accent). Effort : faible.

**I3 — États désactivés par opacité.** Bouton à 45 %, champs / cases à 50 % : bouton primaire désactivé **2,0–2,8:1**, champ
désactivé Ivoire 3,33:1, puis indistinct d'un bouton actif peu contrasté (bouton « Envoyer » du Journal). WCAG exempte le désactivé,
mais l'opérateur doit comprendre *pourquoi*. → style explicite : fond `surface-2`, texte `fg-subtle`, bordure pointillée, et raison en
infobulle / texte d'aide (`aria-disabled` + `aria-describedby`). Effort : faible à moyen.

**I4 — Lignes estompées hors district (`assist-board.tsx`, `opacity-40`).** Texte `fg` à 40 % : 3,3:1 (Commandement), **2,5:1**
(Ivoire) ; `fg-muted` à 40 % : **1,8:1**. Ces lignes restent des informations. → ne pas estomper le texte ; signaler l'appartenance par
une puce de district et ordonner (district d'abord) ou estomper seulement le fond. Effort : faible.

**I5 — Bordures et paliers de surface trop proches.** `border` 1,31–1,49:1 sur bg / surface (sombres), 1,37–1,46 (Ivoire) ;
`surface-2` vs `bg` 1,07–1,15. Toute la hiérarchie (cartes, séparateurs de lignes de tableau, tuiles « Vue du jour ») repose sur ces
filets, qui disparaissent sur les dalles TN / IPS bas de gamme et en plein jour. → `border` à L 0,32–0,36 en sombre (1,55–1,77:1) ;
garder `border-strong` ≥ 3:1 pour les champs (déjà fait) ; zébrure ou survol plus marqué sur les tableaux longs. Effort : faible.

**I6 — Couleur seule : bordure gauche de statut, sens IN / OUT.** La barre gauche des lignes (`statusColor`) est purement chromatique
(ok / danger à ΔE 0,05 pour un deutéranope, soit ≈ 8 % des hommes) ; elle est doublée par le badge, donc acceptable, mais le badge doit
alors être lisible (I1). Les sens « OUT » en vert `ok` et « IN » en bleu `info` réutilisent des couleurs de statut pour une
taxonomie qui n'en est pas une (OUT n'est pas « OK ») → neutre + flèche (↗ / ↘) ou icône embarquement / débarquement. Effort : faible.

**I7 — Mono et sans mélangés sans règle dans les tableaux.** `commandes-commandement-d.png` : date et heure en Geist Mono, mais N°
de bon et relation TC (identifiants) en sans gris. La mono élargit les colonnes (≈ +15 %) et casse le rythme. → règle : **chiffres
(dates, heures, compteurs) en Geist `tabular-nums`**, **mono réservée aux identifiants** (TC_…, réf. DICOS, n° de bon, abréviations
PtCar). Mettre `font-variant-numeric: tabular-nums` par défaut sur `table` (70 usages manuels aujourd'hui). Effort : faible à moyen.

**I8 — Saira Condensed majuscule sur du contenu dynamique.** Bon pour « COMMANDES », « BONJOUR, ADMIN » ; mauvais pour l'aperçu du bon
(« ORIGINE → DESTINATION » devient « LIÈGE-GUILLEMINS → … » condensé capitales) et les titres de section `display text-h3` des
formulaires. Les capitales condensées réduisent la reconnaissance des noms de gares. → Saira (ou son remplaçant, §4) seulement pour le
H1 de page et les valeurs de StatCard ; titres de carte et de section en Geist 600 casse normale. Effort : faible.

### Finition

- **F1 — Tailles orphelines** : 22 px (carte PN), `text-base` sur la connexion (doublon de `body-lg`), `text-[0.6875rem]` (barre
  mobile) et `text-[11px]` (pastille de notification) contournent l'échelle. → jetons uniquement ; lint `text-\[`.
- **F2 — Tracking** : `display` +0,02 em est juste pour Saira ; pour des titres en Geist, passer à −0,015 em (h2) / −0,02 em (h1),
  comme la référence GSAP. `label-mono` 0,1 em : ramener à 0,06 em en 12 px.
- **F3 — Longueur de ligne** : aucun `max-w` en `ch` (Nouveautés, procédures Markdown, détail du Journal). → `max-w-[68ch]` sur le
  texte courant long ; interlignage 1,5 pour ce texte (body 15/22 ou 15/24).
- **F4 — Lissage** : `-webkit-font-smoothing: antialiased` appliqué aussi aux thèmes clairs (macOS rend alors le texte sombre trop
  fin). → limiter à `[data-scheme="dark"]`.
- **F5 — Captures en locale en-US** : « mm/dd/yyyy », « 05:14 AM » dans les champs natifs (`commandes_nouveau-…`). Ce n'est pas l'UI
  réelle des agents (navigateur fr-BE) mais cela fausse les revues : `locale: "fr-BE", timezoneId: "Europe/Brussels"` dans Playwright.
- **F6 — Thème Contraste élevé** : `danger #FF4040` n'est qu'à 6,06:1 / Lc −41, le plus faible du thème (les autres ≥ 9,8:1) →
  `#FF6B6B` (≈ 7,6:1). Bordure `#8A8A8A` partout : volontaire, OK.
- **F7 — Luminance des statuts irrégulière** (Commandement : L 0,67 danger → 0,79 accent) : le rouge paraît « plus faible » que
  l'ambre, à l'inverse de la hiérarchie d'alerte. Les palettes proposées tiennent les statuts dans une bande de L de ±0,03.
- **F8 — Focus des champs** : `focus-visible:outline-1 outline-offset-0` + bordure accent ≈ 2 px effectifs : conforme 2.4.11 (AA) ;
  pour 2.4.13 (AAA) passer à `outline-2`. Le reste du focus est bon (accent ≥ 5,6:1 sur tous les fonds).

### Ce qui va bien

Focus global jamais supprimé ; `border-strong` ≥ 3:1 pour les champs (WCAG 1.4.11) ; champs 16 px au tactile ; cibles 44 px au
tactile ; badges doublés d'un libellé ; `accent-fg` = fond (≥ 5,6:1 partout) ; `prefers-reduced-motion` global ; polices
auto-hébergées ; test AA automatisé (à étendre : APCA indicatif, distances de teinte).

---

## 2. Contrastes actuels (extrait, `scratchpad/typo/current.mjs`)

| Thème | fg / surface-2 | fg-muted / surface-2 (APCA) | accent / bg | statut le plus faible / surface-2 | accent-fg / accent | border / surface | border-strong / surface-2 |
|---|---|---|---|---|---|---|---|
| Commandement | 14,11 | 4,93 (Lc −37) | 9,90 | danger 5,45 (Lc −42) | 9,90 | 1,31 | 3,17 |
| Ivoire | 14,75 | 4,89 (Lc 67) | 5,61 | accent 5,23 | 5,61 | 1,46 | 3,15 |
| Rail | 13,05 | 5,06 (Lc −41) | 6,30 | danger 5,17 | 6,30 | 1,37 | 3,12 |
| Contraste | 18,42 | 11,94 | 14,27 | danger 5,32 | 14,27 | 5,73 | 8,49 |
| Nocturne | 13,49 | 5,25 (Lc −41) | 8,02 | danger 5,64 | 8,02 | 1,39 | 3,12 |

Désactivé (opacité) : primaire 2,79 / 1,97 / 2,19 / 3,33 / 2,45 ; champ 4,51 / **3,33** / 4,57 / 5,37 / 4,44.

## 3. Passage en OKLCH

Valeurs actuelles converties (ex. Commandement) : bg `oklch(14.6% 0.003 0)`, surface 18.4 %, surface-2 21.6 %, border 28.8 %,
border-strong 52 %, fg 92.7 %, fg-muted 62.7 %, accent `oklch(78.7% 0.147 73)`, ok 72.8 % / 150°, warn 71.5 % / 55°, danger
67.3 % / 24°, info 67.8 % / 238°. On y lit directement les défauts : accent et warn à 18° de teinte et 7 points de L ; danger 11 points
sous l'accent.

Recommandation :
- **Source en OKLCH dans `tokens.ts`** (`{ l, c, h }`), sortie **hex** dans `themes.css` (calculée avec réduction de chroma hors gamut,
  comme `color.mjs`). Le support navigateur d'`oklch()` est large (Chromium 111+, Firefox 113+, Safari 15.4+), mais un poste
  d'entreprise figé reste possible : garder l'hex en sortie ne coûte rien.
- **Paliers de L fixes** partagés par tous les thèmes sombres : bg 15, surface 19, surface-2 22.5, border 32–36, border-strong 57,
  fg-subtle 62, fg-muted 74, fg 93 ; statuts dans une bande L 72–78, chroma 0,11–0,17. Thèmes clairs : bg 97, surface 99, surface-2 95,
  border 87–89, border-strong 59–60, fg-subtle 53, fg-muted 46, fg 17–21, statuts L 46–52. Un thème = une teinte de neutre (h) + un
  accent ; tout le reste se déduit, et le test vérifie ratios + ΔE.
- Les mélanges existants (`color-mix(in oklab, …)`) sont déjà dans le bon espace : à garder.

---

## 4. Palettes candidates

Toutes vérifiées par `scratchpad/typo/palettes.mjs` (WCAG + APCA + ΔE + deutéranopie). « badge » = texte du ton sur son fond teinté
12 % (`BADGE_TINT`). Fichier réutilisable : `scratchpad/palettes.json`.

### A — « Commandement affiné » (sombre, évolution de l'actuel)

Même caractère (noir chaud, ambre), accent poussé vers l'or pour s'écarter de l'orange `warn`, texte secondaire relevé, filets plus
visibles, statuts à luminance homogène, jeton `progress` pour « Confirmé ».

| Jeton | Hex | OKLCH | Clés de contraste |
|---|---|---|---|
| bg | `#0D0B09` | oklch(15.1% 0.005 68) | — |
| surface | `#161310` | oklch(18.9% 0.008 67) | — |
| surface-2 | `#1F1B17` | oklch(22.5% 0.010 67) | vs bg 1,15 |
| border | `#37322C` | oklch(32.0% 0.013 72) | /bg 1,55, /surface 1,46 |
| border-strong | `#7C766E` | oklch(56.9% 0.014 75) | /surface-2 3,81 |
| fg | `#EDE7DC` | oklch(93.0% 0.016 83) | /surface-2 13,90 (Lc −91) |
| fg-muted | `#B1AA9E` | oklch(74.0% 0.019 81) | /surface-2 **7,42** (Lc −55) — était 4,93 |
| fg-subtle | `#8C857C` | oklch(62.0% 0.016 74) | /surface-2 4,69 (placeholder, désactivé) |
| accent | `#FAC13B` | oklch(84.1% 0.155 84) | /bg 11,93 |
| accent-fg | `#0D0B09` | oklch(15.1% 0.005 68) | /accent 11,93 |
| ok | `#64CF80` | oklch(77.1% 0.150 150) | /surface-2 8,78, badge 7,95 |
| warn | `#F68C36` | oklch(74.1% 0.160 55) | /surface-2 7,11, badge 6,58 |
| danger | `#FD7277` | oklch(72.0% 0.170 20) | /surface-2 6,40, badge 5,98 (Lc −49) |
| info | `#68B7ED` | oklch(75.0% 0.110 240) | /surface-2 7,81, badge 7,14 |
| progress | `#D78ADB` | oklch(74.0% 0.140 325) | /surface-2 6,96, badge 6,44 |

Distances : accent / warn **0,13** (était 0,085), accent / info 0,28, warn / danger 0,10, info / progress 0,17. Limite connue :
ok / danger et info / progress se rapprochent en deutéranopie (0,04 / 0,03) → pastilles de forme différente (I1).

### B — « Craie » (inspirée GSAP, adaptée à un outil métier)

Crème chaud sur quasi-noir `#0E100F`, **accent = la craie elle-même** (bouton primaire crème plein, texte noir : un outil métier a
besoin d'une action primaire évidente, contrairement au site vitrine), couleur réservée à deux taxonomies disjointes : **statuts**
(saturés, L ≈ 0,75) et **modules** (pastels surligneurs, L 0,80–0,91, chroma plus basse ou teintes hors statuts). La crème pure
`#FFFCE1` est gardée pour l'accent et les titres ; le corps est légèrement atténué (`#EEECD6`) pour limiter le halo sur fond noir
(astigmatisme) sur huit heures. Conséquence : un lien ou un onglet actif en « accent » ressemble au texte → **soulignement / barre
d'onglet obligatoires** (indice non chromatique, bon pour l'accessibilité de toute façon).

**Sombre**

| Jeton | Hex | OKLCH | Clés de contraste |
|---|---|---|---|
| bg | `#0E100F` | oklch(17.0% 0.004 160) | — |
| surface | `#151513` | oklch(19.5% 0.004 120) | — |
| surface-2 | `#1E1E1B` | oklch(23.4% 0.006 107) | vs bg 1,14 |
| border | `#3D3E38` | oklch(36.1% 0.010 115) | /bg 1,77, /surface 1,69 (« Surface 25 » GSAP) |
| border-strong | `#7B7B72` | oklch(58.0% 0.013 107) | /surface-2 3,91 |
| fg | `#EEECD6` | oklch(93.9% 0.029 103) | /surface-2 14,01 (Lc −93) |
| fg-muted | `#AFAFA2` | oklch(75.0% 0.018 107) | /surface-2 7,54 (Lc −57) — le `#7C7C6F` GSAP n'était qu'à Lc ≈ −37 |
| fg-subtle | `#8A8A80` | oklch(63.0% 0.015 107) | /surface-2 4,80 |
| accent | `#FFFCE1` | oklch(98.6% 0.035 102) | /bg 18,43 |
| accent-fg | `#0E100F` | oklch(17.0% 0.004 160) | /accent 18,43 |
| ok | `#5ED476` | oklch(78.0% 0.170 148) | /surface-2 8,88, badge 8,08 |
| warn | `#F8962D` | oklch(76.0% 0.161 62) | /surface-2 7,47, badge 6,90 (« Orangey » GSAP) |
| danger | `#FF7777` | oklch(73.0% 0.166 22) | /surface-2 6,49, badge 6,10 |
| info | `#5ABDF2` | oklch(76.0% 0.120 235) | /surface-2 7,95, badge 7,33 |

**Clair (« Craie de jour »)** — papier crème, encre quasi noire ; accent = encre (bouton primaire noir, texte crème).

| Jeton | Hex | OKLCH | Clés de contraste |
|---|---|---|---|
| bg | `#FAF8E7` | oklch(97.6% 0.022 101) | — |
| surface | `#FEFDF4` | oklch(99.2% 0.012 101) | — |
| surface-2 | `#F1EEDC` | oklch(94.7% 0.024 99) | vs bg 1,09 |
| border | `#D8D5C3` | oklch(87.0% 0.024 99) | /surface 1,45 |
| border-strong | `#807E70` | oklch(59.1% 0.021 100) | /surface-2 3,51 |
| fg | `#0D100E` | oklch(16.9% 0.006 156) | /surface-2 16,40 |
| fg-muted | `#58594F` | oklch(46.0% 0.016 112) | /surface-2 6,09 (Lc 74) |
| fg-subtle | `#6D6C63` | oklch(52.9% 0.014 102) | /surface-2 4,53 |
| accent | `#131715` | oklch(20.0% 0.007 164) | /bg 16,92 |
| accent-fg | `#FAF8E7` | oklch(97.6% 0.022 101) | /accent 16,92 |
| ok | `#0F6A31` | oklch(46.1% 0.120 150) | /surface-2 5,76, badge 5,48 |
| warn | `#9A4900` | oklch(49.9% 0.129 52) | /surface-2 5,41, badge 5,18 |
| danger | `#AC262A` | oklch(49.0% 0.170 25) | /surface-2 5,87, badge 5,57 |
| info | `#005F98` | oklch(46.9% 0.119 245) | /surface-2 5,83, badge 5,56 |

**Couleurs de module (taxonomie)** — teintes choisies hors des 4 teintes de statut (25°, 55–62°, 148°, 235–245°) :

| Module | Sombre (hex / oklch / sur surface) | Clair (hex / oklch / sur surface) | ΔE min. vs statuts (sombre / clair) |
|---|---|---|---|
| Commandes — jaune surligneur | `#F9E361` · oklch(91% 0.150 100) · 14,09 | `#766200` · oklch(50% 0.103 95) · 5,85 | 0,14 / 0,09 |
| PMR — lilas | `#C3B0FD` · oklch(80% 0.109 295) · 9,53 | `#6646A8` · oklch(48% 0.151 295) · 6,84 | 0,12 / 0,12 |
| Opérations — cyan | `#65E0E7` · oklch(84% 0.110 200) · 11,64 | `#017272` · oklch(50% 0.085 195) · 5,63 | 0,10 / 0,09 |
| Annuaire et données — rose | `#F6B3D8` · oklch(84% 0.091 345) · 10,76 | `#9B3876` · oklch(50% 0.149 345) · 6,39 | 0,15 / 0,11 |
| Équipe — pêche / brun rosé | `#F8BFA6` · oklch(85% 0.074 45) · 11,31 | `#66423F` · oklch(42% 0.051 25) · 8,51 | 0,13 / 0,12 |
| Admin — craie neutre | `#C3BDB0` · oklch(80% 0.019 86) · 9,77 | `#615D54` · oklch(48% 0.015 87) · 6,42 | 0,14 / 0,12 |

Règles d'usage : la couleur de module n'apparaît que sur l'**icône de navigation active, le sourcil de page, un filet de 2 px sous
l'en-tête et la carte d'accueil du module** ; jamais sur un badge, une bordure de statut ou un bouton. Paires les plus proches
(Équipe / Admin 0,08, PMR / Annuaire 0,09) : acceptable car toujours accompagnées du nom du module. Opérations cyan reste à 0,10 du
`info` : ne jamais les juxtaposer sans libellé. Six couleurs + quatre statuts, c'est la limite haute : si l'utilisateur veut plus de
calme, n'en garder que quatre (Équipe et Admin en neutre).

### C — « Porcelaine » (claire premium pour le jour, remplace Ivoire)

Ivoire est chaud et beige (h 87°) : sur une dalle de bureau moyenne il tire vers le jaune sale, et son accent brun se confond avec
`warn`. C part d'un neutre très légèrement froid, cartes quasi blanches sur fond gris perle (la profondeur vient du palier, sans ombre),
encre bleu-noir, accent **bleu pétrole** (distinct de l'`info` indigo et de l'orange `warn`), jeton `progress` prune.

| Jeton | Hex | OKLCH | Clés de contraste |
|---|---|---|---|
| bg | `#F4F6F8` | oklch(97.2% 0.003 250) | — |
| surface | `#FDFEFF` | oklch(99.7% 0.002 250) | — |
| surface-2 | `#EBEFF2` | oklch(95.0% 0.006 240) | vs bg 1,07 |
| border | `#D7DBE0` | oklch(89.0% 0.008 254) | /surface 1,38 |
| border-strong | `#7B8187` | oklch(60.0% 0.012 248) | /surface-2 3,41 |
| fg | `#131922` | oklch(21.2% 0.020 258) | /surface-2 15,26 (Lc 95) |
| fg-muted | `#515963` | oklch(46.1% 0.019 254) | /surface-2 6,14 (Lc 75) |
| fg-subtle | `#666C75` | oklch(52.9% 0.016 258) | /surface-2 4,58 |
| accent | `#006071` | oklch(45.0% 0.080 215) | /bg 6,66, /surface 7,14 |
| accent-fg | `#FDFEFF` | oklch(99.7% 0.002 250) | /accent 7,14 |
| ok | `#146D34` | oklch(47.1% 0.120 150) | /surface-2 5,56, badge 5,32 |
| warn | `#9F5000` | oklch(51.9% 0.129 55) | /surface-2 5,01, badge 4,85 |
| danger | `#B32228` | oklch(49.9% 0.180 25) | /surface-2 5,72, badge 5,45 |
| info | `#3055B6` | oklch(47.9% 0.160 265) | /surface-2 5,86, badge 5,60 |
| progress | `#932B83` | oklch(48.0% 0.170 335) | /surface-2 6,23, badge 5,92 |

Distances : accent / warn 0,22 (Ivoire : 0,046), accent / info 0,13, accent / ok 0,11, warn / danger 0,10. Si l'utilisateur tient à
l'identité ambre en clair, il faut alors déplacer `warn` vers le jaune-ocre (moins lisible en clair) : déconseillé.

---

## 5. Propositions typographiques

### Échelle cible (7 tailles + stat, rapport ≈ 1,15–1,25)

| Jeton | Actuel | Proposé (confortable) | Compact | Usage |
|---|---|---|---|---|
| `caption` | label 11/16 mono caps | **12/16**, mono caps 0,06 em | 12/16 | sourcils, fil d'Ariane, horodatage décoratif |
| `label` | small 12/16 | **13/18** sans 500 | 12/16 | libellés de champ, en-têtes de tableau, badges, boutons `sm` |
| `hint` | 13/18 | fusionné dans `label` (13/18, `fg-muted`) | — | aides, erreurs, toasts |
| `body` | 14/20 | **15/22** | 14/20 | texte courant, cellules, champs desktop |
| `body-lg` | 16/24 | **17/24** | 16/24 | champs mobiles (≥ 16 px), texte long |
| `h3` | 20/24 | 20/26 sans 600 | 18/24 | titres de carte et section (casse normale) |
| `h2` | 28/32 | 26/30 sans 600, −0,015 em | 24/28 | titres de panneau |
| `h1` | 40/40 display | 34/36 display (ou sans 650, −0,02 em) | 30/32 | titre de page |
| `stat` | 32/1 | 36/1 tabulaire | 30/1 | valeurs de StatCard |

Le passage 14 → 15 px du corps augmente la hauteur des tableaux d'environ 7 % : compensé par la densité compacte (inchangée à 14) et
par l'abandon de la mono sur les dates (colonnes plus étroites). Plancher : rien sous 12 px, aucune donnée sous 13 px.

### Règles

- **Majuscules mono** : seulement pour les sourcils, le fil d'Ariane et les codes courts (≤ 4 caractères : IN, OUT, DSE). Jamais pour
  des en-têtes de tableau ni des statuts.
- **Chiffres** : `tabular-nums` par défaut sur `table`, StatCard, horaires ; Geist sans pour les dates/heures ; Geist Mono pour les
  identifiants (n° de bon, TC_, réf. DICOS, PtCar) avec `slashed-zero` si la police le permet.
- **Interlignage** : 1,45–1,5 pour le corps, 1,1–1,2 pour les titres ; longueur de ligne ≤ 68 ch pour la prose.
- **Tracking** : 0 sur le corps Geist, −0,015 à −0,02 em sur les titres en sans, +0,06 em sur la mono capitale.

### Combinaisons (OFL, auto-hébergeables)

1. **« Geist seul » (recommandée, effort minimal)** — Geist 400/500/600 pour tout, titres compris (casse normale, tracking négatif),
   Geist Mono pour les identifiants ; **Saira Condensed retirée** (une police de moins à charger). C'est la leçon GSAP (« une seule
   famille, la typographie est le héros ») sans perdre ce qui fonctionne déjà. Le caractère « tactique » passe par la mono des
   sourcils, le chanfrein et la couleur, pas par des capitales condensées.
2. **« IBM Plex Sans + Plex Mono (+ Plex Sans Condensed) »** — famille industrielle conçue pour les interfaces techniques, chiffres
   très distincts (1/l/I, 0/O), mono à zéro barré, et une **Condensed de la même famille** pour garder des titres de page condensés
   cohérents avec le corps (remplace Saira sans rupture de dessin). `next/font/google` : `IBM_Plex_Sans`, `IBM_Plex_Mono`,
   `IBM_Plex_Sans_Condensed`. Inconvénient : poids statiques (plus de fichiers que Geist variable), dessin plus « corporate ».
3. Variante à étudier : **Inter (corps) + Inter Tight (titres)** — œil plus grand que Geist à taille égale, donc gain de lisibilité à
   13–15 px ; `cv11` (a à un étage) et `ss01` disponibles ; Inter Tight donne les titres serrés de la référence GSAP. Ou **Mona Sans**
   (axe de chasse variable : corps normal et titres condensés dans un seul fichier ; vérifier sa présence dans `next/font/google`,
   sinon `next/font/local` depuis les fichiers OFL officiels). Departure Mono reste possible pour « En direct » seulement (non
   disponible sur Google Fonts : `next/font/local`).

---

## 6. Accessibilité — récapitulatif

| Point | État | Action |
|---|---|---|
| Focus visible global | Bon (2 px accent, décalage 2) | — |
| Focus dans les menus Radix | **Insuffisant** (fond seul, 1,07–1,15:1) | barre 2 px accent (I2) |
| Focus des champs | Conforme AA | `outline-2` pour AAA (F8) |
| Champs ≥ 16 px mobile | Bon (`pointer: coarse`) | garder en passant à `body-lg` 17 |
| Cibles 44 px tactile | Bon | barre d'onglets : libellés 12 px casse normale |
| Désactivé | Opacité 45–50 %, ambigu | style explicite + raison (I3) |
| Couleur seule | Barre de statut, sens IN/OUT, lignes hors district | formes / icônes / pas d'opacité sur le texte (I4, I6) |
| Statuts distinguables | Confirmé ≈ En cours / Envoyé | jeton `progress` + test ΔE (C1) |

## Fichiers

- `scratchpad/audit-typo-couleur.md` (ce rapport)
- `scratchpad/palettes.json` — `{ A: { name, dark }, B: { name, dark, light, modules: { dark, light } }, C: { name, light } }`
- `scratchpad/typo/` — scripts de calcul (`color.mjs`, `cvd.mjs`, `current.mjs`, `distinct-current.mjs`, `palettes.mjs`),
  `verif.txt` (tous les ratios), `table.txt` (hex ↔ oklch)
