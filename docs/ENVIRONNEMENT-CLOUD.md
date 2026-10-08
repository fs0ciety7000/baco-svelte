# Environnement cloud Claude Code « CSM »

À créer dans claude.ai/code : menu de l'environnement (barre de titre d'une session) → **Nouvel environnement**.
Documentation : https://code.claude.com/docs/en/claude-code-on-the-web

## 1. Nom et description

- **Nom** : `CSM`
- **Description** : `CSM v2 — Next.js + PocketBase (baco-svelte), Supabase BACO en lecture seule`

## 2. Accès réseau

Niveau **Limited**, case « Allow package managers » cochée (npm, GitHub…), et ces domaines autorisés :

| Domaine | Pourquoi |
|---|---|
| `mgljaheyimizrydazrxh.supabase.co` | Sauvegarde / export BACO (lecture seule) |
| `test-csm.fs0ciety.org` | Vérifier le déploiement CSM |
| `pb-test-csm.fs0ciety.org` | Instance PocketBase CSM (si exposée pour l'admin) |
| `<domaine de ton Coolify>` | API Coolify (déploiements), si tu fournis un jeton |
| `api.irail.be` | Trains en direct (iRail) |
| `fonts.googleapis.com`, `fonts.gstatic.com` | `next/font` télécharge Saira Condensed au build |
| `github.com`, `objects.githubusercontent.com` | Binaire PocketBase (releases GitHub) |
| `linear.app`, `vercel.com`, `raycast.com`, `attio.com`, `gsap.com` | Recherche de références design (facultatif) |

Le plus simple au début : niveau **Full** (comme « Default »), puis restreindre une fois la liste stabilisée.
Vérifié en session 2 : sans ces domaines, le proxy répond 403 (`curl -sS "$HTTPS_PROXY/__agentproxy/status"`).
Les scripts Node doivent tourner avec `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.
Ne pas autoriser `test.fs0ciety.org` : l'instance PocketBase du jeu n'a rien à faire dans cet environnement.

## 3. Variables d'environnement / secrets

À ranger dans **Network secrets** si la section existe, sinon en variables. Ne jamais les coller dans une conversation.

| Variable | Contenu |
|---|---|
| `SUPABASE_URL` | `https://mgljaheyimizrydazrxh.supabase.co` |
| `SUPABASE_SECRET_KEY` | Clé secrète **après rotation** |
| `SUPABASE_PUBLISHABLE_KEY` | Clé publiable **après rotation** |
| `CSM_TEST_ADMIN_EMAIL`, `CSM_TEST_ADMIN_PASSWORD` | Compte admin de test BACO/CSM |
| `CSM_PB_URL`, `CSM_PB_ADMIN_EMAIL`, `CSM_PB_ADMIN_PASSWORD` | Instance PocketBase CSM, une fois déployée sur Coolify |
| `COOLIFY_API_URL` | Facultatif : adresse de **ton tableau de bord Coolify**, sans chemin (ex. `https://coolify.fs0ciety.org`). L'API est servie sous `/api/v1` |
| `COOLIFY_API_TOKEN` | Facultatif : jeton créé dans Coolify → **Keys & Tokens → API tokens** (activer l'API dans **Settings** si besoin), droits `read` + `write` + `deploy`, **sans** `root` ni `read:sensitive` |

**Ne pas reprendre** `PREPROD_PB_*` ni `PREPROD_KEEP_EMAILS` (instance du jeu). `OPENAI_API_KEY` n'est pas utile à CSM.

## 4. Script d'installation

```bash
#!/usr/bin/env bash
set -euo pipefail
# PocketBase (prototype local) — figer la dernière version stable (voir github.com/pocketbase/pocketbase/releases)
PB_VERSION=0.40.4   # version figée de CSM (pocketbase/Dockerfile)
if ! command -v pocketbase >/dev/null; then
  cd /tmp && Z="pocketbase_${PB_VERSION}_linux_amd64.zip"
  curl -fsSL -o "$Z" "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/$Z"
  curl -fsSL "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/checksums.txt" | grep "$Z" | sha256sum -c -
  unzip -o -q "$Z" pocketbase -d /usr/local/bin && rm "$Z"
fi
# age (archives chiffrées) — déjà présent sur l'image par défaut, sinon :
command -v age >/dev/null || (apt-get update -qq && apt-get install -y -qq age)
```

Constaté en session 2 : `pocketbase` n'était pas installé au démarrage (script absent ou non exécuté) ; il a été
installé à la main. Vérifier que ce script est bien collé dans les réglages de l'environnement.

Les dépendances `npm` de `/web` s'installent dans la session (`cd web && npm ci`), le dossier n'existant pas
encore. Une fois `/web` créé, ajouter un hook SessionStart dans le dépôt plutôt que d'alourdir ce script.

## 5. Connecteurs et dépôt

- Dépôt : `fs0ciety7000/baco-svelte`.
- Connecteurs : **Supabase** (lecture SQL, pour les empreintes et les contrôles) et **GitHub**.
