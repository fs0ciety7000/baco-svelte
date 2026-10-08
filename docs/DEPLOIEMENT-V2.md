# Déploiement de CSM v2 sur Coolify

> Environnement de test : **https://test-csm.fs0ciety.org** (web) et **https://pb-test-csm.fs0ciety.org** (PocketBase,
> réservé à l'administration). Ressources créées par Claude via l'API Coolify le 8 octobre 2026.
> BACO (Vercel, branche `main`, base Supabase) n'est pas concerné.

## 1. Ressources Coolify

Projet **CSM** (`cqqgszrebw6mm6wyizbzb5i3`), environnement `production`, serveur `localhost` (Coolify 4.4.2,
proxy Traefik). Source : GitHub App `breakable-bee-gkkc8wwg8sswo044`, dépôt `fs0ciety7000/baco-svelte`.

| Ressource | UUID | Dossier / Dockerfile | Port | Domaine | Nom interne |
|---|---|---|---|---|---|
| `csm-pocketbase` | `ttu45cm7qrgmqgo7dcespp3f` | `/pocketbase` · `/Dockerfile` | 8090 | `pb-test-csm.fs0ciety.org` | `csm-pocketbase` |
| `csm-web` | `xzhygai7yapefgji83rkgile` | `/web` · `/Dockerfile` | 3000 | `test-csm.fs0ciety.org` (via Cloudflare) | `csm-web` |

- **Branche déployée** : `claude/admiring-thompson-1lkun9` (branche de la session 2). À chaque nouvelle branche de
  travail, la changer dans Coolify (Application → Configuration → Git → Branch, ou `PATCH /applications/{uuid}`
  `git_branch`). Auto-déploiement au push, filtré par `watch_paths` (`web/**`, `pocketbase/**`).
- **Health checks** : `/api/health` sur chaque application. Celui du web renvoie `{ ok, pocketbase }` : `pocketbase:
  false` signifie que le web ne joint pas `http://csm-pocketbase:8090`.
- **Réseau** : le web appelle PocketBase par le réseau Docker interne de Coolify (`PB_URL=http://csm-pocketbase:8090`,
  nom stable grâce à `custom_internal_name`). Le navigateur ne voit jamais PocketBase.

## 2. Variables d'environnement (runtime uniquement, jamais au build)

| Application | Variable | Valeur |
|---|---|---|
| `csm-pocketbase` | `PB_ADMIN_EMAIL` | `admin@test-csm.fs0ciety.org` |
| `csm-pocketbase` | `PB_ADMIN_PASSWORD` | généré (32 caractères), **visible seulement dans Coolify** (Environment Variables), littéral |
| `csm-web` | `PB_URL` | `http://csm-pocketbase:8090` |
| `csm-web` | `CSM_COOKIE_SECURE` | `true` |

Le point d'entrée de l'image PocketBase applique les migrations puis crée ou met à jour ce superuser à chaque
démarrage (`pocketbase/docker-entrypoint.sh`). Changer le mot de passe = modifier la variable puis redémarrer.

Pour l'environnement cloud Claude (`docs/ENVIRONNEMENT-CLOUD.md`) : `CSM_PB_URL=https://pb-test-csm.fs0ciety.org`,
`CSM_PB_ADMIN_EMAIL`, `CSM_PB_ADMIN_PASSWORD` (copiés depuis Coolify), et ajouter `pb-test-csm.fs0ciety.org` aux
domaines autorisés.

## 3. Données et sauvegardes

- **Volume persistant** `ttu45cm7qrgmqgo7dcespp3f-csm-pb-data` monté sur `/pb_data` (base SQLite, fichiers,
  sauvegardes internes).
- **Sauvegarde PocketBase** (réglée par migration) : chaque nuit à **2 h** UTC, zip cohérent (base + fichiers) dans
  `/pb_data/backups`, 14 conservées.
- **Sauvegarde Coolify du volume** : chaque nuit à **2 h 30** UTC, 14 conservées localement sur le serveur Coolify,
  alerte après 2 jours sans exécution. Elle contient les zips de 2 h.
- **À venir** : copie hors serveur sur **Cloudflare R2** (décision du 8 octobre : R2 plus tard). Un stockage S3 R2
  existe déjà dans Coolify (`agenda`) : créer un bucket `csm-backups` dédié, l'ajouter dans Coolify → S3 Storages, puis
  activer `save_s3` sur la planification du volume (ou régler S3 dans PocketBase → Settings → Backups).
- **Restauration** : PocketBase → Settings → Backups → Restore (redémarre l'instance), ou arrêter `csm-pocketbase`,
  remplacer le contenu du volume par un zip décompressé, redémarrer. Testé en local le 8 octobre (comptages et fichiers
  identiques).
- **Données de BACO** : l'import (`pocketbase csm-import`) se lance depuis le terminal Coolify du conteneur
  `csm-pocketbase`, avec la sauvegarde copiée dans le volume. Pas de route HTTP d'import. Voir §5.

## 4. CI GitHub

`.github/workflows/csm-v2.yml`, déclenchée par les changements de `web/**` ou `pocketbase/**` :

1. **web** : `lint`, `format`, `typecheck`, `test:run`, `build` ;
2. **pocketbase** : PocketBase 0.40.4 (somme vérifiée), migrations, `scripts/test-rules.mjs` ;
3. **e2e** : PocketBase vide + agent de test, serveur standalone, Playwright desktop 1440×900 et mobile 390×844
   (artefacts en cas d'échec) ;
4. **docker** : build des deux images (sans publication).

Coolify construit ses propres images depuis Git ; la CI ne déploie pas.

## 5. Opérations courantes

```bash
C="$COOLIFY_API_URL/api/v1"; H="Authorization: Bearer $COOLIFY_API_TOKEN"
curl -s -X POST -H "$H" -H 'content-type: application/json' "$C/deploy" -d '{"uuid":"xzhygai7yapefgji83rkgile"}'  # redéployer le web
curl -s -H "$H" "$C/deployments/<deployment_uuid>"                                                                # suivre un déploiement
curl -s -X PATCH -H "$H" -H 'content-type: application/json' "$C/applications/<uuid>" -d '{"git_branch":"<branche>"}'  # changer de branche
```

Import des données de test (quand l'utilisateur l'a décidé) :
1. copier `/home/user/csm-backup` (hors Git) dans le volume, par exemple via le terminal Coolify ou `docker cp` sur
   le serveur ;
2. `pocketbase csm-import /pb_data/import --dir=/pb_data --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks`
   (ajouter `CSM_IMPORT_RESET=1` pour rejouer) ;
3. supprimer la copie de la sauvegarde du volume.

## 6. Pièges

- Le domaine `test-csm.fs0ciety.org` passe par **Cloudflare** (proxy) : SSE compatible (battement toutes les 25 s,
  `X-Accel-Buffering: no`), mais garder le mode SSL **Full (strict)** pour que Traefik serve son certificat.
- Le build du web télécharge les polices Google (`next/font`) : le serveur Coolify doit atteindre `fonts.googleapis.com`.
- Le build de PocketBase télécharge le binaire depuis GitHub (somme vérifiée) : il échoue derrière un proxy TLS (cas de
  l'environnement cloud Claude, où l'image a été testée avec le binaire local).
- Variables Coolify créées par l'API : forcer `is_buildtime: false` pour les secrets, sinon elles sont aussi passées
  au build.
