# Audit motion — CSM v2 (`/web`)

> Audit du 9 oct. 2026, en lecture seule. Code lu, plus des mesures Playwright sur le serveur local (`127.0.0.1:3001`,
> compte de capture local) : échantillonnage image par image de `getBoundingClientRect`, `getComputedStyle` et
> `document.getAnimations()`, et poids des chunks dans `.next/static/chunks`. Aucun fichier du dépôt n'a été modifié
> (le script de sonde temporaire a été supprimé). Aucune donnée personnelle ci-dessous.

## 1. Synthèse

- **Il y a très peu de mouvement, et une partie est fausse.** GSAP n'est réellement utilisé qu'à trois endroits : le
  trait des onglets (`tabs.tsx`, `module-tabs.tsx`), le compteur des `StatCard` et la cascade d'entrée du tableau de
  bord (plus la page `/design`). Tout le reste repose sur 4 keyframes CSS (`fade-in`, `fade-out`, `pop-in`, `pop-out`),
  `transition-colors`, et les animations internes de Vaul et Sonner. `Flip` est enregistré mais **jamais utilisé**.
- **3 défauts visibles mesurés** :
  1. Les dialogues et la palette ⌘K **glissent en diagonale** sur la moitié de leur largeur à l'ouverture. La palette
     traverse 288 px en 220 ms. Cause : le keyframe `pop-in` anime la propriété `translate`, que Tailwind 4 utilise
     aussi pour le centrage `-translate-x-1/2`.
  2. Le tableau de bord **clignote** au chargement : les widgets sont visibles à 106 ms (HTML du serveur), passent à
     `opacity: 0 / hidden` à 290 ms (hydratation, `gsap.from`), puis réapparaissent en fondu.
  3. Chaque changement de filtre **recharge toute la page**. C'est un `<form method="get">` natif plus
     `FormAutoSubmit` : mesuré sur `/pmr`, le marqueur `window` est perdu et la navigation est de type `navigate`. On
     perd la position de défilement, la page passe par un écran blanc, puis tout est réhydraté et le trait des
     onglets repousse depuis 0 px.
- **Budgets dépassés** : le panneau `Sheet` (Vaul) dure **500 ms** (mesuré, cubic-bezier .32 .72 0 1), soit 1,7 fois
  le budget de 300 ms. Le `Skeleton` porte `animate-pulse`, une **boucle infinie**, alors que son commentaire et
  DESIGN-DIRECTION le disent statique.
- **Ce qui est bien** : `gsap.matchMedia()` est utilisé partout où GSAP sert, et la règle CSS globale en mouvement
  réduit fonctionne (0 animation mesurée en `reducedMotion: "reduce"`). La seule boucle infinie observée en
  fonctionnement est `.live-dot` (pulse-dot, sur l'opacité, donc composé par le GPU). Les boutons ont un retour
  `active:translate-y-px` en 150 ms. Le Journal suit le bas du fil sans à-coup et affiche une pastille « N nouveaux
  messages ».
- **Ce qui manque** : le mouvement qui *explique* le temps réel, alors que c'est le cœur métier. Une donnée qui
  change par SSE (`router.refresh`), une ligne de départ qui prend du retard, une mission synchronisée ou un message
  d'un collègue apparaissent **sans signal**. Il manque aussi le passage squelette → contenu, le retour « Copié » sur
  place (aujourd'hui un toast de 4 s à chaque copie) et la continuité ligne → panneau.
- **Coût** : environ **40 Ko gzip de GSAP** (2 chunks : ~19,8 Ko pour le cœur, ~19,9 Ko pour Flip, CustomEase et
  `@gsap/react`) chargés sur les 11 entrées de route de l'app (tous les `layout` de module et l'accueil), surtout pour
  animer un trait de 2 px. Ce poids se justifie seulement si le système ci-dessous est adopté. Sinon, une transition
  CSS suffit.

**Recommandation** : un système de **7 primitives** (`enter`, `exit`, `swap`, `highlight`, `count`, `slide-indicator`,
`flip-panel`), une **source unique de jetons** (TS vers variables CSS), et 3 correctifs rapides d'abord (P0, moins
d'une demi-journée).

## 2. Inventaire de ce qui bouge aujourd'hui

### 2.1 Jetons

| Source | Valeurs | Remarque |
|---|---|---|
| `src/lib/motion.ts:15` | `MOTION = { micro .15, enter .24, panel .22, exit .16, counter .6 }` | `micro`, `panel` et `exit` ne sont **jamais utilisés** |
| `src/lib/motion.ts:13` | `CustomEase "hud" = 0.2, 0, 0, 1` | Équivalent CSS : `--ease-hud` |
| `src/app/globals.css:66-71` | `--ease-hud` ; `--animate-fade-in 220ms`, `pop-in 220ms`, `fade-out/pop-out 160ms ease-in`, `pulse-dot 2s infinite` | **Aucun jeton `--d-*`** (CLAUDE.md en parle mais ils n'existent pas). Les durées sont écrites en dur dans `@theme` |
| `src/app/globals.css:268-276` | Mouvement réduit : `animation/transition-duration: .01ms !important` | Correct pour le CSS. N'agit ni sur `scrollTo({behavior:"smooth"})` ni sur Vaul en JS |

### 2.2 Usages

| Endroit | Technique | Durée / courbe | Fichier |
|---|---|---|---|
| Trait des onglets Radix | GSAP `x` + **`width`**, MutationObserver | 300 ms (en dur) « hud » | `components/ui/tabs.tsx:23-49` |
| Trait des onglets de module (liens) | GSAP `x` + **`width`** | 300 ms (en dur) « hud » | `components/shell/module-tabs.tsx:22-35` |
| Compteur StatCard | GSAP objet `{v}`, `snap`, `textContent` | 600 ms `power3.out` | `components/ui/stat-card.tsx:51-74` |
| Cascade des widgets (accueil, /design) | `useStaggerIn` → `gsap.from(y:8, autoAlpha:0)` | 240 ms, stagger 30 ms, 8 au plus | `lib/motion.ts:20-38`, `app/(app)/dashboard.tsx:291` |
| Dialog | CSS `pop-in` / `pop-out` + overlay `fade` + `backdrop-blur` | 220 / 160 ms | `components/ui/dialog.tsx:28-31` |
| Palette ⌘K | CSS `pop-in`, overlay `fade-in`, pas de sortie | 220 ms | `components/shell/command-palette.tsx:60-63` |
| Popovers (menu, cloche, émojis, info-bulle) | CSS `fade-in` sur `data-state=open`, pas de sortie | 220 ms | `topbar.tsx:71`, `user-menu.tsx:45`, `notification-bell.tsx:87`, `emoji-picker.tsx:54`, `tooltip.tsx:22` |
| Sheet (panneau de détail) | Vaul (CSS injecté) | **500 ms** cubic-bezier(.32,.72,0,1) | `components/ui/sheet.tsx:37-48` |
| Toasts | Sonner (animations par défaut) | ≈ 400 ms | `components/ui/toast.tsx:8` |
| Message du Journal | CSS `animate-fade-in` sur chaque `<article>` | 220 ms | `components/ops/journal-chat.tsx:378` |
| Pastille « N nouveaux messages » | CSS `pop-in` | 220 ms | `components/ops/journal-chat.tsx:581` |
| Boutons | `transition-[bg,color,border,transform] 150ms ease-hud`, `active:translate-y-px` | 150 ms | `components/ui/button.tsx:10` |
| Interrupteur | `transition-transform 150ms ease-hud` | 150 ms | `components/ui/checkbox.tsx:37` |
| Survols (17 occurrences) | `transition-colors` (valeur par défaut de Tailwind : 150 ms, courbe **standard** et non « hud ») | 150 ms | `sidebar.tsx`, `tabs.tsx`, `table.tsx`… |
| Live | `animate-pulse-dot` (opacité) | 2 s infini | `app/(app)/commandes/live-refresh.tsx:36`, `design/showcase.tsx:629` |
| Squelette | **`animate-pulse` infini** | 2 s infini | `components/ui/misc.tsx:88` |
| Spinners | `animate-spin` | infini, uniquement pendant un chargement | `button.tsx:61`, `form-kit.tsx:205`, `live-board.tsx:404`, `alea-export.tsx:140` |
| Glisser-déposer (accueil) | dnd-kit (`transition` inline) | 250 ms par défaut | `app/(app)/dashboard.tsx:204` |
| Transitions de page | **aucune** (ni View Transitions, ni GSAP) | — | — |

### 2.3 Mesures

| Mesure | Résultat |
|---|---|
| Palette ⌘K, ouverture (1440 px) | `left` passe de 720 à 432 px en environ 220 ms, `translate` va de `0% 8px` à `-50%` : **glissement horizontal de 288 px** |
| Accueil, rechargement | Widget visible à 106 ms, `opacity 0 / hidden` à 290 ms, puis fondu jusqu'à 530 ms : **flash** |
| Trait des onglets `/commandes` au chargement | Part de `width 0` et grandit jusqu'à 57 px en environ 300 ms, **à chaque chargement** |
| Filtre `/pmr` (choix d'un district) | Rechargement complet du document (le marqueur JS est perdu) |
| Sheet desktop | `transition-duration: 0.5s`, 500 ms avant d'être en place |
| Boucles infinies en fonctionnement | `pulse-dot` uniquement (1 à 2 instances par page) |
| `reducedMotion: "reduce"` (390 px) | 0 animation active : conforme |
| GSAP | Chunks `c15bf2b0-…` (51,5 Ko, 19,8 Ko gzip) + `2545-…` (50,4 Ko, 19,9 Ko gzip), présents dans 11 entrées de route |

## 3. Constats

### Critique

**C1. Les dialogues et la palette glissent en diagonale (conflit entre `translate` et le centrage).**
Preuve : `globals.css:83-94` (`@keyframes pop-in { from { translate: 0 8px } }`, `pop-out { to { translate: 0 4px } }`).
Ces keyframes sont appliqués à des éléments centrés par `-translate-x-1/2 -translate-y-1/2`, que Tailwind 4 compile
en propriété `translate: var(--tw-translate-x) var(--tw-translate-y)` : `dialog.tsx:31`, `command-palette.tsx:63`,
`journal-chat.tsx:581` (la pastille « nouveaux messages » glisse elle aussi horizontalement). Le keyframe remplace le
centrage pendant l'animation : la palette part de 288 px à droite, et le Dialog part en bas à droite puis repart vers
le bas à droite à la fermeture. C'est le premier mouvement que voit un agent (⌘K), et il ne veut rien dire.
*Proposition* : animer une propriété **différente** du centrage. Garder `translate` pour le centrage et animer
`transform`, `scale` ou `top`. Le plus simple :
```css
@keyframes pop-in  { from { opacity: 0; transform: translateY(6px) scale(.985); } }
@keyframes pop-out { to   { opacity: 0; transform: translateY(4px) scale(.985); } }
```
`transform` et `translate` se composent, donc le centrage reste intact. Ajouter un E2E qui vérifie que
`getBoundingClientRect().left` du dialogue ne varie pas de plus de 2 px pendant l'ouverture. *Effort : XS (15 min).*

**C2. Chaque filtre recharge tout le document (perte de continuité).**
Preuve : `components/ui/form-auto-submit.tsx:13-21` (`form.requestSubmit()`) sur des `<form method="get">` natifs :
`pmr/filter-bar.tsx:61`, `orders/order-list.tsx:55`, `admin/page.tsx:39`, `admin/audit/page.tsx:56`,
`referentiels/*`, `pmr/materiel/page.tsx:68`. Mesuré : navigation `navigate`, état JS perdu. Conséquences sur le
mouvement : écran blanc, défilement remis à zéro, trait d'onglet qui repart de 0 (C3), cascade et compteurs rejoués.
C'est aussi le parcours le plus fréquent de la journée.
*Proposition* : `import Form from "next/form"` (natif Next 15, aucune dépendance, garde le repli sans JS). La
navigation devient côté client et seule la liste change, ce qui permet ensuite la primitive `swap` (fondu de 120 ms
de la liste, ou Flip des lignes conservées). Garder `scroll={false}` sur les filtres. *Effort : S (une demi-journée,
6 formulaires plus E2E).*

**C3. Le tableau de bord clignote au chargement (SSR visible, puis masqué, puis fondu).**
Preuve : `lib/motion.ts:26-33` (`gsap.from(..., { autoAlpha: 0 })` exécuté à l'hydratation) et
`dashboard.tsx:202,291`. Mesuré : visible à 106 ms, caché à 290 ms. Sur un PC d'entreprise lent, l'écart est plus
grand. C'est le défaut classique d'un `from()` après SSR.
*Proposition* : ne jamais masquer un contenu déjà peint. Deux options :
(a) cacher dès le premier rendu par CSS, sous condition que JS et le mouvement soient disponibles :
`html[data-motion="ok"] [data-stagger]:not([data-shown]) { opacity: 0 }`, où `data-motion` est posé par le script
anti-flash existant (`matchMedia(MOTION_OK)`), avec un repli `animation: reveal 0s 1.2s forwards` si GSAP ne se charge
pas ;
(b) plus simple et plus juste pour un outil ouvert 8 h par jour : **jouer la cascade seulement aux navigations
client** (pas au premier chargement, pas au retour sur l'onglet). L'accueil s'affiche tout de suite, ce qui vaut mieux
qu'une animation. *Effort : S.*

### Important

**I1. Le panneau `Sheet` dure 500 ms (budget : 300 ms).**
Preuve : CSS de Vaul injecté (`[vaul-drawer]{transition:transform .5s cubic-bezier(.32,.72,0,1)}`, chunk `5486-…`),
utilisé sans surcharge dans `ui/sheet.tsx:37-48`. Mesuré : 500 ms pour 426 px. Le panneau sert à chaque clic de ligne
(PMR, Groupes, Commandes, Journal) : c'est l'animation la plus vue de l'app.
*Proposition* : surcharger dans `globals.css` :
`[data-vaul-drawer]{ transition-duration: var(--d-panel) !important; animation-duration: var(--d-panel) !important; transition-timing-function: var(--ease-out) !important }`
avec `--d-panel: 240ms`. Sur mobile, garder la courbe de Vaul (le geste du pouce le justifie) avec 280 ms. Vérifier
que le geste de la poignée reste fluide, puisque Vaul gère le relâchement lui-même. *Effort : XS.*

**I2. Le squelette pulse sans fin (contraire à la règle validée).**
Preuve : `components/ui/misc.tsx:82-88`. Le commentaire dit « Statique », mais la classe est `animate-pulse`.
DESIGN-DIRECTION, tableau des écarts validés : « Skeleton statique ». Utilisé dans `dashboard-widgets.tsx:132,229`,
`live-board.tsx:437,651,793`, `pn-board.tsx:25`, `journal-chat.tsx`.
*Proposition* : retirer `animate-pulse`. Si le chargement dure plus de 400 ms, afficher un seul balayage de 1,2 s
(`background-position`, une itération), puis rester statique. Le passage au contenu se fait par la primitive `swap`
(fondu de 120 ms). *Effort : XS.*

**I3. Le compteur `StatCard` part de 0 à chaque montage, avec un flash « valeur → 0 → valeur ».**
Preuve : `stat-card.tsx:49` (`previous = useRef(0)`), `:55-69`. Le HTML du serveur affiche la bonne valeur, puis le
compteur réécrit 0 avant de remonter pendant 600 ms. C'est un effet de vitrine, pas une information : rien n'a changé.
Autre fragilité : `el.textContent = …` (`:67`) remplace le nœud texte que React gère via `{formatter.format(value)}`
(`:98`). Après un premier tween, React modifie un nœud détaché (cas où la préférence passe à « réduit »).
*Proposition* : initialiser `previous` à `value` (aucun tween au montage, conformément à la recette « pas de tween si
le delta est nul »). Écrire uniquement dans `el.firstChild.nodeValue`, ou rendre la valeur seulement par la ref. Ajouter
`aria-label` avec la valeur finale sur le conteneur, et la primitive `highlight` (bordure du ton pendant 400 ms) quand
la valeur change en direct. *Effort : XS.*

**I4. Le trait des onglets anime `width` et repart de 0 à chaque montage.**
Preuve : `module-tabs.tsx:26-29` et `tabs.tsx:30-33` (`gsap.to(bar, { x, width })`), avec `w-0` initial
(`module-tabs.tsx:64`, `tabs.tsx:65`). Mesuré : de 0 à 57 px à chaque chargement de `/commandes`. Ce composant est
remonté à chaque rechargement par filtre (C2) et entre `/pmr` et `/groupes`, qui ont deux `layout` distincts
(`app/(app)/groupes/layout.tsx:8`). `width` déclenche un recalcul de mise en page à chaque image.
*Proposition* : au montage, `gsap.set` (pas de tween). Ensuite, animer `x` + `scaleX` (trait de 1 px de base,
`transform-origin: left`), ou utiliser `Flip.fit` (Flip est déjà dans le bundle). Factoriser les deux composants en un
hook `useSlideIndicator(listRef, selector)`. *Effort : S.*

**I5. `tabs.tsx` crée un `gsap.matchMedia()` à chaque changement d'onglet sans le libérer.**
Preuve : `tabs.tsx:31` (`const mm = gsap.matchMedia()` dans `place()`, appelé par le MutationObserver et
`resize`, sans `mm.revert()`). Les écouteurs `matchMedia` et les contextes s'accumulent tant que la liste reste
montée. Même schéma dans `module-tabs.tsx:27`, où le contexte est libéré seulement au démontage.
*Proposition* : un seul `mm` par montage, avec une fonction `place(animate)` fermée sur la condition (`const reduce =
mm.conditions.reduce`), ou `gsap.quickTo(bar, "x", …)` créé une fois. *Effort : XS.*

**I6. Les données en direct changent sans le dire.**
Preuve : `commandes/live-refresh.tsx:17-19` (`router.refresh()` sur l'événement SSE), `live-board.tsx:180-182`
(départs relus toutes les 30 s), `journal-chat.tsx:266-280` (nouveau message : fondu de 220 ms identique à un message
ancien chargé en lot), extension DICOS → `pmr_assists` (missions ajoutées sans signal). Un retard qui passe de +2 à +12,
ou une commande confirmée par un collègue, ne se remarque pas. DESIGN-DIRECTION le prévoit pourtant (« Nouvelle ligne
live : fond ambre 10 % qui s'estompe en 1,2 s », « Changement de statut : flash de la bordure gauche »), sans
implémentation.
*Proposition* : la primitive `highlight` (§4), branchée sur un `useChangedKeys(list, key, signature)` qui compare
l'identité et la signature (statut, retard, voie, heure) entre deux rendus. Elle n'est **jamais** jouée au premier
rendu ni sur ses propres actions (l'agent sait ce qu'il vient de faire). Le Journal ne met en évidence que les
messages des autres. *Effort : M (1 jour : hook, 4 listes, E2E).*

**I7. « Copié » passe par un toast de 4 s à chaque copie.**
Preuve : `pmr/copy.tsx:10-11` (`toast.success("Copié : …")`). L'export ALEA copie bloc par bloc
(`alea-export.tsx:241,254`) : les toasts s'empilent en bas à droite et masquent le contenu sur mobile.
*Proposition* : un retour **sur place** : l'icône `Copy` laisse la place à `Check` (fondu croisé et `scale`
0,6 → 1 en 150 ms), libellé « Copié » en `text-ok` pendant 1,2 s, puis retour. Annonce par une région `aria-live`
discrète (sr-only). Le toast reste réservé à l'échec. C'est la primitive `swap` appliquée à une icône. *Effort : S.*

**I8. Aucune continuité entre la ligne et le panneau.**
Preuve : `pmr/assist-board.tsx:279-283` → `<Sheet>` (`:361`) ; même schéma dans `group-board.tsx`,
`orders/tracking-board.tsx`. Le panneau arrive du bord droit sans lien visuel avec la ligne cliquée, et la ligne active
n'est pas marquée pendant l'ouverture.
*Proposition (sobre)* : marquer la ligne ouverte (`aria-selected` + fond `surface-2` + bordure accent, transition de
couleur de 120 ms). Pendant que le panneau entre, faire glisser en Flip une **copie du `TrainChip`** de la ligne vers
l'en-tête du panneau (`Flip.from` de 240 ms, `absolute: true`), en desktop seulement. C'est le seul « effet » de
continuité recommandé, sur l'information clé (le n° de train). *Effort : M.*

### Finition

| # | Constat (preuve) | Proposition | Effort |
|---|---|---|---|
| F1 | Deux sources de durées : `MOTION` en TS (`motion.ts:15`), en dur en CSS (`globals.css:68-71`) et `0.3` en dur (`tabs.tsx:33`, `module-tabs.tsx:29`) ; `micro`, `panel` et `exit` sont inutilisés | Jetons uniques (§4.1) : variables CSS `--d-*` / `--ease-*`, lues par GSAP via `getComputedStyle` ou dupliquées dans `motion.ts` avec un test d'égalité | XS |
| F2 | `transition-colors` utilise la courbe par défaut de Tailwind, et non « hud » (17 occurrences) | `--default-transition-timing-function: var(--ease-hud)` et `--default-transition-duration: var(--d-micro)` dans `@theme` | XS |
| F3 | Popovers et palette sans animation de sortie (`topbar.tsx:71`, `user-menu.tsx:45`, `notification-bell.tsx:87`, `command-palette.tsx:63`), et pas d'origine | `data-[state=closed]:animate-fade-out` (120 ms) ; `transform-origin: var(--radix-popover-content-transform-origin)` + `scale .98 → 1` | XS |
| F4 | `scrollTo({ behavior: "smooth" })` ignore le mouvement réduit (`journal-chat.tsx:261`) : la règle CSS `scroll-behavior` n'agit pas sur l'option JS | `behavior: smooth && !matchMedia(NO_MOTION).matches ? "smooth" : "auto"` | XS |
| F5 | Overlay du Dialog avec `backdrop-blur-[2px]` animé en opacité (`dialog.tsx:28`) : coûteux sur un PC de bureau à iGPU pour un effet invisible | Supprimer le flou (le voile à 70 % suffit) | XS |
| F6 | `Flip` enregistré (`motion.ts:12`) mais inutilisé, chargé sur 11 entrées | Le garder si I4 / I8 / `swap` sont adoptés ; sinon le retirer (environ la moitié du chunk `2545`) | XS |
| F7 | Le Journal fait fondre les 100 messages d'un coup au premier rendu et lors de « Messages plus anciens » (`journal-chat.tsx:378`) | Fondu réservé aux messages arrivés après le montage (`data-new`) ; rien sur le lot initial ou ancien | XS |
| F8 | Accordéon `FormSection` (mobile) : `hidden` / `flex` sec (`form-kit.tsx:152-154`), seul le chevron tourne | Acceptable (rapide). Option : `grid-template-rows: 0fr → 1fr` en 180 ms, en CSS pur | S |
| F9 | Cascade du tableau de bord sur des widgets dnd-kit (`dashboard.tsx:202-204`) : GSAP `clearProps: "transform"` agit sur le même `style.transform` que dnd-kit | Animer un enfant (la `Card`) et non le nœud triable | XS |
| F10 | `live-board.tsx:173` : `setBoard(null)` à chaque changement de gare, donc un squelette apparaît même pour 150 ms de chargement | Garder l'ancien tableau en `opacity .6` (+ `aria-busy`) jusqu'à la réponse, puis `swap` ; squelette seulement après 300 ms | S |
| F11 | Pas de transitions de page | **Ne pas** en ajouter de globales (outil dense, navigation très fréquente) ; seul le contenu du module fait `enter` (fondu de 120 ms + `y: 4`) aux navigations client entre onglets | — |

## 4. Système de motion proposé

### 4.1 Jetons (source unique)

À ajouter dans `globals.css` (`:root`) et à exposer dans `motion.ts` (`MOTION` lu depuis ces variables ou recopié, avec
un test Vitest qui compare les deux) :

| Jeton | Valeur | Usage |
|---|---|---|
| `--d-instant` | 80 ms | Pression de bouton, case cochée |
| `--d-micro` | 140 ms | Survols, icône qui change (`swap`), sorties de popover |
| `--d-enter` | 200 ms | Apparition d'élément, popover, dialog |
| `--d-panel` | 240 ms | Sheet, Flip de continuité, trait d'onglet |
| `--d-exit` | 140 ms | Toute sortie (une sortie est toujours plus rapide que l'entrée) |
| `--d-highlight` | 1 200 ms | Estompage du surlignage d'une donnée nouvelle (ce n'est pas un mouvement : une couleur qui s'éteint) |
| `--d-count` | 450 ms | Compteur (ramené de 600 à 450 ms) |
| `--ease-out` (« hud ») | `cubic-bezier(.2, 0, 0, 1)` | Entrées, déplacements |
| `--ease-in` | `cubic-bezier(.4, 0, 1, 1)` (≈ `power2.in`) | Sorties |
| `--ease-inout` | `cubic-bezier(.65, 0, .35, 1)` | Déplacement d'un point A à un point B (Flip, indicateur) |
| `--shift` | 6 px | Amplitude maximale d'un déplacement d'entrée |

Règles : rien au-delà de 300 ms pour un mouvement, sauf `count` et la couleur de `highlight` ; amplitude ≤ 8 px ;
stagger ≤ 25 ms et 8 éléments au plus ; animer seulement `transform`, `opacity`, `clip-path` et les couleurs (jamais
`width`, `height`, `top` ni `left` par image).

### 4.2 Les 7 primitives

| Primitive | Sens (ce qu'elle explique) | Recette | Mouvement réduit |
|---|---|---|---|
| `enter` | « Ceci vient d'apparaître » | `autoAlpha 0 → 1`, `y: 6 → 0`, `--d-enter`, `--ease-out` ; stagger de 25 ms sur 8 au plus | Fondu de 120 ms seulement |
| `exit` | « Ceci part » | `autoAlpha → 0`, `y: 4`, `--d-exit`, `--ease-in` ; ne bloque jamais le focus (retiré tout de suite de l'arbre d'accessibilité) | Disparition immédiate |
| `swap` | « Même place, nouveau contenu » (squelette → données, icône Copier → Copié, filtre appliqué) | Fondu croisé de 120 ms (sortie 60 ms, entrée 120 ms) ; pour une icône : `scale .6 → 1` | Remplacement immédiat |
| `highlight` | « Cette donnée a changé / est nouvelle » (SSE, synchro DICOS, message d'un collègue, retard modifié) | Fond `accent` à 12 % puis transparent en `--d-highlight` ; bordure gauche `accent` → couleur du statut en 400 ms. Jamais au premier rendu, jamais sur ses propres actions, au plus 1 fois par élément et par minute | **Gardé** (la couleur n'est pas un mouvement), sans transition : surlignage de 1,2 s puis retrait sec |
| `count` | « La valeur a bougé de X » | Tween `{v}` en `--d-count` `power3.out`, `snap: 1`, `tabular-nums` ; pas de tween si le delta est nul, ni au montage, ni si le delta est supérieur à 500 | Valeur posée directement |
| `slide-indicator` | « Vous êtes ici » (onglets, segmented, filtre actif) | `x` + `scaleX` en `--d-panel` `--ease-inout` ; `set` au montage | `set` |
| `flip-panel` | « Ce panneau détaille cette ligne » (ligne → Sheet ; Journal → plein écran) | `Flip.getState` → changement d'état → `Flip.from(state, { duration: --d-panel, ease: "hud", absolute: true })` sur 1 élément clé (TrainChip, en-tête) | Aucun Flip ; le Sheet s'ouvre sans glissement (fondu de 120 ms) |

La boucle `.live-dot` reste la **seule** boucle (opacité, 2 s). Les spinners ne sont permis que dans un bouton
`aria-busy` et pendant moins de 10 s (au-delà, un texte « Toujours en cours… »).

### 4.3 Règles d'usage

1. **Pas d'animation sans changement d'état.** Le montage initial d'une page n'est pas un changement : on ne rejoue
   ni cascade ni compteur au chargement ou au retour sur l'onglet.
2. **Ne jamais masquer ce qui est déjà peint** (pas de `from(autoAlpha: 0)` sur du HTML rendu par le serveur).
3. **Ne jamais bloquer la saisie** : aucun `pointer-events: none` pendant une animation et aucun `await` d'animation
   avant le focus ; les champs ne bougent jamais pendant qu'on tape (pas de `highlight` sur une ligne en cours
   d'édition).
4. **Une propriété, un propriétaire** : le centrage utilise `translate`, l'animation utilise `transform` (C1) ; un nœud
   géré par dnd-kit ou Vaul n'est pas animé par GSAP (F9).
5. **Les sorties sont plus courtes que les entrées**, avec la courbe `in`.
6. **Tout passe par `motion.ts`** (les primitives) ou les utilitaires CSS dérivés des jetons ; aucune durée en dur
   dans un composant.
7. **Mouvement réduit** : `gsap.matchMedia()` avec deux branches (`MOTION_OK` / `NO_MOTION`) ; le sens (couleur,
   texte) est conservé, seul le déplacement est retiré.
8. **Densité compacte** : en `data-density="compact"`, durées × 0,8 (variable CSS calculée).

### 4.4 Exemples de code (courts)

**Jetons (`globals.css`)**
```css
:root {
  --d-micro: 140ms; --d-enter: 200ms; --d-panel: 240ms; --d-exit: 140ms; --d-highlight: 1200ms;
  --ease-out: cubic-bezier(.2,0,0,1); --ease-in: cubic-bezier(.4,0,1,1); --ease-inout: cubic-bezier(.65,0,.35,1);
}
@theme { --default-transition-duration: var(--d-micro); --default-transition-timing-function: var(--ease-out); }
@keyframes pop-in  { from { opacity: 0; transform: translateY(6px) scale(.985); } }   /* C1 */
[data-vaul-drawer] { transition-duration: var(--d-panel) !important; animation-duration: var(--d-panel) !important; }
```

**`highlight` : un hook générique (`lib/motion.ts`)**
```ts
/** Surligne les éléments [data-key] dont la signature a changé depuis le rendu précédent. */
export function useHighlightChanges(scope: RefObject<HTMLElement | null>, sig: Record<string, string>) {
  const prev = useRef<Record<string, string> | null>(null);
  useGSAP(() => {
    const before = prev.current; prev.current = sig;
    if (!before) return;                                   // 1er rendu : rien
    const changed = Object.keys(sig).filter((k) => before[k] !== sig[k]);
    if (!changed.length) return;
    const els = changed.map((k) => scope.current?.querySelector(`[data-key="${CSS.escape(k)}"]`)).filter(Boolean);
    const mm = gsap.matchMedia();
    mm.add({ ok: MOTION_OK, reduce: NO_MOTION }, (ctx) => {
      gsap.fromTo(els, { "--hl": 0.12 }, {
        "--hl": 0, duration: ctx.conditions!.reduce ? 0 : 1.2, delay: ctx.conditions!.reduce ? 1.2 : 0, ease: "none",
      });
    });
  }, { scope, dependencies: [sig] });
}
// CSS : [data-key] { background: color-mix(in oklab, var(--accent) calc(var(--hl, 0) * 100%), transparent); }
// Usage : useHighlightChanges(ref, Object.fromEntries(list.map((a) => [a.id, `${a.status}|${a.delay}|${a.platform}`])));
```

**`slide-indicator` sans `width` (I4 + I5)**
```ts
export function useSlideIndicator(list: RefObject<HTMLElement | null>, bar: RefObject<HTMLElement | null>,
                                  selector: string, deps: unknown[]) {
  const mounted = useRef(false);
  useGSAP(() => {
    const el = list.current?.querySelector<HTMLElement>(selector);
    if (!el || !bar.current) return;
    const to = { x: el.offsetLeft, scaleX: el.offsetWidth, transformOrigin: "0 0" };   // barre de 1 px de large
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      mounted.current ? gsap.to(bar.current, { ...to, duration: 0.24, ease: "hud" }) : gsap.set(bar.current, to);
    });
    mm.add(NO_MOTION, () => gsap.set(bar.current, to));
    mounted.current = true;
    return () => mm.revert();
  }, { scope: list, dependencies: deps, revertOnUpdate: false });
}
```

**`swap` d'icône « Copié » (I7)**
```tsx
const [done, setDone] = useState(false);
const onCopy = async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); };
<Button onClick={onCopy} aria-label={`Copier : ${text}`}>
  <span className="grid [&>*]:col-start-1 [&>*]:row-start-1">
    <Copy  className={cn("transition-[opacity,scale] duration-(--d-micro)", done && "scale-60 opacity-0")} />
    <Check className={cn("text-ok transition-[opacity,scale] duration-(--d-micro)", !done && "scale-60 opacity-0")} />
  </span>
  <span className="sr-only" aria-live="polite">{done ? "Copié" : ""}</span>
</Button>
```

**`flip-panel` du n° de train (I8)**
```ts
const open = (a: Assist, rowChip: HTMLElement) => {
  const state = Flip.getState(rowChip);           // avant le changement d'état
  setPanel(a);
  requestAnimationFrame(() => {                   // une fois le Sheet monté
    const target = document.querySelector("[data-flip-id='panel-train']");
    if (target && window.matchMedia(MOTION_OK).matches)
      Flip.from(state, { targets: target, duration: 0.24, ease: "hud", absolute: true, scale: true });
  });
};
```

## 5. Plan priorisé

| Prio | Lot | Contenu | Effort | Critère d'acceptation |
|---|---|---|---|---|
| **P0** | Corrections visibles | C1 (keyframes `transform`), I1 (Vaul à 240 ms), I2 (squelette statique), I3 (compteur sans tween au montage), F4 | ≈ 2 h | Dialog et palette : `left` stable à ±2 px pendant l'ouverture (E2E) ; Sheet ≤ 260 ms ; 0 animation infinie hors `.live-dot` et spinners (`getAnimations()` en E2E) |
| **P0** | Pas de flash | C3 (cascade seulement en navigation client) | ≈ 1 h | Accueil : l'opacité du 1er widget ne repasse jamais sous 1 après le premier affichage |
| **P1** | Continuité | C2 (`next/form` sur les 6 filtres), I4 + I5 (`useSlideIndicator`), F1 + F2 (jetons uniques), F3 | 1 j | Changement de filtre sans rechargement (marqueur `window` conservé), défilement gardé, trait d'onglet immobile au montage |
| **P1** | Le direct se voit | I6 (`useHighlightChanges` sur Commandes / suivi, départs, Missions PMR, Groupes, nouveaux messages du Journal des autres), I3 (`highlight` sur StatCard), F7 | 1 j | Un changement par SSE surligne la seule ligne concernée pendant 1,2 s ; rien au premier rendu ni sur sa propre action ; maintenu en mouvement réduit sans transition |
| **P2** | Retours sur place | I7 (Copier → Copié), F10 (garder l'ancien tableau pendant le chargement) | ½ j | Plus aucun toast de succès à la copie ; ALEA copiable bloc par bloc sans empilement |
| **P2** | Continuité spatiale | I8 (ligne active + Flip du TrainChip, desktop), Journal → plein écran en Flip | 1 j | ≤ 240 ms ; désactivé en mouvement réduit et sous 768 px |
| **P3** | Polissage | F5, F6 (garder ou retirer Flip selon P2), F8, F9, F11, densité compacte × 0,8 | ½ j | Bundle GSAP inchangé ou réduit ; captures 1440 et 390 |

Ordre conseillé : P0 dans le même commit que l'ajout d'un E2E « motion » (`e2e/motion.spec.ts` : stabilité du
dialogue, absence de boucle, absence de flash, durée du Sheet), puis P1 module par module.

### Références d'esprit (adaptées à un outil dense)

- **Linear** : changements d'état instantanés, mouvement réservé aux transitions de contexte (panneaux, palette) en
  moins de 200 ms ; les listes ne « dansent » pas.
- **Raycast** : palette qui apparaît sans déplacement (fondu et scale de 0,98), sortie plus rapide que l'entrée.
- **Rauno Freiberg / devouringdetails** : retour sur place (icône qui se transforme) plutôt que notification
  détachée ; mouvement interruptible ; aucune animation sur une action répétée cent fois par jour.
- **gsap.com** : sur la vitrine, le mouvement *est* le produit (défilement, SplitText). Pour CSM, on en retient la
  rigueur des courbes et `matchMedia`, **pas** ScrollTrigger ni SplitText : aucune animation au défilement dans l'app
  (règle de DESIGN-DIRECTION confirmée), SplitText éventuellement sur l'écran de connexion seulement.
