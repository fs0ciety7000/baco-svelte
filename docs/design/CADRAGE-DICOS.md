# Cadrage — intégration DICOS (Missions PMR)

> 8 octobre 2026 · Note de conception. **Aucun jeton, aucune donnée personnelle ni réelle ne figure dans ce
> document** (ni dans Git, ni dans une capture). Les exemples de structure sont génériques.

Objectif : importer les **missions d'assistance PMR** depuis l'outil interne DICOS
(`https://dicos.intern-belgiantrain.be`) dans CSM, pouvoir **choisir un jour** et voir les missions, avec le
**numéro de dossier** de chaque mission. Renommer l'onglet **Prestations → Missions PMR**.

---

## 1. Contrainte d'authentification (ce qui cadre toute la solution)

- DICOS est une **SPA** protégée par **Entra ID / IdHub OIDC** (`idp.intern-belgiantrain.be`). Après connexion
  (mot de passe + fédération), la SPA détient un **access token** (Bearer) qu'elle rejoue sur `/api/*`. Durée ≈ 14 h.
- Pas de **client credentials / app registration** possible : **l'IT ne le fournira pas** (décision du 8 oct.).
- Scopes observés (`openid, dmz-hr, B2E-full`) **sans `offline_access`** → pas de `refresh_token` exploitable.
- Conséquence : **aucun flux serveur-à-serveur non interactif** n'est possible. Le jeton ne peut pas être rafraîchi
  côté CSM. Toute solution doit **s'appuyer sur la session DICOS déjà ouverte par l'agent**.

## 2. Solution retenue : extension de navigateur greffée sur DICOS

Une **petite extension** (Chromium/Edge) active sur l'origine `dicos.intern-belgiantrain.be` :

- s'exécute dans le contexte de l'onglet DICOS **déjà connecté** → **réutilise la session existante** (le Bearer que
  la SPA détient en mémoire) ; **rien à stocker, aucun mot de passe, aucun rafraîchissement à gérer** : l'expiration
  est gérée par DICOS lui-même via la session de l'agent ;
- appelle l'API DICOS **en same-origin** (pas de CORS, le navigateur attache la session) ;
- **filtre et mappe** côté extension, puis **pousse vers un endpoint d'ingestion CSM** authentifié par un **jeton de
  connecteur propre à CSM** (pas les identifiants SNCB). L'extension peut émettre le POST cross-origin vers CSM grâce
  à ses *host permissions* (ce qu'un simple bookmarklet ne peut pas).

Pourquoi pas les alternatives :
- **CSM lit DICOS côté serveur** : exclu (auth Entra interactive, pas de compte applicatif).
- **Connecteur Node local avec SSO silencieux** : possible seulement si le poste est Entra-joint et via un broker
  Windows ; plus lourd, et ne dispense pas d'un onglet/session. L'extension est plus simple et aussi durable.
- **Bookmarklet** : bloqué par le CORS pour le POST vers CSM.

**Limite assumée :** la synchro nécessite un **onglet DICOS ouvert et connecté** — ce qui est le cas en service.

## 3. Endpoints DICOS utilisés

| Appel | Usage | Remarque |
|---|---|---|
| `POST /api/missions` (corps = filtre) | Liste des missions d'un jour | Corps **confirmé** : `{ "stationIds": ["8863008", …], "date": "AAAA-MM-JJ" }` (gares du périmètre de l'agent + jour). `traveler` n'y donne que des **compteurs** |
| `GET /api/missions/{id}?reservationType={type}` | Détail d'une mission | Porte le **n° de dossier** (`reservationId` = `reservationDisplayId`, format `AAAA-MM-JJ-NNNN`) et le point de rencontre |

- Le filtre `stationIds` est la **liste des gares du périmètre de l'agent** : l'extension la reprend telle quelle de la
  requête que DICOS émet déjà, et ne change que `date` selon le jour choisi (aucune config de périmètre à saisir).
- Les **types d'assistance** (`typeId`/`symbol`, ex. `pmr-bp`/`blind-person`) ne sont **que dans le détail** ; la liste
  ne donne que des compteurs → la table de correspondance se construit aux appels de détail (repli « Autre »).
- Le n° de dossier **n'est pas** dans la liste : il faut **un appel de détail par mission** → pour un jour (~150
  missions) prévoir une **limitation de débit** (par ex. 3–5 req/s, file bornée) côté extension, et ne recharger le
  détail que des missions nouvelles ou modifiées (voir dédup).
- `reservationType` est **obligatoire** sur le détail (ex. `Disabled`, `Group`) ; il vient de la liste.

## 4. Données reprises (décision du 8 oct. : **on garde tout**)

Contrairement à la première hypothèse, on importe **l'ensemble** des champs utiles d'une mission, y compris les
données nominatives et de contact. **Garde-fous inchangés** : lecture derrière **`pmr:read`**, **anonymisation à 12
mois**, **jamais dans Git ni dans une capture**, exports sans nom. À confirmer avec le **DPO** (comme le reste du PMR).

Mapping mission DICOS → prestation CSM (`pmr_assists`, champs à compléter) :

| Source DICOS | Cible CSM | Note |
|---|---|---|
| `id` | `dicos_id` (nouveau, unique) | Clé de **déduplication** |
| `reservationId` / `reservationDisplayId` | `dicos_ref` | N° de dossier `AAAA-MM-JJ-NNNN` (le format diffère de l'ancien DICOS `1234-56-78-9012` → élargir le motif) |
| `journey.time`, `journey.stationName` | heure, gare | Instant réel → jour + heure Europe/Brussels |
| `journey.otherStationName` | autre gare | Origine/destination selon le sens |
| `missionType` (`Departure`/`Arrival`/`Stickering`) | sens / type de mission | `Stickering` = étiquetage groupe, à distinguer |
| `journey.trainNumber`, `transportId` | train | |
| `traveler.disableds[]` (`typeId`, `quantity`, `symbol`) [détail] + `fullAssistances`, `lightAssistances` | type + nombre PMR | `pmr-bp`/`blind-person` → NV ; table complétée au fil des imports, repli « Autre » |
| `reservationType` | type de réservation | `Disabled` / `Group` |
| `status` | statut (voir §5) | |
| `client` (nom, prénom, **e-mail, téléphone, langue**) | fiche client PMR liée | **nominatif** → `pmr:read`, anonymisé 12 mois |
| `trainManager`, `driver` (nom, **téléphone**, rôle) | accompagnement (nouveau) | Donnée d'exploitation, même protection |
| `meetingPoint[]` (multilingue) | point de rencontre | Prendre FR par défaut |
| `coachNumber`, `doorNumber`, `coaches[]` | voiture / porte | |
| `owner` (agent affecté) | attribué à | |

## 5. Correspondance des statuts

DICOS : `New`, `Assigned`, `Started`, `Completed`, `Deleted`, `Suspended` → CSM (prévue / réalisée / annulée /
absent) à caler ensemble. Piste : `New`/`Assigned`/`Started` → **prévue** ; `Completed` → **réalisée** ;
`Deleted`/`Suspended` → **annulée** ; `clientStatus = Absent` → **client absent**. À valider.

## 6. Côté CSM

- **Renommage** onglet et libellés **Prestations → Missions PMR** (`web/src/navigation.ts`, pages `/pmr`).
- **Sélecteur de jour** sur l'écran des missions (déjà proche de l'existant `?du=&au=`).
- **Collection / champs d'ingestion** : étendre `pmr_assists` (`dicos_id` unique, champs ci-dessus) ou une table
  d'ingestion tampon ; **idempotent**, dédup sur `dicos_id`, met à jour le statut si la mission a changé.
- **Endpoint d'ingestion** `POST /api/pmr/missions/ingest` :
  - authentifié par un **jeton de connecteur** (collection PocketBase dédiée, révocable, sc: `pmr:write`), **jamais**
    un jeton d'agent interactif ;
  - **CORS** limité à l'origine de l'extension / au besoin réel ; corps validé par zod ; écrit via hooks (audit,
    historique) ; ne crée jamais de nom en clair lisible sans `pmr:read`.
- **Deux modes de synchro** (décision du 8 oct.) :
  - **bouton** « Synchroniser ce jour » dans l'extension (simple, prévisible) ;
  - **automatique** toutes les X min tant que l'onglet DICOS est **ouvert et visible** (pause onglet caché), avec
    débit limité et dédup.

## 7. Sécurité & vie privée

- **Aucun identifiant SNCB stocké dans CSM** ; l'extension ne persiste pas le Bearer (lecture en vol depuis la session).
- Le **jeton de connecteur** CSM est révocable et scoped ; sa fuite ne donne pas accès à DICOS.
- Données nominatives et de contact : **`pmr:read`**, **anonymisation 12 mois**, **jamais** en Git/capture/export nominatif.
- Journalisation d'audit des ingestions (qui/quoi/quand), sans recopier le contenu personnel dans les logs.

## 8. Points ouverts (à confirmer)

1. ~~Corps de `POST /api/missions`~~ — **confirmé** : `{ stationIds[], date }` (voir §3).
2. Liste complète des `reservationType` et des `typeId`/`symbol` — connus `pmr-bp`/`blind-person`, le reste se complète aux imports (repli « Autre »).
3. Poste **Entra-joint** ? (n'est plus bloquant avec l'extension, mais utile si on voulait un connecteur natif).
4. ~~Validation DPO~~ — **confirmée (8 oct.)** : conservation autorisée, durée libre ; on garde 12 mois par défaut (modifiable), tout derrière `pmr:read`.
5. Navigateur cible (Edge/Chromium) et mode de distribution de l'extension (chargement local vs magasin interne).
