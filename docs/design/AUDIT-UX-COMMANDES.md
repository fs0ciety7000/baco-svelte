# Audit UX — parcours Commandes (bus C3, taxi, suivi, B201)

> 8 octobre 2026 · Référence métier : v1 SvelteKit (`src/`), non modifiée.
> Données observées : sauvegarde `csm-backup/data` (statistiques uniquement, aucune donnée personnelle).
> Tous les exemples sont fictifs.

---

## 1. Cartographie des parcours v1

### 1.1 Chiffres clés (sauvegarde du 8 octobre 2026)

| Indicateur | Valeur | Lecture |
|---|---|---|
| Commandes bus (`otto_commandes`) | 295 (déc. 2025 → oct. 2026) | Module très utilisé |
| Bus par commande | 1 bus : 74 % · 2 bus : 21 % · 3+ : 5 % | Le cas courant est 1 bus |
| Type C3 | Remplacement 97 % · Évacuation 2 % · Modif. planifié 1 % | Le type 2 doit être le défaut |
| Omnibus (non direct) | 79 % | La saisie des arrêts est le cas courant |
| `status = envoye` | 290 / 295 | Presque tout est « Clôturé » |
| `kanban_status = commande` | 290 / 295 | Le kanban n'est **pas utilisé** |
| `envoye` sans « Mail envoyé » coché | 138 (47 %) | La case manuelle n'est pas fiable |
| `nombre_voyageurs` vide | 270 (92 %) | Champ ignoré |
| Capacité = 80 | 92 % | Bon défaut |
| Commandes taxi (`taxi_commands`) | **3**, toutes en brouillon, `taxi_email` vide sur les 3 | Module quasi inutilisé |
| Rapports B201 | **1** (déc. 2025) | Module abandonné |
| Gares d'origine fréquentes | Charleroi-Central, Mons, Namur, Tournai, Saint-Ghislain | Base pour les suggestions |

### 1.2 Bus C3 (`/otto`)

Écrans : liste (`OttoList`) → formulaire plein écran (`OttoForm`) → modale e-mail. Pas d'URL pour « nouveau ».

| # | Étape / champ | Défaut | Réf. |
|---|---|---|---|
| 1 | Bouton « Nouveau » (liste) | — | `OttoList.svelte:435` |
| 2 | Type C3 (3 grosses cartes) | 2 Remplacement | `+page.svelte:100`, `OttoForm.svelte:293-315` |
| 3 | Motif (texte libre, **requis**) | vide | `OttoForm.svelte:334-335`, `+page.svelte:174` |
| 4 | Date | aujourd'hui **en UTC** | `+page.svelte:104` |
| 5 | Heure d'appel | vide | `OttoForm.svelte:342-343` |
| 6 | Relation / N° d'ordre | `TC_` | `+page.svelte:102`, `OttoForm.svelte:346-352` |
| 7 | Société (recherche maison, **requise**) | vide | `OttoForm.svelte:356-380`, `+page.svelte:175` |
| 8 | Direct / Aller-retour (2 bascules) | Direct, Aller simple | `OttoForm.svelte:394-408` |
| 9 | Origine, Destination (datalist) | vide | `OttoForm.svelte:414-435` |
| 10 | Carte (calcul OSRM après 1 s) | — | `OttoForm.svelte:138-146` (script) |
| 11 | Voyageurs, PMR, Capacité | –, –, 80 | `OttoForm.svelte:452-454` |
| 12 | Bus × n : plaque, prévue, confirmée, démob. (+ annulation), chauffeur, trajet spécifique | 1 bus vide | `OttoForm.svelte:463-556` |
| 13 | Lignes (puces) puis Arrêts (auto ou saisie libre) | — | `OttoForm.svelte:570-630` |
| 14 | Barre d'actions : case « Mail envoyé », E-mail, PDF, Brouillon, Clôturer | — | `OttoForm.svelte:637-652` |
| 15 | Modale e-mail → « Ouvrir Outlook » (`mailto:`) | — | `OttoForm.svelte:254-277, 660-672` |

**Cas courant** (1 bus, omnibus, envoi) : ~10 saisies, ~14 clics, plus 4 à 6 gestes dans Outlook pour joindre le PDF à la main.
**Mise à jour après envoi** (heure confirmée, plaque) : ouvrir → Déverrouiller → confirmer → retour forcé à la liste → rouvrir → saisir → Clôturer. ~7 clics par mise à jour.

### 1.3 Taxi (`/generateTaxi`)

Écrans : liste (50 dernières) → formulaire → panneau détail (modale) → modale e-mail.

| # | Étape / champ | Défaut | Réf. |
|---|---|---|---|
| 1 | « Nouveau » | rédacteur = agent connecté | `generateTaxi/+page.svelte:284-288` |
| 2 | Motif ou Cause PMR (liste de 10) + Remarques | vide | `:617-626`, causes `:23-28` |
| 3 | Rédacteur (lecture seule), Facturation (8 options) | SNCB | `:629-630`, `:29` |
| 4 | Aller / Aller-retour | Aller | `:638-639` |
| 5 | Date & heure (local), Via, Départ, Arrivée (**requise**) | maintenant, **Départ = « Mons » codé en dur** | `:643-646`, `:181`, `:300` |
| 6 | Retour : date, départ, arrivée (inversion auto) | vide | `:650-652`, `:239-244` |
| 7 | Société taxi (datalist, **requise**) → adresse, e-mail, tél. auto | vide | `:662`, `:227-236` |
| 8 | Standard / PMR | Standard | `:678-679` |
| 9a | PMR : nb PMR, passagers, véhicules, client (recherche), nom, prénom, type, dossier | 0, 1, 1 | `:684-695` |
| 9b | Standard : passagers, nom (option), réf./ordre | 1 | `:698-700` |
| 10 | « Enregistrer & PDF » (PDF auto à la création seulement) | — | `:712-715`, `:307-310` |
| 11 | Liste → carte → détail → E-mail → « Ouvrir Outlook » | — | `:573`, `:736-744`, `:330-341` |

**Cas courant** (standard, aller) : ~7 saisies, ~9 clics, puis 4 clics pour l'e-mail et le PDF à joindre à la main.
**Aucune action ne fait passer un taxi à « envoyé » ou « clôturé ».**

### 1.4 Suivi (liste bus, kanban, « Aujourd'hui »)

| Vue | Contenu | Réf. |
|---|---|---|
| Liste bus | Recherche, filtres statut (Tous/Brouillon/Envoyé), dates + raccourcis, société, district, tri ; regroupement par relation | `OttoList.svelte:68-134, 237-390` |
| Kanban bus | 4 colonnes `commande → en_approche → sur_place → termine`, glisser-déposer + flèches | `OttoKanban.svelte:14-19, 37-63` |
| Aujourd'hui | Commandes dont `date_commande` = aujourd'hui (UTC) | `OttoList.svelte:199-200` |
| Exports | Excel, PDF liste, « Rapport du jour » | `OttoList.svelte:309-317` |
| Liste taxi | Mêmes filtres + type PMR + rédacteur, sur 50 lignes | `generateTaxi/+page.svelte:80-130`, `taxi.service.js:53-58` |

Pas de vue commune bus + taxi. Pas de vue « à confirmer ».

### 1.5 Remise de service B201 (`/b201`)

| Étape | Réf. |
|---|---|
| Sélection du jour (précédent / suivant / sélecteur) | `b201/+page.svelte:366-379` |
| Grille 3 périodes × 2 fonctions (PACO, RCCA) × 3 services (Bus, Taxis, Taxis PMR) | `:13-62` |
| Ajout manuel de chaque transport : société, heure, origine, destination, relation / dossier | `:212-250`, `:514-569` |
| Commentaires par période et pour le lendemain | `:453-491` |
| Enregistrer, puis Export PDF (capture d'écran `html2canvas`) | `:141-208`, `:293-341` |

Page absente du menu. Rien n'est lu depuis `otto_commandes` ni `taxi_commands`.

---

## 2. Frictions classées par gravité

### Bloquant (perte de données, erreur métier, action impossible)

| # | Friction | Preuve |
|---|---|---|
| B1 | **B201 : changer la date au sélecteur ne recharge pas le rapport.** « Enregistrer » fait alors un UPDATE de l'ancien rapport avec la nouvelle date : la remise de la veille est déplacée et écrasée. | `b201/+page.svelte:376` (bind seul), `:154-159` |
| B2 | **Le PDF n'est jamais joint** : `mailto:` ne peut pas porter de pièce jointe. Le corps ne contient ni horaires ni arrêts : le fournisseur reçoit un mail incomplet si l'agent oublie le PDF. | `OttoForm.svelte:254-277`, `generateTaxi/+page.svelte:260-280, 336-341` |
| B3 | **Taxi : destinataire toujours vide.** La table `taxis` a une colonne `mail`, le code lit `email`. Confirmé : `taxi_email` vide sur 3/3 commandes. | `generateTaxi/+page.svelte:232, 338`, `taxi.service.js:13` |
| B4 | **Taxi : l'e-mail ouvert depuis le détail utilise `form`**, pas la commande affichée : mauvais destinataire et mauvaise date possibles. | `generateTaxi/+page.svelte:330-339, 740` |
| B5 | **Taxi jamais clôturable** : filtre « Envoyé » présent, aucune action n'y mène. | `generateTaxi/+page.svelte:55, 429, 712` |
| B6 | **Date par défaut en UTC** : entre 0 h et 2 h (heure belge), la commande et la B201 prennent la veille. Environ 27 commandes bus créées dans ce créneau. | `otto/+page.svelte:104, 145`, `OttoList.svelte:157, 199`, `b201/+page.svelte:28, 80` |
| B7 | **Raccourci `N` et « + Nouveau » ouvrent `/otto?new=1`**, paramètre ignoré : on arrive sur la liste. | `AppShell.svelte:93`, `otto/+page.svelte:56` |

### Coûteux (temps perdu à chaque commande)

| # | Friction | Preuve |
|---|---|---|
| C1 | **Statut éclaté** : `status` (brouillon/envoye), `kanban_status`, `is_mail_sent`. 47 % des « envoyés » sans case mail ; kanban figé à 98 %. Personne ne sait ce qui est confirmé. | `+page.svelte:101, 114`, `OttoKanban.svelte:14-19`, données |
| C2 | **« Clôturer » verrouille le bon** alors que les heures confirmées, plaques et démob. arrivent après. Déverrouiller repasse en brouillon et renvoie à la liste. | `+page.svelte:37, 167-170, 212-214` |
| C3 | La case « Mail envoyé » est désactivée une fois clôturé : impossible de la cocher après coup. | `OttoForm.svelte:638-639` |
| C4 | **Duplication codée mais masquée** (bouton commenté). Pas de modèle, pas de « refaire hier ». | `OttoList.svelte:602`, `OttoKanban.svelte:100`, `+page.svelte:141-156` |
| C5 | Pas d'enregistrement auto : quitter la page perd la saisie. | `+page.svelte:221-224`, `generateTaxi/+page.svelte:379` |
| C6 | B201 ressaisit à la main ce qui existe déjà en commandes. | `b201/+page.svelte:212-250` |
| C7 | PDF taxi généré seulement à la création ; ensuite 3 clics (liste → détail → PDF). | `generateTaxi/+page.svelte:307-310, 739` |
| C8 | PDF bus généré depuis le formulaire non enregistré : il peut différer de la base. | `OttoForm.svelte:249-252` |
| C9 | Liste taxi limitée à 50 lignes : filtres et recherche faux au-delà. Liste bus sans limite (tout chargé). | `taxi.service.js:58`, `otto.service.js:7-16` |
| C10 | B201 : Export PDF grisé tant qu'on n'a pas enregistré ; PDF = image d'une page, non paginé. | `b201/+page.svelte:356, 308-330` |

### Gênant (qualité, confiance, accessibilité)

| # | Friction | Preuve |
|---|---|---|
| G1 | Validations quasi absentes : date retour < aller, date passée, nb PMR = 0 alors que `min=1`, origine = destination. | `generateTaxi/+page.svelte:183, 298-300, 684`, `+page.svelte:172-175` |
| G2 | Client PMR : nom coupé au premier espace ; pas de lien `pmr_client_id` (copie dénormalisée). | `generateTaxi/+page.svelte:246-257` |
| G3 | Vocabulaire incohérent : statut `envoye` affiché « Clôturé », toast « Clôturé ! ». | `OttoList.svelte:557`, `+page.svelte:212` |
| G4 | Champs ignorés en tête de formulaire (voyageurs vide à 92 %). | données, `OttoForm.svelte:452` |
| G5 | Kanban sans auteur ni horodatage des déplacements ; glisser-déposer inopérant au toucher. | `+page.svelte:226-234`, `otto.service.js:102-105` |
| G6 | Libellés de 10 px en majuscules, `<label>` non reliés, modales sans piège de focus. | `OttoForm.svelte:487-522`, AUDIT §5 |
| G7 | Un tutoriel modal est nécessaire pour comprendre le formulaire bus. | `OttoTutorialModal.svelte` |
| G8 | Tâche B201 : périodes et fonctions codées en dur, aucune notion d'auteur par bloc. | `b201/+page.svelte:13-15` |

---

## 3. Parcours cibles v2

Principe : **une seule entité « Commande »** (`kind = bus | taxi`), un seul cycle de vie, un seul suivi.
Point d'entrée : `Commandes` → onglets `Suivi | Bus | Taxi | Remise B201`. Le bouton global « + Nouveau » et `N` ouvrent un menu Bus / Taxi.

### 3.1 Création bus

URL : `/commandes/bus/nouveau` (ou `?from=<id>`, `?modele=<id>`). Le brouillon est créé dès la première saisie.

| Section | Champs (ordre) | Défauts / aides |
|---|---|---|
| 1. Démarrer | Bandeau : « Refaire la commande d'hier », « Dupliquer… », « Depuis un modèle » | Les 3 dernières commandes de l'agent en raccourci |
| 2. Incident | Type C3 (segmenté, 3 options), Motif, Relation / N° d'ordre, Date, Heure d'appel | Type 2 ; date = aujourd'hui **Europe/Brussels** ; heure d'appel = maintenant (modifiable) ; masque `TC_` + chiffres |
| 3. Trajet | Origine, Destination (combobox gares), Direct / Omnibus, Aller simple / A-R, Lignes, Arrêts | Origine suggérée selon le district ; lignes déduites des gares ; arrêts pré-cochés entre O et D (modifiables) ; carte repliée par défaut |
| 4. Fournisseur | Société (combobox avec e-mail visible) | Dernière société utilisée sur ce trajet en premier |
| 5. Bus | Ligne par bus : heure prévue, capacité ; « + Ajouter un bus » copie l'heure | Capacité 80 ; plaque, chauffeur, heures confirmée et démob. **masqués jusqu'à « confirmé »** |
| 6. Options | Voyageurs, PMR | Repliée par défaut |

- Validation en ligne, au départ du champ : D ≠ O, date ≥ hier, heure valide, société avec e-mail.
- Indicateur « Enregistré il y a 3 s » dans l'en-tête. Brouillons listés dans la vue « Mes brouillons ».
- **Desktop** : formulaire à gauche (max 720 px), panneau droit collant « Aperçu du bon » (PDF miniature + résumé). Barre d'actions collante en bas : `Préparer l'envoi` (primaire), `Aperçu PDF`, menu `…` (Dupliquer, Enregistrer comme modèle, Supprimer).
- **Mobile 390 px** : une colonne, sections en accordéon avec résumé une ligne quand fermées ; carte et aperçu masqués (bouton « Voir l'itinéraire ») ; barre d'action collante avec un seul bouton primaire + `…` ; pavés numériques (`inputmode`) pour heures et nombres ; cibles 44 px.

### 3.2 Création taxi

Même gabarit, sections : Démarrer · Trajet (date-heure, départ, arrivée, via, A-R → bloc retour pré-inversé) · Passager (Standard | PMR) · Fournisseur · Facturation.

- PMR : combobox **liée à la fiche client** (`pmr_client_id`), nom/prénom/type/téléphone en lecture, lien « Ouvrir la fiche ». Saisie libre seulement via « Nouveau client ».
- Départ par défaut = gare du district de l'agent (fin du « Mons » codé en dur).
- Nb PMR ≥ 1 si PMR ; retour > aller ; facturation SNCB par défaut, cause PMR obligatoire en mode PMR.
- Mobile : identique au bus ; bascule Standard / PMR en segmenté pleine largeur.

### 3.3 Envoi (.eml + PDF)

1. `Préparer l'envoi` → validation complète → **feuille d'envoi** (Dialog desktop, Drawer plein écran mobile) : destinataires (société + copie boîte fonctionnelle), objet, corps HTML en aperçu, PDF joint (nom normalisé, ex. `2026-10-08 · C3-2 · Mons → Tournai.pdf`).
2. `Télécharger le brouillon Outlook` → fichier `.eml` (en-tête `X-Unsent: 1`, PDF en pièce jointe). L'agent l'ouvre, vérifie l'expéditeur (boîte fonctionnelle) et envoie.
3. Au retour sur l'onglet, bandeau : « Avez-vous envoyé l'e-mail ? » `Oui, marquer envoyé` / `Pas encore`. Le statut **ne change jamais seul**.
4. Repli : `Copier le corps` et `Télécharger le PDF` séparément (si `.eml` bloqué par le poste).
- Mobile : l'`.eml` peut ne pas s'ouvrir dans Outlook iOS/Android. Proposer `Partager` (Web Share API avec le PDF) en premier, `.eml` en second. **À valider (Q2).**
- Raccourcis : `Ctrl+Entrée` = Préparer l'envoi ; dans la feuille, `D` = télécharger, `E` = marquer envoyé.

### 3.4 Suivi commun bus + taxi

Table unique (une ligne = une commande), filtres combinables, vues enregistrées en onglets :

| Vue | Filtre | Tri |
|---|---|---|
| À confirmer | statut = envoyé | ancienneté de l'envoi ↑ (badge « depuis 45 min ») |
| Aujourd'hui | date de service = aujourd'hui, statut ∉ {annulé} | heure prévue ↑ |
| En cours | statut = en cours | heure prévue ↑ |
| Non facturées | statut = terminé | date ↑ |
| Mes brouillons | brouillon, auteur = moi | modifié ↓ |

- Colonnes : statut, type (bus/taxi), date-heure, trajet, société, relation, nb bus, auteur, dernière action.
- Clic sur une ligne → **panneau latéral** (Drawer droite desktop) : résumé, historique des statuts, actions contextuelles. Pas de changement de page.
- Sélection multiple → action de masse : « Marquer facturé » (coordinateur).
- Kanban conservé en vue optionnelle (colonnes = statuts), sans glisser-déposer obligatoire.
- **Mobile** : la table devient une liste de cartes (statut, heure, O → D, société) ; vues en puces défilables ; panneau = page plein écran ; action principale dans la carte (« Confirmer », « Démarrer »).
- Raccourcis : `J/K` ligne suivante/précédente, `Entrée` ouvrir, `Échap` fermer, `/` rechercher, `1…5` changer de vue, `C` confirmer, `X` sélectionner.

### 3.5 Transitions de statut (où et comment)

| Transition | Qui | Quand | Depuis où |
|---|---|---|---|
| brouillon → envoyé | Agent auteur ou équipe | Après envoi Outlook | Bandeau retour, feuille d'envoi, panneau |
| envoyé → confirmé | Agent | Le fournisseur rappelle ou répond | Vue « À confirmer » : bouton ligne → mini-formulaire (heure confirmée, plaque, chauffeur par bus ; taxi : heure) |
| confirmé → en cours | Agent | Le bus/taxi est sur place | Panneau, carte mobile, ou auto-proposé à l'heure prévue |
| en cours → terminé | Agent | Démobilisation | Panneau : heure de démob. par bus |
| terminé → facturé | Coordinateur | Facture reçue / contrôlée | Vue « Non facturées », action de masse |
| * → annulé | Agent (coordinateur après « en cours ») | Annulation | Menu `…`, motif obligatoire |

La modification reste possible jusqu'à « terminé » sans « déverrouiller » ; un changement d'horaire après envoi propose « Préparer un e-mail rectificatif ».

### 3.6 B201 générée depuis les commandes

- Écran `Remise B201` : sélecteur de jour (fuseau Europe/Brussels) + période (matin 06–13, après-midi 13–21, nuit 21–06) déduite de l'heure.
- Blocs Bus / Taxis / Taxis PMR **remplis automatiquement** par les commandes du créneau (statut ≠ brouillon), en lecture avec lien vers la commande. Ajout manuel seulement pour un transport hors outil (marqué « manuel »).
- Saisie libre : commentaires par période et « pour le service suivant », enregistrés automatiquement, avec auteur.
- Export : PDF vectoriel paginé (pas de capture d'écran) + `.eml` vers la liste de diffusion.
- Changer de jour recharge toujours le rapport (corrige B1). Verrou optimiste si deux agents éditent.
- Mobile : périodes en onglets, une colonne ; commentaire en `textarea` auto-extensible.
- Raccourcis : `←/→` jour précédent/suivant, `T` aujourd'hui.

---

## 4. Modèle de statuts

```
brouillon ─► envoyé ─► confirmé ─► en cours ─► terminé ─► facturé
    │           │          │           │
    └───────────┴──────────┴───────────┴──► annulé
```

| De → Vers | Action UI | Champs requis | Effets |
|---|---|---|---|
| brouillon → envoyé | « Marquer envoyé » | e-mail destinataire connu | `sent_at`, `sent_by`, PDF figé (version) |
| envoyé → brouillon | « Revenir en brouillon » | — | Seulement si aucun e-mail réellement parti (confirmation) |
| envoyé → confirmé | « Confirmer » | heure confirmée (≥ 1 bus) | `confirmed_at/by` |
| confirmé → en cours | « Démarrer » | — | `started_at/by` |
| en cours → terminé | « Terminer » | heure démob. par bus (ou « non renseignée ») | `ended_at/by` |
| terminé → facturé | « Marquer facturé » | réf. facture (option) | Coordinateur uniquement |
| tout sauf facturé → annulé | « Annuler » | motif | E-mail d'annulation proposé si ≥ envoyé |
| annulé → statut précédent | « Rétablir » | — | Coordinateur, dans les 24 h |

- Chaque transition écrit une ligne `commande_events` : `{commande_id, from, to, at (UTC), by (user), note}`. Affichage en heure belge.
- Annulation partielle (un bus sur trois) = attribut du bus, pas un statut de commande.
- Migration v1 : `brouillon` → brouillon ; `envoye` → envoyé ; `envoye` + heure confirmée → confirmé ; `kanban en_approche/sur_place` → en cours ; `termine` → terminé ; date passée + démob. saisie → terminé. `is_mail_sent` est abandonné.

| Statut | Jeton | Usage |
|---|---|---|
| brouillon | neutre (`muted`) | contour pointillé |
| envoyé | `info` | attend une réponse |
| confirmé | `accent` | prêt |
| en cours | `warn` | sur le terrain, attention |
| terminé | `ok` | fait |
| facturé | `ok` atténué + icône | archivé |
| annulé | `danger` | barré dans les listes |

Toujours : pastille = couleur **+ libellé + icône** (pas la couleur seule).

---

## 5. Composants UI nécessaires (priorité)

| P | Composant | États / variantes |
|---|---|---|
| P0 | `Button` | primary, secondary, ghost, danger ; sm/md ; loading, disabled ; icône seule avec `aria-label` |
| P0 | `Field` (label + aide + erreur) | normal, focus, erreur, désactivé, lecture seule, requis |
| P0 | `Input`, `Textarea` (auto-extensible), `NumberInput` | + `inputmode`, préfixe/suffixe |
| P0 | `DateInput`, `TimeInput`, `DateTimeInput` | fuseau Europe/Brussels, « maintenant », min/max |
| P0 | `Combobox` (gares, sociétés, clients PMR) | vide, recherche, résultats, aucun résultat, chargement, création (« Nouveau… »), récents |
| P0 | `SegmentedControl` | 2–3 options, désactivé |
| P0 | `StatusPill` | 7 statuts, taille sm/md, avec tooltip date + auteur |
| P0 | `FormSection` (accordéon) | ouvert, replié avec résumé, en erreur, complet |
| P0 | `StickyActionBar` | desktop / mobile, 1 primaire + menu `…` |
| P0 | `Dialog` / `Drawer` (droite, bas mobile) | focus piégé, `Échap`, plein écran < 640 px |
| P0 | `Toast` | succès, erreur, info, avec action « Annuler » ; `aria-live` |
| P0 | `AutosaveIndicator` | enregistrement, enregistré, hors ligne, erreur + réessayer |
| P1 | `DataTable` | tri, sélection multiple, ligne active, vide, chargement (squelette), erreur ; mode cartes < 640 px |
| P1 | `SavedViewTabs` | compteur par vue, défilable mobile |
| P1 | `FilterBar` + `FilterChip` | actif, effacer, « Effacer tout » |
| P1 | `SendSheet` (feuille d'envoi .eml) | prêt, PDF en génération, téléchargé, en attente de confirmation |
| P1 | `ConfirmBanner` (« Avez-vous envoyé ? ») | visible, confirmé, ignoré |
| P1 | `Timeline` (historique des statuts) | événement, note, auteur |
| P1 | `RepeatableRows` (bus × n) | ajouter (copie), supprimer, réordonner, ligne annulée |
| P1 | `Menu` / `DropdownMenu` | items, séparateur, danger, raccourci affiché |
| P1 | `Kbd` + aide raccourcis (`?`) | — |
| P2 | `StopPicker` (lignes + arrêts ordonnés) | auto, manuel, aucun arrêt |
| P2 | `RouteMap` (repliable) | replié, chargement, erreur réseau (filtrage OSRM), affiché |
| P2 | `PdfPreview` | miniature, chargement, erreur |
| P2 | `EmptyState`, `Skeleton` | par contexte |
| P2 | `DayPicker` B201 + `PeriodTabs` | aujourd'hui, autre jour, verrouillé |

---

## 6. Questions ouvertes (bloquantes)

1. **Le module taxi est-il vraiment utilisé ?** 3 commandes en 6 mois, toutes en brouillon. Les taxis se commandent-ils par téléphone ? Faut-il l'investissement complet ou un formulaire minimal + journalisation ?
2. **Outlook sur mobile** : les agents envoient-ils depuis un téléphone ? Le `.eml` s'ouvre-t-il dans Outlook mobile sur les appareils SNCB, ou faut-il prévoir « Partager » avec le PDF ?
3. **Qui confirme et comment ?** Le fournisseur répond-il par téléphone ou par mail ? L'heure confirmée est-elle toujours connue au moment de la confirmation ?
4. **Facturé** : qui marque une commande facturée (agent, coordinateur, comptabilité) et faut-il saisir une référence ou un montant ?
5. **« En cours » est-il utile** au quotidien, ou faut-il passer directement de confirmé à terminé ? (Le kanban v1 n'est pas utilisé à 98 %.)
6. **B201** : un seul rapport par jour pour toute l'équipe, ou un par district / par agent ? Qui la reçoit (liste de diffusion) ?
7. **Annulation partielle** : un bus annulé sur plusieurs doit-il apparaître dans la B201 et la facturation ?
8. **Modèles** : partagés par toute l'équipe, ou personnels à chaque agent ?
