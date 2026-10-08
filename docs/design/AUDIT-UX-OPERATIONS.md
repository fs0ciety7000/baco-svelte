# Audit UX — module Opérations (trains en direct, main courante, carte PN, statistiques)

> 8 octobre 2026 · Référence métier : v1 SvelteKit (`src/`), non modifiée.
> Données observées : sauvegarde `csm-backup/data` (statistiques uniquement : aucun nom, aucun contenu de message,
> aucune adresse ni coordonnée n'est reproduit) et lecture seule du schéma Supabase (policies, triggers, buckets).
> Tous les exemples sont fictifs.

---

## 1. Cartographie des parcours v1

### 1.1 Chiffres clés (sauvegarde du 8 octobre 2026)

| Indicateur | Valeur | Lecture |
|---|---|---|
| Public potentiel | 29 comptes, dont **14 `otto_agent`** sans accès au live, à la main courante ni à la carte PN | Le module sert ~15 agents (user, moderator, admin, sysop) ; les `otto_agent` ne voient que les statistiques |
| Main courante (`main_courante`) | **33 entrées** restantes, du 5 nov. 2025 au 31 août 2026 | Très peu utilisée |
| Activité réelle (journal d'audit) | 78 créations, **48 suppressions**, 26 modifications, par 8 agents | 61 % des entrées créées ont été supprimées |
| Suppressions | médiane **38 s** après la création, 38 / 48 en moins de 10 min | On supprime et on republie au lieu de corriger (ou on teste) |
| Activité par mois (créations) | nov. 19 · déc. 36 · janv. 14 · fév. 0 · mars 1 · avril 0 · mai → août : 2 par mois | **Quasi abandonnée depuis février 2026** |
| Auteurs des 33 entrées | 6 agents ; le premier signe **64 %** des entrées | Usage porté par une personne |
| Contenu | longueur médiane 186 caractères (36 → 1 433) ; 18 sur plusieurs lignes ; 1 seule utilise le Markdown ; 0 lien | La barre Markdown ne sert pas |
| Thèmes (mots-clés, comptage seul) | « PMR » 10 · « info » 7 · « rampe » 3 · « travaux » 3 · « taxi » 1 · « C3 » 1 | Consignes et informations de service, surtout PMR |
| Urgent | 4 / 33 | Rare |
| Mentions `@` | 2 entrées ; **12 notifications** générées, toutes entre nov. et déc. 2025, toutes lues, lien `journal.html` (ancienne app) | Les mentions ne notifient plus de façon utile |
| Jour / heure (Bruxelles) | vendredi 15 / 33 ; pic 14 h – 16 h (16 / 33) ; 1 entrée entre 0 h et 3 h | Entrées de fin de service |
| Réactions (`log_reactions`) | 22, **toutes 👍** (👀 et ⚠️ jamais utilisés), 5 agents, 17 entrées | Sert d'accusé de lecture |
| Pièces jointes | 0 entrée avec pièce jointe ; **6 fichiers orphelins** dans `documents/journal/` (2 PDF, 4 images) | Fichiers d'entrées supprimées restés dans un bucket **public** |
| Passages à niveau (`pn_data`) | **211 PN** sur **17 lignes** (L.94 : 50, L.132 : 29, L.140 : 18…) | Référentiel stable, jamais modifié depuis l'interface |
| Champs PN | adresse 211 / 211 · BK 211 / 211 · position 210 / 211 · zone 209 / 211 | Bonne qualité |
| Zone PN en base | FTY 95 · FCR 60 · FMS 45 · **FNR 9** · vide 2 | 4 zones, dont FNR inconnue du code |
| Zone PN affichée (recalculée par polygones) | FTY 79 · FCR 52 · FMS 45 · **« Autre » 35** | **35 PN (17 %) mal classés** à l'écran (BUG-4) |
| Numéros de PN | 118 numéros distincts : un même numéro existe sur plusieurs lignes (59 cas) ; suffixes « Bis », « TER » sous 4 graphies | Clé = ligne + numéro, à normaliser |
| `temp_geo_data` (non utilisée par le code) | **251 positions de PN** sur 22 lignes ; 181 recoupent `pn_data` à moins de 200 m ; ~70 PN absents de `pn_data` (5 lignes en plus) | Source plus complète, sans adresse |
| `gare_coordinates` | 180 gares géocodées (Nominatim), août → oct. 2026 | Référentiel des commandes (carte OSRM), pas d'Opérations |
| Statistiques : source | `otto_commandes` (296) + **comptage seul** de `taxi_commands` (3) | Page = tableau de bord des **bus C3** uniquement |
| Bus par mois | déc. 4 · janv. 26 · fév. 23 · mars 28 · avril 16 · **mai 50 · juin 48** · juil. 26 · août 24 · sept. 31 · oct. 20 (au 8) | Pic mai – juin |
| Répartition | 15 rédacteurs, 10 sociétés, 167 trajets distincts ; district du rédacteur : Sud-Ouest 255 · Sud-Est 41 | Le district est celui de l'agent **aujourd'hui** |
| Widgets d'accueil (7 agents ayant une disposition) | Trains 3 · Météo 3 · Raccourcis 3 · Trafic 2 · Journal **1** | Le live intéresse plus que la main courante |
| `remises` (passations de service) | 39 fiches, 12 nov. → 13 déc. 2025, 5 agents, 1 seule avec message ; aucun code ne la lit | Abandonnée ; ancêtre de la B201 (Commandes) |

### 1.2 Tables, services et API concernés

| Élément | Rôle | Détail |
|---|---|---|
| `main_courante` | Entrées du journal | `id`, `user_id` → profiles, `message_content` (texte, Markdown), `is_urgent`, `attachment_path`, `attachment_type` (`image` / `file`), `created_at`, `updated_at`. Trigger d'audit + trigger `handle_new_mention_notification` |
| `log_reactions` | Réactions | `log_id`, `user_id`, `emoji`, unique (`log_id`, `user_id`) : une réaction par agent |
| `notifications` | Cloche (shell) | `user_id_target`, `title`, `message`, `type`, `link_url`, `is_read` ; écrite par le trigger de mention et par `social.service.js` (gamification retirée) |
| Storage `documents/journal/*` | Pièces jointes | Bucket **public** (`getPublicUrl`), partagé avec les procédures |
| `pn_data` | Passages à niveau | `id`, `ligne_nom` (« L.94 »), `pn` (« PN 12 Bis »), `bk` (« BK 12.345 »), `adresse`, `geo` (texte « lat,lon »), `zone` |
| `temp_geo_data` | Import brut de positions PN | `denomination` (« L-94-12 »), `position` (texte) ; RLS activée par le hotfix ; à ne pas migrer telle quelle (BACKEND-DECISION) |
| `spi_data`, `ligne_data` | Zones SPI, gares par ligne | Lus par `/lignes` (Référentiels) ; `pn_data` y est aussi affiché (« Adresse PN ») |
| `otto_commandes`, `taxi_commands`, `profiles` | Sources des statistiques | Tout est chargé dans le navigateur puis agrégé (`ottoStats.js`) |
| `stats.service.js` | — | **Code mort** (jamais importé) |
| API **iRail** `api.irail.be` | `stations`, `liveboard`, `vehicle`, `composition`, `disturbances` | Appelée **directement par le navigateur** (`irail.service.js`, `WidgetTrains`, `WidgetTraffic`), sans User-Agent dédié ni cache |
| Tuiles **CARTO** `basemaps.cartocdn.com` | Fonds de carte vectoriels (styles dark-matter / positron) | `Map.svelte` (maplibre-gl) |
| Tuiles **memomaps** | Couche « trafic » raster | Codée mais désactivée sur la carte PN (`showTraffic={false}`) |
| **Google Maps** | Itinéraire (lien `dir/?api=1`), Street View (**iframe** `output=svembed`, non documenté), lien dans la popup | Navigation externe + cadre intégré |
| **flatpickr** | Sélecteur de date du journal | Chargé depuis `cdn.jsdelivr.net` **et `npmcdn.com`** à l'exécution |
| **Open-Meteo** | Widget météo | Hors périmètre (accueil) |

**Accès en base (lecture des policies le 8 oct., après le hotfix) :**

| Table | Lecture | Écriture |
|---|---|---|
| `main_courante` | tout compte connecté | création par l'auteur ; modification par l'auteur ou un admin ; suppression par l'auteur ou un admin ; **policy `ALL` pour `is_staff()` (admin + moderator)** : un moderator peut tout supprimer alors que l'UI v1 lui refuse `journal:delete` |
| `log_reactions` | tout compte connecté | ses propres réactions |
| `notifications` | ses notifications | **insertion par n'importe quel compte, pour n'importe qui** (`with check true`) : notifications forgeables |
| `pn_data` | tout compte connecté | **UPDATE ouvert à tout compte connecté** (deux policies `using true`), y compris `reader` et `otto_agent` ; création / suppression admin |
| Storage `documents` | **public** (URL sans connexion) | upload : admin + moderator seulement depuis le hotfix → **un `user` ne peut plus joindre de fichier** |

### 1.3 Trains en direct (`/live`)

Un seul écran : en-tête « Live · Emma live » → bascule **Par gare / Par train** → formulaire → résultats.

| # | Étape / champ | Défaut | Réf. |
|---|---|---|---|
| 1 | Ouverture : contrôle `live:read` **côté navigateur** puis chargement de la liste complète des gares iRail (~600) | mode « Par gare » | `live/+page.svelte:78-98` |
| 2 | Par gare : Gare (autocomplétion maison dès 2 lettres, 8 suggestions), Date, Heure, Départs / Arrivées, « Rechercher » | date = aujourd'hui **en UTC**, heure = heure locale | `:36-46, 91-92, 376-460` |
| 3 | Tableau : train, destination / origine, heure (+ heure estimée), retard (badge coloré), voie (« ⚠ modifiée »), statut (Parti, Extra, point animé) | — | `:515-610` |
| 4 | Par train : Numéro (« IC 2134 » → `BE.NMBS.IC2134`), Date | date **en UTC** | `:39-40, 106-127`, `irail.service.js:35-39` |
| 5 | Résultat train : retard max, places 1re / 2e, itinéraire arrêt par arrêt (passé, actuel, à venir, voie, suppression) | — | `:637-800` |
| 6 | Composition : rames, voitures, places, climatisation, toilettes, vélos, **section PMR**, prises | — | `:804-975` |
| 7 | « Auto-refresh » : relance toutes les 30 s avec compte à rebours | désactivé | `:160-183` |

**Cas courant** (« ce train est-il à l'heure à Mons ? ») : taper la gare, choisir, Rechercher, parcourir le tableau
(**aucune ligne n'est cliquable**), puis basculer en « Par train » et retaper le numéro : ~8 gestes.
Aucun favori, aucun lien vers une commande de bus, aucune vue des perturbations sur cet écran (elles sont dans un
widget d'accueil séparé).

### 1.4 Main courante (`/journal`)

Fil chronologique inversé, 15 entrées par page (« Voir plus anciens »), compositeur en tête.

| # | Étape / champ | Défaut | Réf. |
|---|---|---|---|
| 1 | Filtres : recherche texte (**masquée sous 1 024 px**), auteur (**masqué sous 640 px**), date (flatpickr) | — | `journal/+page.svelte:328-364` |
| 2 | Compositeur (`journal:write`) : barre Markdown, texte, `@` → suggestions (5), emoji, pièce jointe (sans contrôle de type ni de taille), « Urgent » | — | `:369-432` |
| 3 | « Publier » : upload dans `documents/journal/`, insertion, rechargement complet du fil | — | `:158-183`, `journal.service.js:44-67` |
| 4 | Carte d'entrée : avatar, nom, date, « (Modifié) » si > 60 s, badge « Urgent » clignotant, contenu Markdown nettoyé (`renderMarkdown`), pièce jointe (image ou lien) | — | `:440-500` |
| 5 | Modifier / Supprimer : icônes **visibles au survol uniquement** ; modification en modale (texte + urgent) | — | `:470-479, 529-560` |
| 6 | Réactions 👍 👀 ⚠️ (une par agent, bascule) | — | `:214-241, 500-512` |

Pas de temps réel (le fil ne bouge qu'au rechargement), pas d'épinglage, pas de lien vers une commande, une
prestation ou un PN, pas d'export du service.

### 1.5 Carte PN (`/carte-pn`)

| # | Étape / champ | Défaut | Réf. |
|---|---|---|---|
| 1 | Chargement de tous les PN ; **zone recalculée** dans le navigateur par 3 polygones codés en dur (FTY, FMS, FCR), sinon « Autre » | — | `pn.service.js:4-29, 62-87` |
| 2 | Bouton « Plan / Satellite » : bascule en réalité entre deux fonds **sombre / clair** et recrée la carte | sombre | `carte-pn/+page.svelte:181-184, 249-259` |
| 3 | Panneau gauche : recherche (PN, adresse, ligne), puces Zones (4), puces Lignes (17, grille 3 colonnes), « Tout masquer » | tout affiché | `:194-244` |
| 4 | Carte maplibre (clusters, polygones de zones) ; clic sur un point → popup HTML (ligne, PN, BK, adresse, lien Google Maps) | — | `Map.svelte:252-282` |
| 5 | Liste de cartes sous la carte (500 px) : clic → la carte vole vers le PN ; « Trajet » ; « Vue » | — | `:262-301` |
| 6 | « Trajet » : Google Maps en voiture **depuis le dépôt de la zone** (3 dépôts codés en dur, « Autre » → Mons) | — | `:18-23, 131-157` |
| 7 | « Vue » : modale avec Street View en **iframe Google** | — | `:307-338` |

**Cas courant** (« quel est l'accès au PN 12 de la L.94 ? ») : taper « 12 », repérer la bonne ligne parmi les
homonymes, cliquer la carte, « Trajet » : ~4 gestes, mais la page complète fait plus de 2 écrans en mobile.

### 1.6 Statistiques (`/stats`)

| Zone | Contenu | Réf. |
|---|---|---|
| Filtres | Raccourcis 7 j / 30 j / mois / année / tout ; dates ; district ; société ; rédacteur ; type C3 ; statut | `stats/+page.svelte:31-96` |
| Indicateurs | Commandes, bus, **taux de clôture** (= statut `envoye`), sociétés, rédacteurs, bus par commande | `ottoStats.js:29-48` |
| Mois record | mois et volume | `stats/+page.svelte:140-148` |
| Courbe | volume par jour / semaine / mois selon la plage (Chart.js) | `ottoStats.js:51-80` |
| Anneaux | par district, par type C3, par statut | `:169-224` |
| Classements | **Top sociétés**, **Top rédacteurs** (nom + district), Top trajets | `:227-310` |

Tout est calculé dans le navigateur sur l'ensemble des commandes. Aucun export, aucune donnée taxi au-delà du
comptage, rien sur les PMR, la main courante ou les délais (envoi → confirmation).

### 1.7 Widgets d'accueil liés

| Widget | Source | Comportement |
|---|---|---|
| Trains (`WidgetTrains`) | iRail `liveboard` | une gare favorite en `localStorage`, filtre local, chargement unique |
| Trafic (`WidgetTraffic`) | iRail `disturbances` | onglets Incidents / Travaux, tout le réseau belge (non filtré par district) |
| Journal (`WidgetJournal`) | `main_courante` (15 dernières) | recherche locale |
| v2 (`web/src/app/(app)/dashboard.tsx:56-57, 141-156`) | — | « Trains perturbés » et « Main courante » prévus, aujourd'hui en état « Bientôt » |

### 1.8 Périmètre : pages voisines inspectées

| Page v1 | Contenu | Module v2 |
|---|---|---|
| `/operationnel` | Procédures (base de connaissances, versions, documents liés) — `procedures`, `procedure_versions` | **Référentiels** → « Procédures et documents » (malgré son nom, pas Opérations) |
| `/planning` | Planning et congés — `planning`, `leave_requests` | **Équipe** |
| `/lignes` | Contenu des lignes (gares, **adresses PN**, zones SPI) — `ligne_data`, `pn_data`, `spi_data` | **Référentiels** ; il lira la collection PN créée par Opérations |
| `/ptcar` | Abréviations PtCar — `ptcar_abbreviations` | **Référentiels** |
| `/otto` | Bons de commande bus | **Commandes** (livré) |
| `/notifications` + cloche | Liste des notifications | **Transverse (shell)** ; la collection est créée avec Opérations car la main courante est son seul émetteur métier (Q8) |
| `team_board`, `WidgetShift`, `WidgetNotepad` | Tableau d'équipe, service, bloc-notes | **Équipe** / accueil |
| `remises` | Passations abandonnées | Non migrée (archivée), voir Commandes / B201 |

---

## 2. Bugs, risques et frictions

### 2.1 Bugs et risques v1 (numérotés)

Constatés dans le code gelé et le schéma (non corrigés : la v1 n'est pas modifiée).

| # | Bug / risque | Effet | Preuve |
|---|---|---|---|
| BUG-1 | **XSS stocké par la carte PN** : la popup est construite par `setHTML` avec l'adresse, le n° et le BK **sans échappement**, et `pn_data` est **modifiable par tout compte connecté** | Un compte `reader` peut injecter du script exécuté chez chaque agent qui ouvre la popup (gravité élevée) | `Map.svelte:259-271, 294-296`, policies `update_zone_pn` et « Permettre update aux utilisateurs connectés » |
| BUG-2 | **Pièces jointes du journal publiques et orphelines** : bucket `documents` public, URL permanente ; la suppression d'une entrée laisse le fichier (6 orphelins) | Fichiers accessibles sans connexion, jamais purgés | `journal.service.js:48-56, 88-114`, `storage.buckets`, sauvegarde |
| BUG-3 | **Pièce jointe impossible pour un `user`** depuis le hotfix (upload `documents` réservé admin + moderator), message d'erreur brut | Publication refusée si un fichier est joint | `journal.service.js:51`, policies `storage.objects` |
| BUG-4 | **Zone PN recalculée à tort** : les polygones écrasent la zone en base ; 35 PN (17 %) passent en « Autre », dont les 9 FNR et 16 FTY | Filtre de zone faux, **itinéraire calculé depuis Mons** au lieu du bon dépôt | `pn.service.js:66-79`, `carte-pn/+page.svelte:141`, données |
| BUG-5 | **Dates par défaut en UTC** (live : date de gare et de train ; stats : raccourcis) alors que l'heure est locale | Entre 0 h et 2 h, le live affiche la veille à l'heure saisie ; le raccourci « mois » inclut le dernier jour du mois précédent ; les semaines du graphe sont étiquetées au dimanche | `live/+page.svelte:40, 44`, `stats/+page.svelte:81-88`, `ottoStats.js:51, 62-67` |
| BUG-6 | **Filtre de date du journal en UTC** (`AAAA-MM-JJT00:00:00` sans fuseau) | Les entrées de 0 h à 2 h (heure belge) tombent le jour précédent | `journal.service.js:19-21` |
| BUG-7 | **Recherche du journal sans délai ni annulation**, une requête par frappe, résultats concaténés | Réponses dans le désordre : fil incohérent ou doublons | `journal/+page.svelte:333`, `:128-154` |
| BUG-8 | **Notifications forgeables** : insertion ouverte à tout compte pour n'importe quel destinataire | Faux messages dans la cloche d'un autre agent | policy « Allow authenticated users to insert notifications for anyone » |
| BUG-9 | **Mentions cassées** : le lien de notification pointe vers `journal.html` (ancienne app) ; aucune notification depuis déc. 2025 | La mention ne mène nulle part | trigger `handle_new_mention_notification`, données |
| BUG-10 | **Droits incohérents** : l'UI refuse la suppression aux moderators, la base l'autorise (`is_staff()` en `ALL`) ; la modification d'une entrée d'autrui dépend de `users:manage` côté UI, du rôle admin côté base | Comportement différent selon le chemin | `journal/+page.svelte:252-262`, policies `main_courante` |
| BUG-11 | **Scripts tiers chargés à l'exécution** (flatpickr depuis jsDelivr et `npmcdn.com`, sans version ni intégrité) | Dépendance réseau et risque de chaîne d'approvisionnement ; sélecteur de date vide si le domaine est filtré | `journal/+page.svelte:302-306` |
| BUG-12 | **Statistiques fondées sur l'ancien statut** : « taux de clôture » = `envoye` (98 %), district = district **actuel** du rédacteur | Indicateur sans signification ; l'historique change quand un agent change de district | `ottoStats.js:20, 32-33` |
| BUG-13 | Libellé « Emma live » alors que les données viennent d'iRail | Confusion sur la source et sa fiabilité | `live/+page.svelte:307-315` |

### 2.2 Frictions classées par gravité

#### Bloquant (erreur métier, action impossible)

| # | Friction | Preuve |
|---|---|---|
| B1 | Itinéraire PN depuis le mauvais dépôt pour 17 % des PN (BUG-4). | `carte-pn/+page.svelte:141` |
| B2 | Main courante **inutilisable sur mobile** : recherche et filtre auteur masqués, actions au survol. | `journal/+page.svelte:328, 339, 470` |
| B3 | Live : une ligne du tableau de gare ne mène pas au train ; il faut retaper le numéro. | `live/+page.svelte:149-210` |

#### Coûteux (temps perdu à chaque usage)

| # | Friction | Preuve |
|---|---|---|
| C1 | Pas de gares favorites dans `/live` (le favori du widget est en `localStorage`, une seule gare). | `WidgetTrains.svelte:51, 84` |
| C2 | Auto-refresh de 30 s manuel, **non suspendu onglet caché**, relance la recherche complète. | `live/+page.svelte:171-183` |
| C3 | Perturbations iRail absentes du live, non filtrées par ligne ou district dans le widget. | `WidgetTraffic.svelte:28-46` |
| C4 | Main courante sans temps réel : il faut recharger pour voir l'entrée d'un collègue. | `journal/+page.svelte:128-154` |
| C5 | Correction = supprimer puis republier (48 suppressions, médiane 38 s) : l'édition est cachée au survol et en modale. | données, `:470-479` |
| C6 | Aucun lien d'une entrée vers une commande, une prestation PMR, un train ou un PN ; aucun export du service. | `journal.service.js` |
| C7 | Carte PN : la page empile filtres, carte et liste (≈ 2,5 écrans en mobile) ; changer de fond recrée la carte et perd le zoom. | `carte-pn/+page.svelte:192-262, 249` |
| C8 | ~70 PN connus (`temp_geo_data`) absents de la carte. | données |
| C9 | Statistiques limitées aux bus ; aucun export ; tout est rechargé et recalculé dans le navigateur. | `stats/+page.svelte:59-71` |

#### Gênant (qualité, confiance, accessibilité)

| # | Friction | Preuve |
|---|---|---|
| G1 | Classement « Top rédacteurs » visible de tous, y compris des `otto_agent` : récompense le volume, comme le classement retiré (décision du 8 oct.). | `stats/+page.svelte:254-275` |
| G2 | Couleurs en dur (hex, palettes Tailwind), badges clignotants (« Urgent », point « live ») en boucle. | `journal/+page.svelte:454`, `live/+page.svelte:204-207` |
| G3 | Tableaux de gare en défilement horizontal à 390 px ; libellés 10 px en capitales. | `live/+page.svelte:548`, `carte-pn/+page.svelte:270, 282` |
| G4 | Bouton « Satellite » qui n'affiche pas de satellite. | `carte-pn/+page.svelte:183` |
| G5 | Street View par iframe Google non documentée (`output=svembed`) : peut cesser sans prévenir. | `carte-pn/+page.svelte:318-326` |
| G6 | Réactions 👀 et ⚠️ jamais utilisées ; seul 👍 sert (accusé de lecture implicite). | données |
| G7 | Numéros de PN en 4 graphies (« Bis », « 9Bis », « TER ») ; tri numérique qui ignore les suffixes. | données, `pn.service.js:82-86` |
| G8 | Chart.js importé statiquement dans `ChartCanvas` (convention v1 : imports lourds dynamiques). | `ChartCanvas.svelte:3` |

---

## 3. Parcours cibles v2

Principe : **le navigateur ne parle qu'au domaine CSM**. iRail, les tuiles et tout service externe passent par le
serveur Next (cache, User-Agent, limites de débit). Le temps réel métier (main courante, notifications) passe par le
relais SSE `/api/events`. Point d'entrée : `Opérations` → onglets
`Trains en direct | Main courante | Carte PN | Statistiques` (`web/src/navigation.ts:87-108`), action rapide
« Entrée de main courante » (`:186-190`). Chaque `page.tsx` garde `requirePermission` (stubs déjà en place).

### 3.1 Trains en direct (`/operations`)

| Zone | Contenu |
|---|---|
| En-tête | `PageHeader` eyebrow `// OPÉRATIONS · IRAIL · MIS À JOUR 14:32`, indicateur « En direct » (`live-dot`), source « iRail (données SNCB) » |
| Barre de recherche unique | `StationCombobox` iRail **ou** n° de train dans le même champ (« IC 2134 », « 2134 » reconnus) ; Date et Heure repliées (« Maintenant » par défaut, Europe/Brussels) ; Départs / Arrivées en `Segmented` |
| Favoris | Puces des gares favorites de l'agent (préférences), réordonnables ; « ☆ Suivre cette gare » |
| Tableau de gare | Heure prévue, **heure estimée**, retard (`StatusBadge` : à l'heure / +n min / supprimé), train, destination, voie (« modifiée » en `warn`), occupation si fournie ; lignes **cliquables** → panneau train |
| Panneau train | Résumé (retard max, origine → destination), itinéraire arrêt par arrêt, composition (section PMR mise en avant), actions : « Suivre ce train », **« Commander un bus de substitution »** (`/commandes/nouveau?origine=…&destination=…&relation=…`, pré-remplissage à ajouter), « Noter dans la main courante » (entrée liée au train) |
| Onglet « Perturbations » | `disturbances` iRail, Incidents / Travaux, **filtrées par défaut sur les lignes et gares du district de l'agent** (référentiel `line_stations`), « Tout le réseau » en option |

- Rafraîchissement : toutes les 30 s **seulement onglet visible** (`poller`), réponse servie par le cache serveur (TTL
  20 s liveboard / véhicule, 5 min perturbations, 24 h gares) ; bouton « Actualiser » ; horodatage de la donnée.
- Erreur iRail : bandeau `warn` « iRail ne répond pas — dernière donnée 14:31 », la dernière réponse reste affichée.
- **Mobile 390 px** : champ de recherche collant, favoris en puces défilables, tableau → `ListCard` (heure en mono,
  retard, train, destination, voie) ; le panneau train devient une page plein écran ; cibles 44 px.
- Raccourcis : `/` rechercher, `F` suivre / ne plus suivre, `R` actualiser, `J/K` ligne, `Entrée` ouvrir, `Échap` fermer.

### 3.2 Main courante (`/operations/main-courante`)

Principe : une **main courante d'exploitation** (événements horodatés, liés aux objets métier), pas un fil social.

| Zone | Contenu |
|---|---|
| En-tête | `DayPicker` (← / →, Aujourd'hui), filtre catégorie en puces, recherche serveur (délai 250 ms, annulation), auteur, « Urgentes / épinglées » |
| Épinglées | Bandeau des consignes épinglées en cours (« jusqu'au 10-10 à 6 h »), avec « Lu » |
| Fil du jour | `Timeline` : heure de l'**événement** (modifiable, distincte de l'heure de saisie), catégorie (`Incident`, `PMR`, `Commande`, `Travaux`, `Consigne`, `Info`), texte, liens (« Bon C3 n° 1234 », « Prestation 16:42 », « IC 2134 », « PN 12 · L.94 »), pièces jointes, auteur, « Modifiée » avec historique, compteur « Lu par 4 » |
| Compositeur | `/operations/main-courante/nouveau` en mobile, panneau en desktop : catégorie (`Segmented`), heure (maintenant), texte (`Textarea` auto-extensible, texte simple + liens automatiques), `@` mention (combobox des agents actifs), lier un objet (combobox commande / prestation / train / PN), urgent, épingler jusqu'à…, 3 fichiers max (images, PDF, 5 Mo) |

- **Temps réel** : les nouvelles entrées arrivent par SSE (sujet `ops_log`), flash ambre, sans recharger.
- Corriger plutôt que supprimer : « Modifier » visible en permanence pour l'auteur (historique conservé) ; « Retirer »
  (avec motif) remplace la suppression, réservé à l'auteur dans les 15 min puis aux coordinateurs (Q4).
- « Lu » remplace les réactions (Q5) ; une entrée urgente non lue apparaît dans la cloche des agents en service.
- Export du service : PDF et CSV de la journée ou d'une période (sans pièce jointe), généré côté serveur.
- **Mobile** : cartes, catégorie en pastille, actions dans un menu `…` toujours visible, bouton « + » au-dessus de la
  barre d'onglets ; filtres dans un `Sheet` bas.
- Raccourcis : `N` nouvelle entrée, `/` rechercher, `←/→` jour, `T` aujourd'hui, `U` urgentes, `Ctrl+Entrée` publier.

### 3.3 Carte PN (`/operations/carte-pn`)

| Zone | Contenu |
|---|---|
| Recherche | Un champ : « 12 », « L.94 », « PN 12 L94 » ou une rue ; résultats groupés par ligne (homonymes lisibles) |
| Filtres | Zones (puces, **zone stockée** en base) et lignes (combobox multiple) ; état dans l'URL (`?ligne=L.94&pn=12`) partageable |
| Liste | Table dense : ligne, PN, BK, adresse, zone ; clic → fiche en panneau |
| Carte (desktop) | Colonne droite, chargée à la demande (import dynamique) ; clusters ; fond clair / sombre suivant le thème |
| Fiche PN | Ligne, n°, BK, adresse, zone et dépôt, coordonnées (copier), **Itinéraire** (Google Maps depuis le dépôt de la zone, ou « depuis ma position » sur mobile), **Street View** (lien externe officiel, nouvel onglet), « Noter dans la main courante », lien « Contenu de la ligne » (Référentiels) |

- **Mobile 390 px** : **liste d'abord** (cartes deux lignes), bascule `Segmented` Liste / Carte ; la carte occupe
  l'écran sous l'en-tête ; fiche en `Sheet` bas ; « Itinéraire » ouvre l'application de navigation du téléphone.
- Sans carte (tuiles indisponibles) : la liste et les liens restent utilisables.
- Raccourcis : `/` rechercher, `M` liste / carte, `Entrée` ouvrir la fiche, `I` itinéraire.

### 3.4 Statistiques (`/operations/statistiques`)

| Zone | Contenu |
|---|---|
| Filtres | Période (7 j, 30 j, mois, année, personnalisée — Europe/Brussels), district (**district de la commande**), société, type C3 |
| Indicateurs (`StatCard`) | Commandes bus, bus mobilisés, taxis, **délai médian envoi → confirmation** (`order_events`), taux d'annulation, prestations PMR (comptage anonyme) |
| Courbe | Volume par jour / semaine (lundi) / mois, bus et taxis empilés |
| Répartitions | Par type C3, par district, par motif normalisé, par ligne (lignes desservies) |
| Fournisseurs | Par société : commandes, bus, délai de confirmation, annulations (sert à la facturation et à la négociation) |
| Trajets | Top trajets origine → destination |
| PMR (avec `deplacements:read`) | Prestations par gare, par type, par période — sans nom, sans réf. DICOS |
| Export | Excel / CSV des agrégats affichés |

- Agrégats calculés **côté serveur** (`src/server/data/stats.ts`, cache 60 s) ; le navigateur ne reçoit que les
  totaux. Graphiques en SVG simples (barres, courbe) avec les jetons du thème : pas de Chart.js (Q9).
- Pas de classement nominatif des agents (Q7).
- Mobile : indicateurs en grille 2 colonnes, graphiques pleine largeur, tableaux → cartes.

### 3.5 Tableau de bord (widgets existants)

- **Trains perturbés** : trains supprimés ou à +5 min des gares favorites de l'agent, puis perturbations du district ;
  clic → panneau train.
- **Main courante** : épinglées + 5 dernières entrées, urgentes en tête, en direct (SSE).

---

## 4. Modèle de données proposé (PocketBase)

### 4.1 Existant vs manquant

| Besoin | Collection v2 | État |
|---|---|---|
| Gares par ligne (filtre des perturbations, lien PN → ligne) | `line_stations` (`1760000200_commandes.js:129-147`) | **Existe** (importée de `ligne_data`) |
| Zones et districts (dépôts PN) | `pmr_zones` (`1760000400_pmr.js:38-75`) | **Existe** : codes FMS, FTY, FCR ; à compléter (FNR, dépôt, polygone d'affichage) |
| Bus et taxis pour les statistiques | `bus_orders`, `taxi_orders`, `order_events` | **Existent** |
| Prestations PMR pour les statistiques | `pmr_assists` | **Existe** |
| Préférences (gares favorites) | `users.preferences` (JSON, `1760000000_init_csm.js:48`) | **Existe** (clé `operations.favoriteStations` à ajouter) |
| Journal d'audit | `audit_log` + `audit.pb.js` | **Existe** (ajouter les nouvelles collections à la liste) |
| Main courante | `ops_log` | **Manque** |
| Accusés de lecture | `ops_log_reads` | **Manque** |
| Historique des entrées | `ops_log_events` | **Manque** |
| Notifications | `notifications` | **Manque** (aucune collection, aucun sujet SSE) |
| Passages à niveau | `level_crossings` | **Manque** (`pn_data` non importé par `pb_hooks/lib/import.js`) |
| Suivi de trains (alertes) | `train_watches` | **Manque**, seulement si Q3 = oui |
| Sujets SSE | `web/src/app/api/events/route.ts:15-23` | **À étendre** : `ops_log`, `notifications` (lecture filtrée par les règles) |
| Proxy iRail, tuiles | routes `web/src/app/api/operations/*` | **Manque** |

### 4.2 Collections

| Collection | Champs | Remarques |
|---|---|---|
| `ops_log` | `body` (texte, 4 000), `category` (select `incident` · `pmr` · `commande` · `travaux` · `consigne` · `info`), `occurred_at` (date, défaut maintenant), `urgent` (bool), `pinned_until` (date), `district` (select v2, défaut celui de l'auteur), `train` (texte 20), `bus_order` → `bus_orders`, `taxi_order` → `taxi_orders`, `pmr_assist` → `pmr_assists`, `level_crossing` → `level_crossings`, `mentions` → users (multiple, **posé par hook** depuis les `@username`), `attachments` (fichier, 3 max, 5 Mo, `image/*` + PDF, **protégé**), `status` (`active` · `retiree`), `retired_reason`, `author` → users (forcé), `edited_at`, `legacy_id` (texte uuid), `created`, `updated` | Index `(occurred_at)`, `(category, occurred_at)` ; recherche `body ~ {:q}` liée |
| `ops_log_reads` | `entry` → `ops_log`, `user` → users, `created` | Index unique `(entry, user)` ; remplace `log_reactions` (👍 importé comme « Lu ») |
| `ops_log_events` | `entry`, `kind` (`edit` · `retire` · `restore` · `pin`), `field`, `from`, `to`, `by`, `note`, `at` | Écrit **par les hooks seulement**, comme `order_events` |
| `notifications` | `user` → users (destinataire), `kind` (`mention` · `urgent` · `train` · `systeme`), `title` (200), `link` (chemin **interne** `^/`), `source` (collection), `source_id`, `read_at` (date), `created` | Créées **par les hooks seulement** ; l'agent ne lit et ne modifie (`read_at`) que les siennes |
| `level_crossings` | `line` (texte, « L.94 »), `number` (texte normalisé « 12 », « 12 bis », « 3 ter »), `bk` (nombre, km), `address` (texte 500), `lat`, `lon` (nombres), `zone` → `pmr_zones` (ou select), `notes` (texte 1 000), `active` (bool), `source` (`baco` · `positions`), `legacy_id`, `updated_by` | Index unique `(line, number)` ; recherche par ligne, n°, adresse |
| `pmr_zones` (existe) | + `depot_label`, `depot_lat`, `depot_lon`, `shape` (JSON polygone, affichage seul) | Le dépôt sert à l'itinéraire PN ; la zone d'un PN reste **stockée**, jamais recalculée |
| `train_watches` (si Q3) | `user`, `kind` (`gare` · `train`), `station_id` (id iRail), `label`, `train`, `day`, `threshold_min` (défaut 5), `expires_at`, `last_state` (JSON) | Propres à l'agent ; cron PocketBase (`cronAdd`, toutes les 2 min, `$http.send` vers iRail) → `notifications` |

Pas de collection pour les statistiques (agrégats serveur ; vues PocketBase `type: 'view'` plus tard si le volume
l'exige) ni pour iRail (cache mémoire du serveur Next).

### 4.3 Hooks et règles de cycle de vie

- `ops_log` : création au nom de l'agent (`author`, `legacy_id`, `mentions`, `edited_at`, `status` refusés dans la
  requête) ; à la création, une notification par mention (agent actif, différent de l'auteur, lien
  `/operations/main-courante?entree=<id>`) et, si `urgent`, une notification aux agents du district.
- Modification : auteur (`journal:write`) ou coordinateur ; chaque changement de `body`, `category`, `occurred_at`,
  `urgent`, `pinned_until` écrit `ops_log_events` (différentiel) et pose `edited_at`.
- Retrait (`status → retiree`, motif obligatoire) au lieu de la suppression ; rétablissement par un coordinateur ;
  suppression réelle : admin seulement (et purge des fichiers).
- Verrou optimiste `expectedUpdated` sur toute modification (comme Commandes et PMR).

### 4.4 Règles d'accès (`web/src/lib/permissions.ts`)

| Collection | list / view | create / update | delete |
|---|---|---|---|
| `ops_log` | `journal:read` (moderator, user, reader) — `otto_agent` exclu ; entrées `retiree` visibles des coordinateurs seulement | create : `journal:write` (moderator, user) ; update : auteur avec `journal:write`, ou moderator | admin |
| `ops_log_reads` | `journal:read` | soi-même (`user = @request.auth.id`), `journal:read` | soi-même |
| `ops_log_events` | `journal:read` | aucune (hooks) | aucune |
| `notifications` | `user = @request.auth.id` | create : aucune (hooks) ; update : le destinataire, `read_at` seul | le destinataire |
| `level_crossings` | `carte_pn:read` (READ_ALL) | `carte_pn:write` (moderator) — plus d'UPDATE ouvert à tous (corrige BUG-1) | admin |
| `pmr_zones` (champs dépôt) | utilisateur actif | moderator (comme aujourd'hui) | admin |
| `train_watches` | propriétaire | propriétaire, `live:read` | propriétaire |
| Proxy iRail / tuiles (Next) | `live:read` / `carte_pn:read` vérifiés dans la route | — | — |
| Statistiques (Next) | `stats:read` ; bloc PMR seulement avec `deplacements:read` | — | — |

- Pièces jointes servies par une route Next (`/api/operations/main-courante/[id]/fichiers/[nom]`) avec le jeton de
  l'agent, `Content-Disposition: attachment` hors images et PDF, `nosniff`, `no-store` — jamais d'URL PocketBase.
- Tous les textes rendus **échappés** (React) ; les popups de carte construites en DOM, jamais par `setHTML` avec
  des données.
- Contrôles à ajouter à `pocketbase/scripts/test-rules.mjs`, y compris avec des comptes créés « à nu »
  (piège `denies` JSON nul, `CLAUDE.md` §7) et un `reader` qui tente de modifier un PN.

### 4.5 Réseau, CSP et services externes

La CSP v2 (`web/src/middleware.ts:18-33`) est `default-src 'self'`, `img-src 'self' data: blob:`,
`connect-src 'self'` ; **aucun appel externe depuis le navigateur**.

| Service | v1 | v2 proposé |
|---|---|---|
| iRail (`stations`, `liveboard`, `vehicle`, `composition`, `disturbances`) | `fetch` navigateur | Routes Next `GET /api/operations/irail/{gares|tableau|train|composition|perturbations}` : paramètres validés par zod, **User-Agent identifiant CSM** (exigé par iRail), cache mémoire (TTL §3.1), regroupement des requêtes identiques, limite ≤ 3 requêtes/s vers iRail (règle d'usage du service), délai 5 s, erreurs traduites. Domaine déjà autorisé dans l'environnement cloud ; à autoriser en sortie du serveur Coolify |
| Fonds de carte | CARTO (styles + tuiles vectorielles + polices + sprites, 4 domaines) | **Option A (recommandée)** : extrait **PMTiles** OpenStreetMap de la zone (Hainaut, Namur, Brabant wallon ; quelques dizaines de Mo), polices et sprites **auto-hébergés**, servis par le domaine CSM (requêtes `Range`) ; aucune dépendance externe, fonctionne derrière le pare-feu, attribution OSM affichée. **Option B** : proxy Next `/api/operations/tuiles/{z}/{x}/{y}` vers un fournisseur raster, avec cache disque — dépend des conditions d'usage du fournisseur (CARTO : licence à vérifier pour un usage d'entreprise). **Option C** : pas de carte, liste + liens Google Maps |
| maplibre-gl | dépendance v1 | **Nouvelle dépendance v2** (~220 Ko gzip) : import dynamique sur la seule page carte. Ses *workers* sont créés depuis des `blob:` : ajouter `worker-src 'self' blob:` à la CSP, ou utiliser la version CSP de maplibre avec le fichier worker servi par CSM (`setWorkerUrl`). Option A ajoute `pmtiles` (petit, maintenu) |
| Street View | iframe Google | Lien externe officiel (`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=lat,lon`) en nouvel onglet : pas de `frame-src` à ouvrir |
| Itinéraire | lien Google Maps | Inchangé (navigation, pas un appel `fetch`) ; « depuis ma position » sur mobile |
| flatpickr (CDN) | scripts tiers | Supprimé : `DayPicker` / `input type=date` du design system |
| Couche trafic memomaps | désactivée | Non reprise |
| Open-Meteo (météo) | widget d'accueil | Hors module ; si repris, même modèle de proxy (Q10) |

### 4.6 Règles de migration depuis la v1

| Source | Cible | Règle |
|---|---|---|
| `main_courante` (33) | `ops_log` | `message_content` → `body` (Markdown conservé en texte, liens rendus) ; `created_at` → `occurred_at` et `created` (SQL) ; `is_urgent` → `urgent` ; `category = info` ; `district` = district de l'auteur ; `edited_at` si `updated_at − created_at > 60 s` ; `mentions` recalculées ; `attachment_*` vides (0) |
| `log_reactions` (22) | `ops_log_reads` | une ligne par (entrée, agent), quel que soit l'emoji |
| `notifications` (12, toutes lues, lien mort) | — | Non migrées |
| Storage `documents/journal/` (6 orphelins) | — | Non migrés (aucune entrée ne les référence) |
| `pn_data` (211) | `level_crossings` | `ligne_nom` → `line` ; `pn` normalisé (« PN 12 Bis » → « 12 bis ») ; `bk` « BK 12.345 » → 12.345 ; `geo` → `lat` / `lon` ; **`zone` reprise telle quelle** (FNR créée dans `pmr_zones`), 2 vides signalées ; `source = baco` |
| `temp_geo_data` (251) | `level_crossings` (si Q6 = oui) | Les ~70 PN absents : `line`, `number`, position, `source = positions`, adresse vide, zone déduite du polygone **à valider** ; les 181 doublons ignorés |
| Dépôts codés en dur (3) | `pmr_zones` | Graine de migration, revue par l'utilisateur |
| `spi_data`, `ligne_data` | Référentiels | Hors module (`line_stations` existe déjà) |
| `remises`, `team_board` | — | Non migrées avec Opérations |

Contrôle après import : comptages par table, 0 PN sans ligne ni n°, liste des PN sans position, répartition par zone
(attendu : FTY 95, FCR 60, FMS 45, FNR 9, vide 2). Le rapport d'import ne contient que des compteurs.

---

## 5. Composants UI à ajouter (priorité)

Réutilisés tels quels : `PageHeader`, `StatCard`, `StatusBadge`, `Table` + `ListCard`, `Sheet`, `Dialog`, `Tabs`,
`EmptyState`, `Skeleton`, `Kbd`, `Field`, `Input`, `Textarea`, `Select`, `Segmented`, `ToggleChip`, `Timeline`,
`ActionBar`, `FormSection` (`web/src/components/ui/form-kit.tsx`), `PhoneLink`, `SavedViewTabs` (suivi des commandes),
`brusselsDay` / `brusselsTime` (`web/src/lib/orders/time.ts`), relais SSE et `live-refresh`.

| P | Composant | États / variantes |
|---|---|---|
| P0 | `StationCombobox` (iRail, partagé avec la PtCar) | vide, recherche, favoris, récents, n° de train reconnu, aucun résultat, iRail indisponible |
| P0 | `DelayBadge` | à l'heure, +n min (seuils `warn` 5 min / `danger` 15 min), supprimé, inconnu ; libellé + icône, jamais la couleur seule |
| P0 | `DepartureBoard` | chargement (squelette), vide, donnée périmée (bandeau), ligne supprimée (barrée), voie modifiée ; cartes < 640 px |
| P0 | `TrainPanel` | itinéraire (passé, actuel, à venir), composition, actions (suivre, bus de substitution, main courante) |
| P0 | `OpsLogComposer` | vide, saisie, mention (suggestions), objet lié, fichiers (envoi, erreur, trop lourd), urgent, épinglé |
| P0 | `OpsLogEntry` | normale, urgente, épinglée, modifiée (historique), retirée (coordinateur), arrivée en direct (flash), « Lu par n » |
| P0 | `LinkedObjectChip` | commande, prestation (sans nom sans `pmr:read`), train, PN ; lien interne |
| P0 | `NotificationBell` (shell) | aucune, non lues (compteur), liste, tout marquer lu ; `aria-live` |
| P1 | `PnList` + `PnSheet` | recherche, homonymes groupés par ligne, sans position, fiche (itinéraire, Street View) |
| P1 | `PnMap` (import dynamique) | chargement, tuiles indisponibles (repli liste), clusters, PN sélectionné ; thème clair / sombre |
| P1 | `DisturbanceList` | incidents, travaux, filtrés district / tout le réseau, vide |
| P1 | `MiniBarChart`, `MiniLineChart` (SVG) | vide, une série, séries empilées, info-bulle clavier ; jetons du thème |
| P1 | `PeriodPicker` | 7 j, 30 j, mois, année, personnalisée (Europe/Brussels) |
| P2 | `ExportButton` (CSV / Excel / PDF) | en cours, prêt, erreur |
| P2 | `WatchToggle` (si Q3) | suivi, non suivi, seuil, expiré |

---

## 6. Questions ouvertes (décisions)

> **Réponses de l'utilisateur (8 oct. 2026)** : toutes les recommandations sont validées, sauf **Q9 → option B**
> (proxy de tuiles raster par le serveur Next, avec cache). **Q6 révisée** : pas de PN « position seule » (`temp_geo_data`
> non reprise) ; seuls les PN de BACO, avec leur adresse, sont importés.

1. **La main courante est-elle encore utile ?** 33 entrées, 2 par mois depuis mars, 64 % par un seul agent, 48
   suppressions. Recommandation : la garder, recentrée en **main courante d'exploitation** (catégorie, heure de
   l'événement, liens vers commande / prestation / train / PN, consignes épinglées, export du service) et la livrer
   après le live ; si l'équipe s'en passe, la réduire à des « consignes épinglées » sur le tableau de bord.
2. **Qui voit et écrit la main courante ?** v1 : tous sauf `otto_agent`. Recommandation : inchangé (lecture READ_ALL,
   écriture moderator + user) ; donner `journal:read` aux `otto_agent` seulement si l'équipe le demande.
3. **Alertes sur les trains suivis** (retard > X min, suppression) poussées dans la cloche ? Recommandation : oui en
   version simple — gares favorites dans les préférences dès la livraison, alertes « train suivi » ensuite, limitées à
   la journée et à 10 suivis par agent (cron serveur, charge iRail maîtrisée).
4. **Suppression d'une entrée** : qui peut, et faut-il garder une trace ? Recommandation : « Retirer » avec motif
   (auteur pendant 15 min, ensuite coordinateurs), entrée conservée et visible des coordinateurs ; suppression réelle
   réservée à l'admin.
5. **Réactions** (👍 seul utilisé) : les garder, ou les remplacer par un **accusé de lecture** « Lu » ?
   Recommandation : « Lu » (compteur et liste des lecteurs), obligatoire visuellement pour les entrées urgentes ; plus
   d'emojis.
6. **Compléter la carte PN avec les ~70 PN de `temp_geo_data`** (positions sans adresse, 5 lignes en plus) ?
   Recommandation : oui, marqués « position seule », adresse à compléter par les coordinateurs ; zone à valider dans
   le rapport d'import.
7. **Statistiques : garder le classement « Top rédacteurs » ?** Recommandation : non (même logique que la
   gamification retirée) ; le remplacer par des volumes par district et par fournisseur, et le délai de
   confirmation ; vue par agent réservée aux coordinateurs si besoin.
8. **Notifications** : créer la collection et la cloche avec Opérations (mentions, urgences, trains suivis) plutôt
   qu'avec Équipe ? Recommandation : oui, collection écrite par les hooks seuls, lien interne, sujet SSE
   `notifications`.
9. **Fonds de carte** : PMTiles auto-hébergé (A), proxy de tuiles (B) ou pas de carte (C) ? Recommandation : **A**,
   avec maplibre en import dynamique et `worker-src 'self' blob:` ajouté à la CSP ; graphiques des statistiques en
   SVG maison, sans Chart.js.
10. **Météo** (3 agents sur 7 avaient le widget) : la reprendre sur le tableau de bord via un proxy Open-Meteo ?
    Recommandation : non dans ce module ; à rediscuter avec l'accueil si l'équipe la réclame.
11. **Qui modifie les PN et les dépôts ?** v1 : tout compte connecté en base, personne dans l'UI. Recommandation :
    coordinateurs (`carte_pn:write`, moderator), historique dans le journal d'audit.
12. **Bus de substitution depuis le live** : ajouter le pré-remplissage de `/commandes/nouveau` (origine,
    destination, relation, motif « Suppression IC 2134 ») ? Recommandation : oui, petit ajout au module Commandes.
