# Refonte de l'annuaire (Ressources › Annuaire) — 14 oct. 2026

Demande de l'utilisateur : « refonte (UI/UX design) de l'annuaire, afin que ce soit plus agréable à utiliser /
rechercher ». Principe de refonte validé d'avance ; ce document résume l'audit, les principes et la maquette, puis ce qui
a été livré. Périmètre : `/referentiels` (collection `directory_contacts`, ≈ 385 fiches : services, gares, sociétés,
personnes). L'annuaire de l'équipe (`/equipe`) n'est pas touché.

Parcours de référence : **un agent au téléphone doit trouver un numéro en 3 secondes**, souvent en tapant de mémoire
(« liege », « FMS », un bout du numéro entendu, « securail »).

## 1. Audit de l'écran précédent (1440 et 390, données fictives)

Captures hors dépôt (`scratchpad/annuaire/avant-*.png`).

| # | Constat | Gravité |
|---|---|---|
| A1 | Recherche par PocketBase `~` (LIKE) : **sensible aux accents** (« liege » ne trouve pas « Liège »), à l'ordre et à la casse hors ASCII ; une phrase entière est cherchée telle quelle (« dispatching securail » → 0) | Bloquant |
| A2 | **Numéro introuvable** dès que la ponctuation diffère (« 065 58 » ne trouve pas « 065/58.12.34 », « +32 » ≠ « 0 ») | Bloquant |
| A3 | Abréviation de gare (« FMS ») et nom néerlandais (« Bergen ») ignorés, alors que le reste de CSM les accepte (recherche de gare tolérante du 11 oct.) | Coûteux |
| A4 | Recherche **à l'Entrée seulement** (aller-retour serveur à chaque essai) ; aucun classement, aucun surlignage | Coûteux |
| A5 | Mobile : premier contact à mi-écran (4 champs de filtre + bouton), **numéro non appelable depuis la liste** (seulement dans la fiche), aucune copie | Coûteux |
| A6 | Aucun favori ni récent : le même numéro de dispatching est recherché vingt fois par jour | Coûteux |
| A7 | Bouton primaire « Nouveau contact » au-dessus de la liste pour tous les coordinateurs (une primaire par écran) ; badges de catégorie colorés `info` qui concurrencent les statuts | Gênant |
| A8 | État vide « Aucun contact pour ces filtres » sans piste ; « Remarque » jamais cherchée | Gênant |
| A9 | Fiche : numéro en lien souligné de taille normale, pas de « Copier », pas d'auteur ni de date | Gênant |

## 2. Principes

1. **La recherche est l'écran** : un grand champ en tête, instantané (filtrage dans le navigateur, ≈ 400 fiches), focalisé
   par « / », Entrée ouvre le premier résultat, ↓ parcourt les résultats, Échap efface.
2. **Tolérance** : accents, casse, ponctuation et ligatures ignorés ; mots dans n'importe quel ordre (tous requis) ; faute
   de frappe tolérée **seulement si rien ne correspond exactement** (« mons » ne ramène pas « Mosans ») ; numéro avec ou
   sans espaces, `/`, `.`, `+32` ou `0032` ; abréviation PtCar et nom NL des gares citées ; remarque et e-mail cherchés.
3. **Pertinence visible** : classement (nom exact > début > début de mot > abréviation > contenu > catégorie / groupe >
   e-mail > remarque > faute de frappe), favoris et récents légèrement devant à pertinence égale, **surlignage** de ce qui
   a été trouvé (nom, groupe, numéro, et la remarque ou l'e-mail quand c'est eux qui ont trouvé la fiche).
4. **Le numéro d'abord** : chaque ligne montre le numéro en chiffres tabulaires ; une action = un clic (appeler, copier,
   écrire) ; au téléphone, bouton d'appel de 44 px au pouce.
5. **Mémoire de l'agent** : favoris (étoile) et « Consultés récemment » dans les préférences du compte
   (`users.preferences.directory`), pas de nouvelle collection ; suivent l'agent sur tous les postes.
6. **Dans le système** : jetons, `rounded-box` / `rounded-control`, `FilterChip` / `ChipRow`, `Select`, `Sheet` ancré dès
   1280 px, `useCopy` / `CopyIcon`, `LiveHighlight`, `EmptyState`, `Kbd`. Aucune dépendance ajoutée.

## 3. Maquette (décrite)

**Desktop 1440**

```
[ 🔍  Nom, gare, numéro, fonction…                         / ]  [ + Nouveau contact ]
Accents et fautes tolérés · abréviation (FMS) · numéro avec ou sans espaces · ↓ parcourir, Entrée ouvrir
[Toutes] [GARE 28] [MIA 8] [SERVICE 9] …                         (puces de catégorie, compteur)
[Toutes les zones ▾] [Tous les groupes ▾]                     66 contacts · Tout effacer

★ Favoris                               ◷ Consultés récemment          (sans saisie ni filtre)
┌───────────────────────────────┐       ┌───────────────────────────────┐
│ ★ Traffic Control   📞 +32 2 … ⧉ ✉ │  │ ☆ Chef de gare Ath   📞 071 … ⧉ │
└───────────────────────────────┘       └───────────────────────────────┘
[Administration 1] [Bornes PMR 4] [Chefs de gare 10] …   (index des groupes, une ligne qui défile)
Bornes PMR 4
┌──────────────────────────────────────────────────────────────────────────┐
│ ☆ Borne PMR Hainaut Est            BORNE PMR · Hainaut Est   📞 0474 92 46 44  ⧉  ✉ │
└──────────────────────────────────────────────────────────────────────────┘
```

Avec une saisie : une seule liste « par pertinence », surlignée, compteur « 5 résultats sur 66 », puce mono de
l'abréviation (`FMS`) quand c'est elle qui a trouvé la fiche. Clic sur une ligne → panneau ancré à droite (la liste reste
utilisable pour enchaîner).

**Mobile 390** : champ de 48 px + bouton « + » carré ; puces de catégorie qui défilent ; zone et groupe côte à côte ;
lignes de 56 px au moins : étoile (44 px) · nom / catégorie / **numéro** · bouton **Appeler** carré de 44 px (`tel:`).
Toucher le nom ouvre la fiche en feuille du bas.

**Fiche (panneau)** : bloc « Téléphone » (numéro en `text-h3` mono sélectionnable, **Appeler** primaire, **Copier le
numéro**), bloc « E-mail » (Écrire, Copier l'adresse), « Ajouter aux favoris », détails (catégorie, groupe, zone, gare
`FMS`, remarque, « Modifié le … par … »), puis Modifier / Supprimer selon les droits (inchangés : `repertoire:update` /
`repertoire:delete`).

**État vide** : « Aucun résultat pour « … » », pistes (partie du nom, abréviation, chiffres, fonction), bouton
« Chercher « mons » » (correction proposée) et « Chercher dans tout l'annuaire » si un filtre est actif.

## 4. Livré

- Logique pure `web/src/lib/referentiels/directory.ts` (testée, `directory.test.ts`) : `foldWithMap` / `foldText`,
  `phoneDigits(WithMap)` (forme nationale), `isPhoneQuery`, `editDistance` (Damerau restreinte), `parseQuery`,
  `buildIndex` + `searchDirectory` (deux passages : exact puis fautes ; `keep` = filtres de la page avant le second
  passage), `suggestQuery`, `highlightText` / `highlightPhone`, `stationAliasIndex` / `stationAliasesFor` (alias de gare
  par mots entiers), `readDirectoryPrefs` / `toggleFavorite` (60 au plus) / `pushRecent` (8).
- Serveur : `listDirectory()` (`server/data/referentiels.ts`) lit toutes les fiches + les gares (`stations`, hors PANG)
  et joint les alias ; remplace `listContacts` / `contactFacets` (un seul aller-retour).
- Actions : `toggleContactFavorite` (retire au passage les favoris de fiches supprimées), `noteContactViewed` (jamais en
  « Voir en tant que ») ; écritures des préférences **en file** côté client (étoile puis ouverture lancées ensemble : la
  seconde écrasait la première).
- Écran : `components/referentiels/directory-board.tsx` (nouveau) ; formulaires et actions de fiche gardés dans
  `contact-board.tsx`. État dans l'URL (`q`, `category`, `zone`, `group`, `id`) par `history.replaceState`, rejoué au rendu
  serveur ; ⌘K ouvre la fiche directement (`?id=`).
- E2E `web/e2e/annuaire.spec.ts` (1440 + 390, fiches fictives) : sans accent / désordre / faute / numéro / état vide / URL,
  appel `etrali:` / `tel:` (44 px), copie, panneau, favori qui persiste et récents.

## 5. Écarts et limites

- **Écart au parcours cible de l'audit Référentiels §3.1** : recherche dans le navigateur au lieu d'une recherche serveur à
  250 ms (l'annuaire est borné : ≈ 400 fiches, ≈ 80 Ko) ; puces de catégorie **et** listes Zone / Groupe (et non zone *ou*
  groupe selon la catégorie) ; pas d'export ni de raccourcis J / K (↓ / ↑ depuis la recherche à la place).
- Sans JavaScript, la recherche part en GET (`?q=`) et le serveur rend la liste filtrée ; les puces et listes demandent JS.
- Les favoris et récents d'un même compte ouvert sur deux postes au même instant peuvent se croiser (dernière écriture
  gagnante) : sans gravité.
- La palette ⌘K garde sa recherche serveur (`~`) pour les contacts ; « Voir tout » mène à l'annuaire, qui tolère accents et
  fautes. À aligner si besoin.
