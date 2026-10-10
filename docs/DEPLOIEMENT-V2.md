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
| `csm-web` | `xzhygai7yapefgji83rkgile` | `/web` · `/Dockerfile` | 3000 | `test-csm.fs0ciety.org` (via Cloudflare) | aléatoire (pas besoin de nom fixe) |

- **Branche déployée** : `claude/csm-session-3-2lkadk` (session 3, changée par l'API au début de la session). À chaque nouvelle branche de
  travail, la changer dans Coolify (Application → Configuration → Git → Branch, ou `PATCH /applications/{uuid}`
  `git_branch`). Auto-déploiement au push, filtré par `watch_paths` (`web/**`, `pocketbase/**`).
- **Health checks** : `/api/health` sur chaque application. Celui du web renvoie `{ ok, pocketbase }` : `pocketbase:
  false` signifie que le web ne joint pas `http://csm-pocketbase:8090`.
- **Réseau** : le web appelle PocketBase par le réseau Docker interne de Coolify (`PB_URL=http://csm-pocketbase:8090`,
  nom stable grâce à `custom_internal_name`). Le navigateur ne voit jamais PocketBase.

## 2. Variables d'environnement (runtime uniquement, jamais au build)

| Application | Variable | Valeur |
|---|---|---|
| `csm-pocketbase` | `PB_ADMIN_EMAIL` | `claude-import@test-csm.fs0ciety.org` (session 3 ; l'ancien superuser existe toujours avec son mot de passe) |
| `csm-pocketbase` | `PB_ADMIN_PASSWORD` | regénéré en session 3 (32 caractères), **visible seulement dans Coolify** (Environment Variables), littéral |
| `csm-web` | `PB_URL` | `http://csm-pocketbase:8090` |
| `csm-web` | `CSM_COOKIE_SECURE` | `true` |
| `csm-web` | `CSM_DICOS_PB_EMAIL`, `CSM_DICOS_PB_PASSWORD` | compte de service PocketBase (rôle `connector`, droit `dicos:write`) de l'ingestion DICOS / ATMS ; secrets |
| `csm-web` | `CSM_DICOS_TOKEN` | **facultatif** depuis l'extension 1.7.0 (jetons personnels des agents) : secret partagé des extensions antérieures, à retirer quand toutes sont à jour |
| `csm-pocketbase` | `CSM_BACKUP_S3_ENDPOINT`, `CSM_BACKUP_S3_BUCKET`, `CSM_BACKUP_S3_ACCESS_KEY`, `CSM_BACKUP_S3_SECRET` | facultatives : sauvegardes envoyées dans **Cloudflare R2** (§3), réglées au démarrage de `serve` par `pb_hooks/backups.pb.js` ; secrets. **Seule source de vérité** : variables absentes ou incomplètes = S3 coupé et secret effacé (une copie restaurée ailleurs n'écrit jamais dans le bucket de production) ; `CSM_BACKUP_KEEP` (défaut 14, max 90) |
| `csm-pocketbase` | `CSM_SMTP_HOST`, `CSM_SMTP_PORT`, `CSM_SMTP_USER`, `CSM_SMTP_PASSWORD`, `CSM_MAIL_SENDER`, `CSM_MAIL_SENDER_NAME`, `CSM_APP_URL` | « Mot de passe oublié » par e-mail (`pb_hooks/mail.pb.js`) ; secrets SMTP **à fournir par l'utilisateur** ; incomplètes = envoi coupé. `CSM_APP_URL` (adresse du site dans le lien) posée le 10 oct. |
| `csm-web` + `csm-pocketbase` | `CSM_INTERNAL_SECRET` | même valeur des deux côtés, ≥ 32 caractères, **runtime** : routes internes des passkeys (posée par l'API le 10 oct. ; à régénérer = changer les deux puis redéployer). `csm-web` : `CSM_PUBLIC_URL` facultative (identifiant WebAuthn, sinon l'hôte de la requête) |
| `csm-pocketbase` | `CSM_DICOS_ALERT_HOURS` | facultative : plage de service de l'alerte « synchro DICOS en retard » (défaut `6-22`, heure de Bruxelles ; `off` = coupée) |
| `csm-web` | `IRAIL_URL`, `TILES_URL`, `CSM_USER_AGENT` | facultatives : défauts `https://api.irail.be/v1`, `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, User-Agent CSM (le serveur doit pouvoir sortir vers ces deux domaines) |

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
- **Hors serveur : Cloudflare R2** (prêt depuis le 9 octobre, à activer) :
  1. Cloudflare → R2 → créer le bucket **`csm-backups`** (emplacement UE si proposé) ; laisser l'accès public coupé ;
  2. R2 → « Manage API tokens » → jeton **Object Read & Write limité au bucket `csm-backups`** → noter l'Access Key ID,
     le Secret Access Key et l'endpoint `https://<id de compte>.r2.cloudflarestorage.com` ;
  3. Coolify → `csm-pocketbase` → variables runtime (pas build) `CSM_BACKUP_S3_ENDPOINT`, `CSM_BACKUP_S3_BUCKET=csm-backups`,
     `CSM_BACKUP_S3_ACCESS_KEY`, `CSM_BACKUP_S3_SECRET` (et `CSM_BACKUP_KEEP=30` pour un mois), puis redéployer ;
  4. au démarrage, le journal affiche « sauvegardes : R2 (csm-backups), N conservées ». La planification de 2 h écrit
     alors **dans R2 et plus dans `/pb_data/backups`** ; la sauvegarde Coolify du volume (2 h 30) reste locale et
     couvre le serveur ;
  5. **test de restauration** (à faire une fois) : PocketBase → Settings → Backups → « Initialize new backup », vérifier
     le zip dans le bucket R2, le télécharger, le restaurer dans un PocketBase local (`pocketbase serve` sur un dossier
     vierge, `POST /api/backups/upload` puis `/restore`), comparer les comptages.
  Le secret R2 est enregistré dans les réglages PocketBase (superusers seulement) : il figure donc dans les sauvegardes ;
  un jeton limité au seul bucket borne le risque. Le révoquer dans Cloudflare suffit à couper l'accès.
- **Restauration** : PocketBase → Settings → Backups → Restore (redémarre l'instance), ou arrêter `csm-pocketbase`,
  remplacer le contenu du volume par un zip décompressé, redémarrer. Testé en local le 8 octobre (comptages et fichiers
  identiques).
- **Données de BACO importées le 8 octobre 2026** (décision de l'utilisateur, option A) : 29 comptes avec leur mot de
  passe BACO, 29 sociétés, 295 commandes bus, 3 commandes taxi, 487 lignes d'audit historique, 6 avatars. Connexion
  vérifiée sur le site avec un vrai mot de passe BACO. L'instance de test contient donc des **données personnelles
  réelles** (dont PMR) : ne pas l'ouvrir à des tiers. Méthode : voir §5.

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

Import des données de BACO (méthode utilisée le 8 octobre, sans route HTTP d'import ni accès au serveur) :
1. en local, dans un dossier vierge : `pocketbase migrate up`, `pocketbase superuser upsert <PB_ADMIN_EMAIL> <PB_ADMIN_PASSWORD>`
   (mêmes valeurs que Coolify), `pocketbase csm-import /home/user/csm-backup` ;
2. `pocketbase serve` local, puis `POST /api/backups` pour produire le zip ;
3. sur l'instance de test, en superuser : `POST /api/backups/upload` (champ `file`), puis
   `POST /api/backups/<clé>/restore` (PocketBase redémarre tout seul) ;
4. vérifier les comptages, un avatar et l'accès anonyme ; supprimer la copie locale.

Session 3 : les variables `CSM_PB_*` de l'environnement cloud étant mal formées, Claude a fixé par l'API un superuser
dédié (`PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` ci-dessus) puis **redéployé** `csm-pocketbase` (un simple « restart » ne
relit pas les variables). Recopier ces deux valeurs dans `CSM_PB_ADMIN_EMAIL` / `CSM_PB_ADMIN_PASSWORD`, une par ligne.

Variante « module seul » (session 3, comptes et mots de passe gardés, sans les empreintes) : télécharger une
sauvegarde de l'instance de test, la restaurer en local, `CSM_IMPORT_SCOPE=commandes CSM_IMPORT_RESET=1 pocketbase
csm-import /home/user/csm-backup`, refaire un zip et le restaurer sur l'instance de test. Même méthode avec
`CSM_IMPORT_SCOPE=pmr` pour le module PMR seul (commandes et comptes gardés) : rejouée le 8 octobre (445 prestations,
55 rampes, 3 zones).

La restauration **remplace** toute la base distante (y compris les superusers) : à réserver à une base vide ou à la
répétition de la bascule. Le zip reste dans `/pb_data/backups` comme point de restauration.

## 6. Pièges

- **Sonde de santé Coolify** : elle interroge `http://localhost:<port>` avec curl puis wget. Dans les images Alpine,
  `localhost` se résout d'abord en `::1` alors que Next écoute en IPv4 (`HOSTNAME=0.0.0.0`) → refus, conteneur
  « unhealthy », Traefik le retire (**503 « no available server »**) et Coolify annule le déploiement. Correctif :
  `health_check_host = 127.0.0.1` sur les deux applications. Ne pas passer Next en `HOSTNAME=::` (plante si IPv6 est
  désactivé).
- **Cloudflare Web Analytics** (coupé par l'utilisateur le 8 octobre, vérifié) injectait `static.cloudflareinsights.com/beacon.min.js` dans les pages : le navigateur
  sort alors du domaine CSM (et le pare-feu de l'entreprise peut le bloquer). À désactiver dans Cloudflare
  (Analytics & Logs → Web Analytics → `fs0ciety.org` → désactiver l'injection automatique, ou une règle qui l'exclut
  pour `test-csm`).

- Le domaine `test-csm.fs0ciety.org` passe par **Cloudflare** (proxy) : SSE compatible (battement toutes les 25 s,
  `X-Accel-Buffering: no`), mais garder le mode SSL **Full (strict)** pour que Traefik serve son certificat.
- Le build du web télécharge les polices Google (`next/font`) : le serveur Coolify doit atteindre `fonts.googleapis.com`.
- Le build de PocketBase télécharge le binaire depuis GitHub (somme vérifiée) : il échoue derrière un proxy TLS (cas de
  l'environnement cloud Claude, où l'image a été testée avec le binaire local).
- Variables Coolify créées par l'API : forcer `is_buildtime: false` pour les secrets, sinon elles sont aussi passées
  au build.

## Secrets GitHub (CI)

| Secret | Rôle |
|---|---|
| `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | facultatifs : clés d'API addons.mozilla.org pour signer l'extension Firefox (job `sign-firefox` de `dicos-extension-release.yml`, canal non listé). Sans eux, le job est ignoré. Espaces et retours à la ligne retirés par le job. AMO n'affiche le secret qu'une fois et en génère un nouveau à chaque demande : copier **la paire** émetteur + secret du même tirage (« Unknown JWT iss » = émetteur faux ; « Error decoding signature » = secret faux ou périmé). |
