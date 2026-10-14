# Refonte de l'interface CSM — audit et plan (14 oct. 2026)

> Statut : **proposition à valider**. Aucun fichier de l'application n'a été modifié.
> Ébauche visuelle (HTML autonome, thèmes Jour / Nuit, desktop + mobile) : `scratchpad/refonte/ebauche.html`
> (hors dépôt). Captures de référence : `scratchpad/refonte/C01…C09-*.png` (hors dépôt, données de test).

## 0. Méthode et limites

- Lecture : `CLAUDE.md`, `web/CLAUDE.md`, `docs/DESIGN-DIRECTION.md`, `docs/design/AUDIT-INTERFACE.md` (9 oct.),
  `web/src/navigation.ts`, le shell (`components/shell/*`), les composants (`components/ui/*`), les 52 pages de
  `app/(app)`, et un relevé par recherche de tous les contrôles natifs.
- **Skill « ui-ux-pro-max »** : consultée (dépôt GitHub `nextlevelbuilder/ui-ux-pro-max-skill`, fichiers `SKILL.md`,
  `references/quick-reference.md`, `references/pro-rules.md` récupérés). Son moteur de recherche (script Python + base
  CSV) n'a **pas** pu être lancé : l'archive du dépôt est refusée par le proxy (403). J'ai donc appliqué sa **grille de
  règles par priorité** (10 catégories, 119 règles) comme liste de contrôle, sans les recommandations générées par la base.
- **Captures** : la connexion à l'instance locale avec le compte de test disponible a échoué (mot de passe différent
  sur la base locale) et la création d'un compte local a été refusée par les garde-fous. Les captures citées sont donc
  celles prises **aujourd'hui et le 11 oct. sur l'instance locale** par les sessions précédentes (copiées dans
  `scratchpad/refonte/` sous un nom explicite). Les points marqués *(à vérifier)* n'ont pas pu être revus à l'écran.

| Capture | Contenu |
|---|---|
| C01-topbar-admin-1440 | Barre du haut sur une page Admin, 1440 px |
| C02-topbar-admin-1024 | Même barre, 1024 px |
| C03-admin-onglets-plus-1280 | Menu « Plus » des onglets Admin, 1280 px |
| C04-menu-profil-admin | Menu du profil (section Administration) |
| C05-bon-bus-1440 / C06-bon-bus-390 | Bon de commande bus (pleine page) |
| C07-ressources-trains-1440 | Ressources › Trains (avant le menu « Plus », 14 oct. matin) |
| C08-pmr-360 / C09-pmr-1440-11oct | Missions PMR (11 oct., avant l'évolution « poste d'exploitation ») |

## 1. Constat

### Ce qui marche (à garder)

Jetons sémantiques stricts et testés (contraste, écart de teinte), thèmes de référence Jour / Nuit / Contraste élevé,
`Field` qui relie libellé + aide + erreur, `Segmented` et `ToggleChip` (déjà des contrôles personnalisés accessibles),
filtrage automatique, compteurs dans la barre latérale, panneau ancré, ⌘K granulaire, mouvement réduit respecté,
aucun débordement horizontal relevé sur les captures.

### Problèmes classés par gravité

| # | Gravité | Constat | Écran / preuve |
|---|---|---|---|
| 1 | **Élevée** | **L'Administration est presque introuvable.** Absente de la barre latérale ; 7 liens dans le menu du profil (en bas d'un long menu) ; dans la barre du haut, les onglets passent dans « Plus » dès que la place manque : **un seul onglet visible à 1024 px**, aucun à 1280 px quand la puce des districts est longue. Sur une page Admin, **aucune entrée n'est active** dans la barre latérale (le module Admin n'y figure pas). | C01, C02, C03, C04 ; `sidebar.tsx`, `navigation.ts` (« l'administration est dans le menu utilisateur ») |
| 2 | **Élevée** | **Dates et heures natives au format du navigateur, pas de l'application** : `10/14/2026` et `02:50 PM` dans un outil français (Chromium en anglais). Un poste Windows / Chrome en anglais affiche le format américain et l'heure sur 12 h : risque d'erreur sur une heure de bus ou un jour de circulation. 36 champs date / heure / mois natifs dans 15 fichiers. | C05, C06 ; `bus-form.tsx` (1 date + 5 heures), `taxi-form.tsx`, `log-composer.tsx` (4 + 4) |
| 3 | **Élevée** | **Listes longues sans recherche** dans des `<select>` natifs : société (bons bus et taxi), chauffeur, ligne (86 lignes dans Ressources › Trains / Lignes). Au clavier il faut connaître la première lettre ; sur mobile la roue du système défile sans filtre. | `bus-form.tsx:643`, `taxi-form.tsx:471`, `referentiels/trains`, `referentiels/lignes` |
| 4 | Moyenne | **Le district se choisit de 4 façons différentes** : `<select>` (10 écrans), puce « Tous les districts », puce « districts du jour » de la barre du haut, cases dans le profil. Alors que le métier combine librement DSO / DSE / DCE (rôles v2), les filtres n'en acceptent qu'un. | C09 (puce + liste côte à côte), `filter-bar.tsx`, `order-list.tsx`, `equipe`, `journee`, `statistiques`… |
| 5 | Moyenne | **Libellés tronqués** dans les contrôles : `DSO · Sud-Oues…` (liste native trop étroite), `Remplaceme…` / `Modif. planifi…` (Segmented en 390 px). La skill : « envelopper avant de tronquer ». | C09, C06 |
| 6 | Moyenne | **Mobile, bon bus** : barre d'actions collante à deux boutons pleine largeur (« Terminer » + « Annuler la commande » en rouge, empilés) + barre d'onglets = ~190 px fixes sur 844 ; l'action destructive est collée à l'action primaire. | C06 ; `ActionBar` |
| 7 | Moyenne | **Barre du bas mobile à 6 entrées** (5 modules + Plus) : la skill et Material plafonnent à 5 ; libellés abrégés (« Opér. », « Données »). | C08 ; `mobile-tabbar.tsx` |
| 8 | Moyenne | **Barre du haut surchargée** en desktop : module + onglets + districts + recherche + Nouveau + présence + cloche + profil (8 groupes). Les onglets, la navigation la plus utile, sont les premiers sacrifiés. | C01, C03 |
| 9 | Moyenne | **Quatre comboboxes écrites à la main** (gare des bons, trains en direct, mentions du Journal, éditeur de ligne), chacune avec sa logique clavier ; **5 `datalist`** restantes (catégories de contacts, zones, groupes, catégories de documents et de procédures, gares de « Ma journée ») alors que l'utilisateur a jugé la `datalist` inutilisable le 11 oct. | `station-input.tsx`, `live-board.tsx`, `log-composer.tsx`, `line-editor.tsx` ; `contact-board.tsx`, `document-board.tsx`, `procedure-board.tsx`, `operations/journee` |
| 10 | Faible | **Cases à cocher natives** à deux endroits (filtre de statut PMR, procédures) à côté de la `Checkbox` Radix ailleurs : rendu et taille de cible différents. | `pmr/filter-bar.tsx:179`, `procedure-board.tsx:420` |
| 11 | Faible | **Barre latérale sous-utilisée** : 6 entrées puis ~450 px vides au-dessus de l'état des flux (place disponible pour l'Administration). | C05, C07 |
| 12 | Faible *(à vérifier)* | Le menu « Plus » des onglets apparaît **translucide** (texte de la page lisible derrière). Probablement capturé pendant le fondu d'ouverture ; à confirmer. | C03 |
| 13 | Faible | Plage de dates = deux champs natifs « Du / Au » sans raccourci commun (les puces Aujourd'hui / Demain / 7 jours existent à côté mais pas dans le même contrôle). | C09, `filter-bar.tsx` |

## 2. Principes retenus

Tirés de la grille de la skill (priorités 1 → 9) et de la direction validée le 11 oct. :

1. **Accessibilité d'abord** (P1) : contraste ≥ 4,5:1, focus visible, ordre de tabulation = ordre visuel, aucune
   information par la couleur seule, motif ARIA APG pour chaque contrôle personnalisé (listbox, combobox, grid).
2. **Cibles** (P2) : 44 px au tactile (déjà garanti par `--control-h` en `pointer: coarse`), 24 px minimum à la souris
   (WCAG 2.2 « target size »), 8 px entre cibles.
3. **Contrôle système quand il est meilleur** (règle `system-controls`) : la skill recommande les contrôles natifs sauf
   besoin réel. Ici le besoin est réel pour : le **format des dates** (#2), la **recherche dans les listes** (#3), la
   **multi-sélection** (#4). Pour une liste courte sans recherche **sur mobile**, la feuille du système reste la plus
   rapide au pouce : le `Select` personnalisé s'ouvre en **feuille du bas** en mobile (même composant, pas la roue native).
4. **Navigation** (P9) : hiérarchie claire primaire / secondaire, ≤ 5 entrées en bas, emplacement constant, entrée
   active toujours signalée, actions destructives séparées.
5. **Formulaires** (P8) : libellé visible, erreur sous le champ reliée par `aria-describedby`, validation à la sortie
   du champ, aide persistante, champs ≥ 16 px en mobile.
6. **Une seule source par motif** : un composant par besoin (sélection simple, recherche, multi, date, heure), utilisé
   partout ; aucune liste déroulante écrite à la main dans un écran.
7. **Rien ne casse sans JavaScript côté filtres** : les filtres sont des formulaires GET (`next/form`) soumis par
   `FormAutoSubmit` sur l'événement `change` ; chaque contrôle personnalisé **porte un champ caché nommé et émet un
   vrai `change`** (voir §3.6).

## 3. Proposition détaillée

### 3.1 Navigation : Administration dans la barre latérale

**Pour qui** : admin et sysop (`isAdmin`, inchangé). Les modérateurs ne voient pas la section (rôles v2 : pas
d'administration) — voir question Q2.

**Desktop ≥ 1280 px (barre de 232 px)** : sous les 6 modules, un séparateur et un **groupe titré « Administration »**
(titre discret `text-small fg-subtle`), puis les pages **en accès direct**, regroupées en 3 :

| Groupe | Pages |
|---|---|
| Comptes | Utilisateurs · Appareils connectés |
| Supervision | Santé (pastille `danger` si une sauvegarde / tâche planifiée est en échec) · Journal d'audit |
| Réglages | Tri du Journal · Quinyx · Campagnes |

Lignes de 36 px (32 px en compact), icône 16 px + libellé, même trait actif que les modules. Le groupe est
**repliable** (chevron, état mémorisé par navigateur) pour qui ne l'utilise pas tous les jours.

**Rail 768–1279 px (96 px)** : une entrée unique « Admin » (icône bouclier) qui ouvre un **menu latéral** (Radix
DropdownMenu, `side="right"`) avec les 7 pages groupées ; active quand on est sur `/admin/*`.

**Mobile** : la feuille « Plus » affiche une **section titrée « Administration »** avec les 7 pages (aujourd'hui une
seule entrée qui mène à `/admin`).

**Barre du haut sur une page Admin** : les onglets Admin disparaissent (la barre latérale les porte) ; on affiche
« Administration › <page> ». Ça libère la place qui faisait tout basculer dans « Plus ».

**Menu du profil** : la section Administration (7 liens) est retirée ; un seul lien « Administration » reste pour
l'habitude (Q3).

**Code** : `navigation.ts` garde la source unique — `ADMIN.tabs` reçoit `group` et `icon` ; `Sidebar` reçoit `admin`
de `useShell()` ; `activeModule` est déjà prêt. Le commentaire « l'administration est dans le menu utilisateur » et
`docs/CSM-V2.md` §2 sont mis à jour.

### 3.2 Barre du haut

- Ordre fixe : *module › onglets* | *districts du jour* | *recherche* | *cloche* | *profil*. Le bouton « + Nouveau »
  devient une entrée de ⌘K et du menu « Créer » de la page ; il reste dans la barre seulement à partir de 1536 px (Q4).
- La présence « en ligne » passe dans le menu du profil ou dans la cloche (Q4) : un groupe de moins.
- Onglets : le menu « Plus » reste, mais avec la place gagnée il ne sert qu'en dessous de 1280 px.

### 3.3 Mobile

- **Barre du bas à 5 entrées** : Accueil, Bons, PMR, Opérations, Plus. « Ressources » passe dans « Plus » avec Équipe et
  Administration (Q5 : alternative = garder Ressources et mettre Accueil dans le logo).
- **Barre d'actions des formulaires** : une seule action primaire pleine largeur + un bouton « ⋯ » qui ouvre une
  feuille avec les actions secondaires et **l'action destructive séparée** (en rouge, en bas, avec confirmation). Hauteur
  fixe ramenée de ~190 à ~120 px.
- **Segmented** : passe à la ligne (grille 2 colonnes) au lieu de tronquer quand une option ne tient pas.

### 3.4 En-têtes, listes, panneaux, états

- **En-tête de liste** : `ListToolbar` commun — recherche (live) + filtres principaux en contrôles personnalisés + bouton
  « Filtres (n) » en mobile + compteur de résultats + action de la page à droite. Le motif existe (`CollapsibleFilters`,
  `FilterChip`) mais chaque écran l'assemble encore à la main.
- **Plage de dates** : un seul contrôle `DateRangePicker` qui contient les raccourcis (Aujourd'hui, Demain, 7 jours,
  Semaine) — les puces séparées disparaissent.
- **Districts** : un seul `DistrictPicker` (multi, 3 puces bascule + « Tous ») partout où l'on filtre par district.
- **Tables** : en-tête collant, tri accessible (`aria-sort`) là où il y a un tri, chiffres tabulaires (déjà en place).
- **Panneaux** : inchangés (ancré ≥ 1280 px, feuille modale en dessous).
- **États** : chaque liste a ses 3 états (chargement = squelette réservant la place ; vide = phrase + action ; erreur =
  message + « Réessayer »). Aujourd'hui seuls `(app)/error.tsx` et `not-found.tsx` existent : ajouter un `loading.tsx`
  par module (squelette de la liste) pour la navigation entre onglets.

### 3.5 Bibliothèque de composants personnalisés

Dépendances : **Radix est déjà là** (dialog, dropdown-menu, checkbox, switch, tabs, tooltip, label, slot) + `cmdk`
+ `vaul`. Proposition : **ajouter `@radix-ui/react-popover`** (≈ 6 Ko gzip, même famille, partage `react-dismissable-layer`,
`react-focus-scope`, `react-popper` déjà installés par le DropdownMenu ; gère positionnement, collision, Échap, clic
dehors, portail). **Pas** de `@radix-ui/react-select` (il ne gère ni la recherche ni le multi : on aurait deux familles
de listes), **pas** de bibliothèque de calendrier (grille de dates écrite avec `Intl.DateTimeFormat('fr-BE')`, ≈ 150
lignes). Liste d'options commune `Listbox` écrite sur le motif APG (pas de `cmdk` dedans : cmdk trie lui-même et ne
gère pas la sélection multiple ; il reste pour ⌘K).

Socle commun à tous :

- `Field` inchangé : il fournit `id`, `aria-describedby`, `aria-invalid`, `aria-required` → chaque contrôle les pose
  sur son déclencheur.
- Props communes : `name` (champ caché pour les formulaires GET et les Server Actions), `value` / `defaultValue` /
  `onValueChange` (contrôlé ou non), `disabled`, `placeholder`, `className`.
- **Pont formulaire** : un `<input type="hidden" name>` (ou plusieurs pour le multi) dont la valeur est mise à jour puis
  `dispatchEvent(new Event("change", { bubbles: true }))` → `FormAutoSubmit` continue de marcher sans changement.
- Desktop : `Popover` ancré, largeur = déclencheur (min 12 rem), hauteur max 18 rem avec défilement.
  **Mobile (< 768 px ou `pointer: coarse`)** : la même liste dans une **feuille du bas Vaul** (titre = libellé du champ,
  options de 48 px, recherche en haut avec police 16 px).
- Jetons uniquement : `surface`, `border-strong`, `accent` (option active / cochée), `surface-2` (option survolée),
  `fg-subtle` (placeholder), `danger` (erreur). Rayon `rounded-control` / `rounded-box` : suit la forme du thème.
- Mouvement : ouverture `pop-in` existante (transform + opacité, 120 ms), rien en mouvement réduit.

#### Select (sélection simple, ≤ ~15 options)

```ts
type Option<T extends string> = { value: T; label: string; hint?: string; icon?: LucideIcon; disabled?: boolean };
<Select name="statut" options={STATUTS} value={v} onValueChange={setV} placeholder="Tous" clearable />
```

Clavier (APG « Select-only combobox ») : Entrée / Espace / ↓ ouvre ; ↑ ↓ déplacent ; Début / Fin ; frappe d'une lettre
= saut à l'option (comme le natif) ; Entrée choisit ; Échap ferme sans changer ; Tab choisit et sort. Rôles :
déclencheur `button` `role="combobox"` `aria-haspopup="listbox"` `aria-expanded`, liste `role="listbox"`, options
`role="option"` `aria-selected`, `aria-activedescendant`. Le libellé choisi **passe à la ligne** dans le déclencheur
plutôt que d'être coupé.

Remplace : Statut (bons, PMR), Type (archives, clients, nouveautés, trains, gares), Rôle (admin, création), Action
(audit), Facturation / Type / Cause PMR (taxi), État / Assistance / Zone (matériel), Zone (PN), Catégorie
(documents, annuaire), Jours (trains), Pays / Proposition (gares), Source / Catégorie (Tri du Journal), Quinyx.

#### Combobox (recherche dans une liste, saisie libre facultative)

```ts
<Combobox name="societe" options={companies} value={id} onValueChange={setId}
  filter={(o, q) => matchFold(o.label, q)}   // accents / casse ignorés (lib/stations/search)
  allowFree={false} emptyText="Aucune société" createLabel={(q) => `Ajouter « ${q} »`} />
```

Clavier (APG « Combobox with listbox popup, autocomplete list ») : la frappe filtre ; ↓ ouvre / descend ; Entrée
choisit l'option active ; Échap ferme puis vide ; Alt+↓ ouvre sans filtrer. Option `async` (Server Action) avec
indicateur et `aria-busy`. `aria-live="polite"` annonce « 8 résultats ».

Remplace : Société (bus, taxi), Chauffeur, Ligne (Trains, Lignes, 86 entrées), **gare** (`StationInput` réécrit sur ce
socle, mêmes règles de correspondance), « Dessert la gare » (Trains), gares de « Ma journée » (`datalist`), catégories /
zones / groupes (annuaire, documents, procédures : `datalist` → `allowFree`), éditeur de ligne. Les mentions du Journal
(`@`) et la recherche des trains en direct gardent leur logique propre mais réutilisent `Listbox`.

#### MultiSelect et DistrictPicker

```ts
<MultiSelect name="statut" options={STATUTS} values={vals} onValuesChange={setVals} summary="2 statuts" searchable />
<DistrictPicker name="district" values={["DSO","DSE"]} onValuesChange={…} allLabel="Tous" />
```

MultiSelect : liste avec cases (`aria-multiselectable="true"`), Espace coche, Entrée ferme ; le déclencheur résume
(« DSO, DSE » ou « 3 statuts ») ; « Tout / Aucun » en tête ; valeurs envoyées en paramètres répétés (`?district=DSO&district=DSE`).
DistrictPicker : variante « puces » toujours visibles (3 districts, pas de menu) : `role="group"`, chaque puce est un
`button aria-pressed`. Remplace : les 10 listes « district », le filtre de statut PMR (cases natives), la puce « Tous les
districts », les districts du jour (profil et barre du haut). **Impact serveur** : les pages qui lisent `?district=`
doivent accepter plusieurs valeurs (filtre PocketBase `(district = "DSO" || district = "DSE")`).

#### DateField, TimeField, DateRangePicker

```ts
<DateField name="jour" value="2026-10-14" onValueChange={…} min max />        // saisie jj/mm/aaaa + calendrier
<TimeField name="heure" value="14:50" onValueChange={…} step={5} pending />  // HH:MM 24 h, « maintenant »
<DateRangePicker nameFrom="du" nameTo="au" presets={["today","tomorrow","7d","week"]} />
```

- Valeur toujours ISO (`AAAA-MM-JJ`, `HH:MM`) : rien ne change côté serveur.
- **DateField** : champ texte masqué `jj/mm/aaaa` (segments jour / mois / année, ↑ ↓ incrémentent le segment, la
  saisie « 14102026 » ou « 14/10 » complète), bouton calendrier → Popover avec grille APG « Date picker dialog »
  (`role="grid"`, flèches = jour, PgUp/PgDn = mois, Début/Fin = semaine, Entrée choisit), semaine du lundi, jours fériés
  belges marqués, libellés `Intl` `fr-BE`. Mobile : **le calendrier s'ouvre en feuille** (pas le sélecteur natif, pour
  garder le format).
- **TimeField** : `HH:MM` 24 h, saisie « 1450 » → 14:50, ↑ ↓ ± `step` minutes, bouton « Maintenant » ; propriété
  `pending` qui affiche « heure à confirmer » (remplace les drapeaux `time_pending` gérés à la main dans les bons).
  `inputMode="numeric"` en mobile.
- **DateRangePicker** : deux DateField + raccourcis dans le même Popover ; « Au » ne peut précéder « Du ».

Remplace : 20 champs date (bons, B201, journal, audit, statistiques, planning, journée, PMR, matériel), 15 champs heure
(bus 5, taxi 3, journal 4, B201, transitions, trains en direct), 1 mois (archives → `MonthField`, même socle).

#### Switch, CheckboxGroup, RadioGroup, Segmented

- `Switch` : déjà Radix ; ajouter la forme du thème (`rounded-control`) et la cible 44 px en tactile (zone cliquable
  sur tout le libellé, `<label>` englobant).
- `CheckboxGroup` (`fieldset` + `legend`, options en colonne ou en ligne, « Tout cocher ») : remplace les cases natives
  de `pmr/filter-bar.tsx` et `procedure-board.tsx`, et les groupes de `Checkbox` du bon bus (« Trajet spécifique »,
  « Bus annulé »).
- `RadioGroup` : non présent aujourd'hui ; utile pour les choix exclusifs de plus de 3 options avec description
  (rôle dans la fiche d'un compte). Écrit sur le même motif que `Segmented` (`role="radiogroup"`, flèches).
- `Segmented` : garder ; ajouter le retour à la ligne (#5) et `name` + champ caché pour les formulaires GET.

#### Page `/design`

Chaque composant y figure avec ses états (fermé, ouvert, focus, survol, erreur, désactivé, lecture seule, vide), dans
les 3 thèmes de référence, plus un test Vitest + Testing Library (clavier) et un E2E 1440 + 390.

## 4. Plan en lots

Chaque lot est livrable seul en préversion (`csm-preview`), avec captures avant / après (1440 + 390), E2E, revue.

| Lot | Contenu | Effort relatif | Risques |
|---|---|---|---|
| **R0** | Administration dans la barre latérale (groupe titré ≥ 1280, menu sur le rail, section dans « Plus » mobile), entrée active, onglets Admin retirés de la barre du haut, menu du profil allégé | S (½ j) | Faible. Tests `module-tabs.test.ts` et E2E shell / admin à adapter |
| **R1** | Socle : `@radix-ui/react-popover`, `Listbox`, pont formulaire (champ caché + `change`), `Select` desktop + feuille mobile, page `/design`, tests clavier | M (1,5 j) | Nouvelle dépendance (justifiée §3.5). `FormAutoSubmit` à vérifier avec le champ caché |
| **R2** | `Combobox` (société, chauffeur, ligne, gares, `datalist` ×5) ; `StationInput` réécrit sur le socle | M (1,5 j) | Régression sur la correspondance des gares (garder `stationCandidates` et ses tests) |
| **R3** | `DateField`, `TimeField`, `DateRangePicker`, `MonthField` ; migration des 36 champs | L (2 j) | Saisie rapide au clavier des opérateurs (à tester avec eux) ; 3 E2E qui font `fill("2026-…")` |
| **R4** | `MultiSelect` + `DistrictPicker` + `CheckboxGroup` ; filtres multi-districts côté serveur | M (1,5 j) | Modifie la lecture de `?district=` dans ~10 pages et les préférences mémorisées |
| **R5** | Migration des `Select` restants (≈ 55 emplacements, 31 fichiers), `ListToolbar` commun, `loading.tsx` par module | M (1,5 j) | Volume ; 4 `selectOption` dans les E2E |
| **R6** | Mobile : barre du bas à 5, barre d'actions à une primaire + « ⋯ », Segmented qui passe à la ligne ; barre du haut allégée | S (1 j) | Habitudes (Ressources déplacé) |
| **R7** | Passe accessibilité (clavier complet, lecteur d'écran NVDA / VoiceOver sur les nouveaux contrôles), mise à jour de `DESIGN-DIRECTION.md`, `web/CLAUDE.md`, CHANGELOG | S (½ j) | — |

Ordre conseillé : R0 (demande explicite, rapide) → R1 → R3 (risque métier le plus fort : format des heures) → R2 →
R4 → R5 → R6 → R7. Total ≈ 10 j.

## 5. Questions à valider

1. **Contrôles personnalisés aussi en mobile ?** Proposition : oui, en feuille du bas (même apparence, recherche, format
   français). Alternative : garder la roue native du téléphone pour les `Select` courts.
2. **Administration pour les modérateurs** : faut-il leur ouvrir certaines pages (Tri du Journal, Santé en lecture) ?
   Aujourd'hui : admin et sysop seulement.
3. **Menu du profil** : retirer complètement les liens Admin, ou garder un lien unique « Administration » ?
4. **Barre du haut** : « + Nouveau » et « En ligne maintenant » peuvent-ils sortir de la barre (⌘K / menu du profil)
   en dessous de 1536 px ?
5. **Barre du bas mobile à 5** : Ressources va dans « Plus » (proposé) ou Accueil est retiré (logo = accueil) ?
6. **Filtres multi-districts** (DSO + DSE en même temps) : souhaité partout, ou seulement dans PMR / Bons ?
7. **Dates** : les postes de l'équipe ont-ils un navigateur en anglais (ce qui confirmerait le risque du format
   américain) ? Jours fériés belges à marquer dans le calendrier ?
8. **Heures** : pas de 5 minutes pour les flèches ↑ ↓ (proposé) ou 1 minute ?
9. Ordre des lots : d'accord pour R0 → R1 → R3 en premier ?
