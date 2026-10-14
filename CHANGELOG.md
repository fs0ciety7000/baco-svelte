# Nouveautés de CSM

Toutes les évolutions de CSM visibles par les agents, de la plus récente à la plus ancienne.
Une version par mise à jour livrée, datée (AAAA.MM.JJ).

## [2026.10.14] — Cycle des bons, trains et nouveautés

### Nouveautés

- **Ressources › Trains** : référentiel des relations de trains (IC, L, P…), avec leurs séries, leurs jours de circulation et la liste de leurs arrêts, mis à jour chaque jour. Par gare : les trains qui s'y arrêtent et ceux qui passent sans arrêt. Par ligne : les relations et les gares desservies.
- **Ressources › Lignes** : toutes les lignes du réseau (plus seulement les 36 lignes du sud), gares dans l'ordre avec leurs points kilométriques, district déduit des gares, liens vers les trains de la ligne et de chaque gare.
- **Bons bus et taxi : trajet tiré du référentiel des trains** : les gares se cherchent aussi par leur nom néerlandais ou un alias (Bergen → Mons) ; les lignes et les arrêts sont proposés d'après les trains qui relient les deux gares (omnibus ou direct), toujours modifiables ; nouveau champ « N° de train » qui remplit le trajet (et l'heure pour un taxi), annulable, repris sur le PDF et l'e-mail.
- **Ressources › Gares** : toutes les gares desservies, avec leur nom néerlandais, leur abréviation, leur pays et leurs lignes. Le district de chaque gare se corrige ici ; les missions DICOS l'utilisent. Les gares frontière (Maubeuge, Aachen, Luxembourg…) se retrouvent aussi sans leur suffixe de pays.
- **Districts des gares** : toutes les gares et PANG (points d'arrêt non gardés), avec 5 districts (DSO, DSE, DCE, DNO, DNE). CSM propose un district pour les gares qui n'en ont pas (gares voisines et lignes communes) : un coordinateur le valide gare par gare ou en masse, ou attribue un district à une sélection. Lignes et type de chaque gare modifiables.
- Les référentiels (trains, gares, lignes) se mettent à jour chaque matin et dès que la SNCB publie un nouvel horaire.
- **Page Nouveautés** : toutes les évolutions de CSM au même endroit, accessible depuis le bas de la barre latérale (ou « Plus » sur mobile). Une fenêtre te résume la dernière mise à jour à ta première connexion après celle-ci.

### Améliorations

- **Nouveau cycle des bons bus et taxi** : « Brouillon / en cours » → « Terminé » (bus démobilisés, heures de démobilisation proposées) → « Envoyé / finalisé ». L'étape « Confirmé » disparaît.
- **« Valider l'envoi »** : un seul bouton prépare le brouillon Outlook (adresse du fournisseur, récapitulatif, PDF joint) et passe le bon en « Envoyé / finalisé ». Le bon est alors verrouillé ; un coordinateur peut le rouvrir.
- **Recherche ⌘K dans tous les modules** : gares (nom, néerlandais, abréviation comme « FMS »), lignes (« L.96 »), relations (« IC14 », « S1 »), n° de train, bons bus et taxi (n° de bon, n° de train, n° TC, gares), fournisseurs, archives, passages à niveau, EBP, procédures et documents, collègues de l'équipe et « Ma journée » à une gare. Les résultats sont rangés par module, 5 au plus par rubrique avec « Voir tout », et tu ne vois que ce à quoi tu as accès.
- **Suivi des bons** : vues « À envoyer », « Aujourd'hui », « En cours » et « Toutes ». L'accueil, la relève et l'écran commun comptent les bons à envoyer.

### Corrections

- Bon taxi : une heure de retour laissée vide n'est plus enregistrée « 00:00 ».

## [2026.10.12] — Missions PMR : statut par prise en charge

### Améliorations

- **Filtre de statut à cases multiples** sur Missions PMR, Groupes et Historique (par exemple « À faire » et « En cours » ensemble).

### Corrections

- **Missions PMR et Groupes** : un trajet n'est plus marqué « réalisé » dès que la gare de départ valide sa prise en charge. Le départ (IN) et l'arrivée (OUT) ont chacun leur statut, coché sur la ligne ; le trajet n'est réalisé que quand les deux le sont.

## [2026.10.11] — Rôles, archives des bons et poste d'exploitation

### Nouveautés

- **Rôles** : Administrateur, Modérateur, PACO/RCCA et Invité, avec des droits par module (lecture, création, modification, suppression). Tes districts (DSO, DSE, DCE) servent de filtres et d'alertes.
- **Archives des bons** (Commandes › Archives) : le PDF de chaque bon finalisé est conservé et retrouvable par référence, trajet ou date.
- **Commandes › Fournisseurs** : sociétés de bus et de taxi, chauffeurs, contacts et lignes desservies.
- **Widget « Fin de service »** : choisis AM, PM, Nuit ou Extra, l'accueil décompte le temps restant.
- **En ligne maintenant** : la barre du haut montre les collègues connectés (statut du jour, district).
- **Documents** : envoi jusqu'à 30 Mo depuis la bibliothèque ou une procédure, visionneuse PDF et images.
- **Missions absentes de DICOS** signalées, et alertes de changement DICOS de dernière minute dans la cloche.

### Améliorations

- **Arrêts au choix dans le bon bus** : toutes les gares des lignes cochées sont proposées, y compris pour un direct (les arrêts d'un direct sont imprimés sur le bon).
- **Champ de gare** plus tolérant (accents, abréviations PtCar) dans les bons, Missions PMR, Groupes et la recherche ⌘K.
- **Accueil « À traiter »** : compteurs et file de ce qui t'attend, par gravité.
- **Nouveaux thèmes Jour, Nuit et Contraste élevé** (les autres thèmes restent disponibles sous « Autres thèmes »).
- Barre du haut sur une ligne, puce des districts du jour, compteurs dans la barre latérale, panneau ancré sur grand écran.
- Filtres par défaut : Missions PMR et Groupes sur tes districts du jour, bons bus sur la semaine.
- Le menu « Annuaire et données » devient **« Ressources »** ; la page EBP est triée par gare.

### Corrections

- L.161 : Schaerbeek retiré de la ligne (il faussait les itinéraires des bons).

## [2026.10.10] — Journal v2, Ma journée, connexion

### Nouveautés

- **Journal v2** : réponses en fil, recherche plein texte, image collée depuis le presse-papiers, mentions de district @DSO, @DSE, @DCE, catégories Service, Perturbation et Groupes.
- **Ma journée** (Opérations) : frise de tes prises en charge PMR, groupes, bus et taxis du jour, avec les retards.
- **Relève de service** : synthèse à copier ou à épingler au Journal.
- **Retards des trains** liés aux missions PMR et aux groupes (badge « +N » ou « Supprimé », alerte dans la cloche).
- **ALEA « encodé »** : chaque bloc se coche une fois saisi, partagé en direct avec l'équipe ; export ALEA commun PMR + groupes.
- **Feuille de route PDF par gare** depuis Ma journée.
- **Notifications du navigateur** (urgences, mentions, retards) quand l'onglet CSM est en arrière-plan.
- **Écran commun** (/tv) pour le bureau : prises en charge, trains en retard, départs et arrivées.
- **Profil** : photo, téléphone professionnel, statut du jour, page d'accueil au choix, sessions ouvertes.
- **Mot de passe oublié** par e-mail et connexion par **passkey** (empreinte, code de l'appareil).
- CSM s'installe comme une application (PWA).

### Améliorations

- ⌘K cherche aussi dans le Journal et les missions PMR / groupes.
- Fraîcheur de la synchro DICOS calculée jour par jour.

## [2026.10.09] — Finition de l'interface, ALEA, extension DICOS

### Nouveautés

- **Export ALEA** (Missions PMR et Groupes) avec la décision « Obligatoire » ou « À vérifier » et le temps d'arrêt tiré d'ATMS (iRail en repli).
- **Groupes DICOS** : onglet dédié et export ALEA de groupe.
- **Page « Extension DICOS »** : téléchargement, installation et connexion de l'extension à ton compte en un clic.
- **Journal** (ex-main courante) : fil continu façon messagerie, districts du jour, perturbations iRail publiées automatiquement.
- Widgets d'accueil **Perturbations** et **Travaux**.
- **Clôture d'un bon** envoyé jamais confirmé, 5 jours après la date de service.

### Améliorations

- 11 thèmes, texte plus lisible, filtres automatiques sur toutes les listes, « Copié » affiché sur place.
- Date de la dernière synchro DICOS affichée sur Missions PMR et Groupes.
- « Masquer les annulées » mémorisé dans ton profil.
- Bon PDF : logo SNCB, agent créateur du bon, heure réelle par bus.
- Tutoiement dans toute l'interface.
