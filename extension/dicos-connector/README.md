# CSM — Connecteur DICOS (extension de navigateur)

Petite extension **Chromium / Edge** (Manifest V3) qui synchronise les **missions PMR** de
[DICOS](https://dicos.intern-belgiantrain.be) vers **CSM** (onglet **Missions PMR**), en réutilisant la
**session DICOS déjà ouverte** par l'agent. Conception : `../../docs/design/CADRAGE-DICOS.md`.

> **Aucun identifiant SNCB n'est stocké.** L'extension ne persiste ni mot de passe, ni jeton DICOS : elle
> relève le Bearer **en vol** depuis les requêtes que la SPA DICOS émet déjà, le temps d'un appel. Elle ne
> s'authentifie auprès de CSM qu'avec un **jeton de connecteur propre à CSM** (révocable, sans accès à DICOS).

## Pourquoi une extension

DICOS est protégé par Entra ID / IdHub (OIDC) **sans `offline_access`** : pas de `refresh_token`, et l'IT ne
fournit pas de *client credentials*. Aucun flux serveur-à-serveur non interactif n'est donc possible. La seule
voie durable est de **s'appuyer sur la session de l'agent** : l'extension, active sur l'origine DICOS, réutilise
le Bearer que la SPA détient déjà. L'expiration est gérée par DICOS lui-même (il suffit que l'onglet reste
connecté). Un simple bookmarklet ne suffirait pas (le POST cross-origin vers CSM est bloqué par CORS) — d'où une
extension, dont le service worker a la permission d'hôte CSM.

## Fonctionnement (3 composants)

| Fichier | Monde | Rôle |
|---|---|---|
| `src/inject.js` | page DICOS (`world: MAIN`, déclaré dans le manifest à `document_start`) | observe `fetch`/`XHR` de la SPA, relève **en vol** l'en-tête `Authorization: Bearer …` et le corps de `POST /api/missions` (`stationIds` = périmètre de gares) et les transmet au content script par `postMessage` (même origine). Aucune requête émise, aucune donnée personnelle lue. |
| `src/content.js` | isolé, même origine | appelle **en même origine** `POST /api/missions` (liste du jour), en déduit les **dossiers** (n° `AAAA-MM-JJ-NNNN` + type) puis lit chaque dossier complet `GET …/trip-details/{n°}/{type}` (gabarit relevé sur la SPA par `inject.js`, ~4 req/s) et transmet les dossiers **bruts** au service worker (v1.1). Repli sur `GET /api/missions/{id}` (format v1.0) si trip-details ne répond pas. Modes bouton **et** automatique (pause si l'onglet est caché). |
| `src/background.js` | service worker | seul à faire l'appel **cross-origin** vers CSM : `POST {csmUrl}/api/pmr/missions/ingest` avec l'en-tête `x-dicos-token`. Ne voit jamais le Bearer DICOS. |

Le **mapping** DICOS → prestation CSM (type PMR, statut, n° de dossier `AAAA-MM-JJ-NNNN`, détail nominatif) est
fait **par le serveur CSM** (`web/src/lib/pmr/dicos-mission.ts`), source unique de vérité : l'extension reste
volontairement « bête » et envoie la mission brute (liste + détail fusionnés).

## Paquets prêts à charger

Deux `.zip` sont générés dans **`web/downloads/dicos-connector/`** (régénérés par `extension/build-zips.sh`, avec
`release.json` : version, tailles, SHA-256). Les agents les téléchargent dans **CSM › PMR › Extension DICOS**
(`/pmr/extension`), qui donne aussi la procédure d'installation, de mise à jour et de dépannage. À chaque nouvelle
version : monter la version des deux manifests, ajouter les nouveautés dans `web/src/lib/pmr/extension-releases.ts`,
relancer `build-zips.sh` (un test vérifie que les trois concordent).

| Navigateur | Paquet | Manifest |
|---|---|---|
| **Chrome / Edge** | `csm-dicos-connector-chrome-v1.6.1.zip` | `background.service_worker` |
| **Firefox** (≥ 128) | `csm-dicos-connector-firefox-v1.6.1.zip` | `background.scripts` + `browser_specific_settings.gecko` |

Les sources (`src/`) sont **communes** ; seul le manifest diffère. Le code utilise l'espace de noms `chrome.*`
(aliasé par Firefox) et des content scripts en monde `MAIN` (Chrome 111+, Firefox 128+).

## Installation

### Chrome / Edge
1. `chrome://extensions` (ou `edge://extensions`) → activer le **mode développeur**.
2. Dézipper le paquet Chrome et **Charger l'extension non empaquetée** → sélectionner le dossier dézippé
   (ou charger le dossier `extension/dicos-connector` directement).

### Firefox (≥ 128)
1. `about:debugging#/runtime/this-firefox` → **Charger un module temporaire…**.
2. Sélectionner le fichier **`manifest.json` à l'intérieur du paquet Firefox dézippé** (ou installer le `.xpi`
   signé par AMO si tu passes par le magasin). Un module temporaire disparaît au redémarrage de Firefox : pour
   un usage permanent, signer le paquet sur [addons.mozilla.org](https://addons.mozilla.org) (self-distribution).

### Suite (commun aux deux)
3. Ouvrir **DICOS**, se connecter, **naviguer une fois dans la liste des missions** (pour que l'extension relève
   la session et le périmètre de gares).
4. **Connexion (1.7.0)** : dans CSM, ouvrir **PMR › Extension DICOS** et cliquer **Connecter l'extension à mon
   compte**. La page crée le **jeton personnel** de l'agent (`csmc_…`, collection `connector_tokens`, seule l'empreinte
   SHA-256 est stockée) et le transmet à l'extension par `postMessage` ; le script `src/csm-link.js`, actif seulement
   sur `/pmr/extension` des domaines CSM du manifest (`test-csm` et `csm.fs0ciety.org`), l'enregistre avec l'adresse
   de la page comme URL CSM. Repli : « Générer un jeton à coller à la main ».
5. Dans l'extension, cliquer **Autoriser CSM** (permission d'hôte, geste de l'agent), choisir le **jour**, puis
   **Synchroniser ce jour** (ou la synchro automatique).

L'extension envoie sa version (`x-csm-extension`) ; la réponse donne la dernière version publiée sur CSM, et le popup
propose la mise à jour. Le dernier lot de chaque jour porte `final: true` : CSM n'affiche « synchronisé » qu'à sa
réception (synchro interrompue = « incomplète »). **Nouveau domaine de production : l'ajouter aux `matches` de
`csm-link.js` et à `optional_host_permissions` des deux manifests.**

## Côté CSM (serveur)

L'endpoint d'ingestion `POST /api/pmr/missions/ingest` (voir `web/src/app/api/pmr/missions/ingest/route.ts`) :

- est **désactivé (503)** tant que les variables ne sont pas posées ;
- exige l'en-tête **`x-dicos-token`** : jeton **personnel** de l'agent (`csmc_…`, retrouvé par son empreinte, 60 s de
  cache, révocable depuis la page ou supprimé à la désactivation du compte) ou, pour les installations antérieures à
  1.7.0, le secret partagé `CSM_DICOS_TOKEN` (facultatif, comparaison à temps constant) ;
- écrit avec un **compte de service** PocketBase (`CSM_DICOS_PB_EMAIL` / `CSM_DICOS_PB_PASSWORD`, rôle `connector`
  + droit `dicos:write`) : les règles et hooks PocketBase s'appliquent ;
- est **idempotent** (dédup sur `dicos_id`), ne touche pas les prestations **anonymisées**, et range le détail
  nominatif dans `pmr_mission` (lisible avec `pmr:read` seulement) ;
- reçoit aussi les **groupes** (`{ day, groups }`, depuis 1.5.0) : missions `reservationType` « Group » sans
  voyageur PMR (`disabled = 0`), rangées dans `group_missions` (onglet **PMR › Groupes**, export ALEA) ;
- **temps d'arrêt ATMS** (depuis 1.6.0) : après chaque synchro, l'extension lit l'itinéraire des trains concernés
  dans un **onglet ATMS ouvert et connecté** (`GET /api/v1/trains/{n°}/{jour}`, même origine, session de l'agent —
  aucun cookie lu ni conservé) et l'envoie à `POST /api/pmr/schedules/ingest` (même jeton de connecteur). CSM en tire
  le temps d'arrêt prévu de chaque gare pour l'export ALEA « Obligatoire ». Sans onglet ATMS : CSM se rabat sur
  l'horaire iRail, la synchro DICOS n'est pas bloquée. **1.6.1** : un onglet ATMS ouvert *avant* l'installation ou
  la mise à jour de l'extension reçoit le script à la demande (permission `scripting`) au lieu d'échouer
  (« Receiving end does not exist ») ; sans onglet joignable, lecture directe avec la session ATMS du navigateur ;
  jusqu'à 100 trains par jour ; le popup indique la voie utilisée et les trains introuvables.

Variables à définir côté `csm-web` (Coolify), **en secrets** :

```
CSM_DICOS_TOKEN=<secret partagé, facultatif : extensions < 1.7.0 seulement>
CSM_DICOS_PB_EMAIL=<compte de service>
CSM_DICOS_PB_PASSWORD=<mot de passe du compte de service>
```

## Firefox signé (installation durable)

Le job CI « sign-firefox » (`.github/workflows/dicos-extension-release.yml`) signe le paquet Firefox sur
addons.mozilla.org (canal **non listé**, pas de fiche publique) et commite le `.xpi` dans
`web/downloads/dicos-connector/` ; CSM propose alors « Installer dans Firefox ». Il ne tourne que si les secrets
GitHub **`AMO_JWT_ISSUER`** et **`AMO_JWT_SECRET`** sont définis (compte développeur addons.mozilla.org → *Gérer les
clés d'API*), une fois par version. Le manifest Firefox déclare `data_collection_permissions` (exigé par AMO).

## Sécurité & vie privée

- Jeton DICOS : **jamais persisté** (mémoire du content script, le temps d'un appel).
- Jeton de connecteur CSM : stocké en `chrome.storage.local`, **révocable** côté CSM, sans accès à DICOS.
- Données nominatives : traitées comme le reste du PMR → **`pmr:read`**, **anonymisation 12 mois**, jamais en
  Git / capture / export nominatif.
- Permission d'hôte CSM demandée **à l'enregistrement** (geste utilisateur), pas à l'installation ;
  `optional_host_permissions` est **restreint au domaine CSM** (`https://*.fs0ciety.org/*`) — un autre hôte ne peut
  jamais être accordé. **Si la production passe sur un autre domaine, l'ajouter ici** avant déploiement.

## Limites

- Nécessite un **onglet DICOS ouvert et connecté** (cas nominal en service). Session expirée → recharger DICOS.
- La synchro automatique **se met en pause** quand l'onglet n'est pas visible (ménage DICOS).
- Les codes d'assistance inconnus sont mappés « Autre » côté serveur et complétés au fil des imports.

## Points ouverts

- Liste complète des `reservationType` / `typeId` (connus : `pmr-bp`→NV, `pmr-ew`→CRE).
- Mode de distribution interne (chargement local ci-dessus vs magasin d'entreprise).
