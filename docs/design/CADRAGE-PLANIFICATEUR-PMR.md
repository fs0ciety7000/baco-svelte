# Cadrage — Planificateur de tâches PMR

> Demande de l'utilisateur (15 oct. 2026) : remplacer les classeurs Excel « planificateur de tâches » (DSO et DSE) par un
> planificateur dans CSM. Lire les horaires Quinyx des agents de gare (SPI, OPI, CPI, PA, B-CS) de dix gares, construire
> leur planning et y répartir les prises en charge PMR de DICOS (IN / OUT), à la main ou automatiquement, selon les
> disponibilités, le district, la zone et les temps de trajet. Vue Gantt / calendrier jour, semaine, mois ; glisser-déposer ;
> « si l'agent est occupé, en chercher un autre ». Les règles s'affineront au fil de l'eau.
>
> **Statut : ébauche soumise, réponses reçues le 15 oct. (§4), rien n'est codé.** Règles détaillées : `REGLES-PLANIFICATEUR-PMR.md` (sans donnée
> personnelle). Les classeurs eux-mêmes (noms d'agents et de voyageurs, téléphones) restent hors dépôt. Les identifiants des
> plannings Quinyx ne vont jamais dans Git : ils se saisissent dans Administration › Quinyx.

## 1. Ce que j'ai compris

**Aujourd'hui.** Un classeur par district et par mois, une feuille par jour, un bloc par gare de base (DSO : Mons,
Braine-le-Comte, Tournai, Charleroi ; DSE : Namur, Ottignies, Liège-Guillemins, Verviers, Libramont, Arlon), une colonne
par poste (PA, CPI, OPI, SPI, EXTRA, + listes TAXI PMR et « PMR au chef de bord »). Le coordinateur colle le résumé DICOS
de chaque prise en charge, calcule l'heure de début et de fin à la main, la place dans la colonne d'un agent, ajoute les
trajets en voiture (« Départ vers Ath », « Retour à Mons »), puis clique « TRIER ». Les tâches techniques (essais de frein,
Ao/Bo, accouplements, immobilisations) sont recopiées chaque semaine depuis des modèles. Aucune macro ne vérifie un
chevauchement, un trajet, une zone ni la limite des guichets B-CS. Volume : ~47 prises en charge par jour en DSO, ~37 en
DSE (pointe 16-17 h), ~30 et ~47 services d'agents par jour.

**Demain dans CSM.**
- Les **agents et leurs services** viennent de Quinyx (fin de la colonne grisée « service non aligné » : un service
  absent de Quinyx n'existe pas).
- Les **prises en charge** viennent des missions DICOS déjà synchronisées (`pmr_assists`) : plus de collage ; la fenêtre et
  la correspondance se calculent seules.
- Les **règles** (durées, fenêtres, trajets, couverture, B-CS) sont des référentiels modifiables, pas du code.
- Le coordinateur **voit** qui est libre, **glisse** une prise en charge sur un agent, et CSM **refuse ou prévient** quand une
  règle est enfreinte ; « Attribuer automatiquement » propose une répartition qu'il accepte en tout ou en partie.

## 2. Règles retenues pour la première version (détail et sources : `REGLES-PLANIFICATEUR-PMR.md`)

| Règle | Valeur | Origine |
|---|---|---|
| Durée PMR « light » (NV, MR, DCO) | 20 min : IN de T−15 à T+5, OUT de T−5 à T+15 (T = heure du train) | écrite + vérifiée (99,6 %) |
| Durée PMR fauteuil (CRF, CRE, CRP) | 30 min : IN de T−20 à T+10, OUT de T−10 à T+20 | écrite + vérifiée |
| Correspondance (même dossier, OUT puis IN même gare, < 30 min) | un seul agent : OUT jusqu'au départ, IN de T à T+5 (light) / T+10 (fauteuil) | déduite (100 %) |
| Taxi | même fenêtre, heure du taxi ; liste à part, pas d'agent | observée |
| Trajet | voiture, matrice base → gare (ex. Mons → La Louvière-Sud 40 min, Charleroi → Nivelles 40 min) ; « Départ » finit au début de la 1re tâche sur place, « Retour » commence à la fin de la dernière | écrite + déduite |
| Couverture | une base n'atteint que les gares de sa matrice ; Mons ↔ Tournai, Liège ↔ Verviers, Libramont ↔ Arlon (deux sens) ; La Louvière-Sud = Mons ; Ath = Tournai ou Mons ; **jamais Mons → Charleroi ni Charleroi → zone FMS** | matrice + réponses de l'utilisateur (§4) |
| Préférence de poste | gare de base : PA, sinon CPI ; gare secondaire : OPI, sinon CPI 2 / EXTRA / SPI | déduite |
| Guichet B-CS | PMR light seulement, pendant l'ouverture du guichet, **3 PMR / heure au plus** (une correspondance OUT + IN compte pour 1) ; sinon agent de la base | écrite + réponse (§4) |
| Tâches techniques | modèles par jour de semaine (train, heure, durée), reconduits ; EDF 10-15 min (50 à Charleroi), Ao/Bo 15-25, désaccouplement 10, immobilisation 10-20 | déduite |
| Chevauchement | plusieurs PMR du **même train** : permis ; deux trains différents en même temps : **refusé** | réponse de l'utilisateur (§4) |
| Pause | aucune pour l'instant | observée |

## 3. Ce que je propose

### 3.1 Données (PocketBase)

- **Quinyx étendu aux agents de gare** : `quinyx_groups.purpose` = `equipe` (PACO / RCCA, comme aujourd'hui) ou `gares`
  (les dix plannings des gares) ; pour un groupe `gares`, l'ingestion garde les services des postes de gare (codes à
  relever : SPI_, OPI_, CPI_, PA_, B-CS… — voir Q1) avec **poste** et **gare de base** déduits du type et de la section.
  Les agents de gare n'ont pas de compte CSM : on ne garde que prénom, nom, poste, base et services. Cela revient sur la
  décision du 14 oct. (« horaires gardés seulement pour l'équipe CSM ») : **accord de l'utilisateur et note DPO requis**.
- **Référentiels du planificateur** (Administration › Planificateur, droit `referentiels:manage`) :
  `planner_bases` (gare de base, district, zone SPI, postes, gares couvertes avec temps de trajet, bases voisines qu'elle
  peut couvrir), `planner_rules` (durées et fenêtres par type, seuil de correspondance, préférences de poste),
  `bcs_counters` (gare, horaires d'ouverture, type, limite par heure), `planner_templates` (tâches techniques récurrentes
  par jour de semaine).
- **Tâches** : `planner_tasks` (jour, type `pmr_in` / `pmr_out` / `technique` / `trajet` / `affiche` / `autre`, début, fin,
  gare, train, agent Quinyx ou guichet B-CS ou taxi ou chef de bord, statut `a_attribuer` / `attribuee` / `faite`, lien vers
  `pmr_assists` et le bout IN / OUT, auteur, origine `manuel` / `auto`). Les tâches PMR sont créées et mises à jour depuis
  les missions DICOS (ajout, changement d'heure, annulation → la tâche est signalée, jamais supprimée en silence). Les
  trajets sont recalculés à chaque changement d'attribution. Verrou optimiste comme les bons.
- Droits nouveaux : `planner:read`, `planner:write` (attribuer), `planner:manage` (modèles, référentiels).

### 3.2 Moteur (logique pure testée, partagée serveur / navigateur)

`lib/planner/` : fenêtres (`taskWindow`), correspondances (`linkConnections`), trajets (`travelBetween` : matrice d'abord,
puis passage par la base si gare secondaire → gare secondaire, Q8), contrôles d'une attribution (`checkAssign` → OK /
avertissement / refus avec une phrase : « Hors zone : Charleroi ne couvre pas FMS », « Occupé 07h00-07h20 », « Trajet de
50 min depuis Tournai impossible avant 09h17 », « Hors service »), et **attribution automatique** gloutonne par heure :
pour chaque prise en charge, agents admissibles classés par coût (déjà sur place < même gare < trajet court < poste
préféré < charge la plus faible), correspondances et prises en charge d'un même train regroupées, B-CS d'abord quand la
règle le permet. Le résultat est une **proposition** : rien n'est enregistré avant « Accepter ».

### 3.3 Écrans (ébauche jointe)

- **PMR › Planificateur** (nouvel onglet) :
  - **Jour** : une ligne par agent, regroupée par gare de base puis poste (« OPI · FMS », service, % occupé), le temps
    en horizontal. Hors service hachuré, temps libre écrit, trait « maintenant ». Blocs colorés par catégorie ; les
    trajets sont dessinés entre les blocs.
  - **« À attribuer »** : liste à droite, filtrée par district, zone et gare.
  - **Glisser-déposer** : les agents possibles s'éclairent, les autres se grisent avec la raison ; un dépôt sur un agent
    occupé propose un autre agent libre.
  - **Semaine** et **Mois** : charge et couverture par jour, jours à risque signalés.
- **Mobile** : agenda d'un agent et liste « À attribuer » avec « Attribuer à… ». Pas de glisser au doigt sur un Gantt.
- **Feuille de l'agent** (lot ultérieur) : sa journée en PDF ou sur téléphone, sans nom de voyageur (Q11).

### 3.4 Lots (chacun validé avant le suivant)

| Lot | Contenu |
|---|---|
| P0 | Quinyx gares : extension 1.9.0 (groupes `gares`, codes CPI / SPI / OPI / PA / EXTRA), ingestion, agents, postes, bases ; dossiers DICOS en attente (si la capture le permet). Référentiels pré-remplis depuis les classeurs. Note DPO. |
| P1 | Moteur pur + tests ; `planner_tasks` alimentée par DICOS (une tâche par bout assisté, dossiers à plusieurs missions) ; saisie manuelle au format ALEA ; vue Jour ; attribution manuelle (glisser, « Attribuer à… », panneau) avec contrôles. |
| P2 | Attribution automatique (proposition, accepter tout / un par un), conflits, guichets B-CS, correspondances. |
| P3 | Semaine, Mois, modèles de tâches techniques, tâches libres (affiches, missions bus), temps réel (SSE). |
| P4 | Feuille de l'agent (PDF / mobile), case « fait », retards iRail sur les blocs, export, retrait des classeurs. |

## 4. Réponses de l'utilisateur (15 oct. 2026)

| # | Question | Réponse |
|---|---|---|
| 2 | Horaires des agents de gare sans compte CSM | **Oui** : gardés (prénom, nom, poste, base, services) ; note DPO à compléter. |
| 3 | Couvertures croisées | **Dans les deux sens** (Mons ↔ Tournai, Liège ↔ Verviers, Libramont ↔ Arlon). **La Louvière-Sud = Mons.** **Ath = Tournai ou Mons.** Jamais Mons → Charleroi ni Charleroi → zone FMS. |
| 4 | Chevauchements | **Plusieurs PMR du même train** (même gare, même heure) pour un agent : permis. **Deux trains différents en même temps** : refusé. |
| 5 | B-CS « 3 PMR / heure » | Un OUT puis IN du même voyageur (correspondance) **compte pour 1**. |
| 6 | Tâches techniques récurrentes | **Modèles des classeurs** pour l'instant. |

**Précisions apportées** :
- **Source des tâches** : DICOS, y compris les **dossiers en attente d'acceptation** (avant qu'ils deviennent des missions).
  L'extension lit aujourd'hui les missions acceptées ; une capture de la requête d'un dossier en attente est nécessaire
  pour lire ce second flux (analysée par script : chemins et clés seulement, jamais de cookie ni de nom).
- **Saisie manuelle** : le PACO / RCCA peut encoder une tâche lui-même au format de l'export ALEA / des classeurs :
  `<n><TYPE> <HHhMM> <train> IN de <GARE> à <autre gare> n°<AAAA-MM-JJ-NNNN> [nom] [téléphone]`, ou
  `… OUT à <GARE> venant de <autre gare> …`. Analyse pure et testée (`lib/planner/parse-task.ts`) ; plusieurs lignes
  collées = plusieurs tâches ; nom et téléphone **jamais repris** dans la tâche (le dossier suffit, la fiche DICOS porte le
  nominatif sous `pmr:read`).
- **Une réservation = plusieurs missions** : ex. Bruxelles-Midi → Mons puis Mons → Tournai = 4 tâches (Bruxelles IN,
  Mons OUT, Mons IN, Tournai OUT) ; à Mons, correspondance si moins de 30 min (un seul agent), sinon deux tâches.
  Le panneau d'une tâche liste les autres tâches du dossier.
- **Codes Quinyx des postes** (planning de Mons, « quasi pareil » ailleurs) : type de service + section.

| Type de service | Section | Poste | Horaire |
|---|---|---|---|
| `CPI_AM`, `CPI_PM`, `CPI_N` | `CPI MONS` | CPI | 06-14, 14-22, 22-06 |
| `SPI_AM`, `SPI_PM`, `SPI_N` | `SPI MONS` | SPI | 06-14, 14-22, 22-06 |
| `OPI 6-14`, `OPI 14-22` | `OPI Mons` | OPI | 06-14, 14-22 ; heures réelles parfois décalées (05-13) |
| `PA_AM`, `PA_PM` | `PA Mons` | PA | 06-14, 14-22 |
| `EXTRA CPI` | `… Mons` | EXTRA (renfort CPI) | 06-14 ou 14-22 |

  Règle de capture des groupes « gares » : type commençant par `CPI`, `SPI`, `OPI`, `PA`, `EXTRA` (ou `B-CS` à vérifier) ;
  **les heures réelles de la prestation font foi** (pas celles du type). Tout le reste est ignoré dans le navigateur :
  repos, congés, absences, formations, visites médicales (codes du type `RW`, `CW`, `CV`, `RR`, `ADA`, `IDEV`…),
  commentaires et pointages. Gare de base = section (« CPI MONS » → Mons).

## 5. Questions encore ouvertes

1. Capture de la requête DICOS d'un **dossier en attente** (le fichier annoncé n'est pas arrivé dans la session).
2. Les agents **B-CS** (guichets) sont-ils dans ces plannings Quinyx, ou les guichets restent-ils une simple capacité
   (3 PMR light / h pendant l'ouverture) sans agent nommé ?
3. Qui planifie (PACO / RCCA seulement ?) ; les agents de gare consultent-ils quelque chose (feuille PDF, écran) ?
4. Nom et téléphone du voyageur sur la feuille de l'agent : oui (avec `pmr:read`) ou jamais ?
5. Taxi et « chef de bord » : simples destinations d'attribution (comme un agent), d'accord ?

## 6. Questions initiales (archive)

1. **Codes Quinyx des postes de gare** (types de service et sections : « SPI_AM … », « CPI … ») : une capture du planning
   d'un des dix groupes suffit pour les relever (même méthode que pour PACO / RCCA, sans cookie).
2. Garder dans CSM les **horaires des agents de gare sans compte CSM** (prénom, nom, poste, services) : d'accord ? (DPO)
3. La règle **« jamais Mons → Charleroi, jamais Charleroi → zone FMS »** et les couvertures croisées (Mons ↔ Tournai,
   Liège ↔ Verviers, Libramont ↔ Arlon) valent-elles dans les deux sens ? La Louvière-Sud : Mons ou Charleroi ?
4. Chevauchements : un agent peut-il assister **deux PMR du même train** ? Deux trains à la même heure dans la même gare ?
5. Limite B-CS « 3 PMR / heure » : comptée par heure de train ? Un OUT + IN du même voyageur = 1 ou 2 ?
6. Les fenêtres (−15 / +5…) et la correspondance < 30 min (fauteuils compris) sont-elles la norme ?
7. Les **tâches techniques** récurrentes ont-elles une source de référence (roulement) à importer, ou on reprend les modèles Excel ?
8. Trajet **gare secondaire → gare secondaire** : temps réel à saisir ou passage par la base ?
9. Qui planifie (coordinateurs PACO / RCCA seulement ?) et qui consulte (les agents de gare n'ont pas de compte CSM) ?
10. Quand un jour est-il « figé » ? Les PMR de dernière minute arrivent-elles dans « À attribuer » avec une alerte ?
11. Nom et téléphone du voyageur sur la feuille de l'agent : oui (avec `pmr:read`) ou jamais ?
12. Taxi et « chef de bord » : simples destinations d'attribution (comme un agent), d'accord ?
