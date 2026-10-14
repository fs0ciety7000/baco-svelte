# Cadrage — Rôles et permissions v3

> Statut : **validé par l'utilisateur** (14 oct. 2026). Réponses au §5 : admin seul gère les rôles (délégation plus
> tard) ; Sysop gardé distinct ; pas de portée par district ; pas de droits temporaires ; granularité du §2.3 acceptée ;
> suppression d'un rôle utilisé refusée avec réaffectation proposée ; Modérateur et PACO/RCCA modifiables mais non
> supprimables ; couleur du rôle = anneau d'avatar. **Lots L0 et L1 livrés** (catalogue, `users.perms`) : voir l'annexe.
> Ébauche visuelle : `scratchpad/roles-v3/ebauche.html` (hors dépôt, noms fictifs).

Demande de l'utilisateur (14 oct.) : « Granularité, ajout de nouvelles permissions, possibilité de créer rôles et
permissions… Et le fait qu'un admin moins à l'aise avec l'informatique puisse facilement et intuitivement ajouter /
retirer des permissions. »

---

## 1. État des lieux (vérifié dans le code)

### 1.1 Ce qui existe (rôles v2, 11 oct.)

| Élément | Où | Constat |
|---|---|---|
| Rôles | `users.role` = **SelectField à valeurs fixes** (`admin`, `sysop`, `moderator`, `paco`, `guest`, `disabled`, `connector` dans `1760002800_roles_v2.js`, `screen` ajouté par `1760003000_screen_role.js`) | Créer un rôle = **migration de schéma** + code. |
| Droits par défaut d'un rôle | `ROLE_DEFAULTS` dans `web/src/lib/permissions.ts` (côté web) **et**, séparément, les noms de rôles **écrits en dur dans les règles** PocketBase | Deux sources à garder en phase à la main. |
| Catalogue | `PERMISSION_MODULES` (`web/src/lib/permissions.ts`) : 15 modules × jusqu'à 4 actions (`read`, `write` = création, `update`, `delete`) | Granularité = module entier (ex. `otto` couvre bons bus, fournisseurs bus, chauffeurs, modèles bus). |
| Surcharges par agent | `users.grants` / `users.denies` (JSON), matrice à 3 états `components/admin/permission-matrix.tsx` (hérité → accordé → retiré), action `setPermissions` (`app/(app)/admin/actions.ts`, clés limitées au catalogue, droits BACO hors catalogue conservés) | Fonctionne, mais l'interface parle en grille module × action, pas en tâches métier. |
| Règles PocketBase | Fonction `can(perm, rôles)` recopiée dans **10 migrations** ; ≈ **100 occurrences** de `@request.auth.role` dans les migrations ; `grants ~` / `denies !~` dans **20 migrations**. `1760002800` réécrit toutes les règles par remplacement de motifs (regex). | Toute évolution des rôles = nouvelle réécriture par regex, fragile. |
| Tests de rôle hors règles | Hooks : `lib/operations.js` (`COORD_ROLES` = admin, sysop, moderator : modération du Journal), `lib/orders.js` (coordinateur = admin/sysop/moderator/paco), `pmr.pb.js` (`screen`), `users.pb.js`, `passkeys.pb.js`, `lib/import-delta.js`. Web : `isAdmin`, `isCoordinator`, `isJournalModerator`, `canEditChangelog`, `isScreen` (`lib/permissions.ts`), ≈ 38 comparaisons `role ===` dans `web/src`, `hideFor: [rôles]` dans `navigation.ts` | Plusieurs droits réels **ne sont pas des permissions** (modération du Journal, Nouveautés, réouverture des bons, administration) : impossibles à accorder à la carte. |
| Administration | `requireAdmin()` = rôle admin ou sysop ; `users.createRule` / `manageRule` = admin (`1760001400`) | Aucune délégation possible (ex. « gestionnaire des comptes »). |
| Tests | `pocketbase/scripts/test-rules.mjs` (431 contrôles d'après le journal) : comptes par rôle, `grants` / `denies` testés (otto, b201, pmr, dicos…) | Bonne base pour une non-régression. |
| Audit | `pb_hooks/audit.pb.js` trace déjà `users` (différentiel) | Les changements de droits sont tracés, mais affichés en JSON brut. |

### 1.2 Écart avec la demande

| Demande | Aujourd'hui | Écart |
|---|---|---|
| Plus de granularité | 15 modules × 4 actions | Pas de sous-module (fournisseurs, modèles, export ALEA, coche « encodé », modération…), pas de portée par district. |
| Ajouter de nouvelles permissions | Uniquement par développement (catalogue + règles) | **Inévitable en partie** : une permission n'a d'effet que si le code et les règles la testent (voir §2.2). Rien n'existe pour des étiquettes « libres ». |
| Créer des rôles depuis l'interface | Impossible (SelectField + règles en dur) | Manque complet. |
| Admin non technicien | Grille « Module / Lecture / Écriture / Modification / Suppression », clic tournant à 3 états, jargon (« hérité », « écriture » = création) | Pas de langage métier, pas d'aperçu « peut / ne peut pas », pas de comparaison, pas d'annulation, pas de confirmation des droits sensibles. |

---

## 2. Modèle cible

### 2.1 Vue d'ensemble

```
catalogue versionné (code)  ──►  rôles (collection `roles`, éditables)  ──►  agent (users.role + grants / denies)
                                                                              │
                                    hook PocketBase (seul écrivain)  ──────►  users.perms  ◄── règles : perms ~ '"X"'
```

1. **Catalogue des permissions** : liste fermée, versionnée avec le code (clé, libellé en phrase, tâche métier, niveau
   de sensibilité, dépendances). Seul le code peut en ajouter, car seul le code peut les faire respecter.
2. **Rôles en base** (`roles`) : nom, description, couleur, liste de permissions du catalogue. Créés, dupliqués,
   modifiés depuis l'interface. Quatre **rôles système** protégés.
3. **Agent** : un rôle + surcharges individuelles (`grants` / `denies`, comme aujourd'hui).
4. **`users.perms`** : liste effective calculée par un hook à chaque changement (agent, rôle ou catalogue). Les règles
   ne testent **plus que** `perms` (et quelques rôles système).
5. **Étiquettes libres** (optionnel, à valider) : créées par l'admin, sans effet de sécurité (filtres, mentions, ciblage).

### 2.2 Catalogue : ce qui est vraiment « ajoutable »

Il faut le dire clairement à l'utilisateur : **un admin ne peut pas inventer une permission qui change le comportement
de CSM** (par ex. « peut voir les bons de nuit ») sans que le code la teste. Trois catégories :

| Catégorie | Exemple | Qui l'ajoute | Effet |
|---|---|---|---|
| **Permission du catalogue** | « Peut supprimer un bon bus » | Développement (versionnée, testée par `test-rules`) | Réel, appliqué par PocketBase. Apparaît **automatiquement** dans l'éditeur de rôles dès son ajout. |
| **Étiquette libre** | « Formateur », « Référent taxis » | Admin, depuis l'interface | Aucun droit. Sert à filtrer l'annuaire Équipe, mentionner (`@Formateurs`), cibler une campagne, plus tard une audience de document. |
| **Rôle** (paquet de permissions) | « Coordinateur de nuit » | Admin, depuis l'interface | Combinaison de permissions du catalogue. C'est ce qui répond à « créer des rôles ». |

Source unique du catalogue : `web/src/lib/permissions/catalog.ts` (comme le reste du domaine), copie générée pour les
hooks `pocketbase/pb_hooks/lib/catalog.js` (même principe que `npm run changelog` : script + test qui échoue si la copie
est périmée ; l'image web est construite depuis `web/` seul).

Forme d'une entrée :

```ts
{ key: "bus:delete", task: "commandes.bus", label: "Supprimer un bon bus",
  sentence: "Peut supprimer définitivement un bon bus", level: "sensible",
  requires: ["bus:read"], legacy: ["otto:delete"] }
```

### 2.3 Granularité proposée (réaliste, fondée sur l'existant)

Regroupement **par tâche métier** (ce que l'admin voit), chaque ligne étant une permission testable. Les clés v2 restent
valables (renommées seulement dans les libellés) ; les nouvelles sont marquées « + ».

| Tâche | Permissions (libellé en clair) |
|---|---|
| **Bons bus** | Voir · Créer et compléter · Modifier un bon d'un autre agent · Valider l'envoi · **+ Rouvrir un bon envoyé** (aujourd'hui « coordinateur » en dur) · Supprimer |
| **Fournisseurs** (+ séparé de `otto`) | Voir · Ajouter / modifier une société, ses chauffeurs, contacts · Supprimer |
| **Modèles de bons** (+) | Utiliser · Créer / modifier · Supprimer |
| **Taxis** | Voir · Créer et compléter · Modifier · Supprimer |
| **B201** | Voir · Rédiger · Supprimer |
| **Archives PDF** | Voir et télécharger · Supprimer |
| **Missions PMR et groupes** | Voir les missions (sans nom) · **Voir les noms et coordonnées** (sensible) · + Exporter l'ALEA · + Cocher « encodé » · + Connecter l'extension DICOS |
| **Clients et matériel PMR** | Voir · Changer l'état du matériel · Créer / modifier fiches et zones · Supprimer |
| **Journal** | Lire · Écrire · Modifier ses messages · **+ Modérer** (retirer / rétablir les messages des autres, aujourd'hui `COORD_ROLES`) · + Publier une consigne épinglée · Supprimer |
| **Trains, carte PN, statistiques** | Voir les trains en direct · Voir la carte PN · Modifier un PN · Voir les statistiques |
| **Ressources** | Annuaire (voir / modifier / supprimer) · Procédures et documents · PtCar · EBP · **Gares et districts** (modifier) · **Lignes** (modifier) |
| **Équipe** | + Voir le planning Quinyx · Voir l'annuaire Équipe · Voir « En ligne maintenant » |
| **Nouveautés** | + Publier une annonce d'équipe (aujourd'hui `canEditChangelog` en dur) |
| **Administration** (+, délégable) | Gérer les comptes · Gérer les rôles · Voir le journal d'audit (sensible : nominatif PMR) · Santé et maintenance · Campagnes d'e-mail · Tri du Journal · Quinyx · Appareils connectés |

**Portée par district** (« seulement mes districts ») : techniquement possible pour la lecture des missions PMR
(`pmr_assists.district` vs districts de l'agent), mais contraire à la décision du 11 oct. (« districts = filtres et
alertes, pas de limite d'écriture ») et complexe (codes DSO vs noms « Sud-Ouest », trajets à deux districts). **Hors
périmètre v3**, question posée (§5).

### 2.4 Collection `roles`

| Champ | Type | Remarque |
|---|---|---|
| `key` | texte, unique, immuable | `admin`, `paco`… ; pour un rôle créé : tiré du nom (`coordinateur-nuit`). Sert de valeur à `users.role`. |
| `label`, `description` | texte | « Coordinateur de nuit », « Bons et Journal la nuit, sans suppression ». |
| `color` | liste fermée de jetons (`accent`, `info`, `ok`, `warn`, `progress`, neutre) | Pastille dans les listes et anneau d'avatar (aujourd'hui `avatarRing(role)`). |
| `perms` | JSON (clés du catalogue) | Validé par hook : clés connues seulement, dépendances ajoutées. |
| `system` | booléen | Rôle livré par CSM : non supprimable, `key` figée. |
| `locked` | booléen | Permissions non modifiables (admin, sysop, screen, connector, disabled). |
| `based_on` | relation `roles` | Modèle d'origine (affichage « créé à partir de PACO/RCCA »). |
| `sort` | nombre | Ordre d'affichage. |
| `updated_by` | relation `users` | Posé par hook. |

Rôles système à la migration :

| Rôle | Système | Verrouillé | Permissions |
|---|---|---|---|
| Administrateur (`admin`), Sysop (`sysop`) | oui | oui | tout (`ADMIN` reste testé en dur dans les règles) |
| Modérateur (`moderator`) | oui | **non** (modifiable) | équivalent v2 + `journal:moderate`, `changelog:write` |
| PACO/RCCA (`paco`) | oui | **non** | équivalent v2 (tout sauf suppression, + réouverture des bons : décision du 11 oct.) |
| Invité (`guest`) | oui | non | `otto:read`, `generate_taxi:read` |
| Écran (`screen`), Connecteur (`connector`), Désactivé (`disabled`) | oui | oui | aucun droit de module ; règles propres conservées |

`users.role` : SelectField → **TextField validé par hook** contre `roles.key` (choix recommandé : toutes les règles
`@request.auth.role = "admin" / "screen" / "connector" / "disabled"` restent justes, aucun identifiant ne change).
Alternative : relation vers `roles` (plus propre, mais réécrit toutes les règles et le code qui lit `role`).

### 2.5 Héritage

`perms(agent) = (rôle.perms ∪ grants) − denies`, avec les règles actuelles conservées : **retiré l'emporte sur le
rôle, accordé l'emporte sur retiré** (ordre de `can()` aujourd'hui) ; `screen` et `disabled` = aucun droit, même accordé ;
`admin` / `sysop` = tout. Les dépendances du catalogue s'appliquent au calcul (modifier ⇒ voir ; créer ⇒ modifier, comme
la matrice le fait déjà pour `write` → `update`).

---

## 3. Sécurité et règles PocketBase

### 3.1 Principe : un champ `users.perms` calculé, des règles stables

- Nouveau champ `users.perms` (JSON). **Seul un hook l'écrit** : `onRecordCreate` / `onRecordUpdate` de `users`
  recalcule toujours `perms` à partir de `role`, `grants`, `denies` et ignore toute valeur envoyée (même par un admin) ;
  hook `roles` (création / modification) recalcule les agents de ce rôle dans la même transaction ; migration de
  catalogue → recalcul de tous les comptes (≈ 30 comptes : négligeable).
- Règles réécrites **une seule fois** : `can(perm)` devient
  `ACTIVE && (ADMIN || @request.auth.perms ~ '"perm"')`. Créer ou modifier un rôle ne touche plus jamais les règles.
- Les tests spéciaux deviennent des permissions : `COORD_ROLES` → `journal:moderate`, coordinateur des bons
  (`lib/orders.js`) → `bus:reopen` / `taxi:reopen`, Nouveautés → `changelog:write`, exclusions `role != "guest"`
  (zones PMR, SPI, Nouveautés) → permissions de lecture correspondantes. Restent en dur : `ADMIN`, `screen`, `connector`,
  `disabled` (rôles système verrouillés, comportements très spécifiques et déjà testés).
- Côté web : `can(user, p)` lit `user.perms` (relu par `getCurrentUser`) ; `ROLE_DEFAULTS` disparaît ; `hideFor` remplacé
  par des permissions ; `isCoordinator` & co. deviennent des `can()`.

### 3.2 Pièges connus à couvrir

| Piège | Parade |
|---|---|
| JSON `null` dans une règle = faux (`pocketbase/CLAUDE.md`) | `perms` toujours tableau (hook de normalisation existant dans `users.pb.js` étendu) ; migration remplit tous les comptes **avant** de réécrire les règles. Test sur un compte créé « à nu ». |
| `record.get()` d'un JSON renvoie du brut dans un hook | Lire `getString()` puis `JSON.parse` (déjà la pratique). |
| Fonctions en tête de `*.pb.js` invisibles dans un gestionnaire | Calcul dans `pb_hooks/lib/perms.js` chargé par `require()`. |
| Jetons existants | PocketBase relit la fiche de l'agent à chaque requête : un changement de droits vaut **dès la requête suivante**, sans reconnexion. **À vérifier** : une souscription temps réel déjà ouverte garde-t-elle l'ancienne fiche ? Si oui, couper les flux SSE de l'agent après un changement de droits (comme après révocation de session). |
| Sous-chaîne dans `~` | Clés toujours entre guillemets (`'"bus:read"'`), aucune clé préfixe d'une autre sans guillemet. |
| Lecture de `perms` par les autres agents (`users.listRule = ACTIVE`) | Masquer `perms` / `grants` / `denies` aux non-admins par `onRecordEnrich` (n'affecte pas `@request.auth` dans les règles). |
| Taille des règles | Elles raccourcissent (un test au lieu de trois). |

### 3.3 Élévation de privilèges et garde-fous

1. **Plafond** : un gestionnaire non admin (permission « Gérer les rôles » ou « Gérer les comptes ») ne peut mettre dans
   un rôle, accorder ou affecter que des permissions **qu'il a lui-même** ; il ne peut ni modifier son propre rôle, ni
   ses propres surcharges, ni un rôle verrouillé, ni affecter `admin` / `sysop`. Vérifié dans le hook (pas seulement dans
   Next).
2. **Au moins un administrateur actif** : hook qui refuse de désactiver, rétrograder ou supprimer le dernier admin actif.
3. **Rôle utilisé** : suppression refusée tant que des agents l'ont (proposer la réaffectation en masse).
4. **Permissions sensibles** (noms PMR, suppression, administration, audit) : confirmation explicite dans l'interface +
   entrée d'audit lisible.
5. **Audit** : `roles` ajouté à `audit.pb.js` ; historique lisible par phrases (« A. Martin a ajouté *Supprimer un bon
   bus* au rôle Coordinateur de nuit — 4 agents concernés ») et bouton **Annuler ce changement** (rejoue l'état précédent).
6. **Catalogue fermé** : le hook refuse toute clé inconnue (comme `setPermissions` aujourd'hui) ; les droits BACO hors
   catalogue (`planning:read`…) restent conservés mais sans effet, affichés « hérités de BACO ».

### 3.4 Migration v2 → v3 sans perte

1. Créer `roles` et y insérer les 8 rôles système avec les permissions **exactement** équivalentes à `ROLE_DEFAULTS` +
   règles v2 (Modérateur et PACO/RCCA en extension : `journal:moderate`, `changelog:write`, `bus:reopen`…).
2. Ajouter `users.perms`, calculer pour chaque compte ; `grants` / `denies` gardés tels quels. Nouvelles clés éclatées
   (ex. `otto:*` → `bus:*` + `suppliers:*`) : chaque `grants` / `denies` v2 est reporté sur toutes ses clés filles.
3. **Contrôle d'équivalence avant bascule** : pour chaque compte réel (sur une copie de la base de prod, en local) et
   chaque clé, `can_v2(compte, clé) == perms_v3 contient clé` ; tout écart bloque la migration.
4. Réécrire les règles (migration dédiée, avec la liste explicite collection par collection plutôt que des regex) ;
   `users.role` → TextField.
5. Pas de retour arrière automatique (comme `1760002800`) : sauvegarde PocketBase juste avant, procédure dans
   DEPLOIEMENT-V2.

### 3.5 Plan de tests

- `test-rules.mjs` : les 431 contrôles existants doivent passer **sans modification d'attente** après L2 (preuve
  d'équivalence) ; puis ajouts : rôle créé à la volée qui donne / ne donne pas l'accès (sans redémarrage), modification
  d'un rôle visible à la requête suivante, `perms` forgé dans le corps ignoré (agent et admin), plafond du gestionnaire,
  dernier admin, rôle verrouillé non modifiable, compte « à nu » (`perms` vide, pas `null`).
- Vitest : calcul de `perms` (web et copie hook identiques), dépendances, phrases « peut / ne peut pas ».
- E2E : créer un rôle par l'interface, l'affecter, vérifier menus et refus ; 1440 et 390 px.

---

## 4. UX pour un admin non technicien

Principes : **phrases métier**, jamais de clé (`otto:write`) ; **regrouper par tâche** ; **montrer l'effet avant
d'enregistrer** ; **tout réversible**.

### 4.1 Parcours

1. **Administration › Rôles** : cartes (pastille de couleur, nom, description, « 12 agents », cadenas pour les rôles
   système verrouillés). Bouton « Nouveau rôle ».
2. **Nouveau rôle** : « À partir de quel rôle ? » (PACO/RCCA, Invité, vide…) → nom + description + couleur. Pré-coché
   d'après le modèle.
3. **Éditeur** : sections par tâche (Bons bus, Taxis, Missions PMR, Journal…), chacune avec un **résumé** (« Tout »,
   « Voir seulement », « Aucun », « Personnalisé ») et, dépliée, des **interrupteurs** en phrases (« Peut supprimer un bon
   bus »). Dépendances automatiques et expliquées (« Voir les bons bus a été activé, nécessaire pour les modifier »).
   Badges « Sensible » sur les droits à risque. Recherche (« supprimer », « PMR »).
4. **Aperçu en direct** (colonne de droite en desktop, onglet en mobile) : « Ce rôle peut… / ne peut pas… » en phrases,
   et « Changements non enregistrés : +2, −1 ».
5. **Comparer avec** un autre rôle : différences seulement.
6. **Enregistrer** : récapitulatif « 4 agents vont recevoir : Supprimer un bon bus » ; confirmation renforcée si un droit
   sensible est ajouté. Toast « Enregistré — Annuler ».
7. **Historique** du rôle : liste des changements en phrases, « Annuler ce changement ».

### 4.2 Fiche d'un agent

- **Rôle** : liste déroulante avec description du rôle choisi.
- **Ajustements pour cette personne** : phrases « En plus de son rôle : Peut modifier les lignes » / « Retiré : Voir les
  noms des voyageurs PMR », chacune avec une **raison** (texte court, facultatif) et un bouton retirer. « Ajouter un
  ajustement » ouvre la même liste de phrases avec recherche. La matrice 3 états actuelle disparaît (ou reste en mode
  « vue experte »).
- **Ce que cette personne peut faire** : même aperçu que l'éditeur de rôle, ajustements surlignés.
- Suggestion : si plusieurs agents ont les mêmes ajustements → « Créer un rôle à partir de ces ajustements ».

### 4.3 Mobile

Liste des rôles en cartes, éditeur en accordéons pleine largeur, interrupteurs de 44 px, aperçu dans un onglet
« Résultat », barre d'enregistrement collante en bas (au-dessus de la barre d'onglets, safe-area).

---

## 5. Plan en lots

Chaque lot est livrable seul en préversion (`csm-preview`) et passe `lint`, `test:run`, `build`, `test-rules`.

| Lot | Contenu | Visible | Taille | Risque |
|---|---|---|---|---|
| **L0** | Catalogue v3 (source unique `lib/permissions/catalog.ts`, libellés en phrases, tâches, sensibilité, dépendances) + copie générée pour les hooks + test de fraîcheur ; inventaire exhaustif des tests de rôle (hooks, web, règles) | non | S | faible |
| **L1** | `users.perms` calculé par hook (+ normalisation, masquage aux non-admins) ; contrôle d'équivalence v2/v3 sur une copie de la base ; le web lit `perms` dans `can()` | non | M | moyen (piège JSON null) |
| **L2** | Réécriture des règles en `perms ~` ; tests spéciaux des hooks → permissions (`journal:moderate`, `bus:reopen`, `changelog:write`) ; `hideFor` → permissions ; `test-rules` 431 inchangés + nouveaux | non (à droits égaux) | L | **élevé** : cœur de la sécurité, revue adversariale + audit sécurité obligatoires |
| **L3** | Collection `roles` (système insérés), `users.role` → texte validé, libellés et couleurs lus en base, plafond + dernier admin + audit `roles` | peu | M | moyen |
| **L4** | Écrans Administration › Rôles : liste, création depuis un modèle, éditeur par tâches, aperçu, comparaison, historique / annuler | oui | L | faible (sécurité portée par L2-L3) |
| **L5** | Fiche agent refondue (ajustements en phrases, raison, aperçu, « créer un rôle à partir de… ») | oui | M | faible |
| **L6** | Granularité fine (fournisseurs, modèles, export ALEA, « encodé », extension, administration délégable) — une permission à la fois, chacune testée | oui | M | moyen |
| **L7** (option) | Étiquettes libres (annuaire, mentions, campagnes) | oui | S-M | faible |
| **L8** (option) | Délégation : « Gérer les comptes » / « Gérer les rôles » pour un non-admin, plafonnée | oui | M | moyen |

Ordre conseillé : L0 → L1 → L2 → L3 → L4 → L5, puis L6 à L8 selon les réponses. L4 peut être maquetté en parallèle de L2.

### Risques principaux

- **Régression d'accès** à L2 (agent bloqué ou, pire, accès indu) → équivalence prouvée par `test-rules` inchangé +
  contrôle compte par compte sur une copie de la prod, déploiement en préversion d'abord.
- **Admin qui se retire ses propres droits** → garde-fous §3.3.
- **Rôles qui prolifèrent** (un par personne) → suggestion de réutilisation, compteur d'agents, comparaison.
- **Fausse attente** sur « ajouter des permissions » → message clair dans l'interface : « Les droits disponibles sont
  fixés par CSM ; tu peux les combiner librement dans des rôles. »

### Questions à faire valider

1. Qui crée / modifie les rôles : **admin seul**, ou délégation à un « gestionnaire des comptes » plafonné (L8) ?
2. Garder **Sysop** distinct d'Administrateur, ou le fusionner ?
3. « Ajouter des permissions » : les **étiquettes libres** sans effet de sécurité (L7) répondent-elles au besoin ? Pour
   quoi faire (annuaire, mentions, campagnes, audience des documents) ?
4. **Portée par district** (un PACO DSE limité aux données DSE) : souhaitée, malgré la décision du 11 oct. ?
5. **Droits temporaires** (ajustement avec date de fin, ex. remplacement d'une semaine) ?
6. Granularité du §2.3 : convient-elle ? Faut-il séparer « Valider l'envoi » de « Créer un bon » ?
7. Supprimer un rôle encore utilisé : refuser, ou proposer une réaffectation en masse ?
8. Les rôles Modérateur et PACO/RCCA peuvent-ils être **modifiés** depuis l'interface (proposé : oui, mais pas supprimés) ?
9. Couleur du rôle utilisée pour l'anneau d'avatar (aujourd'hui accent doublé pour admin / sysop seulement) ?

---

## Annexe — L0 / L1 livrés et inventaire des tests de rôle (14 oct. 2026)

### A. Catalogue v3 (L0) et `users.perms` (L1)

- **Source unique** : `web/src/lib/permissions/catalog.ts` (clé, tâche, libellé, phrase « Peut… », niveau, `requires`,
  `legacy`, rôles par défaut `roles`, `v2`, `hidden`). **69 clés** = **56 clés v2** (les 51 de `PERMISSION_MODULES` +
  les 5 lectures BACO `planning:read`, `bus:read`, `taxi:read`, `ops:read`, `lignes:read`, cachées) + **13 nouvelles**
  qui remplaceront des tests de rôle en dur au lot L2 :

  | Clé | Par défaut | Remplacera |
  |---|---|---|
  | `bus:reopen`, `taxi:reopen` | PACO/RCCA, Modérateur | « coordinateur » des bons (`lib/orders.js` `isCoordinator`, `lib/orders/status.ts`) : rouvrir un envoyé, rétablir un annulé |
  | `suppliers:read` | PACO/RCCA, Modérateur | onglet Fournisseurs `hideFor: ["guest"]` |
  | `pmr_equipment:manage` | PACO/RCCA, Modérateur | `isCoordinator()` (matériel complet, zones) + branche de rôle de `pmr_equipment.updateRule` |
  | `pmr_zones:read` | PACO/RCCA, Modérateur | `pmr_zones` list/view `role != "guest"` |
  | `journal:moderate` | Modérateur | `COORD_ROLES` (`lib/operations.js`), `isJournalModerator()`, branches `moderator` des règles `ops_log*` |
  | `spi:read` | PACO/RCCA, Modérateur | `spi_points` list/view `role != "guest"` |
  | `timetable:read` | PACO/RCCA, Modérateur | `train_services`, `train_relations`, `rail_lines` list/view (et `rail_lines.update`) `!= "guest"` ; onglets Lignes / Trains / Gares ; export des gares |
  | `team:read` | PACO/RCCA, Modérateur | onglet Équipe › Annuaire `hideFor` ; agents mentionnables (`server/data/ops.ts`) |
  | `quinyx:read` | PACO/RCCA, Modérateur | `quinyx_*` list/view `!= "guest"`, onglet Planning, accueil (`todayShiftOf`) |
  | `presence:read` | PACO/RCCA, Modérateur | « En ligne maintenant » (`topbar.tsx`, `onlineAgents`) |
  | `changelog:read`, `changelog:write` | PACO/RCCA + Modérateur / Modérateur | `changelog` list/view `!= "guest"` / create-update-delete `moderator` ; `canEditChangelog()`, onglet « Annonces » |

  Pas de clé d'administration : l'administration reste `ADMIN` (admin / sysop) en dur (décision : admin seul, délégation
  plus tard). Attention aux noms : `bus:read` / `taxi:read` sont des lectures **historiques de BACO** (cachées), sans
  rapport avec `bus:reopen` / `taxi:reopen` ; les bons bus restent sous `otto:*`, les taxis sous `generate_taxi:*`.
- **Copie pour les hooks** : `pocketbase/pb_hooks/lib/catalog.js`, écrite par `npm run catalog` (web/, aussi en
  `prebuild`) ; `catalog.test.ts` échoue si elle est périmée, si les clés v2 ne sont pas exactement couvertes, si les rôles
  par défaut v2 changent, ou si le calcul web (`lib/permissions/compute.ts`) et le hook (`lib/perms.js`) divergent.
- **`users.perms`** (migration `1760004300`, hook `users.pb.js`) : recalculé à **chaque** création / modification d'un
  compte (corps ignoré, même admin / superuser), recalculé pour tous les comptes au démarrage de `serve` si le catalogue a
  changé, jamais `null`. Héritage : admin / sysop = tout ; écran, désactivé, connecteur = rien ; accordé > retiré > rôle ;
  `legacy` ; puis retrait des clés dont une dépendance manque (seul écart voulu avec la v2 : une lecture retirée retire les
  actions du module). Masqué aux non-admins sur la fiche d'un autre agent (le compte de service lit `perms`, pas
  grants / denies) ; l'agent lit les siens. Côté web, `can()` lit `perms` pour toute clé du catalogue (sinon ancien
  calcul : instance sans le champ, droit hors catalogue comme `dicos:write`).
- **Contrôle d'équivalence** : `node pocketbase/scripts/perms-equivalence.mjs <data.db>` (ancien `can()` + tests de rôle
  en dur ↔ `perms` stocké, par compte et par clé, sans nom ni e-mail). Copie locale de la base de dev (13 comptes) :
  0 écart. À relancer sur une copie de la base de prod avant L2.

### B. Règles PocketBase (état après `1760004200`, lu dans `_collections`)

Atomes communs : `ACTIVE` = `@request.auth.id != "" && role != "disabled"` ; `ADMIN` = admin || sysop ;
`&& role != "screen"` ajouté partout par `1760003000`.

1. **`can(P)`** = `ACTIVE && (ADMIN || ((rôles par défaut de P) && denies !~ '"P"') || grants ~ '"P"')` → L2 :
   `ACTIVE && (ADMIN || perms ~ '"P"')`. Collections : `alea_marks` (deplacements:read / write), `b201_reports`
   (b201:*), `bus_companies`, `bus_company_lines`, `bus_contacts`, `bus_drivers`, `bus_orders` (otto:*),
   `order_templates`, `order_events` (otto:* ; generate_taxi:* pour `kind = "taxi"`), `taxi_companies`, `taxi_orders`
   (generate_taxi:*), `connector_tokens` create (deplacements:write), `dicos_syncs`, `group_missions`,
   `pmr_assist_legacy`, `pmr_clients`, `pmr_equipment`, `pmr_mission`, `train_schedules` (pmr:*), `pmr_assists`,
   `mission_trains` (deplacements:*), `pmr_events` (deplacements:read || pmr:read), `pmr_zones` create / update
   (pmr:write / update), `directory_contacts` (repertoire:*), `documents`, `procedures`, `procedure_versions`
   (documents:*), `ebp_views` (ebp:*), `level_crossings` (carte_pn:*), `line_stations`, `spi_points` create / update /
   delete (lignes:*), `ops_log`, `ops_log_events`, `ops_log_reads` (journal:*), `order_pdfs`, `order_pdf_backups`
   (archives:read / delete), `ptcar` (ptcar:*), `stations`, `rail_lines` update (ptcar:update), `train_watches` create
   (live:read).
2. **`canDelete(P)`** = `ACTIVE && (ADMIN || (moderator && denies !~ P) || grants ~ P)` (deleteRule de toutes les
   collections ci-dessus qui ont `X:delete`) → `perms ~ '"X:delete"'`.
3. **Tests de rôle hors `can()`** :

   | Collection.règle | Test actuel | L2 |
   |---|---|---|
   | `ops_log` list / view, `ops_log_events` / `ops_log_reads` list / view | `status = "active" \|\| author = moi \|\| ADMIN \|\| moderator` | `… \|\| perms ~ '"journal:moderate"'` |
   | `ops_log.update` | `author = moi \|\| ADMIN \|\| moderator` | `journal:moderate` |
   | `changelog` list / view | `role != "guest"` | `changelog:read` |
   | `changelog` create / update / delete | `ADMIN \|\| moderator` | `changelog:write` |
   | `pmr_equipment.update` (champs complets) | `ADMIN \|\| paco \|\| moderator` | `pmr_equipment:manage` |
   | `pmr_zones` list / view | `role != "guest"` | `pmr_zones:read` |
   | `spi_points` list / view | `role != "guest"` | `spi:read` |
   | `train_services`, `train_relations`, `rail_lines` list / view ; `rail_lines.update` | `role != "guest"` | `timetable:read` (update : `ptcar:update && timetable:read`) |
   | `quinyx_agents`, `quinyx_groups`, `quinyx_shifts` list / view | `role != "guest"` (connecteur compris) | `quinyx:read` **ou** `role = "connector"` (le connecteur n'a aucune permission de module) |
   | `quinyx_*` create / update / delete, `quinyx_places` list / view | `role = "connector" && grants ~ dicos:write` | inchangé (rôle système + droit hors catalogue) |
   | `dicos_syncs`, `group_missions`, `pmr_mission`, `pmr_assists`, `train_schedules`, `connector_tokens.update` | branche `grants ~ dicos:write` (compte de service) | inchangé |
   | `bus_orders`, `pmr_assists`, `mission_trains`, `alea_marks`, `dicos_syncs`, `ops_log`, `app_settings`, `users` list / view | branches `role = "screen"` | inchangé (rôle système verrouillé) |
   | `app_settings` (clé `import_delta`) ; create / update | `ADMIN` | inchangé |
   | `audit_log` list / view | `ADMIN \|\| grants ~ "audit:read"` | **`ADMIN` seul** (clé retirée du catalogue le 11 oct., grants effacés) |
   | `users` create / update / manage, `mail_campaigns`, `passkeys` list / view / delete, `user_sessions`, `cron_runs`, `connector_tokens` list / view / delete, `quinyx_groups` / `quinyx_places` écriture, `quinyx_agents` / `quinyx_shifts` delete | `ADMIN` | inchangé (admin seul) |
   | `pmr_zones.delete`, `dicos_syncs` / `group_missions` / `mission_trains` / `pmr_mission` / `train_schedules` delete | `ADMIN` seul | inchangé ; **écart** : le web donne `pmr:delete` au Modérateur, la règle des zones non |
   | `stations` list / view, `line_stations` list / view, `notifications`, `train_watches` | `ACTIVE` (invité compris) | inchangé ; **écart** : l'onglet Gares et l'export sont fermés à l'invité, la lecture de `stations` non |
   | `users.update` (soi-même) | `role / grants / denies / … :isset = false` | ajouter `perms:isset = false` est inutile (le hook écrase), à garder tel quel |

### C. Hooks PocketBase

| Fichier | Test | L2 |
|---|---|---|
| `lib/operations.js` `COORD_ROLES` / `isCoord` | admin, sysop, moderator (+ superuser) | `perms ~ journal:moderate` (lire `users.perms`) |
| `lib/operations.js` `hasJournalRead` (`LOG_READERS`), `hasPerm(u, perm, roles)` | calcul v2 recopié (rôle + grants + denies) | lire `perms` (une seule source) |
| `lib/operations.js` filtres `role != "disabled" && role != "connector"` (+ `screen`) | destinataires possibles | inchangé (rôles système) |
| `lib/orders.js` `isCoordinator` / `COORDINATOR` | admin, sysop, moderator, paco | `bus:reopen` / `taxi:reopen` selon la collection |
| `pmr.pb.js` `dicosIngest`, `lib/alerts.js` l. 90 | `grants ~ dicos:write` | inchangé (connecteur) |
| `pmr.pb.js` `onRecordEnrich` | `role = "screen"` | inchangé |
| `lib/alerts.js` l. 110 | `role != disabled / connector / screen` | inchangé |
| `passkeys.pb.js` | `disabled`, `connector` | inchangé |
| `users.pb.js` | `disabled` (tokenKey, jetons) | inchangé |
| `lib/import.js` `ROLE_MAP`, `lib/import-delta.js` | rôles BACO → v2, comptes créés désactivés | inchangé (`perms` recalculé par le hook à l'enregistrement) |

### D. Web (`web/src`)

| Où | Test | L2 |
|---|---|---|
| `lib/permissions.ts` `isCoordinator` (pmr/actions.ts `saveEquipment`, `saveZone`, pmr/materiel/page.tsx) | admin, sysop, moderator, paco | `can(user, "pmr_equipment:manage")` |
| `lib/orders/status.ts` `isCoordinator(role)` (bus-order-view, taxi-order-view, commandes/suivi) | idem | `can(user, "bus:reopen" \| "taxi:reopen")` |
| `lib/permissions.ts` `isJournalModerator` (operations/actions.ts, journal/page.tsx, export main courante) | admin, sysop, moderator | `can(user, "journal:moderate")` |
| `lib/permissions.ts` `canEditChangelog` (equipe/actions.ts, changelog/page.tsx) | admin, sysop, moderator | `can(user, "changelog:write")` |
| `changelog/page.tsx` `showAnnouncements = role !== "guest"` | invité exclu | `changelog:read` |
| `navigation.ts` `hideFor: ["guest"]` (Fournisseurs) | | `permission: "suppliers:read"` |
| `navigation.ts` `hideFor: ["guest", "screen"]` (Lignes, Trains, Gares) | | `timetable:read` |
| `navigation.ts` `hideFor: ["guest", "screen"]` (Équipe › Annuaire / Planning) | | `team:read` / `quinyx:read` |
| `navigation.ts` `hideFor: ["screen"]` (Mon profil) | | inchangé (rôle système) |
| `components/shell/topbar.tsx` `role !== "guest"` ; `equipe/actions.ts` `onlineAgents` `role === "guest"` | « en ligne » | `presence:read` |
| `(app)/page.tsx` `role === "guest" ? null : todayShiftOf` | | `quinyx:read` |
| `server/data/ops.ts` l. 371 (agents mentionnables) | `role != guest / disabled / connector / screen` | `perms ~ '"team:read"'` |
| `server/quinyx-ingest.ts` l. 167, `lib/quinyx/model.ts` `TEAM_ROLES` | comptes de l'équipe (horaires gardés) | `quinyx:read` (même ensemble) ou étiquette d'équipe (L7) |
| `app/api/referentiels/gares/export/route.ts` | `guest / screen / disabled / connector` exclus | `timetable:read` |
| `server/auth.ts` `isAdmin` / `requireAdmin` (pages et actions admin, export d'audit, actions admin des archives, import du référentiel des trains, ⌘K comptes) | admin, sysop | inchangé (admin seul) |
| `server/auth.ts` `requireUser` (`screen` → `/tv`), `app/connexion/actions.ts`, `api/events` (présence), `server/data/handover.ts`, `tv/page.tsx`, `(app)/layout.tsx` (`isScreen`) | rôle Écran | inchangé |
| `server/data/team.ts`, `server/data/quinyx.ts`, `search-actions.ts`, `admin/campaign-actions.ts` (filtres `role != disabled / connector / screen`) | listes d'agents | inchangé (rôles système) |
| `admin/*` (`ROLES`, `ROLE_CHOICES`, `user-editor`, `permission-matrix` `full`, compte `connector` non gérable) | administration des rôles | L3 (collection `roles`) |
| `components/shell/avatar.tsx` `avatarRing`, `equipe/page.tsx` badge admin | admin / sysop | L3 (couleur du rôle) |
| `server/dicos-service.ts` `can(owner, "deplacements:write")` | droits du propriétaire du jeton | lit déjà `perms` (L1) |

### E. À savoir pour L2

- **Temps réel** (vérifié le 14 oct. sur PocketBase 0.40.4, script de contrôle hors dépôt) : une souscription SSE déjà
  ouverte **suit** un changement de droits fait par l'API ou `$app.save()` (retrait de `journal:read` → plus d'événement
  `ops_log` ; rétabli → de nouveau reçu) : PocketBase rafraîchit la fiche `@request.auth` de ses clients temps réel quand
  la fiche de l'agent est enregistrée. Une écriture **SQL directe** sur `users` (migration, recalcul au démarrage) ne la
  rafraîchit pas : au lot L3, le recalcul des agents d'un rôle modifié doit passer par `$app.save()`.
- Le recalcul de `perms` après un changement du catalogue est automatique (démarrage de `serve`) ; ajouter un contrôle
  `test-rules` par nouvelle clé.
