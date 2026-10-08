# Audit UX — module Référentiels (annuaire, lignes, PtCar, EBP, procédures et documents)

> 8 octobre 2026 · Référence métier : v1 SvelteKit (`src/`), non modifiée.
> Données observées : sauvegarde `csm-backup/data` (statistiques uniquement : aucun nom, téléphone, e-mail,
> adresse ni contenu libre n'est reproduit) et lecture seule du schéma Supabase (policies, hotfix, buckets).
> Tous les exemples sont fictifs.

**Périmètre confirmé** (`web/src/navigation.ts:113-139`) : les 5 onglets de **Référentiels** sont
`Annuaire` (v1 `/repertoire`, `repertoire:read`), `Lignes` (v1 `/lignes`, `hideFor: ['otto_agent']`),
`PtCar` (v1 `/ptcar`, `ptcar:read`), `EBP` (v1 `/ebp`, `ebp:read`) et `Procédures et documents`
(v1 `/operationnel` + `/documents`, `documents:read`). Les 5 appartiennent bien à Référentiels. La base
de connaissances `operationnel` (procédures) **remonte ici** (et non dans Opérations), comme l'avait
recommandé l'audit Opérations §1.8 et comme le nomme la navigation. L'onglet `Lignes` **lit** les collections
déjà créées par Commandes (`line_stations`) et Opérations (`level_crossings`, `pmr_zones`) : il ne les
duplique pas. L'`Annuaire` (contacts généraux) est distinct des répertoires fournisseurs de Commandes
(`bus_companies`, `taxi_companies`, `bus_contacts`).

---

## 1. Cartographie des parcours v1

### 1.1 Chiffres clés (sauvegarde du 8 octobre 2026)

| Indicateur | Valeur | Lecture |
|---|---|---|
| Contacts annuaire (`contacts_repertoire`) | **385** · catégories : MIA 195 · RCC-OCC 76 · Autre 58 · B-TO 44 · Borne PMR 11 · **1 sans catégorie** | Référentiel vivant, porté par la catégorie MIA |
| Remplissage annuaire | tél. 385/385 (383 avec séparateurs) · groupe 385/385 · zone 248 (64 %) · **e-mail 42 (11 %)** | Le téléphone est le champ clé ; l'e-mail est marginal |
| Zones / groupes annuaire | 20 zones distinctes · 58 groupes distincts · **16 groupes de noms en double** | Doublons et nomenclature libre à dédoublonner |
| Gares par ligne (`ligne_data`) | **370** gares · 36 lignes · districts **DSO 164 · DSE 203 · DCE 3** · **99 sans `ordre`** (27 %) | L'ordre des gares est incomplet (tri faux) ; un 3ᵉ district (DCE) ignoré par l'UI |
| Zones SPI (`spi_data`) | **112** points · 19 lignes · zones FCR 50 · FMS 42 · FTY 20 · remarques 19 (17 %) · adresse 112/112 | Petit référentiel, bien adressé |
| Passages à niveau (`pn_data`) | **211** PN · 17 lignes · zones FTY 95 · FCR 60 · FMS 45 · **FNR 9** · 2 vides · geo 210/211 | Déjà traité par Opérations → `level_crossings` (lu ici en « Adresse PN ») |
| Abréviations PtCar (`ptcar_abbreviations`) | **1 148** · abbr/FR/NL 100 % remplis · 0 doublon d'abbr · **tout créé le 6 nov. 2025** (import unique) | Référentiel figé, jamais modifié depuis l'import |
| EBP (`ebp`) | **466** lignes · PtCar 466/466 · Vue_EBP 447 (96 %) · Abbr 408 (88 %) · **Lignes 381 (82 %)** · 48 lignes distinctes · 248 vues distinctes | Correspondances PtCar ↔ vue EBP, à trous |
| Procédures (`procedures`) | **8** · catégories PMR 4 · BUS 1 · Procédures 1 · Divers 1 · « Liens Utiles  » 1 (**espace final**) · 2 auteurs · créées nov.–déc. 2025, **dernière màj juillet 2026** | Base vivante mais minuscule ; catégories en texte libre |
| Versions de procédure (`procedure_versions`) | **24** · **4 procédures seulement** versionnées (14 · 4 · 4 · 2) · 2 auteurs | Versioning utilisé sur une poignée de fiches |
| Documents (`document_metadata`) | **11** fichiers · 8 catégories · 3 déposants · déposés nov.–déc. 2025 | Petite bibliothèque, abandonnée depuis |
| Liens procédure ↔ document (`liaisons_contenu`) | **5**, tous `procedure → document` | Pièces jointes de 2 ou 3 procédures |
| Storage `documents` | bucket **public** (URL sans connexion), partagé avec le journal (voir audit Opérations) | Fuite potentielle, à ne plus exposer |

### 1.2 Tables, services et accès concernés

| Table / service | Rôle | Détail |
|---|---|---|
| `contacts_repertoire` | Annuaire général | `id`, `nom`, `tel`, `email`, `categorie_principale`, `zone`, `groupe` ; aucun auteur ni horodatage |
| `ligne_data` | Gares par ligne | `ligne_nom`, `gare`, `ordre`, `district` (DSO/DSE/DCE) — **importée dans `line_stations`** |
| `spi_data` | Zones SPI par ligne | `ligne_nom`, `lieu`, `zone` (FTY/FMS/FCR), `adresse`, `remarques` — **non migrée à ce jour** |
| `pn_data` | Passages à niveau | `ligne_nom`, `pn`, `bk`, `adresse`, `geo`, `zone` — **importée dans `level_crossings`** (Opérations) |
| `ptcar_abbreviations` | Codes gares officiels | `abbr`, `ptcar_fr`, `ptcar_nl`, `created_at` — **non migrée** |
| `ebp` | Correspondances EBP | colonnes **entre guillemets** `Lignes`, `PtCar`, `Abbr`, `Vue_EBP` — **non migrée** |
| `procedures` | Base de connaissances | `titre`, `categorie`, `contenu` (Markdown), `updated_by`, `created_at`, `updated_at` |
| `procedure_versions` | Historique des fiches | `procedure_id`, snapshot `titre/categorie/contenu`, `modified_by`, `archived_at` |
| `document_metadata` | Métadonnées fichiers | `file_name` (clé), `categorie`, `uploaded_by`, `created_at` |
| `liaisons_contenu` | Liens génériques | `source/target_content_type/id` ; ici `procedure → document` (cible = **nom de fichier**) |
| Storage `documents` | Fichiers | Bucket **public**, `getPublicUrl` ; sert aussi les pièces jointes du journal |
| Services | `repertoire.service.js`, `lignes.service.js`, `documents.service.js` ; PtCar / EBP / procédures : requêtes `supabase` **dans la page** | Tout l'accès aux données se fait **depuis le navigateur** (client `supabase`) |

**Accès en base (policies lues le 8 oct., après le hotfix) :**

| Table | Lecture | Écriture |
|---|---|---|
| `contacts_repertoire`, `ligne_data`, `spi_data`, `pn_data` | tout compte connecté | **`FOR ALL` admin uniquement** (hotfix 3a) — alors que l'UI v1 propose l'édition aux moderators |
| `procedures` | tout compte connecté | insert / update / delete **admin uniquement** (hotfix 3f) — l'UI v1 l'ouvre aux moderators |
| `ebp` | **anon + authenticated** (laissé ouvert pour le SSR de BACO) | admin / sysop / moderator (hotfix 4b) |
| `ptcar_abbreviations` | tout compte connecté | — (aucune policy d'écriture : figé) |
| `liaisons_contenu` | RLS activée par le hotfix | policies existantes |
| Storage `documents` | **public** (URL permanente, sans connexion) | upload / update / delete **admin uniquement** (hotfix 3g) → un `user`/`moderator` ne peut plus importer |

> Conséquence directe : sur la base BACO **post-hotfix**, les boutons « Ajouter / Modifier / Importer »
> affichés aux moderators dans l'annuaire, les lignes, les procédures et les documents **échouent en
> silence** (seul l'admin passe). Ce décalage UI / RLS est à trancher pour la v2 (§6 Q3).

### 1.3 Annuaire (`/repertoire`)

Un écran : en-tête (bascule grille / liste, export PDF, « Ajouter ») → recherche + tri A-Z/Z-A →
panneau de filtres (catégories, puis zones **ou** sous-catégories) → contacts regroupés par groupe → modale.

| # | Étape / champ | Défaut | Réf. |
|---|---|---|---|
| 1 | Chargement de **tous** les contacts, filtrage et tri **dans le navigateur** | grille (mémorisée `localStorage`) | `+page.svelte:127-159`, `repertoire.service.js:10-18` |
| 2 | Recherche locale (nom, tél., e-mail, groupe) | — | `:80-85` |
| 3 | Catégories (puces) ; sélection → affiche un sous-filtre | aucune | `:168-182, 306-317` |
| 4 | Sous-filtre **Zone** si catégorie ∈ {`MIA`, `BORNE PMR`}, sinon **Groupe** | — | `:51-57, 184-194` |
| 5 | Carte contact : nom, badge zone, tél. `etrali:`, e-mail `mailto:` ; Modifier / Supprimer **au survol** | — | `:383-410` |
| 6 | Modale : Nom (requis), Téléphone, Email, Catégorie (datalist), Zone (datalist), Groupe (**texte libre**) | vide | `:420-452` |
| 7 | Export PDF (jsPDF) ou Excel des contacts filtrés | — | `repertoire.service.js:68-92` |

**Cas courant** (« le numéro du MIA de telle zone ») : cocher la catégorie, cocher la zone, repérer la carte,
cliquer le lien tél. : ~3 gestes — mais la liste des 385 contacts est entièrement chargée et le lien `etrali:`
n'appelle pas depuis un mobile.

### 1.4 Lignes (`/lignes`)

Un écran en **4 étapes imposées** : District → Catégories → Lignes → (SPI : zones) → résultats regroupés par ligne.

| # | Étape / champ | Défaut | Réf. |
|---|---|---|---|
| 1 | District : **2 boutons `DSO` / `DSE`** seulement (pas de DCE) | aucun | `lignes/+page.svelte:133-141` |
| 2 | Catégories : `Lignes` (gares) · `Adresse PN` · `Zone SPI` | aucune | `:151-159` |
| 3 | Lignes disponibles (filtrées par district) ; tri « naturel » maison | aucune | `:183-191`, `lignes.service.js:30-33` |
| 4 | SPI : filtre de zone `FTY/FMS/FCR` (optionnel) | aucun | `:204-212` |
| 5 | Résultats : par ligne, blocs Gares (puces), PN (cartes : PN, BK, adresse), SPI (lieu, zone, adresse, remarque) | — | `:232-313` |

- **Rien ne s'affiche** tant qu'au moins une catégorie **et** une ligne ne sont pas cochées (`+page.svelte:55-61`).
- Les gares sont triées par `ordre`, **absent sur 99 lignes** → ordre partiellement aléatoire.
- Les PN sont retriés par numéro en ignorant les suffixes (`Bis`, `Ter`) — même défaut que l'audit Opérations (G7).
- Le bloc « Adresse PN » **duplique** la Carte PN d'Opérations (mêmes données `pn_data`), sans carte ni itinéraire.

### 1.5 PtCar (`/ptcar`) et 1.6 EBP (`/ebp`)

Deux écrans jumeaux : en-tête + un champ de recherche centré + **tableau paginé serveur** (15 lignes).

| Élément | PtCar | EBP |
|---|---|---|
| Source | `ptcar_abbreviations` (1 148) | `ebp` (466), colonnes **`Lignes/PtCar/Abbr/Vue_EBP`** |
| Colonnes | Abréviation (badge mono), PtCar FR, PtCar NL | Lignes, PtCar, Abréviation (badge), Vue EBP |
| Recherche | `or(abbr/ptcar_fr/ptcar_nl ilike)` — **injection PostgREST** (virgule/parenthèse) | `or(Lignes/PtCar/Abbr/Vue_EBP ilike)` — idem |
| Pagination | `range()` serveur, 15/page | idem |
| Réf. | `ptcar/+page.svelte:56-85` | `ebp/+page.svelte:45-74` |

Lecture seule, aucune action, tableau en **défilement horizontal à 390 px**. Aucun lien entre PtCar/EBP et les
autres référentiels (gares, lignes), alors que ce sont les mêmes codes gares.

### 1.7 Procédures (`/operationnel`) et documents (`/documents`)

**Procédures** — base de connaissances : barre latérale (recherche + catégories) → cartes Markdown → modale
(éditeur `EasyEditor`, documents liés, historique).

| # | Étape / champ | Défaut | Réf. |
|---|---|---|---|
| 1 | Chargement des procédures + des liens `liaisons_contenu` (collés côté client) | tri par titre | `operationnel/+page.svelte:123-169` |
| 2 | Recherche `or(titre/contenu ilike)` **à chaque frappe** (pas de délai) — injection PostgREST | — | `:136-138, 392` |
| 3 | Catégories (texte libre, espaces de fin non nettoyés) | « Tout voir » | `:78-83, 413-424` |
| 4 | Carte : titre, badge catégorie, contenu `{@html renderMarkdown(contenu)}` (**sanitize OK**), badges documents liés | — | `:484-503` |
| 5 | Modale : Titre, Catégorie (datalist), Contenu Markdown (`EasyEditor`), « Documents liés » (sélection dans le bucket) | — | `:545-610` |
| 6 | Enregistrer : **snapshot manuel** de la version actuelle dans `procedure_versions`, puis update ; liens réécrits (delete + insert) par **nom de fichier** | — | `:171-240, 276-297` |
| 7 | Historique : liste des versions, « Restaurer » (remplit l'éditeur, **sans enregistrer**) | — | `:106-121, 679-726` |

**Documents** — bibliothèque de fichiers : barre latérale (recherche + catégories) → liste de fichiers →
aperçu / téléchargement.

| # | Étape / champ | Défaut | Réf. |
|---|---|---|---|
| 1 | Chargement par catégorie + recherche serveur (`ilike` sur `file_name`) | « Tout voir » | `documents/+page.svelte:70-83`, `documents.service.js:21-38` |
| 2 | Import : `<input file>` → **`prompt()`** pour la catégorie → upload Storage (`upsert` par nom) + upsert métadonnée | — | `:87-118`, `documents.service.js:43-63` |
| 3 | Ligne : nom, catégorie, date ; Aperçu (`window.open` sur **URL publique**) ou Télécharger ; Supprimer **au survol** | — | `:242-291` |
| 4 | Suppression : métadonnée puis fichier (**non transactionnel** → orphelins possibles) | — | `documents.service.js:68-83` |

### 1.8 Périmètre : ce qui est Référentiels et ce qui ne l'est pas

| Donnée v1 | Module v2 | Remarque |
|---|---|---|
| `contacts_repertoire` | **Référentiels → Annuaire** | Nouveau collection dédiée |
| `ligne_data` | **Référentiels → Lignes** | Lit `line_stations` (déjà importée par Commandes) |
| `spi_data` | **Référentiels → Lignes** (bloc SPI) | Collection manquante |
| `pn_data` | **Opérations → Carte PN** ; **Référentiels → Lignes** le **lit** | `level_crossings` existe ; pas de duplication |
| `ptcar_abbreviations` | **Référentiels → PtCar** | Collection manquante ; sert aussi de source aux combobox gares (PMR, Opérations) |
| `ebp` | **Référentiels → EBP** | Collection manquante |
| `procedures`, `procedure_versions` | **Référentiels → Procédures et documents** | Déplacé depuis Opérations (nav. confirme) |
| `document_metadata`, `liaisons_contenu`, Storage `documents` | **Référentiels → Procédures et documents** | Fichiers servis par route Next, bucket plus public |
| `bus_companies` / `taxi_companies` / `bus_contacts` | **Commandes** | Répertoires fournisseurs, distincts de l'Annuaire |

---

## 2. Bugs, risques et frictions

### 2.1 Bugs et risques v1 (numérotés)

Constatés dans le code gelé et le schéma (non corrigés : la v1 n'est pas modifiée).

| # | Bug / risque | Effet | Preuve |
|---|---|---|---|
| BUG-1 | **Bucket `documents` public** : `getPublicUrl`, URL permanente sans connexion ; aperçus et liens de procédures exposés | Tout fichier (procédures, cartes, restrictions gares) lisible sans authentification | `documents.service.js:88-91`, `operationnel/+page.svelte:493`, `storage.buckets` |
| BUG-2 | **Décalage UI / RLS** : l'UI ouvre l'édition de l'annuaire, des lignes et des procédures aux moderators, mais le hotfix réserve l'écriture à l'admin (et l'upload de `documents` à l'admin) | « Ajouter / Importer » échoue en silence pour un moderator sur la base post-hotfix | hotfix `:110-118, 154-167, 169-177`, `repertoire/+page.svelte:285`, `operationnel/+page.svelte:370` |
| BUG-3 | **Injection PostgREST** dans les recherches `or(... ilike ...)** (PtCar, EBP, procédures) : une virgule ou une parenthèse casse la requête | Recherche en erreur sur une saisie banale | `ptcar/+page.svelte:70`, `ebp/+page.svelte:59`, `operationnel/+page.svelte:137` |
| BUG-4 | **Filtre district des lignes incomplet** : seuls `DSO` / `DSE` ; les 3 gares `DCE` et toute ligne sans district connu sont invisibles dès qu'un district est coché | Lignes manquantes au référentiel | `lignes/+page.svelte:133`, `lignes.service.js:16-20`, données (DCE 3) |
| BUG-5 | **Mode de sous-filtre insensible à la casse** : `specialCats = ['MIA','BORNE PMR']` mais la donnée vaut `Borne PMR` → les 11 bornes PMR passent en mode **Groupe** et non **Zone** | Filtre de zone inopérant pour Borne PMR | `repertoire/+page.svelte:53`, données |
| BUG-6 | **Liens procédure ↔ document par nom de fichier** : `liaisons_contenu.target_content_id` = `file_name` ; renommer / réimporter (`upsert`) casse ou double le lien | Pièce jointe orpheline ou perdue | `operationnel/+page.svelte:287-295`, `documents.service.js:54-60` |
| BUG-7 | **Restauration de version sans enregistrement** : « Restaurer » remplit l'éditeur mais ne sauvegarde pas ; quitter perd la restauration | Fausse impression de restauration | `operationnel/+page.svelte:106-121` |
| BUG-8 | **Versioning manuel non atomique** : lecture de l'état courant, insert de la version, puis update — un échec entre les deux laisse une version sans mise à jour (ou l'inverse) | Historique incohérent | `operationnel/+page.svelte:192-224` |
| BUG-9 | **Suppression de document non transactionnelle** : métadonnée supprimée puis fichier ; un échec laisse un fichier orphelin dans un bucket public | Orphelins publics | `documents.service.js:68-83` |
| BUG-10 | **Catégorie par `prompt()`** à l'import, **texte libre** partout (contacts, procédures, documents) avec espaces de fin (« Liens Utiles  ») | Catégories dupliquées, tri et filtres fragmentés | `documents/+page.svelte:96`, données |
| BUG-11 | **Tri des gares par `ordre` manquant** (99/370) et tri PN ignorant les suffixes | Ordre d'affichage faux | `lignes.service.js:92-100`, données |
| BUG-12 | **Aucune traçabilité** sur l'annuaire, les lignes, PtCar, EBP (pas d'auteur ni d'horodatage) ; seules les procédures ont un historique | Modifications anonymes | schéma |

### 2.2 Frictions classées par gravité

#### Bloquant (erreur métier, action impossible)

| # | Friction | Preuve |
|---|---|---|
| B1 | Fichiers de la bibliothèque accessibles sans connexion (BUG-1). | `documents.service.js:88-91` |
| B2 | Édition impossible pour les coordinateurs sur la base post-hotfix (BUG-2) : l'annuaire et les procédures ne se modifient plus. | hotfix 3a/3f/3g |
| B3 | Tout l'accès aux données passe par le **client Supabase dans le navigateur** : incompatible avec la contrainte v2 (le navigateur ne parle qu'au domaine CSM, pare-feu `*.supabase.co`). | `*/+page.svelte` (onMount `supabase`) |

#### Coûteux (temps perdu à chaque usage)

| # | Friction | Preuve |
|---|---|---|
| C1 | Lignes : parcours en 4 étapes imposées, rien par défaut ; impossible de voir une ligne d'un clic. | `lignes/+page.svelte:55-61` |
| C2 | Annuaire : 385 contacts chargés et filtrés côté client ; recherche sans tél. formaté, actions au survol (invisibles au toucher). | `repertoire.service.js:10-18`, `+page.svelte:402` |
| C3 | Procédures : recherche relancée à chaque frappe sans délai ni annulation (réponses dans le désordre). | `operationnel/+page.svelte:392` |
| C4 | PtCar / EBP / Lignes / PN sans lien entre eux, alors que ce sont les mêmes codes gares. | pages |
| C5 | Documents : catégorie saisie par `prompt()`, pas de type ni de taille contrôlés. | `documents/+page.svelte:87-118` |

#### Gênant (qualité, confiance, accessibilité)

| # | Friction | Preuve |
|---|---|---|
| G1 | Téléphone `etrali:` non cliquable sur mobile (même défaut que PMR / Annuaire équipe). | `repertoire/+page.svelte:391` |
| G2 | Tableaux PtCar / EBP en défilement horizontal à 390 px, libellés 10 px en capitales. | `ptcar/+page.svelte:144-151` |
| G3 | Couleurs en dur (hex, `blue-500/…`), classes `bg-${color}-500` construites dynamiquement (Tailwind ne les génère pas toujours). | `lignes/+page.svelte:98-103`, partout |
| G4 | EBP à trous (18 % de `Lignes` vides, 12 % d'`Abbr`) affichés sans signalement. | données |
| G5 | 16 groupes de contacts en double par nom, 1 contact sans catégorie. | données |
| G6 | Export PDF/Excel de l'annuaire seulement ; rien pour PtCar, EBP, lignes, procédures. | `repertoire.service.js:68-92` |

---

## 3. Parcours cibles v2

Principe : **le navigateur ne parle qu'au domaine CSM**. Les référentiels sont lus par des Server Components
(`src/server/data/referentiels.ts`), écrits par Server Actions zod avec le jeton de l'agent (règles PocketBase
= RLS). Point d'entrée : `Référentiels` → onglets `Annuaire | Lignes | PtCar | EBP | Procédures et documents`
(`web/src/navigation.ts:113-139`). Chaque `page.tsx` garde `requirePermission` / `requireRoute` (stubs déjà en
place). Composants du design system uniquement (`web/src/components/ui`).

### 3.1 Annuaire (`/referentiels`)

| Zone | Contenu |
|---|---|
| En-tête | `PageHeader` eyebrow `// RÉFÉRENTIELS · ANNUAIRE · 385 CONTACTS`, recherche serveur (nom, tél., e-mail, groupe ; délai 250 ms), export |
| Filtres | Catégorie en puces (liste fermée), puis **Zone ou Groupe** selon la catégorie (correction insensible à la casse, BUG-5) |
| Liste | `Table` dense (nom, catégorie, groupe, zone, tél., e-mail) groupée par groupe, repliable ; clic → panneau |
| Panneau | Fiche (catégorie, zone, groupe, `PhoneLink`, e-mail), historique des modifications ; actions (modifier, supprimer) **toujours visibles** |

- Création / édition en `Dialog` (desktop) ou `Sheet` bas (mobile) ; à la création, un contact proche (même nom
  ou même téléphone) est proposé avant d'enregistrer (corrige les doublons).
- Catégorie et groupe en **listes gérées** (select + ajout coordinateur), fin du texte libre et des espaces de fin.
- **Mobile 390 px** : `ListCard` (nom, catégorie, tél. appelable d'un geste), filtres dans un `Sheet` bas.
- Raccourcis : `/` rechercher, `N` nouveau contact, `J/K` ligne, `Entrée` ouvrir.

### 3.2 Lignes (`/referentiels/lignes`)

Vue **par ligne** immédiate, sans parcours imposé.

| Zone | Contenu |
|---|---|
| Recherche / sélection | `Combobox` de lignes (tri naturel), filtre district **Sud-Ouest · Sud-Est · Centre** (les 3, corrige BUG-4) |
| Onglets internes | `Segmented` : Gares · Adresse PN · Zones SPI (ou tout affiché, repliable) |
| Gares | Liste **ordonnée** (position), signalement des gares sans position ; lien vers la fiche PtCar |
| Adresse PN | Lecture de `level_crossings` (Opérations) : PN, BK, adresse, zone ; lien « Ouvrir dans la Carte PN » (pas de carte dupliquée) |
| Zones SPI | `spi_points` : lieu, zone, adresse, remarque |

- Édition des gares / SPI réservée aux coordinateurs (`lignes:write`) ; les PN restent édités depuis la Carte PN.
- État dans l'URL (`?ligne=L.94&onglet=pn`) partageable.
- **Mobile** : `Combobox` collant, blocs en sections repliables avec compteur ; pas de défilement horizontal.
- Raccourcis : `/` rechercher, `1/2/3` gares / PN / SPI.

### 3.3 PtCar (`/referentiels/ptcar`) et 3.4 EBP (`/referentiels/ebp`)

Même gabarit `ReferenceTable` : recherche serveur (filtres **liés** `pb.filter`, fin de l'injection BUG-3),
pagination serveur, colonnes alignées, **mode cartes** sous 640 px.

- PtCar : Abréviation (`AbbrBadge` mono), nom FR, nom NL ; clic → « voir les lignes qui desservent cette gare »
  (lien vers Lignes) et les correspondances EBP.
- EBP : Lignes, PtCar, Abréviation, Vue EBP ; cellules vides **signalées** (`—` en `muted`) ; filtre « incomplètes ».
- Les deux lisent le même code gare que `line_stations` et `ptcar` : navigation croisée (PtCar ↔ Lignes ↔ EBP).
- Export CSV / Excel des lignes filtrées (côté serveur).
- **Mobile** : `ListCard` (abréviation en tête, noms en dessous) ; recherche collante.
- Raccourcis : `/` rechercher, `J/K` ligne.

### 3.5 Procédures et documents (`/referentiels/documents`)

Deux sous-vues en `Segmented` : **Procédures** (défaut) · **Documents**.

**Procédures** :

| Zone | Contenu |
|---|---|
| Barre latérale | Recherche serveur (titre + contenu, délai 250 ms, annulation), catégories (liste gérée) |
| Liste / fiche | Carte par procédure : titre, catégorie, aperçu Markdown **rendu et échappé côté serveur**, pièces jointes (relation vers `documents`), dernière màj + auteur |
| Édition | `Dialog` plein écran : titre, catégorie (select), éditeur Markdown, documents liés (sélection dans la bibliothèque **par relation**, plus par nom) |
| Historique | `Timeline` (réutilisé) des versions ; « Restaurer » **crée explicitement une nouvelle version** (corrige BUG-7/8), verrou optimiste `expectedUpdated` |

**Documents** :

- `Table` / `ListCard` : nom, catégorie, date, déposant ; aperçu (image / PDF) et téléchargement via une **route
  Next** (`/api/referentiels/documents/[id]`) avec le jeton de l'agent — plus d'URL publique (corrige BUG-1).
- Import : `Dialog` (catégorie en select, type et taille vérifiés sur les octets, nom normalisé, pas d'écrasement
  silencieux) ; suppression avec confirmation, seulement si aucune procédure ne référence le fichier.
- **Mobile** : cartes, filtres dans un `Sheet` bas ; éditeur Markdown en plein écran.
- Raccourcis : `/` rechercher, `N` nouvelle procédure / importer, `Ctrl+Entrée` enregistrer.

---

## 4. Modèle de données proposé (PocketBase)

### 4.1 Existant vs manquant

| Besoin | Collection v2 | État |
|---|---|---|
| Gares par ligne | `line_stations` (`1760000200_commandes.js:132-146`) | **Existe** (importée de `ligne_data`, avec `district`) |
| Passages à niveau (bloc « Adresse PN ») | `level_crossings` (`1760000500_operations.js:80-104`) | **Existe** (importée de `pn_data`) — **lue**, pas dupliquée |
| Zones et districts | `pmr_zones` (`1760000400_pmr.js:40-55`) | **Existe** (FMS, FTY, FCR, FNR, dépôts) |
| Journal d'audit | `audit_log` + `audit.pb.js` | **Existe** (ajouter les nouvelles collections) |
| Annuaire général | `directory_contacts` | **Manque** (`contacts_repertoire` non importée) |
| Zones SPI par ligne | `spi_points` | **Manque** (`spi_data` non importée) |
| Abréviations PtCar | `ptcar` | **Manque** (non importée ; aujourd'hui les combobox gares lisent `line_stations`) |
| Correspondances EBP | `ebp_views` | **Manque** |
| Procédures | `procedures` | **Manque** |
| Versions de procédure | `procedure_versions` | **Manque** |
| Documents (métadonnées + fichiers) | `documents` | **Manque** (fichier PocketBase protégé, servi par Next) |

### 4.2 Collections

| Collection | Champs | Remarques |
|---|---|---|
| `directory_contacts` | `name` (requis), `phone` (chiffres normalisés), `email`, `category` (select géré), `zone` (texte / select), `group` (texte / select), `note`, `updated_by` → users, `legacy_id` (entier), `created`, `updated` | Index `(category)`, `(name)` ; recherche liée `name ~ {:q}` |
| `spi_points` | `line` (texte « L.94 »), `place` (lieu), `zone` (select, réf. `pmr_zones.code`), `address`, `notes`, `updated_by`, `legacy_id` | Index `(line)` ; complète `pmr_zones` (qui garde code + dépôt + district) |
| `ptcar` | `abbr` (texte, **unique**), `name_fr`, `name_nl`, `legacy_id` | Référentiel officiel figé ; **source commune** des combobox gares (PMR, Opérations) |
| `ebp_views` | `line`, `ptcar`, `abbr`, `ebp_view`, `legacy_id` | Correspondances ; champs vides conservés et signalés |
| `procedures` | `title` (requis), `category` (select géré), `content` (texte Markdown, 20 000), `attachments` → `documents` (multiple), `updated_by` → users, `legacy_id` (uuid), `created`, `updated` | Verrou optimiste sur `updated` ; rendu Markdown **échappé côté serveur** |
| `procedure_versions` | `procedure` → `procedures`, `title`, `category`, `content`, `by` → users, `at` (date) | Écrite **par un hook** à chaque modification (fin du versioning manuel non atomique) |
| `documents` | `name`, `category` (select géré), `file` (fichier, **protégé**, types/taille contrôlés), `uploaded_by` → users, `legacy_id`, `created` | Servi par une route Next avec le jeton ; jamais d'URL publique |

### 4.3 Règles d'accès (`web/src/lib/permissions.ts`)

| Collection | list / view | create / update | delete |
|---|---|---|---|
| `directory_contacts` | `repertoire:read` (READ_ALL) | `repertoire:write` (moderator) ; `updated_by` = l'appelant, `legacy_id` figé | moderator / admin |
| `line_stations`, `spi_points` | utilisateur actif / `lignes:read` | `lignes:write` (moderator) | moderator / admin |
| `ptcar`, `ebp_views` | `ptcar:read` / `ebp:read` (READ_ALL) | `ptcar:write` / `ebp:write` (moderator) | admin |
| `procedures` | `documents:read` (READ_ALL) | `documents:write` (moderator **et** user, comme la v1 « documents ») — ou permission `procedures:*` dédiée (Q1) | moderator / admin |
| `procedure_versions` | `documents:read` | aucune (hook) | aucune |
| `documents` | `documents:read` | `documents:write` ; fichier vérifié sur les octets | moderator / admin, refusée si référencé |

- Tests de règles à écrire comme pour Commandes / PMR (`pocketbase/scripts/test-rules.mjs`), y compris avec des
  comptes créés « à nu » (piège `denies` JSON nul, `CLAUDE.md` §7) et un `reader` / `otto_agent` qui tente d'écrire.
- Markdown des procédures rendu et **nettoyé** (serveur) ; les combobox et popups ne construisent jamais de HTML
  à partir de données.

### 4.4 Règles de migration depuis la v1

| Source | Cible | Règle |
|---|---|---|
| `contacts_repertoire` (385) | `directory_contacts` | `tel` réduit aux chiffres ; `categorie_principale` normalisée (trim, casse), 1 ligne sans catégorie → « Autre » signalée ; doublons (16) signalés, non fusionnés ; `created`/`updated` = date d'import |
| `spi_data` (112) | `spi_points` | `lieu` → `place` ; `zone` reprise ; `adresse`, `remarques` repris |
| `ptcar_abbreviations` (1 148) | `ptcar` | copie directe (`abbr` unique) ; sert de source aux combobox gares |
| `ebp` (466) | `ebp_views` | colonnes `Lignes/PtCar/Abbr/Vue_EBP` → `line/ptcar/abbr/ebp_view` ; vides conservés (18 % Lignes, 12 % Abbr) et comptés dans le rapport |
| `procedures` (8) | `procedures` | `categorie` **trim** (« Liens Utiles  » → « Liens Utiles ») ; `contenu` → `content` ; auteur repris ; `created` d'origine conservé (SQL) |
| `procedure_versions` (24) | `procedure_versions` | copie telle quelle, `archived_at` → `at` |
| `document_metadata` (11) + Storage `documents` | `documents` | fichier copié dans le champ `file` protégé ; `categorie` normalisée ; déposant repris ; le bucket public n'est pas rejoué |
| `liaisons_contenu` (5, `procedure→document`) | `procedures.attachments` | résolu **par relation** vers `documents` (fin du lien par nom de fichier) ; liens non résolus signalés |
| `ligne_data`, `pn_data` | — | **déjà** dans `line_stations` / `level_crossings` ; non réimportés |

Contrôle après import : comptages par table, taux de remplissage EBP, liste des liens procédure ↔ document non
résolus, doublons de contacts. Le rapport d'import ne contient que des compteurs.

---

## 5. Composants UI à ajouter (priorité)

Réutilisés tels quels : `PageHeader`, `Table` + `ListCard`, `Combobox`, `Field`, `Input`, `Select`, `Textarea`,
`Segmented`, `Dialog`, `Sheet`, `Tabs`, `EmptyState`, `Skeleton`, `Kbd`, `StatusBadge`, `Timeline`, `ActionBar`,
`FormSection`, `PhoneLink` (PMR), `StationCombobox` (PMR / Opérations), `SavedViewTabs`, `ExportButton` (Opérations),
`useAutosave`, relais SSE.

| P | Composant | États / variantes |
|---|---|---|
| P0 | `ReferenceTable` (PtCar, EBP) | recherche serveur, pagination, tri, vide, chargement (squelette), cellule vide signalée ; cartes < 640 px |
| P0 | `AbbrBadge` | code mono, copiable, lien vers la gare |
| P0 | `ContactDirectory` | groupé par groupe, catégorie en puces, zone / groupe contextuel, recherche |
| P0 | `ContactForm` + `ContactPanel` | création, édition, doublon probable signalé, suppression ; actions visibles |
| P0 | `LineExplorer` | sélection de ligne, district (3), onglets Gares / PN / SPI, lien Carte PN |
| P1 | `MarkdownView` (rendu échappé serveur) | titre, corps, pièces jointes |
| P1 | `ProcedureEditor` | éditeur Markdown, catégorie (select), documents liés (relation), verrou optimiste |
| P1 | `VersionHistory` (sur `Timeline`) | version, auteur, date, restaurer (nouvelle version) |
| P1 | `DocumentLibrary` + `DocumentUploader` | liste, catégorie, import (type/taille vérifiés), suppression protégée |
| P1 | `FilePreview` (route Next) | image, PDF, téléchargement, erreur |
| P2 | `ManagedCategorySelect` | liste gérée, ajout coordinateur, normalisation |

---

## 6. Questions ouvertes (décisions)

1. **Permission des procédures** : les garder sous `documents:read/write` (navigation actuelle) ou créer
   `procedures:read/write` dédié ? Recommandation : **garder `documents`** pour la lecture et l'édition (une seule
   bibliothèque de connaissances), écriture ouverte aux `user` **et** moderators (la v1 `documents` donnait déjà
   `documents:write` au rôle `user`), édition de l'annuaire / lignes / PtCar / EBP réservée aux coordinateurs.
2. **Fichiers de la bibliothèque** : les servir par une route Next avec le jeton de l'agent (fin du bucket public) ?
   Recommandation : **oui** (corrige BUG-1), `Content-Disposition: attachment` hors image / PDF, `nosniff`, `no-store`.
3. **Qui écrit les référentiels ?** v1 UI = moderator ; base post-hotfix = admin (BUG-2). Recommandation :
   **coordinateurs (`:write`, moderator)** pour l'annuaire, les lignes, SPI, PtCar, EBP, documents ; historique au
   journal d'audit ; aligner l'UI et les règles PocketBase (plus d'écart silencieux).
4. **PtCar et EBP sont-ils encore tenus à jour ?** Import unique (6 nov. 2025), 0 modification depuis.
   Recommandation : **référentiels en lecture**, mise à jour par **réimport d'un fichier officiel** (procédure
   d'admin), édition unitaire réservée aux coordinateurs.
5. **Zones SPI** : collection dédiée `spi_points` (points par ligne) ou fusion dans `pmr_zones` ? Recommandation :
   **collection séparée** `spi_points` (112 points, par ligne) ; `pmr_zones` garde code + district + dépôt.
6. **Annuaire vs répertoires fournisseurs** (bus / taxi de Commandes) : fusionner ? Recommandation : **garder
   séparés** (usages et droits différents), avec un lien croisé « voir la société » quand le contact en désigne une.
7. **Doublons de l'annuaire** (16 groupes de noms en double, 1 contact sans catégorie) : fusionner à l'import ?
   Recommandation : **signaler sans fusionner** ; catégorie obligatoire en v2, détection de doublon à la création.
8. **Historique des procédures** : garder le versioning complet (snapshot) ou passer à un différentiel ?
   Recommandation : **snapshot par hook** (`procedure_versions`), restauration = nouvelle version, par coordinateur.
9. **Téléphone des contacts** : `etrali:` (softphone) sur desktop, `tel:` sur mobile ? Recommandation : **oui**,
   réutiliser `PhoneLink` (décision déjà prise pour PMR / Annuaire équipe, 8 oct.).
10. **Carte PN dans l'onglet Lignes** : afficher une carte ou renvoyer vers Opérations → Carte PN ? Recommandation :
    **renvoyer** (lien profond), pas de carte dupliquée ni de seconde dépendance maplibre dans Référentiels.
11. **EBP incomplet** (18 % de `Lignes` vides, 12 % d'`Abbr`) : à compléter ? Recommandation : afficher tel quel
    avec les vides **signalés** et un filtre « incomplètes », complétion par les coordinateurs.
12. **Catégories en texte libre** (contacts, procédures, documents) avec espaces de fin : listes fermées ?
    Recommandation : **listes gérées** (select normalisé, trim), ajout par coordinateur, migration qui déduplique.
