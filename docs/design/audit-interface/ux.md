# Audit UX transversal — CSM v2 (9 oct. 2026)

Périmètre : parcours, cohérence entre modules, clics des tâches fréquentes, états, feedback, clavier, mobile, accessibilité.
Sources : captures `audit/*-commandement-{d,m}.png`, `report-commandement.json` (0 débordement horizontal sur 58 vues),
code `web/src/**`, sonde Playwright sur le serveur local. Aucune donnée personnelle n'est reprise ici.

> Note sur les captures : les dates `mm/dd/yyyy` et heures `05:14 AM` viennent de la locale du Chromium de capture
> (`<html lang="fr">` est correct). Sur un poste fr-BE elles s'affichent `jj/mm/aaaa`, 24 h. Pas un défaut.

## Synthèse

1. Le socle est solide : navigation à source unique, aucun débordement en 390 px, barre d'action collante dans la zone du pouce, autosave et brouillons visibles, ⌘K, suivi au clavier (J/K), B201 au clavier (←/→/T).
2. Le principal risque est la **fiabilité perçue** : aucune date de dernière synchronisation sur les Missions PMR et les Groupes (données en lecture seule poussées par l'extension), et aucun `loading.tsx` ni `error.tsx` (navigation sans retour visuel, erreur serveur = page générique).
3. Les **patterns divergent selon les modules** : filtrage automatique dans certains écrans et pas dans d'autres, raccourcis de dates placés au-dessus ou en dessous, bouton « Nouveau » placé à droite, à gauche ou en secondaire, recherche « Filtrer » ou « Rechercher ».
4. Il y a des **files qui s'encrassent** : « À confirmer » contient des bons envoyés il y a 200 jours et plus, et le Journal affiche 36 non lus qu'il faut marquer un par un (surtout des messages iRail automatiques).
5. Les gains rapides sont dans ⌘K (chercher des données, pas seulement des pages), le filtrage automatique partout, les filtres repliés sur mobile et les raccourcis `/` et `N` recommandés par les audits précédents mais non livrés.

---

## Constats

### Critique

| # | Écran | Preuve | Proposition | Effort |
|---|---|---|---|---|
| C1 | PMR › Missions, Groupes | Aucune mention de la dernière synchro DICOS (`assist-board.tsx`, `groupes/page.tsx` : pas d'horodatage de synchro). L'état vide dit « Aucune mission PMR pour ces filtres » même si l'extension n'a rien poussé aujourd'hui. Un opérateur peut donc préparer l'ALEA sur une liste périmée sans le savoir. | Bandeau sous le compteur : « Synchronisé avec DICOS à 07:42 par X · il y a 12 min », en couleur warn au-delà de 30 min (jour courant) ou s'il n'y a aucune synchro du jour. L'état vide distingue « Pas encore de synchro pour ce jour : lancez l'extension DICOS » et « Aucune mission ». Pour la source : `max(updated)` des lignes du jour, ou un enregistrement `app_settings` écrit à l'ingestion. Même principe pour ATMS dans la modale ALEA (déjà indiqué en partie). | S–M |
| C2 | Toutes les pages `(app)` | Aucun `loading.tsx` ni `error.tsx` dans `src/app` (vérifié avec `find`). Un clic dans la barre latérale ne montre aucun retour pendant 350–800 ms en local (plus en prod derrière Cloudflare), d'où des doubles clics. Une exception serveur affiche « Application error » (piège déjà noté dans CLAUDE.md §7). | `(app)/error.tsx` en français (« Le serveur n'a pas répondu », « Réessayer » = `reset()`, lien Accueil), `global-error.tsx`. Ajouter un indicateur de navigation : une barre fine en haut via `useLinkStatus` (Next ≥ 15.3) sur les liens du shell, ou un `loading.tsx` par module (squelette du `PageHeader` et de la table). | S |

### Important

| # | Écran | Preuve | Proposition | Effort |
|---|---|---|---|---|
| I1 | Filtres : Commandes Bus/Taxi, Annuaire, Lignes/PtCar/EBP (`ref-ui.tsx`), Documents, Matériel, Clients | `FormAutoSubmit` n'est branché que sur PMR, Groupes, Historique, Équipe et Admin (grep). Ailleurs, il faut changer un filtre **puis** cliquer « Filtrer ». L'utilisateur a demandé le filtrage automatique le 8 oct. | Ajouter `<FormAutoSubmit />` aux 7 barres restantes. Garder le bouton seulement pour la recherche texte, ou le masquer quand JS est actif. Libellé unique « Rechercher » ou « Filtrer » (Clients dit « Rechercher », les autres « Filtrer »). | S |
| I2 | Commandes › Suivi, Accueil › « À confirmer » | La vue « À confirmer » liste des bons envoyés « il y a 220 j », « 217 j », « 193 j ». Le widget d'accueil n'affiche que la relation et l'**heure d'appel** (`call_time`), sans date : un bon vieux de 7 mois ressemble à un bon du jour (« · 00:00 »). Les « ? → ? » (origine ou destination vides) n'aident pas. | Widget : date de service + âge (« lun. 02/03 · il y a 220 j »). Dans Suivi, âge > 2 j en warn, > 7 j en danger, et une action **« Clôturer sans confirmation »** (terminé ou annulé avec motif), éventuellement en masse pour les coordinateurs. Remplacer « ? → ? » par « Trajet non renseigné ». | S–M |
| I3 | Accueil › Vue du jour | La tuile « À confirmer » mène à `/commandes?statut=envoye` (liste Bus) alors que la vue métier est `/commandes/suivi` (À confirmer, bus + taxi). « Aujourd'hui » n'est pas cliquable. | « À confirmer » → `/commandes/suivi`, « Aujourd'hui » → vue Suivi « Aujourd'hui », « En cours » → vue Suivi « En cours ». Une seule destination par notion. | S |
| I4 | Opérations › Journal | « 36 NON LUS » : chaque message, y compris les perturbations iRail automatiques, demande son propre « Marquer lu ». La pastille des non-lus n'est pas cliquable et elle est masquée en mobile (`hidden sm:inline`). | « Tout marquer lu » (ou « jusqu'ici ») dans l'en-tête. Pastille cliquable qui mène au premier non-lu, visible en mobile. Proposition à valider : les messages `source = irail` ne comptent pas dans les non-lus (ils restent dans la cloche). | S |
| I5 | ⌘K / recherche du topbar | Le placeholder dit « Rechercher, aller à… » mais la palette ne fait que de la navigation, des créations et des thèmes (`command-palette.tsx`). Pour retrouver un contact, un bon n° 315, un train ou une gare, il faut passer par l'onglet puis le champ de recherche. | Groupe « Résultats » alimenté par une Server Action limitée (5 par type) : contacts de l'annuaire (avec téléphone cliquable), bons (n°, relation TC_), PtCar (abréviation ↔ nom), train → Trains en direct. Respecter les droits (`pmr:read` pour les clients). C'est le plus gros gain pour « retrouver un contact ». | M |
| I6 | Mobile : Commandes, Missions PMR, Groupes, Annuaire, Matériel | En 390 px, les filtres sont toujours dépliés : 5 champs, 2 boutons et 4 puces, soit environ 330 px avant le 1er résultat (Commandes, PMR). Le Journal a déjà le bon pattern (« Rechercher et filtrer » repliable). Les audits Commandes, PMR et Référentiels recommandaient des filtres dans un `Sheet` bas sur mobile. | Sous `md`, garder la recherche et les puces de dates. Mettre les autres filtres derrière un bouton « Filtres (2) » (compteur des filtres actifs) dans un tiroir bas ou un panneau repliable, comme dans le Journal. Composant commun `FilterBar` (voir I8). | M |
| I7 | Raccourcis clavier | Recommandés dans les audits Commandes, PMR, Opérations et Référentiels : `/` rechercher, `N` nouveau, `J/K` sur les listes. Seuls J/K (Suivi), ←/→/T (B201), Ctrl+Entrée (formulaires) et ⌘K existent. La sonde confirme que `/` ne fait rien. Aucune aide « ? ». | Hook commun `useListKeys` : `/` donne le focus au champ `q` de la page, `N` lance l'action « nouveau » de l'onglet, `J/K/Entrée` sur toutes les tables à panneau (PMR, Groupes, Annuaire, Matériel, Clients). `?` ouvre une feuille d'aide générée depuis la même source. Garde « hors champ de saisie » déjà écrite dans `b201-keys.tsx`. | M |
| I8 | Cohérence des barres de liste | Raccourcis de dates **sous** le formulaire (Commandes) ou **au-dessus** (PMR, Groupes). Bouton de création : primaire en haut à droite (« Nouveau bon »), primaire à gauche sous les filtres (« Nouveau contact », « Nouvelle rampe », « Nouveau client »), secondaire en haut à droite (« Nouveau compte »). L'export est à droite sur une ligne à lui (ALEA), en icône (Journal) ou absent. | Gabarit unique `ListToolbar` : ligne 1 = compteur, « En direct » et action primaire à droite ; ligne 2 = puces de période ; ligne 3 = filtres (auto) ; export en secondaire à côté du primaire. Les composants existent, il faut les aligner. | M |
| I9 | Commandes : formulaires bus et taxi | Gares saisies par `<datalist>` (`bus-form.tsx:194`). La correspondance tient compte des accents (« Liege » ne propose pas « Liège ») et elle est pauvre sur mobile (iOS : barre de suggestions minimale). Une gare mal orthographiée casse la déduction des lignes et des arrêts. | Remplacer par le `StationCombobox` prévu (recherche insensible aux accents et à la casse, abréviation PtCar acceptée : « LG » → Liège-Guillemins), avec avertissement si la valeur n'est pas une gare connue. | M |
| I10 | PMR › Missions vs Groupes : export ALEA | Deux boutons « Export ALEA » distincts. Un train et une gare qui ont à la fois des PMR et un groupe demandent deux modales et deux copies, alors que la règle métier raisonne par train + jour + gare + sens. | Option « Inclure les groupes » dans la modale des Missions, ou export unique accessible depuis les deux onglets (à valider, Q2). | M |
| I11 | Navigation : onglet par défaut | Cliquer « Opérations » ouvre toujours « Trains en direct » (état vide « Choisissez une gare » sans favori). Le Journal, tâche fréquente, est à 2 clics. Même chose pour PMR (Missions) qui est bien le bon défaut. | Le module rouvre le **dernier onglet visité** (préférence UI déjà persistée par `saveUiPreferences`). Pour Trains en direct sans favori, préremplir avec la gare du district de l'agent. | S |

### Finition

| # | Écran | Preuve | Proposition | Effort |
|---|---|---|---|---|
| F1 | Global | 76 « (s) » (« 5 mission(s) », « 135 fiche(s) », « 1 passager(s) »). | Petit utilitaire `plural(n, "mission")`. | S |
| F2 | Global | Tutoiement isolé (« Tu n'as pas accès aux commandes bus », « Choisis… ») alors que le reste vouvoie (« Ajoutez », « Saisissez »). | Choisir une forme (Q5) et relire les chaînes. | S |
| F3 | Annuaire | Chaque groupe est une table séparée et les colonnes changent de largeur d'un groupe à l'autre (Nom 270 px, puis 365 px…). Le regard saute. | `table-layout: fixed` et colonnes communes (`colgroup`), ou une seule table avec des lignes d'en-tête de groupe. | S |
| F4 | PMR › Missions (mobile) | Sur la carte, la gare d'arrivée est tronquée (« Charleroi-Cent… ») et la gare assistée n'est pas surlignée comme en desktop. Le bouton Copier est collé hors de la carte. | Trajet sur 2 lignes (départ / arrivée) avec surlignage IN/OUT, Copier dans le coin de la carte (cible de 44 px). | S |
| F5 | PMR › Missions (desktop) | La colonne « Heure » répète l'heure déjà présente dans « Trajet ». La colonne District affiche « — » sur toutes les lignes du jeu de test. | Fusionner l'heure dans le trajet, ou garder « Heure » = heure de la gare assistée. Masquer « District » quand le filtre district est actif. | S |
| F6 | Journal (mobile) | Les puces de catégorie défilent sous le bouton « Urgent » (« Tr… » coupé). Le bouton d'envoi désactivé est peu lisible. | « Urgent » en icône dans la barre d'outils du composeur, puces sur toute la largeur avec un fondu de défilement. | S |
| F7 | Matériel | Gares en abréviation seule (FCR, FLZ…). Bien pour les habitués, opaque pour les nouveaux. | `title` ou 2e ligne avec le nom PtCar (référentiel déjà chargé ailleurs). | S |
| F8 | Accueil | Le widget « Raccourcis » fait doublon avec « Nouveau » du topbar en desktop. En mobile, où « Nouveau » n'est pas dans le topbar, il est utile mais se trouve en 3e position. « Personnaliser » prend une ligne entière en haut sur mobile. | Mobile : raccourcis en tête (ou bouton « + » dans le topbar mobile), « Personnaliser » en bas de page. Desktop : widget masqué par défaut. Ajouter un widget « Missions PMR du jour » (compteur + ALEA à vérifier), absent de l'accueil. | S–M |
| F9 | Admin › Utilisateurs | Tri alphabétique sensible aux accents et à la casse (« Cédric » après « Coordination »). | `Intl.Collator("fr", { sensitivity: "base" })` côté serveur. | S |
| F10 | Commandes › Bus | 310 bons et 200 rendus par défaut (page de 8 400 px). Le message « 200 affichées sur 310 » n'apparaît qu'en bas de page. | Vue par défaut « 7 derniers jours + à venir », ou message de limite affiché en haut près du compteur. | S |

---

## Tâches fréquentes : clics actuels

| Tâche | Actuel (desktop) | Avec les propositions |
|---|---|---|
| Commander un bus | Nouveau → Bon bus (2) + saisie + Préparer l'envoi + Télécharger + Confirmer | `N` depuis Commandes (1) ; gares au combobox (moins de corrections) |
| Missions PMR du jour + ALEA | PMR (1) → Export ALEA (2) → Copier les obligatoires (3), puis la même chose dans Groupes (+3) | 3 clics pour tout, avec la date de synchro visible avant de copier |
| Écrire au journal | Opérations (1) → Journal (2) → saisie → Entrée | 1 clic (dernier onglet mémorisé) ou ⌘K |
| Retrouver un contact | Annuaire et données (1) → saisie → Filtrer (2) → appel. Mobile : Plus → Annuaire → saisie → Filtrer (4 gestes) | ⌘K → saisie → Entrée ou appel direct (1 raccourci) |
| Vider « À confirmer » | Ouvrir chaque bon, une transition à la fois | Clôture depuis la ligne, en masse pour les coordinateurs |

## Top 5 des gains de productivité

1. **⌘K qui cherche des données** (contacts, bons, gares, trains) : I5.
2. **Filtrage automatique partout + filtres repliés en mobile** : I1 et I6, un seul composant `ListToolbar` (I8).
3. **Date de dernière synchro DICOS / ATMS** sur Missions et Groupes : C1. Moins de vérifications croisées dans DICOS.
4. **Files propres** : clôture des bons envoyés anciens et « Tout marquer lu » dans le Journal (I2, I4).
5. **Raccourcis `/`, `N`, `J/K` communs + mémorisation du dernier onglet** : I7, I11.

## Questions à poser à l'utilisateur

1. Les messages iRail automatiques doivent-ils compter dans les « non lus » du Journal, ou seulement dans la cloche ?
2. ALEA : un même train + gare + sens avec des PMR **et** un groupe, est-ce un seul encodage ALEA (export commun) ou deux ?
3. Que faire d'un bon « envoyé » jamais confirmé : clôture manuelle (terminé ou annulé), et à partir de combien de jours le signaler ?
4. En mobile, l'Annuaire mérite-t-il un onglet de la barre du bas (à la place de PMR ou d'Opérations pour certains rôles), ou ⌘K / la loupe suffisent-ils ?
5. Tutoiement ou vouvoiement dans l'interface ?
