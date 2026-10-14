> **Décisions de l'utilisateur (14 oct. 2026)** : proposition recommandée **validée** avec ces changements :
> - **Trains en direct** va dans **Réseau** (pas dans Opérations) ;
> - **B201** va dans **Ressources** (pas dans Commandes) ;
> - Q5 : **Gares et PtCar restent deux onglets séparés** (pas de fusion) ;
> - Q7 (corrigé par l'utilisateur) : PtCar / EBP / SPI **en lecture seule pour les PACO/RCCA**, **modifiables par admin /
>   sysop seulement**, et de même pour **les gares (districts, lignes, type) et les lignes** (décision suivante de
>   l'utilisateur : « oui, je veux » retirer aux PACO/RCCA la modification des gares et des lignes) ;
> - tout le reste validé (Réseau, Statistiques dans l'Accueil, Journal et Suivi « À envoyer » par défaut, module Équipe
>   supprimé, Mon profil et Extension dans le menu du compte, Admin › Référentiels pour admin / sysop / modérateurs,
>   renommages, nouvelles URL avec redirections).

# Audit de la navigation de CSM et proposition d'arborescence (14 oct. 2026)

> Statut : **proposition à valider**. Rien n'a été modifié dans le dépôt.
> Sources lues : `CLAUDE.md`, `web/CLAUDE.md`, `docs/CSM-V2.md` §2, `docs/DESIGN-DIRECTION.md`,
> `docs/design/REFONTE-UI-2026-10.md`, `docs/design/CADRAGE-ROLES-V3.md`, `web/src/navigation.ts`,
> `web/src/lib/permissions/catalog.ts`, `components/shell/*` (barre latérale, barre du haut, onglets, barre mobile,
> ⌘K, menu du compte), les 55 `page.tsx` de `app/(app)`, les actions serveur des écrans de référentiels.
> Ébauche visuelle : `ebauche.html` et ses rendus `ebauche-1440.png`, `ebauche-390.png` (même dossier).

---

## 1. Inventaire de l'existant

### 1.1 Modules, onglets, routes, droits

Source unique : `web/src/navigation.ts`. Six modules (Accueil compris), plus l'Administration (admin / sysop) et le lien
« Nouveautés » hors module. La barre mobile montre Accueil, Bons, PMR, Opérations, puis « Plus ».

| Module (court) | Onglet | Route | Droit exigé |
|---|---|---|---|
| **Accueil** | (aucun onglet) « À traiter » + widgets | `/` | connecté |
| **Commandes** (Bons) | Bus | `/commandes` | `otto:read` |
| | Taxi | `/commandes/taxi` | `generate_taxi:read` |
| | Suivi | `/commandes/suivi` | `otto:read` |
| | Fournisseurs | `/commandes/fournisseurs` | `otto:read` + `suppliers:read` |
| | Archives | `/commandes/archives` | `archives:read` |
| | Remise B201 | `/commandes/b201` | `b201:read` |
| **PMR** | Missions PMR | `/pmr` | `deplacements:read` |
| | Groupes | `/groupes` (hors `/pmr`) | `pmr:read` |
| | Historique | `/pmr/historique` | `deplacements:read` |
| | Clients | `/pmr/clients` | `pmr:read` |
| | Rampes et matériel | `/pmr/materiel` | `pmr:read` |
| | Extension DICOS | `/pmr/extension` | `deplacements:read` |
| **Opérations** | Trains en direct | `/operations` | `live:read` |
| | Journal | `/operations/journal` | `journal:read` |
| | Ma journée | `/operations/journee` | `journal:read` |
| | Relève | `/operations/releve` | `journal:read` |
| | Carte PN | `/operations/carte-pn` | `carte_pn:read` |
| | Statistiques | `/operations/statistiques` | `stats:read` |
| **Ressources** (Données) | Annuaire | `/referentiels` | `repertoire:read` |
| | Lignes | `/referentiels/lignes` | `timetable:read` |
| | Trains | `/referentiels/trains` | `timetable:read` |
| | Gares | `/referentiels/gares` | `timetable:read` |
| | PtCar | `/referentiels/ptcar` | `ptcar:read` |
| | EBP | `/referentiels/ebp` | `ebp:read` |
| | Procédures et documents | `/referentiels/documents` | `documents:read` |
| **Équipe** | Annuaire de l'équipe | `/equipe` | `team:read` |
| | Planning | `/equipe/planning` | `quinyx:read` |
| | Mon profil | `/equipe/profil` | connecté (sauf Écran) |
| *Hors module* | Nouveautés | `/changelog` | connecté |
| **Administration** (admin, sysop) | Comptes : Utilisateurs · Appareils connectés | `/admin`, `/admin/extension` | `isAdmin` |
| | Supervision : Santé · Journal d'audit | `/admin/sante`, `/admin/audit` | `isAdmin` |
| | Réglages : Tri du Journal · Quinyx · Campagnes | `/admin/journal`, `/admin/quinyx`, `/admin/campagnes` | `isAdmin` |

Anciennes routes déjà redirigées : `/operations/main-courante(/nouveau)` → Journal, `/pmr/groupes` → `/groupes`,
`/equipe/nouveautes` → `/changelog`, `/admin/lignes` → `/referentiels/lignes`.

Doublons d'accès hors des modules : menu du compte (Mon profil, **Mon planning**, **Extension CSM**, Administration),
actions rapides (bon bus, bon taxi, message au Journal), ⌘K (« Aller à » construit depuis la navigation), choix de la
page d'accueil (`lib/home.ts` : 8 pages), raccourcis du manifeste PWA (Missions PMR, Journal, Ma journée, bon bus).

### 1.2 Ce que voit chaque rôle (droits par défaut du catalogue)

| Rôle | Modules visibles | Onglets | Remarques |
|---|---|---|---|
| **PACO/RCCA** (`paco`) | Accueil, Commandes, PMR, Opérations, Ressources, Équipe | 6 + 6 + 6 + 7 + 3 = **28** | Lit tout, crée et modifie (bons, PMR, Journal, contacts, procédures, **PtCar, EBP, PN, districts des gares, lignes**), ne supprime pas. Pas d'Administration. |
| **Modérateur** | Idem | 28 | + suppression partout, modération du Journal, annonces. **Pas d'Administration**, donc aucun accès aux futurs écrans de gestion des référentiels si on les met là sans changer la règle. |
| **Invité** | Accueil, Commandes (Bus, Taxi, Suivi), Équipe (Mon profil seul) | 4 | Un module « Équipe » à un seul onglet (son profil) : module creux. Fournisseurs masqué (`suppliers:read`). |
| **Admin / Sysop** | Tout + Administration (7 pages) | 35 | L'administration ne contient **aucun référentiel**. |
| **Écran** | `/tv` seul | — | Hors sujet ici. |

### 1.3 Ce qui existe déjà comme édition des référentiels

| Référentiel | Collection | Écran | Édition aujourd'hui | Manque |
|---|---|---|---|---|
| PtCar | `ptcar` (1 148) | Ressources › PtCar | **Aucune** (liste + recherche) alors que `ptcar:write/update/delete` existent | créer, modifier, supprimer, contrôle qualité |
| EBP | `ebp_views` (466) | Ressources › EBP | **Aucune** ; filtre « Incomplètes » (seul contrôle qualité) | créer, modifier, supprimer, compléter les vues manquantes |
| Passages à niveau | `level_crossings` (211) | Opérations › Carte PN | Créer et modifier sur la carte (`saveCrossing`) | désactiver / supprimer (champ `active` sans écran), vue tableau, PN sans coordonnées / sans zone |
| Points SPI | `spi_points` (112) | lus dans le détail d'une ligne | **Aucune** (droits `lignes:write/update/delete` sans écran) | tout ; rattachés par **libellé de ligne BACO**, à recaler sur `rail_lines` |
| Gares et districts | `stations` (829) | Ressources › Gares | District, lignes, type ; sélection multiple, « Valider les propositions », export CSV | contrôle qualité dédié (377 sans district, districts BACO flamands douteux), régénération du référentiel par défaut |
| Lignes | `rail_lines` (86) | Ressources › Lignes | Gares d'une ligne, « Rétablir l'automatique » | liste des lignes modifiées à la main, trous signalés, lignes sans km |
| Horaires | `train_*` | Ressources › Trains | « Relancer l'import » (`startTimetableImport`) | état des imports (GTFS, Infrabel, sections) visible ailleurs que dans un onglet de consultation |
| Sociétés (bus, taxi) | `bus_companies`, chauffeurs, taxis | Commandes › Fournisseurs | Complète (sociétés, chauffeurs, contacts, suppression) | doublons, sociétés sans e-mail |
| Contacts | `directory_contacts` (385) | Ressources › Annuaire | Complète (+ détection des doublons) | — |
| Zones PMR | `pmr_zones` | PMR › Rampes et matériel | Complète (`pmr_equipment:manage`) | — |

### 1.4 Incohérences relevées

**Regroupements**

1. **Opérations est un fourre-tout de 6 onglets de natures différentes** : temps réel (Trains en direct), messagerie
   (Journal), synthèses du quart (Ma journée, Relève), un référentiel cartographique (Carte PN) et un tableau de bord
   analytique (Statistiques). Les statistiques couvrent les **bons bus, les taxis et les PMR** : elles ne sont pas
   « opérationnelles ».
2. **La pastille de la barre latérale ne mène pas à ce qu'elle compte.** Opérations affiche « messages non lus au
   Journal » mais ouvre Trains en direct ; Commandes affiche « bons terminés à envoyer » mais ouvre la liste Bus (le
   Suivi « À envoyer » est le 3e onglet). Deux clics là où un suffirait.
3. **Ressources mélange trois choses** : des personnes (Annuaire), des documents (Procédures) et cinq référentiels du
   réseau (Lignes, Trains, Gares, PtCar, EBP). 7 onglets : le dernier passe dans le menu « Plus » de la barre du haut
   dès 1280 px. La Carte PN, référentiel du réseau, est ailleurs (Opérations), et les **points SPI** sont cachés dans le
   détail d'une ligne.
4. **Gares et PtCar se recouvrent** : deux listes de points du réseau (829 gares / PANG / étrangères, 1 148 PtCar),
   l'abréviation PtCar figure déjà dans Gares. L'agent ne sait pas laquelle ouvrir pour « c'est quoi FCR ? ».
5. **Équipe est un module maigre** (annuaire des collègues, planning, profil), et pour l'invité un module à un seul
   onglet (son profil). « Mon profil » et « Mon planning » sont aussi dans le menu du compte.
6. **Extension DICOS** est une page d'installation et de dépannage rangée parmi les écrans de travail PMR ; elle sert
   aussi à ATMS et Quinyx (extension 1.8.0) et le menu du compte l'appelle **« Extension CSM »** : deux noms, un écran.
7. **Les synthèses du jour sont dispersées** : Accueil « À traiter », Opérations › Ma journée, Opérations › Relève,
   écran commun `/tv`. C'est acceptable (publics différents), mais Ma journée et la Relève dépendent de `journal:read`
   alors que leur contenu est surtout PMR et bons.
8. **Commandes : Bus, Taxi et Suivi listent les mêmes bons** (Suivi = bus + taxi par vues). Fournisseurs (référentiel)
   et Archives (rare) ont le même rang que les écrans quotidiens.

**Libellés**

9. **Deux « Annuaire »** (Ressources › Annuaire = contacts externes ; Équipe › Annuaire de l'équipe = collègues).
10. **Deux « Trains »** (Opérations › Trains en direct ; Ressources › Trains = référentiel horaire, relations, séries).
11. **Trois « Journal »** (Journal de l'équipe, Journal d'audit, Tri du Journal) : acceptable en Administration, mais
    « Journal d'audit » et « Tri du Journal » sont voisins dans la barre latérale.
12. Module, libellé court et route divergent : `referentiels` / « Ressources » / « Données » ; `commandes` /
    « Commandes » / « Bons ». Le libellé court mobile « Données » n'est utilisé nulle part ailleurs.
13. « Historique » (PMR) = historique **BACO archivé** de la saisie de la journée abandonnée : le libellé laisse croire à
    l'historique des missions DICOS.

**Profondeur et place**

14. Barre du haut : 6-7 onglets + districts + recherche + présence + cloche + profil → onglets repliés dans « Plus »
    (constat déjà fait par la refonte UI, §1 n° 8).
15. Mobile : Journal = Opérations puis onglet 2 (2 touchers) alors que c'est l'écran le plus consulté de la journée.

**Administration**

16. Aucun référentiel dans l'Administration ; PtCar, EBP et SPI **n'ont aucun écran d'édition** malgré des droits
    d'écriture accordés par défaut aux PACO/RCCA (droits « morts »).
17. L'Administration est réservée à `isAdmin` : un modérateur ne pourrait pas gérer les référentiels si on les y range
    sans revoir la règle ; l'en-tête affiche « Réservé aux administrateurs ».

**Couplages techniques à connaître (risques)**

- `requireRoute(href)` (11 pages) autorise une page **si son href est un onglet visible** : déplacer un onglet sans
  déplacer la page casse sa garde.
- `activeModule()` prend le **plus long préfixe** : tant que Trains en direct vit sur `/operations`, toute page
  `/operations/*` est rattachée à Opérations, même si l'onglet est déclaré ailleurs. Statistiques et Carte PN doivent
  donc **changer de route** pour changer de module.
- Chaque dossier a un `layout.tsx` avec `ModuleLayout moduleId="…"` figé (onglets mobiles) : à dériver du chemin.
- `shell-actions.ts` calcule les pastilles par id de module (`commandes`, `pmr`, `operations`).
- `users.preferences.home` stocke des chemins (`lib/home.ts`) : une valeur ancienne doit être reconvertie.
- Les notifications enregistrées en base portent des liens (`/operations/journal?entree=…`, `/operations/carte-pn?pn=…`) :
  les redirections doivent **conserver la chaîne de requête**.

---

## 2. Tâches clés d'un opérateur et nombre de clics actuel

Desktop depuis n'importe quel écran (clic = sélection d'un module ou d'un onglet ; ⌘K en alternative indiquée).
Mobile : touchers depuis la barre du bas.

| Moment | Tâche | Desktop actuel | Mobile actuel | Avec la recommandation |
|---|---|---|---|---|
| Prise de service | Cocher ses districts du jour | 1-2 (puce de la barre du haut) | 1-2 | inchangé |
| | Voir son horaire / qui travaille | 2 (Équipe › Planning, ou menu du compte) | 3 (Plus › Équipe › Planning) | 2 / 2 |
| | Lire les consignes et la relève | 2 (Opérations › Relève) | 2 | 2 / 2 |
| | Lire le Journal | **2** (Opérations ouvre Trains en direct) | **2** | **1 / 1** |
| | Ouvrir Ma journée | 2 | 2 | 2 / 2 |
| Bons | Créer un bon bus | 2 (Commandes › Nouveau) ou N / ⌘K | 2 | inchangé |
| | Envoyer les bons terminés | **2** (Commandes › Suivi) — la pastille ne mène pas au Suivi | 2 | **1 / 1** |
| | Retrouver le PDF d'un bon clôturé | 2 (Commandes › Archives, souvent dans « Plus ») | 2 | 2 / 2 |
| | Appeler un transporteur | 2 (Commandes › Fournisseurs) ou Ressources › Annuaire (doublon) | 2 | 2 / 2 |
| PMR | Missions du jour | 1 | 1 | 1 / 1 |
| | Export ALEA | 2 (PMR › bouton) | 2 | inchangé |
| | État d'une rampe | 2 (PMR › Rampes et matériel) | 2 | 2 / 2 |
| Incident | Retards / suppression d'un train | 1 (Opérations) | 1 | 2 (Opérations › Trains en direct) ou ⌘K « 1734 » |
| | Message urgent au Journal | 2 + saisie | 2 | **1** + saisie |
| | Trouver un PN et son adresse | 2 (Opérations › Carte PN) ou ⌘K | 2 | 2 (Réseau › Carte PN) / 2 (Plus › Carte PN) |
| | Ouvrir une procédure | 2 (Ressources › Procédures, souvent dans « Plus ») | 3 | 2 / 2 |
| | Code PtCar / gare (« FCR ? ») | 2-3 (Gares ou PtCar ?) ou ⌘K | 3 | 2 (Réseau › Gares et PtCar) / 2 |
| | Contact d'une gare | 1 (Ressources) | 2 | 1 / 2 |
| Fin de service | Relève : copier / épingler | 2 | 2 | 2 / 2 |
| Pilotage | Statistiques | 2 | 2 | 2 (Accueil › Statistiques) / 2 |
| Gestion | Corriger un PtCar / une EBP / un point SPI | **impossible** | impossible | 2 (Admin › Référentiels › écran) |

Gains : les deux tâches les plus fréquentes (Journal, bons à envoyer) passent de 2 à 1 clic ; « Trains en direct »
perd un clic (compensé par ⌘K et le widget « Favoris » de l'accueil) ; la gestion des référentiels devient possible.

---

## 3. Deux propositions

### Proposition A — « Recentrer sans renommer » (ajustement minimal)

```
Accueil
Commandes   Suivi · Bus · Taxi · B201 · Archives · Fournisseurs
PMR         Missions · Groupes · Clients · Matériel · Historique BACO
Opérations  Journal · Ma journée · Relève · Trains en direct · Statistiques
Ressources  Contacts · Procédures · Gares et PtCar · Lignes · Horaires · EBP · Carte PN
Équipe      Collègues · Planning
Administration  + Référentiels
```

- **Avantages** : libellés de modules inchangés (rien à réapprendre), peu de routes déplacées (Carte PN seulement),
  livrable en un lot, pastilles cohérentes (Journal et Suivi en premier).
- **Inconvénients** : Ressources reste un fourre-tout de 7 onglets (personnes + documents + réseau), toujours replié
  dans « Plus » ; Statistiques toujours sous Opérations ; Équipe reste un module de 2 onglets.

### Proposition B — « Par nature de travail » (recommandée)

```
Accueil     À traiter · Statistiques
Opérations  Journal · Ma journée · Relève · Trains en direct          (le quart, le temps réel)
Commandes   Suivi · Bus · Taxi · B201 · Archives · Fournisseurs       (les bons)
PMR         Missions · Groupes · Clients · Matériel · Historique BACO  (l'assistance)
Réseau      Horaires · Lignes · Gares et PtCar · EBP · Carte PN        (consulter le réseau)
Ressources  Contacts · Collègues · Planning · Procédures et documents  (les gens, les documents)
Administration  Comptes · Référentiels · Supervision · Réglages        (gérer)
```

- **Avantages** : chaque module répond à une question unique (« que se passe-t-il ? », « quels bons ? », « quelles
  assistances ? », « où / quoi sur le réseau ? », « qui / quel document ? ») ; 4 à 6 onglets partout (plus de « Plus »
  dans la barre du haut à 1280 px) ; plus de doublon de libellé (Annuaire, Trains) ; tous les référentiels du réseau
  au même endroit, PN compris ; l'invité n'a plus de module creux ; règle simple « consulter dans le module, gérer dans
  l'Administration ».
- **Inconvénients** : deux libellés de module changent (Réseau apparaît, Équipe disparaît dans Ressources) ; Ressources
  change de contenu (risque de confusion la première semaine, à annoncer dans les Nouveautés) ; plus de routes à
  rediriger ; Trains en direct passe en 4e onglet.

*Écartée* : C — « Journal au premier niveau » (module Journal à part, Trains en direct + Ma journée + PN + référentiels
dans un module Exploitation de 7 onglets) : un clic de moins pour le Journal, mais le gain est déjà obtenu par B en
mettant le Journal en tête d'Opérations, et Exploitation redevient un fourre-tout.

---

## 4. Recommandation détaillée (proposition B)

### 4.1 Modules, onglets, libellés, routes

| Module (court mobile) | Onglets dans l'ordre | Route cible | Droit (inchangé) | Ancienne route → redirection |
|---|---|---|---|---|
| **Accueil** | À traiter | `/` | connecté | — |
| | Statistiques | `/statistiques` | `stats:read` | `/operations/statistiques` |
| **Opérations** (Opér.) | **Journal** (défaut, porte la pastille) | `/operations/journal` | `journal:read` | — |
| | Ma journée | `/operations/journee` | `journal:read` | — |
| | Relève | `/operations/releve` | `journal:read` | — |
| | Trains en direct | `/operations/trains` | `live:read` | `/operations` → `/operations/trains` (requête gardée ; le module, lui, ouvre le Journal) |
| **Commandes** (Bons) | **Suivi** (défaut, vue « À envoyer », porte la pastille) | `/commandes/suivi` | `otto:read` *ou* `generate_taxi:read` (aujourd'hui `otto:read` seul : un agent « taxi seul » ne voit pas le Suivi) | — |
| | Bus | `/commandes` | `otto:read` | — |
| | Taxi | `/commandes/taxi` | `generate_taxi:read` | — |
| | B201 | `/commandes/b201` | `b201:read` | — |
| | Archives | `/commandes/archives` | `archives:read` | — |
| | Fournisseurs | `/commandes/fournisseurs` | `otto:read`+`suppliers:read` | — |
| **PMR** | Missions | `/pmr` | `deplacements:read` | — |
| | Groupes | `/groupes` | `pmr:read` | — |
| | Clients | `/pmr/clients` | `pmr:read` | — |
| | Matériel (« Rampes et matériel » en titre de page) | `/pmr/materiel` | `pmr:read` | — |
| | Historique BACO | `/pmr/historique` | `deplacements:read` | — |
| **Réseau** | Horaires (relations, séries, arrêts) | `/reseau/horaires` | `timetable:read` | `/referentiels/trains` |
| | Lignes | `/reseau/lignes` | `timetable:read` | `/referentiels/lignes`, `/admin/lignes` |
| | Gares et PtCar | `/reseau/gares` | `timetable:read` | `/referentiels/gares` ; `/referentiels/ptcar` → `/reseau/gares?type=ptcar` |
| | EBP | `/reseau/ebp` | `ebp:read` | `/referentiels/ebp` |
| | Carte PN | `/reseau/pn` | `carte_pn:read` | `/operations/carte-pn` (garder `?pn=`) |
| **Ressources** | Contacts | `/ressources` | `repertoire:read` | `/referentiels` |
| | Collègues | `/ressources/equipe` | `team:read` | `/equipe` |
| | Planning | `/ressources/planning` | `quinyx:read` | `/equipe/planning` |
| | Procédures et documents | `/ressources/documents` | `documents:read` | `/referentiels/documents`, `/referentiels/documents/voir/:id` |
| *Hors module* | Mon profil (menu du compte) | `/profil` | connecté sauf Écran | `/equipe/profil` |
| | Extension CSM (menu du compte, liens depuis PMR, Planning, profil) | `/extension` | `deplacements:read` ou `quinyx:read` | `/pmr/extension` |
| | Nouveautés | `/changelog` | connecté | — |

Barre mobile (4 + Plus) : **Accueil · Opérations · Bons · PMR · Plus** ; « Plus » liste Réseau, Ressources (avec
leurs onglets, comme aujourd'hui), Nouveautés et l'Administration.

Barre latérale desktop : 6 modules, pastilles inchangées (Commandes = bons à envoyer, PMR = missions impactées,
Opérations = non-lus du Journal) **qui mènent désormais à l'écran qu'elles comptent**.

### 4.2 Administration

| Groupe | Pages | Qui |
|---|---|---|
| Comptes | Utilisateurs · Rôles (lot L4 des rôles v3) · Appareils connectés | admin, sysop |
| **Référentiels** | une entrée « Référentiels » (pastille = nombre d'anomalies) qui ouvre un tableau de bord, puis un écran par référentiel | **admin, sysop, modérateur** (nouvelle clé `referentiels:manage`, voir 4.4) |
| Supervision | Santé · Journal d'audit | admin, sysop |
| Réglages | Tri du Journal · Quinyx · Campagnes | admin, sysop |

En-tête « Réservé aux administrateurs » remplacé par le nom du groupe ; un modérateur ne voit que le groupe Référentiels.

#### Section « Référentiels » : ce que chaque écran doit permettre

Principe : **une fiche, un éditeur, deux portes**. Le même composant d'édition sert dans la consultation (bouton
« Modifier » d'une fiche, pour qui en a le droit, comme aujourd'hui pour les districts, lignes et PN) et dans
l'Administration, qui ajoute la vue tableau dense, la sélection multiple, les imports / exports, le contrôle qualité et
l'historique. Aucune fonction actuelle n'est retirée.

| Écran (`/admin/referentiels/…`) | Liste et édition | Imports / exports | Contrôle qualité (alimente la pastille) |
|---|---|---|---|
| **Tableau de bord** (`/admin/referentiels`) | une carte par référentiel : nombre de fiches, anomalies, dernière modification (qui, quand), dernier import | — | total des anomalies ; lien direct vers chaque filtre |
| **Gares et districts** (`gares`) | district, type (gare / PANG / étranger), lignes, alias ; sélection multiple, « Attribuer à la sélection », « Valider les propositions » (déplacés depuis Réseau, qui garde « Modifier » sur une fiche) | export CSV / JSON (existe) ; « Régénérer le référentiel par défaut » (aujourd'hui script `station-seed.mjs`) | sans district ; proposition en attente ; gare flamande classée DSO / DSE ; gare sans ligne ; sans coordonnées |
| **Lignes** (`lignes`) | gares dans l'ordre, nom, tronçons ; marque « manuelle » ; « Rétablir l'automatique » | export CSV | modifiées à la main (à revoir après import) ; trou kilométrique signalé ; sans km ; sans district |
| **PtCar** (`ptcar`) | créer, modifier (abréviation unique, nom FR / NL, type, ligne, km), supprimer (si non référencé) | import CSV (aperçu des différences avant d'appliquer) ; export | sans nom NL ; abréviation absente d'Infrabel ; gare sans PtCar ; doublon de nom |
| **EBP** (`ebp`) | créer, modifier (ligne, PtCar, vue), supprimer ; filtre « Incomplètes » (existe) | import / export CSV | vue manquante ; PtCar inconnu ; ligne inconnue de `rail_lines` |
| **Passages à niveau** (`pn`) | tableau (n°, ligne, km, adresse, zone, actif) + carte pour placer le point ; créer, modifier (existe), **désactiver / réactiver**, supprimer (modérateur) | import / export CSV | sans coordonnées ; sans zone ; hors de sa ligne (> 1 km du tracé) ; doublon de n° |
| **Points SPI** (`spi`) | par ligne : créer, modifier, retirer (droits `lignes:*` existants) | import / export CSV | ligne BACO introuvable dans `rail_lines` (rattachement par libellé à recaler) ; ligne du district sans SPI |
| **Fournisseurs** (`fournisseurs`) | contrôle seulement : fusionner deux sociétés, désactiver ; l'édition courante reste dans Commandes › Fournisseurs | export CSV | sans e-mail ; doublons (nom proche, même téléphone) ; chauffeurs sans téléphone |
| **Imports** (`imports`) | état des imports quotidiens (GTFS SNCB, Infrabel ponctualité / points / sections) : date, durée, nombres, erreurs ; « Relancer l'import » (déplacé depuis Réseau › Horaires) | — | import en échec ou de plus de 26 h |

Restent hors de l'Administration : Contacts (Ressources, édition quotidienne + doublons existants), Procédures et
documents (Ressources), Zones PMR et matériel (PMR › Matériel), catégories (listes de valeurs, éventuellement plus tard).

### 4.3 Impact sur ⌘K, l'accueil, la barre du haut

- **⌘K** : « Aller à » se met à jour seul (navigation source unique). À changer : `paletteHeading` (« Ressources ›
  Gares » → « Réseau › Gares et PtCar », « Ressources › Trains » → « Réseau › Horaires », PN → « Réseau › Carte PN »,
  Agents → « Ressources › Collègues ») et les liens « Voir tout » ; nouveau groupe « Administration › Référentiels »
  (aller à un écran, et « Modifier le PtCar FCR » pour qui gère). Mots-clés à reporter (« passages à niveau »,
  « abréviations », « main courante »…).
- **Accueil** : reçoit un deuxième onglet (Statistiques) ; liens des widgets et de « À traiter » vers les nouvelles
  routes ; « Bons à envoyer » mène au Suivi. `lib/home.ts` : « Annuaire » → « Contacts », « Trains en direct » →
  `/operations/trains`, et conversion des anciennes valeurs enregistrées (`/operations` → `/operations/trains`,
  `/referentiels` → `/ressources`).
- **Barre du haut** : 4 à 6 onglets par module, donc plus de repli dans « Plus » à 1280 px dans le cas courant.
- **Manifeste PWA** : raccourcis inchangés (Journal, Missions PMR, Ma journée, bon bus).
- **Menu du compte** : Mon profil, Mon planning, Extension CSM, Administration (inchangé, routes mises à jour).

### 4.4 Impact sur les droits

- **Aucune clé de lecture ne change** ; les onglets gardent leur droit.
- `TASKS` du catalogue (regroupement de l'éditeur de rôles) : groupes « Réseau » (PtCar, EBP, PN, lignes / SPI, horaires),
  « Ressources » (contacts, documents, équipe), « Pilotage » (statistiques) pour que l'éditeur de rôles suive les menus.
- **Nouvelle clé `referentiels:manage`** (sensible ; rôles par défaut : modérateur ; admin et sysop l'ont d'office) :
  ouvre la section Administration › Référentiels. Les actions restent soumises aux clés existantes (`ptcar:write`,
  `carte_pn:delete`…), donc les règles PocketBase ne changent pas. `adminModule()` filtre alors les onglets par droit
  au lieu de tout ou rien ; garde de `admin/layout.tsx` par onglet.
- Suivi des commandes ouvert avec `otto:read` **ou** `generate_taxi:read` (corrige le « taxi seul » qui ne voit pas
  le Suivi ; déjà signalé le 11 oct. pour Fournisseurs).
- `catalog.test.ts` (couverture des clés par la navigation), `navigation.test.ts`, `module-tabs.test.ts`,
  `impersonation.test.ts` à adapter.

### 4.5 Redirections (aucun lien cassé)

Une seule liste dans `next.config` (`redirects()`, permanentes, **chaîne de requête conservée** par Next) plutôt que
des pages de redirection : `/operations/statistiques`, `/operations/carte-pn`, `/referentiels`, `/referentiels/:p*`,
`/equipe`, `/equipe/planning`, `/equipe/profil`, `/pmr/extension`, et les redirections existantes (main courante,
`/pmr/groupes`, `/equipe/nouveautes`, `/admin/lignes`) reportées vers leur cible finale (pas de chaîne de deux
redirections). `/operations` (Trains en direct aujourd'hui) : redirection serveur vers `/operations/trains` en gardant
`?gare=` / `?train=` (lien des notifications « train »). Routes API (`/api/referentiels/...`) **inchangées**.
Test : un E2E « anciennes routes » qui visite chaque ancienne URL avec une requête et vérifie la cible.

---

## 5. Questions à faire valider (réponse recommandée en gras)

1. Séparer l'actuel « Ressources » en **Réseau** (horaires, lignes, gares, EBP, PN) et **Ressources** (contacts,
   collègues, planning, procédures), le module Équipe disparaissant ? → **Oui.**
2. Nom du module des référentiels du réseau : **« Réseau »** / « Infrastructure » / « Données ».
3. Statistiques : **onglet de l'Accueil** / onglet de Ressources / Administration (coordinateurs seulement).
4. Opérations ouvre sur : **le Journal** / Trains en direct (comme aujourd'hui).
5. Commandes ouvre sur : **le Suivi « À envoyer »** / la liste Bus.
6. Fusionner Gares et PtCar en un onglet « Gares et PtCar » (filtre par type) ? → **Oui**, au lot 4 (en attendant,
   deux onglets voisins dans Réseau).
7. Qui gère les référentiels dans l'Administration ? → **admin, sysop et modérateurs** ; les PACO/RCCA **gardent** les
   « Modifier » qu'ils ont déjà (district d'une gare, ligne, PN) depuis Réseau.
8. Les droits d'écriture PtCar / EBP / SPI que les PACO/RCCA ont par défaut mais sans écran : les garder (ils
   apparaîtront sur la fiche) ou les réserver aux modérateurs ? → **Les réserver aux modérateurs** (droits
   aujourd'hui sans effet : rien n'est retiré dans les faits).
9. Fournisseurs : **reste dans Commandes** (édition quotidienne) ; l'Administration n'ajoute que doublons, fusion et
   désactivation.
10. Renommer : Trains (référentiel) → **« Horaires »**, Annuaire → **« Contacts »**, Annuaire de l'équipe →
    **« Collègues »**, Historique → **« Historique BACO »**, Remise B201 → **« B201 »** ? → **Oui.**
11. « Mon profil » **seulement dans le menu du compte** (plus d'onglet) et l'extension en page **« Extension CSM »**
    hors module ? → **Oui.**
12. Renommer les URL selon l'arborescence (`/reseau/…`, `/ressources/…`) avec redirections permanentes ? → **Oui**
    (lot 2), ou garder les anciennes URL et ne changer que les menus (moins propre : `/referentiels` = Contacts).

---

## 6. Plan de mise en œuvre

| Lot | Contenu | Effort | Risque | Tests à adapter |
|---|---|---|---|---|
| **L1 — Menus** | `navigation.ts` (modules, ordre, libellés, onglets par défaut, Réseau / Ressources, profil et extension hors module) ; `ModuleLayout` dérivé du chemin (`activeModule`) au lieu de `moduleId` figé ; Trains en direct → `/operations/trains`, Statistiques → `/statistiques`, Carte PN → `/reseau/pn` (obligatoire à cause du plus long préfixe) ; `requireRoute` des pages déplacées ; pastilles ; Suivi ouvert au « taxi seul » | 1,5 j | moyen (gardes `requireRoute`, `activeModule`) | `navigation.test.ts`, `module-tabs.test.ts`, `shell.spec` (modules, barre mobile, « Plus »), `operations.spec` (Trains, Carte PN, Statistiques), `commandes.spec` (onglet par défaut), `ux.spec`, `motion.spec` |
| **L2 — URL et redirections** | routes `/reseau/*`, `/ressources/*`, `/profil`, `/extension` ; `redirects()` centralisé ; liens codés en dur (≈ 15 fichiers : widgets, `todo.tsx`, `ops.ts`, `handover-view`, `live-board`, `pn-board`, `journal-chat`, `supplier-board`, `archive-tools`, `user-menu`, `search-actions`, `manifest`, `lib/home.ts`) ; conversion de `preferences.home` ; `paletteHeading` | 1 j | faible | `palette.spec`, `quinyx.spec`, `extension.spec`, `trains.spec`, `pmr.spec`, `palette.test.ts`, `impersonation.test.ts`, `todo.test.ts` ; nouvel E2E « anciennes routes » |
| **L3 — Admin › Référentiels (socle)** | clé `referentiels:manage` (catalogue, copie des hooks, tests) ; `adminModule` par onglet ; tableau de bord qualité ; Gares (outils de masse déplacés), Lignes, Imports | 2 j | moyen (droits, Administration ouverte aux modérateurs) | `admin.spec` (+ compte modérateur : ne voit que Référentiels), `catalog.test.ts`, `test-rules.mjs` (inchangé si les règles ne bougent pas : à vérifier) |
| **L4 — Écrans d'édition manquants** | PtCar, EBP, PN (tableau, désactivation, suppression), Points SPI, Fournisseurs (doublons, fusion) ; imports CSV avec aperçu ; vérifier les règles `create/update/delete` de `ptcar`, `ebp_views`, `spi_points`, `level_crossings` et ajouter les contrôles manquants ; fusion Gares + PtCar dans Réseau | 4-5 j | moyen (écritures sur des référentiels utilisés par les bons et l'ALEA ; suppression d'une fiche référencée à refuser par hook) | E2E par écran (1440 + 390), `test-rules.mjs` (+ contrôles par collection) |
| **L5 — Finition** | `CHANGELOG.md` (annonce « les menus changent », tableau ancien → nouveau), `CLAUDE.md`, `web/CLAUDE.md`, `docs/CSM-V2.md` §2, `DESIGN-DIRECTION.md` ; captures 1440 / 390 soumises | 0,5 j | faible | `changelog.spec` |

Ordre conseillé : L1 + L2 ensemble en préversion (une seule semaine de réapprentissage), puis L3, puis L4 écran par
écran. Captures desktop et mobile à soumettre avant de généraliser (règle du projet).
