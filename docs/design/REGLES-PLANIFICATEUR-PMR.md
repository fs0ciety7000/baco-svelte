# Règles du planificateur PMR — extraites des classeurs Excel (DSO / DSE, octobre 2026)

> Version **sans donnée personnelle** (aucun nom d'agent ni de voyageur, aucun téléphone, numéros de dossier DICOS
> remplacés par `AAAA-MM-JJ-NNNN`). Sources : `10. OCTOBRE 2026 DSO planificateur tâches.xlsm` (« DSO ») et
> `10. OCTOBRE 2026 DSE planificateur tâches 2.0.xlsm` (« DSE »). Les références `feuille!cellule` renvoient à la
> feuille `01` sauf mention contraire (les feuilles `01`…`31` ont toutes la même structure). Les règles marquées
> **(déduite)** ne sont écrites nulle part : elles sont observées dans les données (comptages en §11).

---

## 0. Structure des classeurs

| Feuille | DSO | DSE | Rôle |
|---|---|---|---|
| `01` … `31` | 31 feuilles, A1:V219 | 31 feuilles, A1:V324 | **Une feuille par jour** : en-tête (lignes 1-11) puis un bloc de 52 lignes par gare de base |
| Blocs de gare (feuille jour) | MONS (l. 12-63), BRAINE-LE-COMTE (64-115), TOURNAI (116-167), CHARLEROI (168-219) | NAMUR (12-63), OTTIGNIES (64-115), LIEGE-GUILLEMINS (116-167), VERVIERS-CENTRAL (168-219), LIBRAMONT (220-271), ARLON (272-323) | Nom en `B12`, `B64`… ; nom de l'onglet en `F12` (`=TEXTAFTER(CELL("nomfichier",A1),"]")`), date en `G12` (`=B1`) |
| Tableaux structurés | 22 par jour | 35 par jour | **Un tableau Excel par poste et par gare** : colonnes `Heure` / `Tâche` / `OK` (ex. `01!C13:E63`) |
| `FMS`, `FBC`, `FTY`, `FCR` (DSO) · `FNR`, `LT`, `FL`, `GV`, `LRB`, `LL` (DSE) | ✔ | ✔ | **Récapitulatif des « affiches » du mois** par gare, reconstruit par macro (lecture seule) |
| `Déplacement` | gabarit vide (4 titres de gare) | tournées d'affichage (Namur, Ottignies, Liège remplis) | Temps de tournée d'affichage par ligne (§3.3) |
| `B-CS` | 12 gares, 139 lignes | 18 gares, 125 lignes | Gares à guichet B-CS + prises en charge PMR confiées au guichet (§5) |
| `Liste` (masquée) | ✔ | ✔ | Listes de valeurs (gares, types PMR, B-CS…) — **plus utilisées** : aucune validation de données dans les feuilles jour |
| `TMP_PASTE` (DSO, « très masquée ») | vide | — | Vestige d'une ancienne macro de collage (aucune macro actuelle ne l'utilise) |

**Numéro de bloc → plage** (utilisé par les macros) : bloc n = lignes `12+52(n-1)` à `63+52(n-1)` ; la ligne « modèle »
de mise en forme de chaque bloc est l'avant-dernière (`62`, `114`, `166`, `218`, `270`, `322`) — VBA `ThisWorkbook.Workbook_SheetChange`.

---

## 1. Postes

### 1.1 Signification (probable)

| Code | Indice dans les classeurs | Interprétation probable | À confirmer |
|---|---|---|---|
| **PA** | Ne fait presque que des PMR **à la gare de base** (Charleroi 165 PMR / 6 déplacements, Liège 118 / 0, Namur 97 / 0, jours 1-16) | Agent d'**accueil / assistance PMR fixe** en grande gare | Libellé exact |
| **CPI** (`CPI`, `CPI 1`, `CPI 2`) | Fait les **opérations techniques** (EDF, Ao/Bo, accouplements) + des PMR à la base ; CPI 2 se déplace davantage | Agent **polyvalent** (technique + PMR) | Libellé exact ; différence CPI 1 / CPI 2 |
| **OPI** (`OPI`, `OPI 2`) | À Mons, **100 % des PMR hors base** (Ath, La Louvière-Sud, Saint-Ghislain…) et 69 déplacements | Agent **itinérant** qui couvre les gares secondaires | Libellé exact |
| **SPI** | Seul poste avec un **service de nuit partout** (22h00-06h00) ; fait immobilisations de nuit, EDF (Tournai), déplacements. Les « zones SPI » (ex-COI) sont les zones FMS, FTY, FCR, FNR, LT, FL, GV, LRB, LL | Agent d'intervention **responsable de la zone** (24 h/24) | Libellé exact |
| **EXTRA** (`EXTRA`, `EXTRA CPI`, `EXTRA PA`, `EXTRA SPI`) | Le plus souvent **« service non aligné »** (gris foncé) ; quand il est actif, renfort PMR + déplacements | **Renfort** ponctuel (poste ouvert mais pas toujours pourvu) | Qui décide d'aligner un EXTRA ? |
| **TAXI PMR** | Pas de colonne `OK` ; trois créneaux fixes 06-14 / 14-22 / 22-06 ; tâches `… TAXI IN/OUT …` | **Pas un agent** : liste des PMR acheminées en taxi (suivi / commande) | Qui commande le taxi ? |
| **PMR attribuée au CDB** (DSE, Ottignies, `01!O65:P115`) | Tableau `HEURE` / `PMR attribuée au CDB` | PMR confiée au **chef de bord** du train (pas d'agent de gare) | Critères |
| **B-CS** | Feuille `B-CS` | **Personnel de guichet** (B-CS = Customer Services ?) des gares secondaires, qui prend en charge des PMR « light » | §5 |

Libellés libres observés dans les créneaux : `CPI = OPI 2`, `PA = CPI 2`, `CPI à FNVT` (détaché à Nivelles), `CPI de LT`
(agent d'Ottignies prêté à Namur / Charleroi), `SPI Arlon reprend la zone` (Libramont), `SPI LL et LRB`, `PA (service de bus
Jurbise)`, `PA à FGH suivi de bus`, `EXTRA CPI LIGHT` → **un créneau peut être réaffecté** (autre gare, autre fonction, mission bus).

### 1.2 Horaires de service (créneaux)

Dans chaque tableau de poste, l'en-tête donne le **1er créneau** (`01!C13` = `06h00 14h00`, `01!D13` = `PA`) et les créneaux
suivants sont des **lignes ordinaires** du tableau (ex. `01!F17` = `14h00 22h00`, `01!G17` = `CPI`) remplies en bleu-gris
(thème 9). Comme le tableau est trié par heure (texte), la ligne `14h00 22h00` sépare naturellement les tâches du matin et de
l'après-midi ; le préfixe `NUIT` (tâches 00h00-05h59) trie après `22h00` (§6.1).

| Créneau | Usage |
|---|---|
| **06h00 14h00** (AM) | Tous les postes |
| **14h00 22h00** (PM) | Tous les postes |
| **22h00 06h00** (Nuit) | SPI partout sauf Arlon ; CPI à Mons, Charleroi (CPI 1), Namur, Liège (CPI 1) ; TAXI PMR |
| **05h00 13h00** / **15h00 23h00** (décalés) | OPI 2 Mons, CPI 2 Tournai, OPI 2 Namur (le plus souvent « non aligné ») |
| Ponctuels | 07h00-13h00, 09h00-17h00, 10h00-18h00, 08h15-16h15, 13h15-21h15 (EXTRA, détachements) |

### 1.3 Postes par gare de base (colonnes des feuilles jour) et effectif moyen

« Créneaux actifs » = créneaux non marqués *service non aligné* ni *malade*, moyenne par jour sur octobre.

| District | Gare de base (code) | Postes (créneaux AM / PM / Nuit) | Créneaux actifs / jour |
|---|---|---|---|
| DSO | **Mons** (FMS) | PA (2), CPI (3), OPI (2), OPI 2 (2, souvent non aligné), EXTRA (2, souvent non aligné), SPI (3), + TAXI PMR | 11,0 |
| DSO | **Braine-le-Comte** (FBC) | CPI (2), EXTRA (2, souvent non aligné), + TAXI PMR | 2,3 |
| DSO | **Tournai** (FTY) | CPI 1 (2), CPI 2 (2, 05-13 / 15-23, souvent non aligné), EXTRA (2), SPI (3), + TAXI PMR | 5,9 |
| DSO | **Charleroi** (FCR) | PA (2), CPI 1 (3), CPI 2 (2, souvent non aligné), OPI (2), EXTRA (2), SPI (3), + TAXI PMR | 10,2 |
| DSE | **Namur** (FNR) | PA (2), CPI (3), OPI (2), OPI 2 (2, décalé), EXTRA / EXTRA CPI (2), SPI (3), + TAXI PMR | 12,3 |
| DSE | **Ottignies** (LT) | CPI (2), EXTRA / EXTRA CPI (2), SPI (3), + TAXI PMR, + PMR au CDB | 5,8 |
| DSE | **Liège-Guillemins** (FL) | PA (2), CPI 1 (3), CPI 2 (2), OPI (2), EXTRA (2, non aligné), SPI (3), + TAXI PMR | 12,0 |
| DSE | **Verviers-Central** (GV) | CPI 1 (2), CPI 2 (2), EXTRA (2, non aligné), SPI (3), + TAXI PMR | 7,0 |
| DSE | **Libramont** (LRB) | CPI 1 (2), CPI 2 (2, souvent non aligné), EXTRA (2), SPI (3), + TAXI PMR | 5,5 |
| DSE | **Arlon** (LL) | CPI 1 (2), CPI 2 (2, non aligné), OPI (2, non aligné), EXTRA (2, non aligné), SPI (2, **pas de nuit**), + TAXI PMR | 4,1 |

---

## 2. Types de tâches et durées

### 2.1 PMR — durée de prise en charge (écrite) et fenêtre autour du train (déduite)

Écrit (`01!M7`, `01!P7`) : « NV = non voyant : 20min · MR = mobilité réduite : 20min · DCO = diff compréhension/orientation :
20min » ; « CRF = chaise roulante fixe : 30min · CRE = électrique : 30min · CRP = pliable : 30min ».

Fenêtre réelle (heure de début / fin de la tâche par rapport à l'heure du train **T**), vérifiée sur 1 659 tâches (99,6 % conformes à la fenêtre standard ou à la règle de correspondance) :

| Catégorie | Types | Durée | **IN** (embarquement, départ du train) | **OUT** (débarquement, arrivée du train) | Occurrences standard (+ correspondance) |
|---|---|---|---|---|---|
| « Light » | NV, MR, DCO | **20 min** | **T − 15 → T + 5** | **T − 5 → T + 15** | IN 463 (+161) · OUT 418 (+163) |
| Fauteuil | CRF, CRE, CRP | **30 min** | **T − 20 → T + 10** | **T − 10 → T + 20** | IN 198 (+21) · OUT 212 (+16) |

Exemples : `01!C14` = `07h01 07h21` pour `1NV 07h16 … IN` ; `01!C15` = `08h38 08h58` pour `1NV 08h43 … OUT` ;
`01!I15` = `06h00 06h30` pour `1CRF 06h20 … IN`.

**Correspondance (déduite, 100 % des cas)** : quand un même dossier fait **OUT puis IN dans la même gare** et que le second
train part **moins de 30 min** après l'arrivée du premier, l'agent reste avec le voyageur :
- la tâche OUT se termine **à l'heure du train de départ** (au lieu de T + 15 / T + 20) ;
- la tâche IN devient **T → T + 5** (light) ou **T → T + 10** (fauteuil).
Écart ≥ 30 min → deux tâches standard (même pour un fauteuil, dont les fenêtres se chevauchent alors entre 30 et 40 min).
Exemple : `B-CS!D21` `06h59 07h20` (OUT 07h04) puis `B-CS!D22` `07h20 07h25` (IN 07h20).

**Taxi** : même fenêtre que le train, l'heure étant celle du taxi (`1NV 06h30 TAXI IN de LA LOUVIÈRE-SUD …`, `01!U14:V14`).

### 2.2 Tâches techniques (« OPERATION », fond jaune — légende `01!R2:S2`)

| Tâche | Abréviation (légende) | Format du texte | Durée habituelle (fenêtre) | Remarques |
|---|---|---|---|---|
| **Essai de frein** | `EDF` (`01!R7`) | `EDF <train> (<hh:mm>) <matériel> [<lieu>]`, ex. `EDF RE1707 (06:06) M7` (`01!G14`) | **10-15 min** ; 20 min à Liège / Verviers ; **50 min** à Charleroi (`… - FCRA`, faisceau) | Fenêtre placée 5-20 min **avant** l'heure du train |
| **Ao/Bo** (+ accouplement) | `Ao/Bo` | `Ao/Bo ME4855 (06:25) + E4855 (06:31) = E4855 (06:51)` (`01!G15`) | **15-25 min** (jusqu'à 45-50 à Tournai / Liège ; 125 à Braine-le-Comte) | Composition de deux trains en un ; finit avant le départ du train formé |
| **(Dés)accouplement** | `ACC / Dés` (`01!R9`) | `Désacouplement E3417 (17:32) > E3417 (17:39) et ME3418 (17:45)(AM75)` | **10 min** | |
| **Immobilisation** | `Immo` (`01!R8`) | `Immobilisation E3442 (22:22) LVRS HLE19`, `Immo E5023 (23h51)` | **10-20 min** | Surtout le soir / la nuit (SPI), quelques minutes **après** l'arrivée |
| **Placement E93** (DSE, Verviers / Arlon) | — | `Placement E93 [au <train>] [GV / REP / GWK]` | 10 min à 2 h | Signification de « E93 » inconnue |
| **Affiches** (placer / retirer) | — | `Placement affiche info-travaux <réf.> L34 + FL …` | **1 h 30 à 4 h** (médiane 2 h 30) | Fond orange (déplacement) ; seule tâche où la case `OK` sert (`01!J7:K9`) ; récapitulées par macro |
| **Canalisation** (DSE) | — | `Canalisation et PMR FAZ`, `Mission affichage canalisation quai I …` | 2 h à 8 h | |
| Divers | — | Accompagnement de groupes, suivi de bus, surveillance de pointe, véhicule de service (pneus, contrôle technique) | variable | Texte libre |

**B-TO** (fond gris clair, `01!R6:S6`) : tâches techniques faites pour **B-TO** (ex. `EDF … FTYA` à Tournai, `Immo … B-TO LJ`
à Jemelle). Matériel cité : `M7`, `AM75`, `AM08`, `HLE19`, `HLE18`, `AR41`, `HPV…`.

Les tâches techniques sont **récurrentes** : 34 tâches DSO et 24 DSE se répètent ≥ 20 jours du mois à l'identique (même
train, même heure) — elles viennent des modèles de semaine (§6.3).

### 2.3 Déplacements et affichage

| Élément | Valeur | Source |
|---|---|---|
| Durée d'un **aller en voiture** « du bureau jusqu'au quai et inversément » | matrice §3 | `01!E1`, `01!B3:Q6` |
| Tâche « Départ vers X » | durée = temps de trajet ; **se termine au début de la première tâche** dans la gare (80 % des cas, sinon 5-15 min de marge) | **(déduite)** |
| Tâche « Retour à <base> » | commence **à la fin de la dernière tâche** (0 à 5 min) | **(déduite)** |
| Couleur | orange (`FFC000`) automatique si le texte contient « départ » ou « retour » (sans accents) | MFC §7 |
| **Temps d'affichage dans une gare** | **15 min** par gare | `Déplacement!F2` (DSO et DSE) |
| Durée d'une tournée d'affichage | `nb de gares × 15 min + trajet(s) Google Maps` | `Déplacement!C5` = `C3*F2`, `C6` = `SUM(C4:C5)` (DSE) |

---

## 3. Temps de trajet entre gares

### 3.1 Matrice gare de base → gare desservie (voiture, aller simple, minutes) — `01!B2:Q6`

**DSO**

| De → | Gares (minutes) |
|---|---|
| **Mons** (`01!B3:F6`) | Saint-Ghislain 25 · Jurbise 30 · Soignies 35 · Cambron-Casteau 40 · La Louvière-Sud 40 · Braine-le-Comte 45 · Leuze 45 · Ath 50 · Tournai 50 · Lessines 60 · Tubize 60 · Enghien 60 |
| **Braine-le-Comte** (`01!G3:I6`) | Soignies 20 · Tubize 30 · Enghien 35 · La Louvière-Sud 40 |
| **Tournai** (`01!J3:L6`) | Leuze 35 · Mouscron 35 · Ath 40 · Lessines 40 · Cambron-Casteau 50 · Enghien 50 · Jurbise 60 · Soignies 60 |
| **Charleroi** (`01!M3:Q6`) | Marchienne-au-Pont 20 · Faisceau A Charleroi 20 · Châtelet 25 · Tamines 30 · Luttre 30 · Fleurus 30 · Lobbes 35 · Walcourt 40 · Nivelles 40 · Braine-l'Alleud 45 · Mariembourg 50 · Waterloo 60 |

**DSE**

| De → | Gares (minutes) |
|---|---|
| **Namur** (`01!B3:C6`) | Jambes 25 · Ciney 40 · Andenne 40 · Dinant 50 |
| **Ottignies** (`01!D3:F6`) | Louvain-la-Neuve 25 · Wavre 25 · Rixensart 25 · Genval 25 · La Hulpe 30 · Gembloux 40 |
| **Liège-Guillemins** (`01!G3:I6`) | Ans 20 · Liège-Saint-Lambert 30 · Flémalle-Haute 35 · Waremme 40 · Visé 40 · Huy 45 · Verviers-Central 45 · Welkenraedt 50 |
| **Verviers-Central** (`01!J3:L6`) | Welkenraedt 35 · Spa 35 · Eupen 40 · Rivage 50 · Gouvy 60 · Vielsalm 60 |
| **Libramont** (`01!M3:O6`) | Marbehan 40 · Rochefort-Jemelle 40 · Marloie 45 · Arlon 50 · Virton 60 · Beauraing 60 · Bertrix 60 |
| **Arlon** (`01!P3:Q6`) | Marbehan 35 · Virton 45 · Libramont 50 · Bertrix 60 |

Les durées des tâches « Départ / Retour » confirment la matrice (Mons → La Louvière-Sud 40 ×33, Mons → Ath 50 ×10,
Charleroi → Luttre 30 ×45, Charleroi → Nivelles 40 ×21, Libramont → Rochefort-Jemelle 40 ×21, Libramont → Marloie 47…).
**Le train** n'apparaît qu'une fois (`Retour à FNR avec train E2434`) : le déplacement par défaut est **en voiture**.

### 3.2 Gares desservies réellement depuis chaque base (PMR des feuilles jour, octobre)

| Base | Gares où ses agents ont pris en charge des PMR (nombre de tâches) |
|---|---|
| Mons | Mons 145 · La Louvière-Sud 83 · Ath 38 · Saint-Ghislain 34 · Quaregnon 10 · Lessines 9 · Soignies 2 · Braine-le-Comte 2 · Charleroi-Central 2 (taxi / dossier) |
| Braine-le-Comte | Braine-le-Comte 23 · Saint-Ghislain 1 · Tubize 1 |
| Tournai | Tournai 37 · Ath 32 · Leuze 19 · Péruwelz 14 · Enghien 8 · Mouscron 4 |
| Charleroi | Charleroi-Central 310 · Nivelles 66 · Luttre 56 · Braine-l'Alleud 3 · Tamines 2 · Mariembourg 1 · La Louvière-Sud 1 |
| Namur | Namur 139 · Ciney 13 · Andenne 4 · Dinant 4 · Gembloux 1 |
| Ottignies | Ottignies 90 · Gembloux 22 · Louvain-la-Neuve 11 · Groenendael 2 |
| Liège | Liège-Guillemins 165 · Huy 12 · Ans 6 · Flémalle-Haute 3 · Waremme 2 · Rivage 1 |
| Verviers | Verviers-Central 58 · Spa 12 · Welkenraedt 4 · Rivage 3 · Vielsalm 1 |
| Libramont | Libramont 55 · Marloie 38 · Rochefort-Jemelle 7 · Arlon 3 · Beauraing 3 · Bertrix 2 · Marbehan 2 |
| Arlon | Arlon 25 · Marbehan 5 |

### 3.3 Tournées d'affichage (`Déplacement`, DSE) — trajet + 15 min par gare

| Base | Ligne (gares) | Gares | Trajet | Total | km |
|---|---|---|---|---|---|
| Namur | L161 Namur → Lonzée | 5 | 0 h 47 | 2 h 02 | 36 |
| Namur | L130 Namur → Jemeppe-sur-Sambre | 7 | 1 h 06 | 2 h 51 | 45 |
| Namur | L125 Namur → Andenne | 6 | 0 h 55 | 2 h 25 | 42 |
| Namur | L154 Namur → Anseremme | 7 | 1 h 32 | 3 h 17 | 76 |
| Namur | L162 Namur → Haversin | 12 | 1 h 08 + 0 h 42 | 4 h 50 | 93 |
| Ottignies | L161 Ottignies → La Hulpe | 5 | 0 h 52 | 2 h 07 | 31 |
| Ottignies | L161 Ottignies → Gembloux | 6 | 1 h 10 | 2 h 40 | 44 |
| Ottignies | L161D Ottignies → Louvain-la-Neuve | 2 | 0 h 33 | 1 h 03 | 18 |
| Ottignies | L139 Ottignies → Pécrot | 9 | 1 h 14 | 3 h 29 | 40 |
| Ottignies | L140 Ottignies → Ligny | 8 | 1 h 22 | 3 h 22 | 54 |
| Ottignies | L144 Gembloux → Jemeppe-sur-Sambre | 4 | 1 h 47 | 2 h 47 | 77 |
| Liège | L36 Liège → Waremme | 9 | 1 h 19 | 3 h 34 | 60 |
| Liège | L34 Liège → Glons | 7 | 1 h 21 | 3 h 06 | 54 |
| Liège | L40 Liège → Visé | 3 | 0 h 54 | 1 h 39 | 41 |
| Liège | L125 Liège → Bas-Oha | 13 | 0 h 54 + 1 h 00 | 5 h 09 | 86 |
| Liège | L125A Liège → Flémalle-Haute | 4 | 0 h 44 | 1 h 44 | 28 |
| Liège | L43+42 Liège → Gouvy | 10 | 2 h 00 + 1 h 00 | 5 h 30 | 176 |
| Liège | L43 Liège → Barvaux | 13 | 1 h 00 + 1 h 14 | 5 h 29 | 119 |

(`Déplacement!B3:C115` ; Verviers, Libramont, Arlon : titres seuls. DSO : gabarit vide, `Déplacement!B2`, `B34`, `B71`, `B117`.)

---

## 4. Zones et couverture

### 4.1 Ce qui est écrit

- La seule règle de couverture écrite est la **matrice des trajets** (§3.1) : une base n'a de temps de trajet **que vers les
  gares qu'elle dessert**. Les règles « jamais Mons → Charleroi » et « jamais Charleroi → zone FMS » **ne sont écrites nulle
  part** ; elles sont cohérentes avec les données (aucun temps Mons → Charleroi, aucune gare de la zone FMS dans la liste de
  Charleroi, 2 tâches seulement « Charleroi-Central » dans le bloc Mons — dossiers en correspondance / taxi).
- `B-CS!K3:K14` (DSO) et `B-CS!K3:K20` (DSE) donnent une **zone** par gare B-CS : Tournai, Mons, Charleroi (DSO) ;
  NAMUR, LIEGE, FAG (DSE).

### 4.2 Gare de base → gares atteignables (synthèse matrice + observé)

| Base | Gares atteignables (matrice) | Couvre aussi une autre base ? |
|---|---|---|
| Mons | zone FMS + Ath, Leuze, Lessines, Enghien, Tubize (zone FTY / FBC) + La Louvière-Sud | **Tournai** (50 min) et **Braine-le-Comte** (45 min) |
| Braine-le-Comte | Soignies, Tubize, Enghien, La Louvière-Sud | — |
| Tournai | Leuze, Mouscron, Ath, Lessines, Cambron-Casteau, Enghien, Jurbise, Soignies | (Jurbise / Soignies = zone FMS) |
| Charleroi | Marchienne, Châtelet, Tamines, Luttre, Fleurus, Lobbes, Walcourt, Nivelles, Braine-l'Alleud, Mariembourg, Waterloo | **jamais** de gare de la zone FMS |
| Namur | Jambes, Ciney, Andenne, Dinant | Ottignies (agents « CPI de LT » prêtés) |
| Ottignies | LLN, Wavre, Rixensart, Genval, La Hulpe, Gembloux | Namur, Charleroi (prêts « CPI LT ») |
| Liège | Ans, St-Lambert, Flémalle-Haute, Waremme, Visé, Huy, Welkenraedt | **Verviers-Central** (45 min) |
| Verviers | Welkenraedt, Spa, Eupen, Rivage, Gouvy, Vielsalm | — |
| Libramont | Marbehan, Rochefort-Jemelle, Marloie, Virton, Beauraing, Bertrix | **Arlon** (50 min) ; « SPI Arlon reprend la zone » |
| Arlon | Marbehan, Virton, Bertrix | **Libramont** (50 min) ; « SPI LL et LRB » |

### 4.3 Règle de répartition PMR (déduite)

- **Gare de base** : PA d'abord (Mons, Charleroi, Namur, Liège), sinon CPI.
- **Gare secondaire** : OPI (Mons, Charleroi), CPI 2 / EXTRA / SPI ailleurs, avec un déplacement aller et retour.
- **Gare B-CS pendant l'ouverture du guichet, PMR light, en semaine** → guichet B-CS (§5) ; hors de ces conditions
  (fauteuil, soir, week-end) → agent de la base (ex. Nivelles : 57 PMR light **hors** heures de guichet confiées à Charleroi,
  aucune pendant).
- Pas de prise en charge possible → **taxi** (DSO : 105 tâches TAXI sur 927) ou **chef de bord** (Ottignies).

---

## 5. Gares B-CS

`B-CS!H16` (DSO) / `B-CS!H22` (DSE) : « **B.CS : attention, un maximum de 3 PMR/heure peuvent être acceptées. Et que des
PMR light** » (phrase complète). `B-CS!B2` : « Autre information de fermeture des guichets : » suivi de lignes vides
(`B3:F17`). `Liste!C13:C15` : « Prise en charge : gare B.CS + B.PT / gare BCS-ONLY ».

| District | Gare | N67 | R67 | Zone | Type |
|---|---|---|---|---|---|
| DSO | Ath | 07:15-14:35 | 08:15-15:35 | Tournai | B-CS ONLY |
| DSO | Braine-le-Comte | 07:15-14:36\* | 08:15-15:36\* | Mons | B-CS + B-PT |
| DSO | Braine-l'Alleud | 07:15-14:37\* | Fermé | Charleroi | B-CS ONLY |
| DSO | Enghien | 07:15-14:38\* | Fermé | Tournai | B-CS ONLY |
| DSO | La Louvière-Centre | 07:15-14:39\* | Fermé | Charleroi | B-CS ONLY |
| DSO | La Louvière-Sud | 07:15-14:40\* | 08:15-15:40\* | Charleroi | B-CS ONLY |
| DSO | Mouscron | 07:15-14:41\* | Fermé | Tournai | B-CS ONLY |
| DSO | Nivelles | 07:15-14:42\* | 08:15-15:42\* | Charleroi | B-CS ONLY |
| DSO | Soignies | 07:15-14:43\* | 08:15-15:43\* | Mons | B-CS ONLY |
| DSO | Tamines | 07:15-14:44\* | Fermé | Charleroi | B-CS ONLY |
| DSO | Tournai | 07:15-20:15 | 07:15-20:05 | Tournai | B-CS + B-PT |
| DSO | Tubize | 07:15-14:46\* | Fermé | Mons | B-CS ONLY |
| DSE | Andenne, Ciney, Dinant | 07:15-10:35 | Fermé | NAMUR | B-CS ONLY |
| DSE | Gembloux | 07:15-14:35 | 08:15-15:35 | NAMUR | B-CS ONLY |
| DSE | Genval | 07:15-14:35 | Fermé | NAMUR | B-CS ONLY |
| DSE | Louvain-la-Neuve | 07:15-20:05 | Fermé | NAMUR | B-CS ONLY |
| DSE | Ottignies | 07:15-20:05 | 08:15-15:35 | NAMUR | B-CS + B-PT |
| DSE | Eupen | 07:15-14:35 | 07:15-14:35 | LIEGE | B-CS ONLY |
| DSE | Huy, Liège-St-Lambert | 07:15-14:35 | Fermé | LIEGE | B-CS ONLY |
| DSE | Spa, Welkenraedt | 08:15-11:35 | Fermé | LIEGE | B-CS ONLY |
| DSE | Visé, Waremme | 07:15-10:35 | Fermé | LIEGE | B-CS ONLY |
| DSE | Verviers-Central | 07:15-20:05 | 07:15-14:35 | LIEGE | B-CS + B-PT |
| DSE | Arlon | 07:15-14:35 | 08:15-15:35 | FAG | B-CS + B-PT |
| DSE | Libramont | 07:15-14:35 | Fermé | FAG | B-CS + B-PT |
| DSE | Marloie | 07:15-10:35 | Fermé | FAG | B-CS ONLY |

\* Fins d'horaire qui augmentent d'une minute par ligne (14:35, 14:36… 14:46) : **artefact de recopie Excel** très probable
(valeur réelle sans doute 14:35 / 15:35).

Liste des prises en charge (`B-CS!B20:E159` DSO, `B26:E151` DSE) : `DATE`, `GARE` « à encoder manuellement »
(`B-CS!B19`), puis `HEURE` + `OPERATION` « Coller résumer automatique PMR dicos » (`B-CS!D19`) ; week-ends en vert
(MFC `WEEKDAY(...)=7 ou 1`). Bouton « TRIER » → tri par DATE puis HEURE (`Trier_Tous_Les_Tableaux_Date_Heure`).

Observé : DSO 122 prises en charge (NV 65, DCO 53, MR 10 voyageurs ; **aucun fauteuil**), surtout Nivelles (61) et La
Louvière-Sud (35) ; DSE 37 (NV 23, DCO 12, MR 3), surtout Marloie (16) et Gembloux (13). **La limite de 3 PMR/heure est
dépassée** 3 fois (DSO, jusqu'à 5 à La Louvière-Sud) et 2 fois (DSE, 4) si l'on compte par heure de train.

---

## 6. Grammaire des tâches et flux de travail Excel

### 6.1 Format de l'heure (`01!D7`)

« **TOUJOURS 4 chiffres** pour les heures : 06h45 · **ESPACE** entre heure début et fin : 06h45 07h00 · De 00h00 à 05h59
ajouter **NUIT** devant les heures. »

Grammaire : `[NUIT ]HHhMM[ HHhMM]` (heure de fin facultative pour une tâche ponctuelle : `Placement E93` à `08h00`). Le
tri étant **alphabétique**, `NUIT …` se place après `22h00 06h00` (la nuit suit le service de nuit). Conformité observée :
97 % (écarts : `14H01`, `7h30`, `14h30 - 16h00`, `Nuit`, cellules vides).

### 6.2 Format d'une tâche PMR

Consigne (`01!G7`) : « Ordre encodage PMR : `1CRE 07h40 E2129 OUT/IN DE/VERS LL` `AAAA-MM-JJ-NNNN` `<Nom du voyageur>` ».
Format réel (résumé copié depuis DICOS) :

```
<n><TYPE>[ + <n><TYPE>] <HHhMM> <train|TAXI> IN de <GARE ASSISTÉE> à <destination> n°<AAAA-MM-JJ-NNNN> <Nom> [<téléphone>]
<n><TYPE>[ + <n><TYPE>] <HHhMM> <train|TAXI> OUT à <GARE ASSISTÉE> venant de <origine> n°<AAAA-MM-JJ-NNNN> <Nom> [<téléphone>]
```

| Élément | Règle | Exemple |
|---|---|---|
| `n` | nombre de voyageurs (1-3 observés) ; plusieurs types joints par `+` | `1MR + 1DCO`, `2CRF + 1CRP`, `3CRF` |
| `TYPE` | NV, MR, DCO, CRF, CRE, CRP | |
| `HHhMM` | heure **du train** à la gare assistée (départ si IN, arrivée si OUT) | `07h16` |
| train | n° commercial (`906`, `E2129`) ou `TAXI` ; parfois n° technique entre parenthèses `908 (19909)` | |
| `IN` / `OUT` | IN = embarquement à la gare assistée ; OUT = débarquement | |
| gare assistée | **en majuscules** (DICOS) ; l'autre gare en casse normale | `IN de MONS à Charleroi-central` |
| dossier | `n°AAAA-MM-JJ-NNNN` ; `n° Informations sur le client` quand DICOS ne donne pas de numéro (52 cas) | |
| fin de ligne | nom du voyageur, parfois téléphone (**données personnelles**) | |

Voiture / porte / point de rendez-vous : **absents** du texte. 99 % des 1 660 tâches PMR suivent cette grammaire ; exceptions :
saisie libre (« 2 PMR Light à embarquer dans E3839 à 17h45 à Huy… »).

L'heure de la tâche (colonne `Heure`) est **calculée à la main** à partir de l'heure du train (§2.1) : aucune formule.

### 6.3 Instructions et macros

| Consigne / bouton | Cellule / macro | Effet |
|---|---|---|
| « AJOUT : heure début ESPACE heure fin + tâche → **TRIER** » | `01!D10` | Ajouter en bas du tableau puis cliquer « TRIER » |
| « SUPPRIMER : effacer → TRIER » | `01!J10` | Vider les cellules (pas de suppression de ligne) |
| « DEPLACER : copier/coller et effacer ensuite. » | `01!D11` | Changer de poste = copier, coller dans l'autre tableau, effacer |
| « ❌ **JAMAIS couper / coller** » | `01!J11` | Couper casserait les tableaux / la mise en forme |
| « /!\ Ouvrir le fichier dans l'application pour que le bouton fonctionne /!\ » | `01!B7` | Macros indisponibles dans Excel en ligne |
| Bouton **TRIER** (un par bloc) | `TrierTableauxParHeure` (Module1) | Trie **tous les tableaux de la feuille** sur la 1re colonne (Heure, texte croissant), retour à la ligne + hauteur auto |
| Bouton TRIER de `B-CS` | `Trier_Tous_Les_Tableaux_Date_Heure` (Module5) | Tri par colonnes *DATE* puis *HEURE* |
| Bouton rouge **ICI** (feuilles d'affiches) | `RechercheAffiches` (Module2) | Parcourt les feuilles 01-31, cherche « affiche(s) » dans chaque bloc de gare, recopie la tâche (colonnes heure / tâche / OK) dans la feuille de la gare avec jour + adresse ; rétablit le message « NE RIEN ENCODER ICI » (Module10) |
| Collage | `Workbook_SheetChange` (ThisWorkbook) | Sur un collage de plusieurs cellules dans un bloc, réapplique la **mise en forme de la ligne modèle** (avant-dernière ligne du bloc) — le collage depuis DICOS garde ainsi le style |
| Ctrl+C | `CopieControlee` (Module8, raccourci posé à l'activation) | **Bloque la copie** dans les lignes 1-11 (en-tête) |
| Création du mois | `DupliquerlesOnglets` (Module4) | À partir de 7 **modèles de semaine** `01` (lundi) … `07` (dimanche) et de la date en `01!B1` : crée 08-31 en copiant le modèle du même jour de semaine, puis recrée 01-07 depuis 08-14 et date `B1` (`dddd d mmmm yyyy`) → les **tâches récurrentes** (techniques, créneaux) sont reconduites chaque semaine |
| Protection | `DeprotegerFeuilles_01_a_31` / `ReprotegerFeuilles_01_a_31` (Modules 6-7) | Feuilles jour protégées (mise en forme autorisée) ; **mot de passe écrit en clair dans le VBA** |
| Filtres | `RetirerTousFiltresTableaux` (Module3) | Retire tous les filtres automatiques |
| DSE seulement | `MiseEnFormeColonnes_Jours01a31` (Module9) | Centre les colonnes Heure, aligne à gauche les colonnes Tâche |

**Aucune macro ne contrôle** les chevauchements, les durées, les trajets ni la limite B-CS. Les PMR sont **collées
depuis DICOS** (résumé), placées à la main dans le tableau d'un poste, l'heure de début / fin calculée à la main, puis triées.

Case **OK** : légende « FAIT » = coché, « PAS ENCORE FAIT » = décoché, « UNIQUEMENT pour les affiches (placer, retirer) »
(`01!J7:K9`). Usage réel : DSO 0 case cochée sur 2 487 ; DSE 23 sur 1 850.

### 6.4 Contraintes implicites (déduites)

| Contrainte | Observation |
|---|---|
| Chevauchement dans un même poste | **Toléré** : DSO 150 et DSE 84 paires de PMR qui se chevauchent dans un même tableau, dont 59 / 29 sur **le même train** et 76 / 42 dans **la même gare** ; 13 / 8 dans deux gares différentes (vraisemblablement des erreurs) ; aussi EDF / Ao/Bo simultanés |
| Enchaînement déplacement | « Départ » finit au début de la 1re tâche sur place ; « Retour » commence à la fin de la dernière |
| Retour à la base | Toujours planifié en fin de tournée (`Retour à Mons`, `retour FMS`…) |
| Pause | **Aucune** pause n'est planifiée |
| Fin de service | Les tâches restent dans le créneau du poste ; la nuit passe au créneau 22h00-06h00 |
| Correspondance | Un seul agent du OUT au IN si < 30 min (§2.1) |
| Postes non pourvus | Créneau en gris foncé « service non aligné » : on ne lui donne pas de tâches |

---

## 7. Mises en forme et couleurs = états

| Couleur | Signification (légende `01!R1:S6`) | Comment |
|---|---|---|
| Jaune `FFFF00` | **OPERATION** (tâche technique) | Manuel, sur la cellule Heure |
| Orange `FFC000` | **DEPLACEMENT** (départ / retour) | **Mise en forme conditionnelle** : texte de la tâche contenant « depart » ou « retour » (accents neutralisés) — seule MFC des feuilles jour (~620 règles DSO, ~260 DSE, recopiées cellule par cellule) |
| Gris foncé (thème 0, −50 %) | **SERVICE NON ALIGNÉ** | Manuel, sur la ligne du créneau (DSO 347, DSE 484 créneaux) |
| Rouge `FF0000` | **MALADE** | Manuel, sur le créneau (DSO 10, DSE 11) |
| Gris clair (thème 0, −15 %) | **B-TO** | Manuel, tâches techniques B-TO |
| Bleu-gris (thème 9, +80 %) | Ligne de créneau (poste actif) | Style du modèle |
| Gris-bleu (thème 2, −50 %), bleu (thème 1) | **Sans légende** (DSO 16, DSE 79 créneaux) | Sens inconnu : formation ? congé ? |
| Vert (feuille `B-CS`) | Week-end | MFC `WEEKDAY` |
| Couleur de gare (`01!B2:P2`) | Identité du bloc | Décoratif |

Feuilles d'affiches : saisie interdite par message de validation « ATTENTION – NE RIEN ENCODER ICI… L'encodage se fait
uniquement dans les onglets 01 à 31 » (`FMS!A2:Z1000`).

---

## 8. Différences DSO / DSE

| Sujet | DSO | DSE |
|---|---|---|
| Gares de base | 4 (Mons, Braine-le-Comte, Tournai, Charleroi) | 6 (Namur, Ottignies, Liège, Verviers, Libramont, Arlon) |
| Taille feuille jour | A1:V219, 22 tableaux | A1:V324, 35 tableaux |
| Format de l'heure dans les tâches techniques | `(06:25)` | `(06h25)` |
| PMR au chef de bord | — | Ottignies (`01!O65:P115`) |
| Feuille `Déplacement` | Gabarit vide | Tournées d'affichage chiffrées (Namur, Ottignies, Liège) |
| `TMP_PASTE` | Oui (vide, très masquée) | Non |
| Macro de mise en forme des colonnes | — | `MiseEnFormeColonnes_Jours01a31` |
| Tâches typiques | Beaucoup d'EDF (20 / jour, Tournai et Charleroi), Ao/Bo, déplacements OPI | Ao/Bo (17 / jour), affiches (Liège, Verviers), Placement E93, canalisation |
| Taxi PMR | 105 tâches / mois | 12 |
| B-CS | 12 gares, 122 prises en charge | 18 gares, 37 prises en charge |
| Zones B-CS | Tournai / Mons / Charleroi | NAMUR / LIEGE / FAG |
| Mot de passe de protection | propre au district (en clair dans le VBA) | idem |
| Liste masquée | gares + types | + listes « Short-notice / Non-prévue », « Présence OUI / NON », mois (vestiges) |

---

## 9. Points ambigus — questions au métier

1. Libellés officiels de **PA, CPI, OPI, SPI** ; différence entre CPI 1 et CPI 2, OPI et OPI 2.
2. Un **EXTRA** est-il un poste prévu au tableau de service (Quinyx) ou un renfort décidé au jour le jour ? Qui l'« aligne » ?
3. Signification des couleurs **sans légende** (gris-bleu, bleu) sur 95 créneaux.
4. **B-TO**, **B-PT**, **B-CS** : définitions ; que change « B-CS + B-PT » par rapport à « B-CS ONLY » ?
5. **N67 / R67** : semaine / week-end ? période (horaire 2026-2027) ? Les fins 14:36… 14:46 sont-elles une erreur de recopie ?
6. Limite B-CS « **3 PMR/heure** » : par heure de train, par heure civile, par fenêtre glissante ? Un OUT + IN du même voyageur compte-t-il pour 1 ou 2 ?
7. B-CS : faut-il aussi respecter une marge avant la fermeture du guichet ? Les PMR de 07h04 (avant 07:15) y sont acceptées.
8. **Correspondance** : la règle « < 30 min = l'agent reste » vaut-elle aussi pour les fauteuils (fenêtres qui se chevauchent de 30 à 40 min) ?
9. Fenêtres PMR : les marges −15 / +5 (IN) et −5 / +15 (OUT) — et −20 / +10, −10 / +20 pour les fauteuils — sont-elles une norme écrite ? Varient-elles selon la gare (grande gare, quai éloigné) ?
10. **Zones / couverture** : la règle « jamais Mons → Charleroi, jamais Charleroi → zone FMS » est-elle officielle ? Pourquoi La Louvière-Sud est-elle desservie par Mons alors que la feuille B-CS la place en zone Charleroi ?
11. Mons ↔ Tournai, Liège ↔ Verviers, Libramont ↔ Arlon se couvrent-elles mutuellement **dans les deux sens** ? Les prêts « CPI de LT » (Ottignies → Namur / Charleroi) sont-ils réguliers ?
12. La matrice ne donne que des trajets **depuis la base** : comment chiffrer un enchaînement **gare secondaire → gare secondaire** (Leuze → Ath, Leuze → Enghien observés) ?
13. Déplacement **en train** autorisé ? (un seul cas). Le véhicule de service est-il une ressource limitée (un par base ?) à planifier ?
14. Pause réglementaire à placer dans le service ? Temps de prise / remise de service ?
15. Chevauchements tolérés : un agent peut-il assister **deux PMR sur le même train** ? Deux PMR sur deux trains différents à la même heure ?
16. Quel délai minimum entre deux tâches dans **deux gares différentes** sans déplacement planifié (13 + 8 cas observés) ?
17. Que signifient **« Placement E93 »**, **Ao/Bo**, les suffixes **FTYA / FCRA / LVRS / FNVT / LJ** ? Les durées des tâches techniques sont-elles normées ?
18. Les tâches techniques récurrentes viennent-elles d'un document de référence (fiche de roulement) qu'on pourrait importer ?
19. **TAXI PMR** : qui commande le taxi et quand ? La colonne sert-elle seulement au suivi ?
20. **PMR attribuée au CDB** (Ottignies) : critères, et faut-il prévenir quelqu'un ?
21. Case **OK** : doit-elle devenir un vrai suivi « fait » pour toutes les tâches (PMR comprises) ?
22. **Affiches** : les références (`2610173`…) et les lignes viennent-elles d'un outil (info-travaux) ? Le temps « 15 min par gare » vaut-il partout ?
23. À quel moment la planification d'un jour est-elle « figée » (les jours 17-31 sont presque vides) ? Qui ajoute les PMR de dernière minute (« short-notice ») ?
24. Le nom et le téléphone du voyageur doivent-ils figurer sur la feuille de l'agent ? (DICOS les fournit ; à arbitrer avec le DPO).

---

## 10. Pistes pour le planificateur CSM (non demandées, pour cadrage)

- Source des PMR : les **missions DICOS déjà ingérées** dans CSM (`pmr_assists` : type, sens, train, heure, gare) remplacent le
  collage du résumé ; la fenêtre (§2.1) et la correspondance (< 30 min) se calculent automatiquement.
- Source des créneaux : **Quinyx** (Équipe › Planning) pour les postes réellement pourvus (fin du gris « non aligné »).
- Référentiels : matrice de trajets par base (§3.1), gares B-CS avec horaires et limite 3 PMR/h light (§5), tâches techniques
  récurrentes par jour de semaine (modèles), tournées d'affichage (§3.3).
- Contrôles à ajouter (absents d'Excel) : chevauchement entre gares, trajet manquant, limite B-CS, fauteuil confié au B-CS,
  tâche hors créneau, gare hors couverture de la base.

---

## 11. Statistiques d'octobre 2026 (sans noms)

Les jours **1 à 16** sont planifiés ; les jours 17 à 31 sont presque vides (planification au fil de l'eau). Moyennes sur les
jours 1-16 sauf mention.

### 11.1 Tâches PMR (feuilles jour, hors B-CS)

| | DSO | DSE |
|---|---|---|
| Tâches PMR sur le mois (1-31) | 927 (945 voyageurs) | 733 (753 voyageurs) |
| Tâches PMR / jour (1-16) | **47,5** | **37,0** |
| Semaine / week-end (par jour) | 56,6 / 20,2 | 42,8 / 19,5 |
| Part IN | 51 % | 52 % |
| Types (voyageurs, 1-16) | NV 54 % · MR 16 % · CRE 13 % · CRF 9 % · DCO 8 % · CRP 1 % | NV 37 % · CRF 18 % · MR 17 % · CRE 16 % · DCO 7 % · CRP 5 % |
| Tâches TAXI (mois) | 105 | 12 |
| Tâches à plusieurs PMR | 14 | 7 |
| PMR par gare de base / jour | Charleroi 21,6 · Mons 18,4 · Tournai 6,4 · Braine-le-Comte 1,1 | Liège 9,9 · Namur 8,8 · Ottignies 6,3 · Libramont 6,2 · Verviers 3,7 · Arlon 2,1 |
| Poste le plus chargé / jour | Charleroi PA 10,3 · Mons PA 6,5 · Mons OPI 4,6 | Liège PA 7,4 · Namur PA 6,1 · Ottignies CPI 4,0 |
| Pointe horaire (mois) | **17h** (194), 16h (113), 7h (86) | **16h** (109), 8h (74), 17h (73) |
| Prises en charge B-CS (mois) | 122 (~4,9 / jour ouvré) | 37 (~2,3 / jour) |

### 11.2 Autres tâches / jour (1-16)

| | DSO | DSE |
|---|---|---|
| EDF | 20,8 | 2,8 |
| Ao/Bo (+ accouplement) | 16,2 + 2,9 | 17,1 |
| Désaccouplement / immobilisation | 0,8 / 0,6 | — / 2,0 |
| Déplacements (départ + retour) | 17,2 | 15,8 |
| Affiches / Placement E93 / canalisation | — | 1,9 / 3,0 / 0,2 |
| Tâches techniques distinctes (mois) | 120, dont 34 présentes ≥ 20 jours | 59, dont 24 présentes ≥ 20 jours |

### 11.3 Effectifs

| | DSO | DSE |
|---|---|---|
| Créneaux actifs / jour (mois) | 29,4 (Mons 11,0 · Charleroi 10,2 · Tournai 5,9 · BC 2,3) | 46,7 (Namur 12,3 · Liège 12,0 · Verviers 7,0 · Ottignies 5,8 · Libramont 5,5 · Arlon 4,1) |
| Créneaux « non aligné » (mois) | 347 | 484 |
| Créneaux « malade » (mois) | 10 | 11 |
