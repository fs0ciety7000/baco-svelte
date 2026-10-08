# Audit UX — module PMR (prestations du jour, historique, clients, matériel)

> 8 octobre 2026 · Référence métier : v1 SvelteKit (`src/`), non modifiée.
> Données observées : sauvegarde `csm-backup/data` (statistiques uniquement : aucun nom, téléphone, n° de dossier,
> adresse ni contenu de remarque n'est reproduit). Tous les exemples sont fictifs.

---

## 1. Cartographie des parcours v1

### 1.1 Chiffres clés (sauvegarde du 8 octobre 2026)

| Indicateur | Valeur | Lecture |
|---|---|---|
| Journées (`daily_movements`) | **71**, du 22 janv. au **3 mai 2026** (102 jours) | Quasi quotidien en mars (29) et avril (30), week-ends compris. **Aucune journée depuis le 3 mai** |
| Journée préparée… | la veille : 52 (73 %) · J-2 : 15 (21 %) · le jour même : 3 · J-3 : 1 | On prépare **demain**, pas aujourd'hui |
| Heure de création (Bruxelles) | 6 h → 21 h, deux pics (6 h, 12 h – 15 h) ; 2 journées créées entre 0 h et 3 h | Créneau UTC à risque (B5) |
| Interventions (`movement_interventions`) | **375** · médiane 5 par journée, max 19 · 4 journées vides | Petit volume, saisi à la main |
| Période | Après-midi 250 (67 %) · Matin 125 | L'après-midi est le cas courant |
| Heure dans le texte | 370 / 375 ; la période correspond à l'heure (< 13 h = matin) dans **99 %** des cas | La période peut être déduite |
| Zone | FMS 303 · FTY 72 ; **51 zones corrigées à la main** (dont 43 à Ath) | La détection automatique se trompe |
| Gares | 17 valeurs distinctes, dont 4 doublons « avec espace final » (13 lignes) et 4 noms en clair | Pas de liste fermée |
| Texte « Détails » | 370 / 375 commencent par une **réf. de dossier DICOS** ; 375 contiennent un n° de train ; types NV 190, CRF 70, CRE 36, MR 26, CR 3, CRP 2 ; codes IN / OUT 398 occurrences ; **~17 %** citent le nom du client | Un **enregistrement structuré** collé dans un champ libre |
| « Attribué à » | 18 postes utilisés sur 20 ; « OPI 1 » = 41 % ; vide : 2 | Liste figée suffisante, mais un poste contient un prénom |
| Effectifs Quinyx | 284 blocs (71 × 2 gares × 2 périodes) ; 4 tout à zéro ; la valeur maximale **3** atteinte 13 fois ; « 10-18 » à 0 dans 92 % | Le curseur plafonne à 3 |
| Notes de la journée | **0** (aucune colonne) | Jamais enregistrées (bug B1) |
| Traçabilité | Pas d'auteur, pas d'audit, toutes les lignes d'une journée ont le même `created_at` | Réécriture complète à chaque sauvegarde |
| Clients (`pmr_clients`) | **135** ; 125 (93 %) créés en nov. 2025 (import), 10 depuis ; 25 actions d'audit par 4 agents | Référentiel stable, peu modifié |
| Types de client | NV 52 · CRE 35 · CRF 27 · CRP 9 · MR 3 · saisies libres hors liste 5 · vide 4 | Champ libre à normaliser |
| Fiches clients | Téléphone 131 / 135 (129 avec séparateurs) · remarques 28 (21 %) · 2 doublons nom + prénom · 1 téléphone en double | Dédoublonnage à prévoir |
| Taxis PMR v1 | 0 (3 taxis au total) | Lien client ↔ commande inexistant en v1 |
| Matériel (`pmr_data`) | **55** fiches, 29 gares (16 avec 1 fiche, 1 avec 8) ; zones FCR 21 · FTY 20 · FMS 14 | Couvre aussi Charleroi |
| État des rampes | OK 43 · HS 8 · En attente 4 · réparation demandée 7 | Le widget d'accueil n'affiche que HS / En attente |
| Validité | Vide 40 · renseignée 15, dont **13 expirées** et 2 illisibles | Aucune alerte d'échéance |
| Activité matériel | 34 actions d'audit (28 mises à jour) par 4 agents, la dernière en sept. 2026 | Module **vivant** |
| `presences` | 9 lignes (nov.–déc. 2025) : pointage d'équipe PACO / RCCA | Hors PMR (module Équipe) |
| `user_presence` | 20 lignes : dernière page vue par agent | Hors PMR (administration) |
| Storage `movements_pdf` | **0 objet**, bucket public, aucun code ne l'utilise | À ne pas migrer |

### 1.2 Tables Supabase concernées

| Table | Rôle | Colonnes |
|---|---|---|
| `daily_movements` | Une ligne par jour (unique sur `date`) : effectifs prévus dans Quinyx | `id` uuid, `date` (AAAA-MM-JJ), `presence_mons`, `presence_tournai`, `presence_mons_am`, `presence_tournai_am` (JSON `{spi, opi, cpi, pa, shift_10_18}`, entiers 0–3), `created_at`. **Ni notes, ni auteur, ni statut, ni date de diffusion** |
| `movement_interventions` | Les assistances de la journée | `id`, `movement_id` → `daily_movements`, `period` (`morning` / `afternoon`), `station` (texte, abréviation PtCar en majuscules), `zone` (texte libre, FMS / FTY), `pmr_details` (texte libre : réf. DICOS, nombre, type, sens, train, heure, parfois nom), `assigned_to` (texte, libellé d'un poste), `created_at` |
| `pmr_clients` | Fiches voyageurs (données de santé) | `id` entier, `nom`, `prenom`, `telephone`, `type` (texte libre), `remarques`, `created_at`, `updated_at`, `updated_by` (renseignés par trigger, 20 fiches sur 135) |
| `pmr_data` | Inventaire rampes et accessibilité par gare / quai | `id` entier, `gare` (code), `quai`, `zone` (FMS / FTY / FCR), `type_assistance` (3h, Full, Light, Taxi, N/A → null), `type_rampe`, `rampe_id`, `etat_rampe` (OK, HS, En attente), `reparation_demandee` booléen, `validite` (texte « mois-AA »), `cadenas`, `remarque_rampe`, `restrictions_gare`, `remarque_gare`, `created_at` |
| `ptcar_abbreviations` | Référentiel lu pour la liste des gares | `abbr`, `ptcar_fr`, `ptcar_nl` (1 148 lignes) — le service lit `abbreviation` et `zone_name` (voir G9) |
| `presences`, `user_presence` | Pointage d'équipe ; présence en ligne | Hors module PMR |
| Storage `movements_pdf` | Prévu pour archiver les PDF du jour | Vide, public, non utilisé |

Accès en base (après le hotfix du 8 oct.) : `daily_movements` et `movement_interventions` restent ouverts **en lecture et
en écriture à tout compte connecté** (policy « Public access » passée de `public` à `authenticated`,
`supabase/migrations/20261008120000_security_hotfix.sql:239-240`), y compris les comptes `reader` et `otto_agent`.

### 1.3 Prestations du jour (`/deplacements`)

Un seul écran : en-tête collant → sélecteur de jour → bloc Matin (effectifs Mons + Tournai, tableau d'interventions) →
séparateur → bloc Après-midi (idem) → Notes. Tout est enregistré d'un coup par « Enregistrer ».

| # | Étape / champ | Défaut | Réf. |
|---|---|---|---|
| 1 | Ouverture (raccourci `p`, action rapide « Prestation PMR ») | jour = aujourd'hui **en UTC** ; `?date=` accepté | `+page.svelte:25, 53-54`, `navigation.js:98-103, 314-317` |
| 2 | Changer de jour : ← / → ou sélecteur | recharge la journée **sans enregistrer** | `DateSelector.svelte:6-14, 28-33` |
| 3 | Effectifs Matin : 2 cartes (Mons, Tournai) × 5 curseurs (SPI, OPI, CPI, PA, 10-18) | 0 partout, plafond 3 | `PrestationSection.svelte:24-35`, `PresenceCard.svelte:25-44` |
| 4 | Interventions Matin : une ligne vide ajoutée d'office | zone FMS | `+page.svelte:78-79, 116` |
| 5 | Par ligne : Zone (texte), Gare (datalist PtCar, majuscules, zone déduite), Détails (texte libre), Attribué à (liste de 20 postes) | zone déduite de la gare | `InterventionsTable.svelte:64-100`, `+page.svelte:118`, `deplacements.helpers.js:12-18` |
| 6 | « Ajouter » (une ligne vide en bas) ; corbeille visible au survol | — | `InterventionsTable.svelte:42-47, 104-111` |
| 7 | Après-midi : étapes 3 à 6 répétées | — | `+page.svelte:154-157` |
| 8 | Notes & remarques (texte, « Markdown supporté ») | vide | `NotesFooter.svelte:14-22` |
| 9 | « Enregistrer » : upsert de la journée, **suppression de toutes les interventions puis réinsertion** | — | `deplacements.service.js:81-128` |
| 10 | « Copier Email » : HTML dans le presse-papiers + `mailto:` vers 9 adresses + 1 copie codées en dur ; coller dans Outlook | masqué < 640 px | `DeplacementHeader.svelte:27-34`, `emailGenerator.service.js:290-312`, `deplacements.constants.js:53-56` |
| 11 | « PDF » : jsPDF côté navigateur, téléchargé, jamais archivé | — | `pdfGenerator.service.js:20-281` |

**Cas courant** (préparer demain, 5 interventions, 4 blocs d'effectifs) : 1 clic « → », ~14 réglages de curseur,
5 × (Ajouter + gare + coller le texte DICOS + poste en 2 clics) ≈ 25 gestes, Enregistrer, Copier Email, collage et
envoi dans Outlook : **~45 gestes**. Rien n'est enregistré avant le clic final.

### 1.4 Historique (`/deplacements/historique`)

| Élément | Comportement | Réf. |
|---|---|---|
| Chargement | 100 dernières journées avec interventions, filtrage côté navigateur | `historique/+page.svelte:44-64` |
| Recherche | Sous-chaîne de la **date** seulement (pas le contenu) | `:69-74` |
| Filtres | Date début / fin, zone (FMS / FTY), période (au moins une intervention) | `:76-96, 218-281` |
| Ligne | Date, total, matin, après-midi, Modifier (→ `/deplacements?date=`), Supprimer | `:326-371` |
| Suppression | `confirm()` natif, interventions puis journée, **aucun contrôle de permission** | `:115-133` |
| Pagination | 20 par page | `:33-38, 379-399` |

Pas d'export, pas de recherche par gare, poste, type ou client. Table à 5 colonnes en défilement horizontal sur mobile.

### 1.5 Clients PMR (`/clients-pmr`)

| # | Étape / champ | Défaut | Réf. |
|---|---|---|---|
| 1 | Grille ou liste (mémorisée), 12 par page, tri par nom | grille | `clients-pmr/+page.svelte:20, 38, 71-72` |
| 2 | Recherche (nom, prénom, téléphone, type), délai 300 ms | — | `:46-53`, `pmrClients.service.js:75-79` |
| 3 | Carte : nom, type (badge), téléphone `etrali:`, remarques (3 lignes) | — | `:251-291` |
| 4 | Modifier / Supprimer : icônes **visibles au survol uniquement** | — | `:264-271, 337-344` |
| 5 | Modale : Prénom, Nom (requis, sans marque), Téléphone, Type (**texte libre**), Remarques | vide | `:384-397, 121` |

Aucune vue des prestations ou taxis liés à un client.

### 1.6 Rampes & matériel (`/pmr`)

| # | Étape / champ | Défaut | Réf. |
|---|---|---|---|
| 1 | Recherche (gare, quai, n° rampe) **à chaque frappe**, filtres zone, état, type | Tous | `pmr/+page.svelte:175-200`, `pmr.service.js:7-23` |
| 2 | Carte : gare, zone, quai, état (badge clignotant si HS), ID rampe, assistance, « réparation demandée », **une seule** remarque | — | `:216-268` |
| 3 | Modale : Localisation (zone, code gare requis, quai), Matériel (assistance, état, ID, type, cadenas, validité « MM/YY »), réparation, 3 remarques | état OK, assistance N/A | `:303-371, 70-78` |
| 4 | Widget d'accueil : rampes HS ou en attente, lien vers la recherche | — | `WidgetPmr.svelte:13, 49` |

---

## 2. Frictions classées par gravité

### Bloquant (perte de données, erreur métier, action impossible)

Les bugs de perte de données et d'accès sont détaillés au §7. Résumé :

| # | Friction | Preuve |
|---|---|---|
| B1 | **Les notes de la journée ne sont jamais enregistrées** : elles disparaissent au rechargement ou au changement de jour. Le libellé promet le Markdown, l'e-mail l'échappe. | `+page.svelte:37, 90-92`, `deplacements.service.js:82-94`, `NotesFooter.svelte:21` |
| B2 | **Sauvegarde destructive** : toutes les interventions sont supprimées puis réinsérées, sans transaction. Un échec réseau entre les deux vide la journée. | `deplacements.service.js:100-128` |
| B3 | **Écrasement entre agents** : deux agents sur la même journée, le dernier « Enregistrer » efface les lignes de l'autre, sans avertissement ni rafraîchissement. | `deplacements.service.js:86-96, 101-104` |
| B4 | **Changer de jour efface la saisie non enregistrée**, sans confirmation. | `DateSelector.svelte:13, 31`, `+page.svelte:67-85` |
| B5 | **Jour par défaut en UTC** : entre 0 h et 2 h (heure belge), la page ouvre la veille. | `+page.svelte:25` |
| B6 | **Une ligne sans gare est supprimée en silence** à l'enregistrement, même si les détails sont remplis. | `deplacements.service.js:119-120` |
| B7 | **Zone en texte libre** : une ligne dont la zone n'est pas exactement `FMS` ou `FTY` (« fms », « FCR ») n'apparaît **ni dans l'e-mail ni dans le PDF**. 0 cas observé, risque latent. | `InterventionsTable.svelte:65-69`, `emailGenerator.service.js:204-235`, `pdfGenerator.service.js:204-230` |
| B8 | **Suppression et écriture sans contrôle de droit** : l'historique propose « Supprimer » à tout lecteur ; « Enregistrer » ne vérifie pas `deplacements:write` ; la base accepte tout compte connecté. | `historique/+page.svelte:115-133, 362-368`, `+page.svelte:47`, hotfix `:239-240` |
| B9 | **Diffusion impossible sur mobile** : « Copier Email » est masqué sous 640 px. | `DeplacementHeader.svelte:30` |

### Coûteux (temps perdu à chaque journée)

| # | Friction | Preuve |
|---|---|---|
| C1 | **Données structurées dans un champ libre** : réf. DICOS, nombre, type, sens, train et heure sont recopiés à la main dans « Détails » (370 / 375 suivent le même format). Impossible de trier, filtrer ou compter. | données, `InterventionsTable.svelte:82-88` |
| C2 | **Période saisie à part** alors qu'elle se déduit de l'heure (99 %) ; il faut choisir le bon tableau avant d'ajouter. | données, `+page.svelte:145-157` |
| C3 | **E-mail et PDF triés par gare**, pas par heure ; l'ordre des lignes d'une gare est aléatoire, car toutes les lignes partagent le même `created_at`. | `deplacements.helpers.js:38-44`, `deplacements.service.js:60`, données |
| C4 | **Zone déduite à tort** : les gares présentes dans les deux listes (ATH, FLZ, FNG) et toute gare saisie avec un espace final basculent en FMS ; 51 corrections manuelles, dont 43 pour ATH. | `deplacements.helpers.js:12-18`, `deplacements.constants.js:5-11`, données |
| C5 | **Effectifs au curseur** (0–3) : 20 réglages par journée, imprécis au doigt, plafond atteint 13 fois. Pas de reprise de la semaine précédente. | `PresenceCard.svelte:36-42` |
| C6 | **Pas d'enregistrement automatique ni d'état « modifié »** ; rien ne signale qu'une journée a été diffusée puis changée. | `+page.svelte:87-99` |
| C7 | **Envoi en 3 temps** (copier, `mailto:`, coller) ; le PDF n'est jamais joint ni archivé ; les destinataires sont codés en dur. | `emailGenerator.service.js:290-312`, `deplacements.constants.js:53-56` |
| C8 | **Historique limité aux 100 dernières journées**, recherche sur la date seulement. | `historique/+page.svelte:54, 69-74` |
| C9 | **Aucun lien client ↔ prestation** : le nom est tapé dans le texte (≈ 17 %), la fiche n'est jamais consultée depuis la journée. | données, `pmrClients.service.js` |
| C10 | **Actions au survol uniquement** (corbeille, modifier, supprimer) : invisibles au toucher. | `InterventionsTable.svelte:107`, `clients-pmr/+page.svelte:264, 337`, `pmr/+page.svelte:270` |
| C11 | **Téléphone client en `etrali:`** : le lien n'appelle pas depuis un téléphone mobile. | `clients-pmr/+page.svelte:278, 319` |
| C12 | **Matériel : pas d'alerte de validité** (13 / 15 expirées) ; filtre « Type » sans « 3h » (19 fiches). | `pmr/+page.svelte:188, 338`, données |

### Gênant (qualité, confiance, accessibilité)

| # | Friction | Preuve |
|---|---|---|
| G1 | Gares non nettoyées : espace final conservé (`LVRS` et `LVRS ` = deux lignes dans l'e-mail). | `+page.svelte:118`, `deplacements.service.js:112`, données |
| G2 | Type client en texte libre : 5 valeurs hors liste, casse incohérente. | `clients-pmr/+page.svelte:391`, données |
| G3 | Recherche matériel lancée à chaque frappe, sans délai ni annulation : résultats qui se chevauchent. | `pmr/+page.svelte:178` |
| G4 | Recherches injectées dans un filtre `or()` PostgREST : une virgule ou une parenthèse provoque une erreur. | `pmr.service.js:17`, `pmrClients.service.js:78` |
| G5 | Carte matériel : une seule remarque affichée (restrictions **ou** remarque rampe), jamais « Infos générales », cadenas ni validité. | `pmr/+page.svelte:262-267` |
| G6 | Liste de postes codée en dur, dont un libellé contenant un prénom. | `deplacements.constants.js:13-34` |
| G7 | Contenu des lignes non échappé dans l'e-mail HTML (seules les notes le sont). | `emailGenerator.service.js:75-82, 106` |
| G8 | Badges clignotants en boucle (HS, réparation), libellés de 9–10 px en capitales, `<label>` non reliés, modales sans piège de focus. | `pmr/+page.svelte:36, 256, 133`, `PresenceCard.svelte:28`, `clients-pmr/+page.svelte:386-395` |
| G9 | Le service des gares lit `abbreviation` et `zone_name`, alors que la table expose `abbr` et `ptcar_fr` : la datalist est probablement vide. À vérifier en v1. | `deplacements.service.js:15-18`, `+page.svelte:164-166`, données |
| G10 | Tableau d'interventions et historique en défilement horizontal à 390 px. | `InterventionsTable.svelte:50-51`, `historique/+page.svelte:300` |

---

## 3. Parcours cibles v2

Principe : **la prestation devient l'unité** (une assistance = une ligne autonome, avec des champs structurés). La
« journée » regroupe les prestations, les effectifs Quinyx, les notes et l'état de diffusion. Chaque prestation
s'enregistre seule (fin des écrasements B2, B3 et B6), avec un historique horodaté.

Point d'entrée : `PMR` → onglets `Prestations du jour | Historique | Clients | Rampes et matériel`
(`web/src/navigation.ts:67-84`, action rapide `:182-186`). L'action rapide « Prestation PMR » et `N` ouvrent `/pmr/nouveau`.

### 3.1 Création d'une prestation

URL : `/pmr/nouveau?jour=AAAA-MM-JJ` (page complète en mobile, panneau latéral sur la journée en desktop). Le jour
proposé est **demain après 14 h**, sinon aujourd'hui (fuseau Europe/Brussels), toujours visible et modifiable (Q11).

| Section | Champs (ordre) | Défauts / aides |
|---|---|---|
| 1. Coller depuis DICOS | Zone de collage (une ou plusieurs lignes) → aperçu des champs reconnus | Exemple fictif : `1234-56-78-9012 1 CRF OUT IC 2134 à 16h42`. Les champs reconnus sont remplis ; le reste va dans « Remarque » |
| 2. Assistance | Heure, Sens (`Segmented` Arrivée / Départ, Q12), Train, Gare (combobox PtCar), Zone | Période **déduite de l'heure** (badge Matin / Après-midi, modifiable) ; zone déduite de la gare via le référentiel, signalée si corrigée |
| 3. Voyageur | Réf. DICOS (masque `9999-99-99-9999`), Nombre (pas à pas, 1), Type (`Segmented` NV · CRF · CRE · CRP · MR · Autre), Client (combobox liée, facultatif) | Le type est repris de la fiche client ; « Nouveau client » ouvre la fiche minimale |
| 4. Attribution | Poste (liste du référentiel des postes) | Dernier poste utilisé pour cette gare et cette période |
| 5. Remarque | Texte libre court | Replié par défaut |

- Validation au départ du champ : heure valide, gare connue, réf. au bon format, doublon (même réf., même jour) signalé.
- Actions : `Enregistrer` (primaire), `Enregistrer et en ajouter une autre` (`Ctrl+Entrée`), `Annuler`.
- **Mobile 390 px** : une colonne, sections en accordéon avec résumé d'une ligne ; pavé numérique pour l'heure, le
  train et la réf. ; `Segmented` pleine largeur ; `ActionBar` collante au-dessus de la barre d'onglets.

### 3.2 Journée en cours (`/pmr?jour=`)

| Zone | Contenu |
|---|---|
| En-tête | `DayPicker` (← / →, Aujourd'hui, Demain), `PageHeader` eyebrow `// PMR · 12 PRESTATIONS · DIFFUSÉE 17:42`, `AutosaveIndicator` |
| Bandeau d'état | Brouillon · Diffusée · **Modifiée depuis la diffusion** (avec « Préparer un rectificatif ») |
| Effectifs Quinyx | Grille 2 gares × 2 périodes × 5 fonctions en `NumberStepper` (0–9), un zéro en `danger` ; « Reprendre le même jour de la semaine dernière » |
| Prestations | Table dense triée **par heure**, regroupée par période ; colonnes : heure, sens, train, gare, zone, type, nombre, réf., client, poste, statut |
| Notes | `Textarea` auto-extensible, **enregistrée** (corrige B1) |

- Ajout en ligne au clavier (desktop) : `N` = nouvelle ligne, `Entrée` = valider, `Échap` = annuler ; clic sur une ligne
  → panneau latéral (détail, historique, actions).
- **Temps réel** : les ajouts des autres agents arrivent par SSE (`live-refresh` des commandes), avec un flash ambre.
- Mobile : cartes (heure en mono, gare, type, poste), en-têtes de période collants, bouton « + » au-dessus de la
  barre d'onglets ; le panneau devient une page plein écran.

### 3.3 Interventions par gare et par poste

Bascule `Segmented` au-dessus de la table : **Chronologie** (défaut) · **Par gare** · **Par poste**.

- Par gare : un bloc par zone puis par gare (format de l'e-mail actuel), compteur par gare, lignes triées par heure.
- Par poste : un bloc par poste, avec la charge (nombre de prestations, première et dernière heure) ; un chevauchement
  de moins de 15 min pour un même poste est signalé (`warn`).
- Mobile : les blocs deviennent des sections repliables, avec le compteur dans l'en-tête.

### 3.4 Diffusion (e-mail et PDF)

1. `Préparer la diffusion` → validation (gare, heure, poste renseignés) → `SendDialog` réutilisé : destinataires (liste
   de diffusion **paramétrée**, Q5), objet `Déplacements PMR · 09-10-2026`, aperçu HTML, PDF joint.
2. `Télécharger le brouillon Outlook` → `.eml` (`X-Unsent: 1`) avec PDF joint, depuis la boîte fonctionnelle.
3. Au retour sur l'onglet : « Avez-vous envoyé l'e-mail ? » → `Oui, marquer diffusée` (horodatage, auteur, PDF figé
   et archivé dans la journée).
4. Après diffusion, toute modification fait passer la journée à « Modifiée depuis la diffusion » ; le rectificatif ne
   liste que les différences (Q6).
- Repli : `Copier le corps` et `Télécharger le PDF` séparés. Mobile : `Télécharger le PDF` et `Partager` en premier
  (l'`.eml` sur mobile reste non prioritaire, décision du 8 oct.).
- Le PDF et l'e-mail sont générés **côté serveur** à partir de la base (`web/src/server/pdf`), triés par heure,
  contenu échappé (corrige B7 et G7).

### 3.5 Clients (`/pmr/clients`)

- Table : nom, type (pastille + libellé), téléphone, dernière prestation, nombre de prestations sur 90 jours.
  Recherche serveur (nom, prénom, téléphone, réf. DICOS), délai 250 ms.
- Clic → panneau : fiche (type en liste fermée, téléphone normalisé avec `tel:` en mobile, remarques), **prestations et
  taxis liés**, historique des modifications. Actions visibles en permanence (pas au survol).
- Doublons : à la création, les fiches proches (même nom, même téléphone) sont proposées avant d'enregistrer.
- Mobile : cartes à deux lignes, appel en un geste.

### 3.6 Rampes et matériel (`/pmr/materiel`)

- Vues enregistrées : **Hors service** · **Réparation demandée** · **Validité dépassée** · **Toutes** (avec compteur).
- Table : gare, quai, zone, assistance, type de rampe, ID, état, validité (`ExpiryBadge` : dépassée en `danger`, à moins
  de 60 jours en `warn`).
- Changement d'état en un geste depuis la ligne (`OK → HS`, motif facultatif), consigné dans l'historique.
- Panneau : toutes les remarques (rampe, restrictions, infos générales), cadenas, historique des états.
- Le widget d'accueil reprend « Hors service » et « Validité dépassée ».
- Mobile : cartes, filtre en puces défilables.

### 3.7 Historique (`/pmr/historique`)

- Deux modes : **Journées** (date, nombre de prestations par période, état de diffusion, auteur de la diffusion) et
  **Prestations** (une ligne par assistance, filtres gare, zone, type, poste, client, réf.).
- Pagination serveur (fin de la limite à 100), plage de dates avec raccourcis (7 j, 30 j, mois).
- Export Excel des prestations filtrées (sans nom de client par défaut, Q10).
- Suppression d'une journée : coordinateurs uniquement, avec motif ; les prestations sont archivées, pas effacées.
- Mobile : cartes ; filtres dans un `Sheet` bas.

### 3.8 Raccourcis

`←/→` jour précédent / suivant · `T` aujourd'hui · `D` demain · `N` nouvelle prestation · `V` coller depuis DICOS ·
`1/2/3` chronologie / par gare / par poste · `Ctrl+Entrée` préparer la diffusion · `/` rechercher · `J/K` ligne
suivante / précédente · `Échap` fermer.

---

## 4. Modèle de données proposé (PocketBase)

### 4.1 Collections

| Collection | Champs | Remarques |
|---|---|---|
| `pmr_days` | `day` (texte AAAA-MM-JJ, **unique**), `staffing` (JSON `{matin:{FMS:{spi,opi,cpi,pa,s10_18}, FTY:{…}}, apres_midi:{…}}`), `notes` (texte, 4 000), `status` (`brouillon` · `diffusee` · `modifiee`), `sent_at`, `sent_by` → users, `sent_pdf` (fichier), `updated_by` → users, `legacy_id` (texte uuid), `created`, `updated` | Une journée pour toute l'équipe ; verrou optimiste sur `updated` (comme `useAutosave`) |
| `pmr_assists` | `day` → `pmr_days` (requis), `time` (HH:MM), `period` (`matin` · `apres_midi`, déduite, modifiable), `direction` (`arrivee` · `depart` · vide), `train` (texte 20), `station` (texte, code PtCar), `zone` (select, référentiel), `dicos_ref` (texte, motif `^$|^\d{4}-\d{2}-\d{2}-\d{4}$`), `pax` (entier ≥ 1, défaut 1), `pmr_type` (select NV, CRF, CRE, CRP, MR, AUTRE), `client` → `pmr_clients` (facultatif), `post` → `pmr_posts`, `note` (texte 1 000), `status` (`prevue` · `realisee` · `annulee` · `absent`), `cancel_reason`, `created_by`, `updated_by`, `legacy_text` (texte d'origine), `legacy_id`, `created`, `updated` | Index `(day, time)`, `(dicos_ref)`, `(client)` |
| `pmr_posts` | `label`, `zone`, `position`, `active` | Remplace la liste codée en dur ; libellés sans nom de personne |
| `pmr_zones` | `code` (FMS, FTY, FCR…), `label`, `district` (select v2), `stations` (JSON, codes PtCar) | Remplace `detectZone` et ses listes |
| `pmr_clients` (existe) | + `type` en select (mêmes valeurs que `PMR_TYPES` + AUTRE), `type_detail` (texte), `phone` normalisé (chiffres), `archived` (bool), `created_by` | Fiche créée par le module Commandes (`1760000200_commandes.js:176-197`) |
| `pmr_equipment` | `station`, `platform`, `zone`, `assistance` (select `3h` · `full` · `light` · `taxi` · vide), `ramp_type`, `ramp_id`, `state` (`ok` · `hs` · `en_attente`), `repair_requested` (bool), `padlock`, `valid_until` (date, dernier jour du mois), `ramp_note`, `station_restrictions`, `station_info`, `updated_by`, `legacy_id` | Index `(station, platform)` |
| `pmr_settings` | `recipients_to`, `recipients_cc` (JSON), `footer` (texte) | Liste de diffusion et pied de page, modifiables par les coordinateurs |
| `pmr_events` | `kind` (`day` · `assist` · `client` · `equipment`), `record` (id), `from`, `to`, `field`, `by` → users, `note`, `at` | Écrit **par les hooks seulement**, comme `order_events` |

### 4.2 Statuts et transitions

```
Journée :   brouillon ─► diffusée ─► modifiée depuis la diffusion ─► diffusée (rectificatif)
Prestation: prévue ─► réalisée            (facultatif, Q4)
               │
               ├──► annulée   (motif)
               └──► absent    (client non présenté)
```

| De → Vers | Action UI | Qui | Effets |
|---|---|---|---|
| journée brouillon → diffusée | « Marquer diffusée » après l'`.eml` | `deplacements:write` | `sent_at`, `sent_by`, PDF figé dans `sent_pdf` |
| diffusée → modifiée | automatique : toute écriture sur la journée ou ses prestations | hook | bandeau « Préparer un rectificatif » |
| modifiée → diffusée | « Marquer le rectificatif envoyé » | `deplacements:write` | nouveau PDF figé, l'ancien conservé dans l'historique |
| prestation prévue → annulée / absent | menu `…` de la ligne, motif | `deplacements:write` | ligne barrée, reste dans le PDF avec la mention |
| annulée → prévue | « Rétablir » | `deplacements:write` | — |
| prévue → réalisée | case de la ligne | `deplacements:write` | facultatif |
| matériel ok ⇄ hs ⇄ en_attente | depuis la ligne | `pmr:write` | événement avec motif |

Chaque transition et chaque modification de champ sensible (heure, gare, poste, client) écrit une ligne
`pmr_events` (`at` en UTC, affiché en heure belge), visible dans le `Timeline` du panneau.

### 4.3 Règles d'accès (reprise des permissions v1, `web/src/lib/permissions.ts`)

| Collection | list / view | create / update | delete |
|---|---|---|---|
| `pmr_days`, `pmr_assists` | `deplacements:read` (moderator, user, reader) | `deplacements:write` (moderator, user) ; `created_by` / `updated_by` = l'appelant ; `sent_*` et `status` de la journée interdits dans la requête (hooks) | coordinateurs (moderator, admin) ; les prestations passent à « annulée » plutôt que d'être supprimées |
| `pmr_clients` | `pmr:read` (moderator, user, reader) — `otto_agent` exclu | `pmr:write` (moderator, user) | admin |
| `pmr_equipment` | `pmr:read` | état et réparation : `pmr:write` ; création : moderator (Q9) | admin |
| `pmr_posts`, `pmr_zones`, `pmr_settings` | utilisateur actif | moderator | admin |
| `pmr_events` | lecture selon la permission de l'objet suivi | aucune (hooks) | aucune |

- Le client d'une prestation n'est développé (`expand`) que si l'agent a `pmr:read` : un compte avec seulement
  `deplacements:read` voit « Client lié » sans nom.
- Tests de règles à écrire comme pour Commandes (`pocketbase/scripts/test-rules.mjs`), y compris avec des comptes créés
  « à nu » (piège `denies` JSON nul, `CLAUDE.md` §7).

### 4.4 Règles de migration depuis la v1

| Source | Cible | Règle |
|---|---|---|
| `daily_movements` (71) | `pmr_days` | `date` → `day` ; `presence_*` → `staffing` (`morning` → `matin`, `_am` → `apres_midi`, `shift_10_18` → `s10_18`) ; `notes` vide ; `status = diffusee` si la date est passée, sinon `brouillon` ; `created` d'origine conservé (SQL) |
| `movement_interventions` (375) | `pmr_assists` | `period` `morning` → `matin`, `afternoon` → `apres_midi` ; `station` nettoyée (espaces, majuscules) ; `zone` reprise telle quelle ; `assigned_to` → `post` par libellé (le libellé contenant un prénom devient un libellé générique) ; `pmr_details` **analysé** : réf. DICOS, nombre, type (`CR` → AUTRE), sens (`IN` / `OUT`, Q12), train, heure ; texte complet gardé dans `legacy_text` ; `status = prevue` ; aucun lien client automatique (le nom n'est pas rapproché) |
| `pmr_clients` (135, déjà importés) | `pmr_clients` | `type` normalisé (minuscules → majuscules, libellés hors liste → AUTRE + `type_detail`) ; téléphone réduit aux chiffres ; doublons signalés dans le rapport d'import, pas fusionnés |
| `pmr_data` (55) | `pmr_equipment` | `validite` « mois-AA » → dernier jour du mois ; illisible → vide + note ; `N/A` et `000` → vide ; `etat_rampe` → `state` |
| `ASSIGNEES`, listes FMS / FTY, `EMAIL_CONFIG` | `pmr_posts`, `pmr_zones`, `pmr_settings` | Graine de migration, revue par l'utilisateur avant import |
| `presences`, `user_presence`, `movements_pdf` | — | Non migrés avec PMR (Équipe, administration ; bucket vide) |

Contrôle après import : nombre de lignes par table, taux d'analyse de `pmr_details` (attendu ≈ 98 %), liste des lignes
non analysées, nombre d'expirations détectées. Le rapport d'import ne contient que des compteurs.

---

## 5. Composants UI à ajouter (priorité)

Réutilisés tels quels : `FormSection`, `Segmented`, `ToggleChip`, `ActionBar`, `AutosaveIndicator`, `Timeline`
(`web/src/components/ui/form-kit.tsx`), `Field`, `Input`, `Textarea`, `Select`, `Dialog`, `Sheet`, `Table` + `ListCard`,
`StatusBadge`, `EmptyState`, `Skeleton`, `Kbd`, `PageHeader`, `StatCard`, `SendDialog`, `OrderHistory`, `B201Keys`,
`useAutosave`, `brusselsDay` / `periodOf` (`web/src/lib/orders/time.ts`), `buildEml`, relais SSE.

| P | Composant | États / variantes |
|---|---|---|
| P0 | `DayPicker` (généralisation de `B201Keys`) | aujourd'hui, demain, autre jour, journée diffusée / modifiée |
| P0 | `NumberStepper` | 0–9, zéro en `danger`, désactivé ; cibles 44 px ; `inputmode="numeric"` |
| P0 | `StaffingGrid` | 2 gares × 2 périodes × 5 fonctions ; « reprendre la semaine dernière » ; lecture seule |
| P0 | `AssistTable` (édition en ligne) | ligne en lecture, en édition, nouvelle, annulée (barrée), en erreur, arrivée en direct (flash) ; groupée par période ; cartes < 640 px |
| P0 | `DicosPasteDialog` | collage, aperçu ligne par ligne (reconnu / partiel / non reconnu), import sélectif |
| P0 | `StationCombobox` (PtCar) | code + nom, récents, zone affichée, inconnu (création refusée) |
| P0 | `PmrTypePill` | NV, CRF, CRE, CRP, MR, Autre ; icône + libellé, jamais la couleur seule |
| P0 | `DayStatusBanner` | brouillon, diffusée (heure, auteur), modifiée depuis la diffusion + action |
| P1 | `GroupedView` (par gare / par poste) | compteur, chevauchement signalé, repliable en mobile |
| P1 | `PmrClientPicker` (extrait de `taxi-form.tsx:629`) | vide, recherche, résultats, doublon probable, création |
| P1 | `ClientPanel` | fiche, prestations liées, taxis liés, historique |
| P1 | `PhoneLink` | `tel:` en mobile, `etrali:` en desktop (Q8), copie |
| P1 | `ExpiryBadge` | valide, échéance < 60 j (`warn`), dépassée (`danger`), inconnue |
| P1 | `EquipmentStateControl` | OK / HS / En attente en un geste, motif facultatif |
| P1 | `SavedViewTabs` (repris du suivi des commandes) | compteur par vue, défilable mobile |
| P2 | `RecipientsEditor` (paramètres PMR) | liste, ajout, adresse invalide |
| P2 | `ExportButton` (Excel) | en cours, prêt, erreur ; option « inclure les noms » réservée |

---

## 6. Questions ouvertes (bloquantes)

1. **Le module journée est-il encore utilisé ?** Aucune journée saisie depuis le 3 mai 2026 (71 journées entre janvier et mai). Recommandation : le confirmer avant d'investir ; s'il est arrêté, livrer d'abord Clients et Matériel, puis une journée simplifiée.
2. **Passer du rapport du jour à une prestation par assistance**, avec des champs structurés (heure, train, gare, type, sens, réf. DICOS, poste) ? Recommandation : oui, le texte libre devient une « Remarque ».
3. **Lier chaque prestation à une fiche client** (données de santé) ou se limiter à la réf. DICOS ? Recommandation : réf. DICOS attendue, client facultatif, plus aucun nom en texte libre.
4. **Faut-il suivre la réalisation** (réalisée, annulée, client absent) ou seulement le prévu ? Recommandation : prévue et annulée obligatoires, « réalisée » facultative.
5. **Liste de diffusion** : les 9 destinataires + 1 copie codés en dur sont-ils à jour, et depuis quelle boîte fonctionnelle envoyer ? Recommandation : liste modifiable par les coordinateurs, envoi depuis la boîte PACO du district.
6. **Rectificatif** : une modification après diffusion doit-elle produire un e-mail rectificatif ? Recommandation : oui, bandeau « modifiée depuis la diffusion » et e-mail des seules différences.
7. **Périmètre** : la journée ne couvre que Mons et Tournai (FMS / FTY), alors que le matériel couvre aussi FCR. Faut-il d'autres zones, et à quels districts v2 les rattacher ? Recommandation : un référentiel de zones modifiable, rattaché à un district.
8. **Téléphone des clients** : le lien `etrali:` (softphone) doit-il rester sur desktop ? Recommandation : `etrali:` sur desktop, `tel:` sur mobile.
9. **Matériel** : qui peut créer une fiche, et qui peut changer l'état d'une rampe ? Recommandation : tout agent `pmr:write` change l'état et la réparation ; création et suppression réservées aux coordinateurs.
10. **Durée de conservation des données de santé** (prestations, fiches clients, exports) ? Recommandation : prestations nominatives 12 mois puis anonymisées (compteurs gardés), fiches sans prestation depuis 24 mois archivées, exports sans nom par défaut. À valider avec le DPO.
11. **Jour proposé à l'ouverture** : 73 % des journées sont préparées la veille. Recommandation : aujourd'hui avant 14 h, demain ensuite, avec `T` / `D` toujours visibles.
12. **Codes du texte DICOS** : que signifient « IN », « OUT » et le code « E » ? Recommandation : IN = arrivée (débarquement), OUT = départ (embarquement), « E » repris en remarque tant qu'il n'est pas défini.

---

## 7. Bugs v1 de gravité bloquante

Constatés dans le code gelé (non corrigés : la v1 n'est pas modifiée). Tous sont évités par le modèle §4.

| # | Bug | Effet | Preuve |
|---|---|---|---|
| BUG-1 | **Notes non enregistrées** | Perte de données : les notes disparaissent au rechargement ou au changement de jour ; aucune colonne en base (0 note dans la sauvegarde) | `+page.svelte:37, 90-92`, `deplacements.service.js:82-94` |
| BUG-2 | **Sauvegarde « tout supprimer puis réinsérer » sans transaction** | Perte de données : un échec après la suppression vide la journée ; l'ordre des lignes devient aléatoire (même `created_at` pour toutes les lignes, vérifié sur les 67 journées non vides) | `deplacements.service.js:100-128, 60` |
| BUG-3 | **Écrasement concurrent** | Perte de données : le dernier agent qui enregistre efface les ajouts de l'autre ; pas de verrou ni de temps réel | `deplacements.service.js:86-104` |
| BUG-4 | **Ligne sans gare effacée en silence** | Perte de données à l'enregistrement | `deplacements.service.js:119-120` |
| BUG-5 | **Changement de jour sans garde** | Perte de la saisie non enregistrée, sans confirmation | `DateSelector.svelte:13, 31`, `+page.svelte:67-85` |
| BUG-6 | **Jour par défaut en UTC** | Entre 0 h et 2 h, la page ouvre et enregistre la veille | `+page.svelte:25` |
| BUG-7 | **Zone hors FMS / FTY omise** de l'e-mail et du PDF | Erreur métier : une assistance saisie n'est pas diffusée aux gares (0 cas observé) | `emailGenerator.service.js:204-235`, `pdfGenerator.service.js:204-230`, `InterventionsTable.svelte:65-69` |
| BUG-8 | **Droits non appliqués** : suppression de journée sans contrôle, enregistrement sans `deplacements:write`, base ouverte à tout compte connecté | Suppression ou modification par un `reader` ou un `otto_agent` (qui n'ont pas ce droit en v1), sans trace | `historique/+page.svelte:115-133`, `+page.svelte:47`, hotfix `:239-240` |
| BUG-9 | **Fuite de données de santé** : `daily_movements` / `movement_interventions` lisibles par tout compte connecté, y compris `otto_agent` ; bucket `movements_pdf` public (vide aujourd'hui) | Noms et handicaps visibles hors du périmètre prévu | hotfix `:16, 239-240`, `docs/AUDIT.md` S2b et S7 |
| BUG-10 | **HTML non échappé dans l'e-mail** (détails, poste, gare) | Contenu arbitraire collé dans un e-mail envoyé à une dizaine de destinataires (gravité moyenne) | `emailGenerator.service.js:75-82, 106` |
