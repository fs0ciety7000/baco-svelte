# Nouveautés de CSM

Toutes les évolutions de CSM visibles par les agents, de la plus récente à la plus ancienne.
Une version par mise à jour livrée, datée (AAAA.MM.JJ).

## [2026.10.14.1] — Nouveaux menus, rôles personnalisés, annuaire refait

### Nouveautés

- **Menus réorganisés** :
  - **Accueil** : À traiter et Statistiques.
  - **Opérations** : Journal (ouvert d'office), Ma journée, B201.
  - **Commandes** : Suivi « À envoyer » (ouvert d'office), Bus, Taxi, Archives, Fournisseurs.
  - **PMR & Groupes** : Missions, Groupes, Clients, Matériel, Historique.
  - Nouveau module **Réseau** : Trains en direct, Horaires, Lignes, Gares, PtCar, EBP, Carte PN.
  - **Ressources** : Contacts, Collègues, Planning, Procédures et documents.
  - Mon profil et l'extension CSM sont dans le menu de ton compte (ta photo en haut à droite).
  - Les anciens liens et favoris mènent automatiquement à la bonne page. Les compteurs de la barre latérale ouvrent directement ce qu'ils comptent (Journal, bons à envoyer).
- **Administration › Référentiels** (administrateurs) : tableau de bord qualité et écrans pour gérer gares et districts, lignes (dont l'ajout d'une ligne absente de l'horaire), PtCar, EBP, points SPI, passages à niveau (désactivation) et mise à jour des horaires.
- **Annuaire refait** : la recherche part dès la première lettre et tolère accents, fautes de frappe et mots dans le désordre ; elle trouve un numéro quel que soit son format (espaces, /, +32), une gare par son abréviation (FMS) ou son nom néerlandais. Résultats classés et surlignés, appel et copie du numéro en un clic, **favoris** et **contacts consultés récemment**, fiche avec numéro en grand. « / » pour chercher, ↑ ↓ pour parcourir, Entrée pour ouvrir.
- **Bon taxi : plusieurs gares « via »** (ajout, ordre, retrait), reprises sur le PDF, l'e-mail et le Suivi.
- **Taxi PMR : « Numéro de dossier »** (format 2026-10-14-0134, remis en forme à la saisie), avec les dossiers DICOS du jour proposés.
- **Supprimer un bon** bus ou taxi : administrateurs et modérateurs, et l'agent qui l'a créé pendant 8 h (« Supprimable encore 7 h 05 »), tant qu'il n'a jamais été envoyé.
- **Bons archivés après un mois** : un bon envoyé ou annulé depuis plus de 30 jours quitte les listes et le Suivi ; il reste dans **Commandes › Archives** (recherche, type, période), et un lien direct vers sa fiche marche toujours (badge « Archivé »).
- **Administration › Rôles** : crée tes propres rôles à partir d'un rôle existant, coche les droits rédigés en phrases simples (« Peut supprimer un bon bus »), vois en direct ce que le rôle peut et ne peut pas faire, compare deux rôles, et annule un changement depuis l'historique. Un rôle encore attribué ne se supprime qu'en réaffectant ses agents.
- **Fiche d'un agent** : ses « ajustements » (droits en plus ou retirés par rapport à son rôle) s'affichent en phrases et s'ajoutent ou se retirent d'un clic, avec le résumé de tout ce que la personne peut faire. La grille technique reste disponible en « Vue experte ».
- **Téléphoner avec Genesys Cloud** : les numéros (annuaire, missions PMR, équipe…) s'ouvrent dans Genesys Cloud au clic (lien `tel:` au format international +32…), comme avant avec Etrali. Il faut l'extension Genesys Cloud du navigateur, avec « Click-to-Dial » activé. Affichage › « Téléphoner en un clic » : choisis Genesys Cloud (par défaut) ou Etrali. Sur mobile, le téléphone compose toujours le numéro.
- **Passages à niveau complets** : tous les PN du réseau (données ouvertes Infrabel), avec leur ligne, leur borne kilométrique (calculée entre les bornes kilométriques Infrabel, à quelques dizaines de mètres près ; « ≈ » quand elle n'est qu'estimée), leur commune et leur adresse. Les PN de l'ancienne carte absents de la liste Infrabel sont désactivés (un administrateur peut les réactiver). La **Carte PN** est refaite : recherche par n°, ligne ou commune, liste et fiche à côté de la carte, filtres par ligne et par district.
- **Ressources › Lignes** : la fiche d'une ligne montre ses passages à niveau, dans l'ordre de la ligne.
- **Zones SPI** : les 19 zones (ex-COI) sont dessinées sur un vrai plan (rues, communes, échelle), en zones semi-transparentes colorées par district (Sud-Ouest, Sud-Est, Centre, Nord-Ouest, Nord-Est) ; chaque gare et chaque PN indique sa zone. Les administrateurs peuvent corriger le nom, la couleur et les gares d'une zone (Administration › Référentiels › Zones SPI).
- **Opérations › B201** (remplace la Relève et l'ancienne B201) : la synthèse de la relève du jour (bons à envoyer, missions à venir, trains en retard, ALEA à encoder, urgences et consignes) et les **notes du jour en Markdown, une page par district** (DSO, DSE, DCE : gras, titres, listes, liens, aperçu), enregistrées automatiquement, chacune avec « Modifié à … par … » et ses versions du jour pour reprendre un ancien texte. La page s'ouvre sur tes districts du jour ; avec deux districts, une page de notes sous l'autre (en onglets sur téléphone). « Copier » et « Épingler au Journal » ne reprennent que la synthèse de la relève, sans les notes ; le PDF de la B201 donne les notes de chaque district demandé, sous un titre par district. Les notes écrites avant (une seule page pour tous) restent lisibles, en lecture seule, sous « Notes communes (avant le 15 oct.) » ; les anciens commentaires par période y sont repris. Les anciens liens (Relève, Ressources › B201) mènent à la nouvelle page.
- **Fournisseurs** : les lignes desservies se choisissent en une fois dans la liste des lignes du référentiel (« L.96 — Bruxelles-Midi – Quévy »), avec recherche ; une ancienne ligne absente du référentiel est gardée et signalée.
- **Missions PMR et Groupes : où en est la journée** : une ligne « Maintenant · 14:32 · prochaine dans 8 min » dans la liste, les prises en charge passées estompées, la prochaine signalée, et une mini-frise 6 h – 22 h (densité par demi-heure, clic pour aller à l'heure, « Aller à maintenant »).
- **Administration › Campagnes** : nouveau modèle « Basculement BACO → CSM (jour J) » proposé par défaut (l'ancienne annonce reste au choix dans la liste « Modèle »), avec bandeau d'en-tête, bouton « Ouvrir CSM », cartes des nouveautés (2 colonnes sur ordinateur, 1 sur téléphone), étapes numérotées et encadrés, aux couleurs du design Signal et lisibles en mode sombre. L'aperçu se regarde en largeur messagerie ou téléphone.
- **Administration › Utilisateurs › fiche : « Voir en tant que »** (administrateurs). Tu vois CSM exactement comme cet agent (menus, onglets, données accessibles), pour vérifier ses droits. Lecture seule stricte, 30 minutes au plus, bandeau « Revenir à mon compte » en haut de chaque page ; chaque début et fin est noté dans le journal d'audit. Impossible sur un autre administrateur.

### Améliorations

- **Nouveau design « Signal »** (par défaut pour tous) : couleurs plus calmes, surfaces séparées par le ton plutôt que par des traits, coins légèrement arrondis, chiffres des compteurs plus lisibles (plus de zéro barré), badges et filtres en pastilles, champs un peu plus hauts avec un halo net au focus, états vides en une ligne. Les thèmes « Jour » et « Nuit » s'appellent désormais « Signal · Jour » et « Signal · Nuit » ; ton choix est gardé.
- **Deux autres styles au choix dans Affichage** : **Quai** (bleu ferroviaire, police IBM Plex, angles presque droits) et **Cabine** (noir et blanc, compact, la couleur réservée aux statuts), chacun en Jour, Nuit ou Automatique. Les autres thèmes restent disponibles sous « Autres thèmes ».
- **Districts des gares corrigés d'après la carte des zones SPI** : Hal → Uccle (Buizingen, Huizingen, Moensberg…) et Bruxelles-Midi en Centre ; Flawinne, Floreffe, Ham-sur-Sambre, Moustier, Ligny, Tilly, Villers-la-Ville et Bierges-Walibi en Sud-Est ; Boitsfort en Centre ; Courtrai en Nord-Ouest ; Tirlemont, Bilzen, Nossegem, Zaventem et Boom en Nord-Est. Les districts corrigés à la main dans CSM ne changent pas.
- **Dates et heures toujours au format belge** (jj/mm/aaaa, 24 h), quelle que soit la langue du navigateur. Tape « 14102026 » ou « 14/10 » pour une date, « 1450 » pour 14:50. Les flèches ↑ ↓ changent le jour, le mois ou l'heure (par pas de 5 minutes). Un calendrier (semaine du lundi, jours fériés belges marqués) s'ouvre au bouton, en feuille du bas sur mobile. Bouton « Maintenant » pour l'heure, et « À confirmer » quand l'heure d'un bon n'est pas encore connue.
- **Listes avec recherche** : société, chauffeur, ligne, gares et catégories se cherchent en tapant (accents et majuscules ignorés), au clavier comme à la souris ; sur mobile, la liste s'ouvre en feuille du bas avec la recherche en haut.
- **Plusieurs districts à la fois dans les filtres** (bons, Missions PMR, Groupes, historique, Ma journée, relève, statistiques, B201, équipe, planning, admin) : des puces DSO / DSE / DCE à cocher, « Tous », et « Mes districts ».
- **Nouvelles listes déroulantes** partout (statut, type, catégorie, rôle…) : même apparence dans tous les thèmes, libellés jamais coupés, clavier complet, feuille du bas sur mobile.
- **Mobile, bons bus et taxi** : une seule action principale en bas de l'écran et un bouton « ⋯ » pour les autres actions ; « Annuler la commande » est séparée en bas de cette liste. La barre prend moins de place.
- Les choix du type « Remplacement / Évacuation / Modif. planifiée » ne sont plus coupés sur petit écran.
- **Périodes « Du / Au »** (bons, Missions PMR, audit, statistiques) : un seul champ avec les raccourcis Aujourd'hui, Demain, 7 jours, Semaine ; « Au » ne peut plus précéder « Du ».
- **Barres de navigation redessinées** : la barre latérale range les modules en « Travail » (Accueil, Opérations, Commandes, PMR & Groupes) et « Référence » (Réseau, Ressources), montre la page ouverte en carte avec un trait de couleur, ses compteurs en pastilles colorées (orange : bons à envoyer, rouge : missions impactées, bleu : messages non lus) et, en bas, l'état des flux (temps réel, DICOS, iRail). En haut : une recherche plus large « Train, gare, bon, agent… » (Ctrl K), des compteurs sur les onglets Suivi, Journal et Missions, et ta photo seule (ton nom et ton rôle sont en tête de son menu). Sur mobile, la barre du bas a des badges ronds et un trait sur l'onglet ouvert. La palette Ctrl K est plus large et plus lisible.
- **Accueil** : « Bonjour » avec la date et ton service du jour (« service PM jusqu'à 22:00 ») ; la file **À traiter** est rangée en trois groupes (**Urgent**, **À faire aujourd'hui**, **Pour information**), avec une icône par nature, le n° de train et son retard, et une action nommée par ligne (« Ouvrir la mission », « Valider l'envoi », « Voir le groupe », « Lire ») ; une seule action principale mise en avant. Les compteurs donnent le détail utile (bon le plus ancien à envoyer, prochaine mission, premier train en retard). Sur grand écran, « Fin de service » et « Prochaines prises en charge » sont à droite de la file ; tes widgets restent en dessous.
- **Missions PMR et Groupes** : les filtres tiennent sur une ligne (période Aujourd'hui / Demain / 7 jours, districts dans un menu, recherche, « Filtres » qui regroupe statuts, dates et « Masquer les annulées », Export ALEA à droite) ; sur téléphone, la première mission arrive beaucoup plus haut. Le sens IN / OUT est affiché dans la gare elle-même, la gare à assister en gras, le retard collé au n° de train.
- **Bons bus et taxi** : sur grand écran, les étapes du bon (Incident, Trajet, Fournisseur…) restent à gauche, en vert quand elles sont complètes et en rouge quand il manque quelque chose ; un clic y mène. L'aperçu à droite ressemble au bon lui-même (billet avec l'itinéraire gare par gare) et la barre d'actions flotte sans cacher le formulaire. Sur téléphone, l'aperçu compact (trajet, date, PDF) passe en tête.
- **Tous les autres écrans passent au nouveau design** (Journal, Ma journée, B201, Réseau, Ressources, Suivi et listes des bons, Archives, Fournisseurs, Clients et Matériel PMR, Administration, profil, Nouveautés) : les filtres tiennent sur une ligne (vue, recherche, districts dans un menu, « Filtres » pour le reste), la recherche part pendant la frappe sans bouton « Afficher », une liste vide est signalée dans son cadre, les chiffres sont plus lisibles et cartes, puces et coins sont les mêmes partout. Dans le Journal, tes catégories et le bouton « Urgent » sont des pastilles, et le champ d'écriture s'entoure d'un halo au focus.
- **Statistiques** : filtres sur une ligne (période, districts, « Filtres » pour les dates, le type et la société, export à droite), totaux en bande de compteurs, graphiques plus nets (bus en bleu, taxis en violet, axes discrets, valeurs écrites) ; le tableau des fournisseurs reste disponible.

- **Administration dans la barre latérale** (administrateurs) : les pages sont accessibles directement, rangées en trois groupes (Comptes, Supervision, Réglages). La section se replie si tu ne t'en sers pas tous les jours. Sur écran moyen, l'entrée « Admin » ouvre un menu avec les mêmes pages. Sur mobile, elles sont dans « Plus ».
- La barre du haut affiche « Administration › page » ; le menu de ton profil garde un seul lien « Administration ».
- **Barre du haut plus légère** sur les écrans de moins de 1536 px : le bouton « + Nouveau » laisse sa place aux onglets. Tu crées toujours un bon depuis la recherche (Ctrl+K › Créer) ou depuis le module. « En ligne maintenant » n'affiche plus que l'icône.
- **Mobile : barre du bas à 5 entrées** (Accueil, Bons, PMR, Opérations, Plus). « Ressources » est dans « Plus », avec Équipe et l'Administration.
- **Notifications selon tes districts du jour, en direct** : perturbations et travaux iRail, retards des trains des missions PMR et des groupes, changements DICOS, urgences et mentions @DSO… arrivent à toute l'équipe concernée, et la cloche ne te montre que celles de tes districts du jour. Si tu changes de district en cours de journée, tu vois aussitôt les alertes de tes nouveaux districts (avant, tu ne recevais que celles du district coché au moment de l'alerte). Sans district choisi, la cloche ne montre que tes alertes personnelles.
- **Mon profil › Notifications** : affiche ou masque chaque catégorie dans la cloche (urgences, mentions, perturbations iRail, travaux iRail, retards des trains, changements DICOS, alertes système). Une catégorie masquée ne déclenche plus de notification du navigateur.
- **Synchro DICOS** : l'heure et le nom affichés sont ceux de la dernière synchro faite par un agent de l'équipe, quel qu'il soit. Si un jour de la période n'a pas été synchronisé depuis plus d'une heure, CSM le signale à part.
- **Pages plus légères et plus stables** : la plupart des écrans chargent environ 40 Ko de moins au premier affichage (les animations passent par le navigateur lui-même), l'arrivée d'une page est plus douce et plus courte, et sur téléphone les filtres ne sautent plus d'une ligne pendant le chargement (Lignes, Horaires, Journal, Ma journée, connexion). L'Historique PMR se lit par pages de 200 missions et la liste des gares s'affiche par 150, avec « Afficher 150 de plus ».

### Corrections

- Missions PMR et Groupes : « Masquer les annulées » est de nouveau visible directement dans la barre de filtres ; en mobile, les boutons ALEA ont un libellé court.
- Les boutons ont la même hauteur que les champs voisins (plus de léger décalage sur une même ligne).
- Missions PMR et Groupes : le tableau n'est plus coupé à droite ; il défile dans son cadre avec l'en-tête, la colonne Train et le bouton Copier toujours visibles.
- Plus d'écran « CSM est momentanément indisponible » au hasard en changeant de module.
- Les listes déroulantes sur mobile ne se referment plus quand on fait défiler leurs options.
- Les districts du jour changés dans un onglet se mettent à jour dans les autres onglets CSM ouverts.
- Bon taxi : l'action principale s'appelle « Terminer » (et non « Terminer (bus démobilisés) »).
- Pendant une mise à jour de CSM (une trentaine de secondes), la page d'erreur réessaie toute seule dès que le serveur répond, au lieu de rester sur « momentanément indisponible ».

### Sécurité

- **Référentiels du réseau** (gares, lignes, PtCar, EBP, points SPI) : en lecture pour l'équipe, modifiables par les administrateurs (ou un rôle qui en reçoit le droit). La carte des passages à niveau ne change pas.
- « Voir en tant que » et gestion des comptes renforcés après un audit : un compte Administrateur ne peut être modifié que par un administrateur, les rôles techniques sont protégés, et un bon déjà envoyé ne peut plus être supprimé par son créateur, même après réouverture.

## [2026.10.14] — Cycle des bons, trains et nouveautés

### Nouveautés

- **Équipe › Planning** : les horaires publiés dans Quinyx (PACO, RCCA, EXTRA) des agents qui ont un compte CSM, par jour (matin, après-midi, nuit, extra, qui est en service) ou par semaine, avec le district de chaque prestation. Ils arrivent par l'extension CSM (version 1.8.0) quand un agent ouvre son planning Quinyx ; ni repos, ni absences, ni coordonnées ne sont repris. Une synchro faite par un agent profite à toute l'équipe : pas besoin que chacun synchronise.
- **Ton district du jour proposé d'après ton horaire Quinyx** (tu peux toujours en choisir un autre), et le widget « Fin de service » suit ton horaire réel.
- **Administration › Quinyx** : groupes Quinyx à lire, table des lieux → districts (Mons et OCC SO → DSO, Namur et OCC SE → DSE) et rattachement des agents Quinyx aux comptes CSM (proposé d'après le nom, à valider).
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
- **Notifications selon tes districts du jour** : la cloche n'affiche plus que les alertes de tes districts du jour (urgences, perturbations, retards des trains de mission, changements DICOS, mentions @DSO…) ; changer tes districts met la cloche à jour aussitôt. Les mentions personnelles et les trains que tu suis restent toujours affichés.
- **Perturbations iRail** : les gares citées sont reconnues aussi par leur nom néerlandais et d'après les districts corrigés dans Ressources › Gares.
- Ressources › Gares, Lignes et Trains : la recherche se lance pendant la frappe, sans Entrée.
- Barre du bas mobile : « Ressources » s'appelle maintenant « Données ».
- **Menu de ton profil** (ta photo en haut à droite) : accès direct à Mon profil, Mon planning et l'extension CSM.
- **Barre du haut** : les onglets qui ne tiennent pas dans la largeur (Administration, par exemple) passent dans un menu « Plus » ; l'onglet ouvert reste toujours visible.
- **Ressources › Lignes : gares modifiables** par les administrateurs, coordinateurs et modérateurs (« Modifier les gares » dans la fiche d'une ligne : ordre, ajout, retrait, embranchements). Une ligne corrigée garde tes corrections aux mises à jour du référentiel ; « Rétablir l'automatique » reprend les gares de l'horaire. Remplace Administration › Lignes et arrêts.
- **Bons bus** : les lignes proposées et l'itinéraire entre deux gares viennent maintenant de Ressources › Lignes (toutes les lignes du réseau, embranchements compris), y compris tes corrections.
- **Trains en direct** : les perturbations de ton district reposent sur les districts de Ressources › Gares.
- **Ressources › Gares** : export de toutes les gares en CSV. Les districts validés par l'équipe deviennent le référentiel de départ de CSM.

### Corrections

- Bon taxi : une heure de retour laissée vide n'est plus enregistrée « 00:00 ».
- **Missions PMR et Groupes** : « Synchronisé avec DICOS il y a… par… » montre la synchro la plus récente, quel que soit l'agent qui l'a faite, avec son heure et son nom (avant, l'heure et le nom pouvaient venir de deux synchros différentes). Un jour de la période resté ancien est signalé à côté. La mention se met à jour en direct pour tout le monde.
- **Administration › Quinyx** : l'adresse du planning copiée telle quelle depuis Quinyx (avec les dates et la vue affichées) est acceptée ; CSM n'en garde que le numéro du groupe.
- **Ressources › Trains** : un train dévié certains jours (travaux) n'affiche plus les gares de son trajet habituel au milieu du détour (IC 943 : Braine-le-Comte suivi des gares de la L.118).
- **Ressources › Lignes** : le filtre par district ne montre plus des lignes de Flandre qui n'ont qu'une ou deux gares dans le district ; une ligne est rattachée aux districts qui portent au moins 30 % de ses gares (DNO et DNE compris), et peut en avoir plusieurs.

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
