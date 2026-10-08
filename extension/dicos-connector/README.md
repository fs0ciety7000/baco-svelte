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
| `src/content.js` | isolé, même origine | appelle **en même origine** `POST /api/missions` (liste) puis `GET /api/missions/{id}?reservationType=…` (détail, ~4 req/s, 3 en vol), fusionne, et transmet les missions **brutes** au service worker. Modes bouton **et** automatique (pause si l'onglet est caché). |
| `src/background.js` | service worker | seul à faire l'appel **cross-origin** vers CSM : `POST {csmUrl}/api/pmr/missions/ingest` avec l'en-tête `x-dicos-token`. Ne voit jamais le Bearer DICOS. |

Le **mapping** DICOS → prestation CSM (type PMR, statut, n° de dossier `AAAA-MM-JJ-NNNN`, détail nominatif) est
fait **par le serveur CSM** (`web/src/lib/pmr/dicos-mission.ts`), source unique de vérité : l'extension reste
volontairement « bête » et envoie la mission brute (liste + détail fusionnés).

## Installation

> Raccourci : un **`.zip` prêt à charger** est fourni à la racine du dossier `extension/` (`dicos-connector.zip`) —
> télécharge-le, dézippe-le, et tu obtiens directement le dossier `dicos-connector/` à sélectionner à l'étape 2.

1. **Chrome/Edge** → `chrome://extensions` (ou `edge://extensions`) → activer le **mode développeur**.
2. **Charger l'extension non empaquetée** → sélectionner ce dossier (`extension/dicos-connector`).
3. Ouvrir **DICOS**, se connecter, **naviguer une fois dans la liste des missions** (pour que l'extension relève
   la session et le périmètre de gares).
4. Cliquer l'icône de l'extension → remplir :
   - **URL CSM** : `https://test-csm.fs0ciety.org` (production le jour venu) ;
   - **Jeton de connecteur** : la valeur de `CSM_DICOS_TOKEN` (fournie par l'admin CSM — **jamais** le Bearer
     DICOS) ;
   - éventuellement **synchro automatique** + période.
5. **Enregistrer les réglages** (accorde la permission d'hôte vers l'URL CSM), choisir le **jour**, puis
   **Synchroniser ce jour**.

## Côté CSM (serveur)

L'endpoint d'ingestion `POST /api/pmr/missions/ingest` (voir `web/src/app/api/pmr/missions/ingest/route.ts`) :

- est **désactivé (503)** tant que les variables ne sont pas posées ;
- exige l'en-tête **`x-dicos-token`** = `CSM_DICOS_TOKEN` (comparaison à temps constant) ;
- écrit avec un **compte de service** PocketBase (`CSM_DICOS_PB_EMAIL` / `CSM_DICOS_PB_PASSWORD`, rôle `reader`
  + droit `dicos:write`) : les règles et hooks PocketBase s'appliquent ;
- est **idempotent** (dédup sur `dicos_id`), ne touche pas les prestations **anonymisées**, et range le détail
  nominatif dans `pmr_mission` (lisible avec `pmr:read` seulement).

Variables à définir côté `csm-web` (Coolify), **en secrets** :

```
CSM_DICOS_TOKEN=<jeton de connecteur>
CSM_DICOS_PB_EMAIL=<compte de service>
CSM_DICOS_PB_PASSWORD=<mot de passe du compte de service>
```

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
