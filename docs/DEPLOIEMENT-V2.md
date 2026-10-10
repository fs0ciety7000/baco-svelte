# Déploiement de CSM v2 sur Coolify

> **Production** (10 octobre 2026) : **https://csm.fs0ciety.org** (web) et **https://pb-csm.fs0ciety.org** (PocketBase,
> derrière Cloudflare Access), branche **`csm-prod`**, environnement Coolify `prod`.
> **Preview** : **https://test-csm.fs0ciety.org** (web) et **https://pb-test-csm.fs0ciety.org**, branche de session.
> Ressources créées par Claude via l'API Coolify (test le 8 octobre, prod le 10 octobre 2026).
> BACO (Vercel, branche `main`, base Supabase) n'est pas concerné.

## 1. Ressources Coolify

### Production (environnement `prod`, branche `csm-prod`)

| Ressource | UUID | Domaine | Notes |
|---|---|---|---|
| `csm-pocketbase-prod` | `k3qyrzgja0ob7pbgd25xp0ms` | `pb-csm.fs0ciety.org` | volume `csm-pb-prod-data` → `/pb_data` ; R2 `csm-backups` (30 conservées) ; nom réseau `csm-pocketbase-prod` |
| `csm-web-prod` | `oe9umzuky1alqztamtenvugz` | `csm.fs0ciety.org` | `PB_URL=http://csm-pocketbase-prod:8090` |

Variables prod (runtime) : PocketBase `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` (superuser neuf, visible dans Coolify),
`CSM_APP_URL=https://csm.fs0ciety.org`, `CSM_INTERNAL_SECRET`, `CSM_BACKUP_S3_*`, `CSM_BACKUP_KEEP=30`, **`CSM_SMTP_*` à
poser** ; web `PB_URL`, `CSM_COOKIE_SECURE=true`, `CSM_PUBLIC_URL=https://csm.fs0ciety.org`, `CSM_INTERNAL_SECRET` (même
valeur), `CSM_DICOS_PB_EMAIL` / `_PASSWORD` (compte `connector` de la prod), `CSM_USER_AGENT`.

**Mettre en production** une version validée sur la preview : `git push origin <commit>:csm-prod` (avance rapide ; Coolify
redéploie les deux applications selon `watch_paths`). Rien d'autre ne pousse sur `csm-prod`.

**Cloudflare** : `csm` et `pb-csm` existent ; **Cloudflare Access** actif sur `pb-csm` et `pb-test-csm` (le web n'en a pas
besoin : il joint PocketBase par le réseau Docker). Garder l'« Email Address Obfuscation » sans effet (`no-transform`).

**Cloudflare Access sur PocketBase** — **fait par l'API Cloudflare le 10 octobre 2026** (jeton `CLOUDFLARE_API_TOKEN` de
l'environnement cloud, compte `CLOUDFLARE_ACCOUNT_ID`, organisation Zero Trust existante `cinecode.cloudflareaccess.com`) :

| Élément | Valeur |
|---|---|
| Application | « PocketBase CSM », `self_hosted`, id `85ccd53d-4528-43ce-a653-96214a9c6a77` |
| Destinations | `pb-csm.fs0ciety.org` (prod) et `pb-test-csm.fs0ciety.org` (preview) — rien d'autre |
| Session | 24 h, redirection directe vers le fournisseur, masquée du lanceur d'applications |
| Fournisseur | One-time PIN (déjà présent, id `8a62d92a-75c8-458c-969b-43e5b50c81fc`, code reçu par e-mail) |
| Politique | « Propriétaire CSM », **Allow**, include e-mails `occmons@gmail.com` et `nico.dessenius@gmail.com` (ajoutée le 10 oct. à la demande du propriétaire) (id `f1527b0c-f4d9-4e2e-99a3-5a8c9f15b215`) |
| Jeton de service | aucun (son secret ne peut pas être remis sans l'afficher) |

Vérifié : `pb-csm` et `pb-test-csm` `/api/health` → 302 vers `cinecode.cloudflareaccess.com` ; `csm` et `test-csm`
`/api/health` → 200 `{"ok":true,"pocketbase":true}`, `/connexion` → 200. Les autres applications Access du compte
(autres projets) ne sont pas touchées. **Ajouter une adresse** : one.dash.cloudflare.com → Access → Applications →
« PocketBase CSM » → Policies → « Propriétaire CSM » → Include → ajouter un sélecteur *Emails* → Save.

Aucun effet sur CSM : `csm-web` joint PocketBase par le réseau Docker (`PB_URL` interne), la sonde de santé est locale,
les liens d'e-mail pointent vers `CSM_APP_URL`. **Effet sur Claude** : les appels directs à `https://pb-*.fs0ciety.org`
(restauration par l'API, réglages, contrôle « collection présente » du §6) renvoient la redirection Cloudflare → passer
par une tâche planifiée Coolify exécutée une fois, ou demander à l'utilisateur un **jeton de service** Access (politique
« Service Auth » ajoutée à l'application, en-têtes `CF-Access-Client-Id` / `CF-Access-Client-Secret` posés comme
variables de l'environnement cloud).

**SMTP Resend** (mot de passe oublié + campagnes) : domaine d'envoi **dédié** `mail.fs0ciety.org` (jamais `csm` ni un
nom qui porte une application : la configuration automatique Brevo a remplacé l'enregistrement `csm` le 10 oct. et coupé
la prod ; Brevo abandonné). Resend → Add domain (région eu-west-1), enregistrements DKIM / MX / TXT de `send.mail`
**non proxifiés** ; clé API « Sending access » limitée au domaine. Variables sur `csm-pocketbase-prod` **et**
`csm-pocketbase` (runtime) : `CSM_SMTP_HOST=smtp.resend.com`, `CSM_SMTP_PORT=587`, `CSM_SMTP_USER=resend`,
`CSM_SMTP_PASSWORD` (clé API), `CSM_MAIL_SENDER=csm@mail.fs0ciety.org`, `CSM_MAIL_SENDER_NAME`, puis redéploiement.
Journal de démarrage : « e-mail : SMTP smtp.resend.com:587 ».

**Serveur mail Stalwart (décision du 10 oct., en cours)** : **tous les envois et réceptions** des services hébergés
passeront par le serveur auto-hébergé **Stalwart v0.16.13**, service Coolify `smtp-fs0ciety`
(`s7rxizvqhtvgib6cs2rqqd9g`, projet **Dev**, hôte 152.53.176.13, DNS inverse `mail.fs0ciety.org`, ports 25 / 465 /
587 / 993 / 4190, interface + API derrière Traefik sur `https://mail.fs0ciety.org` → conteneur 8080). Resend devient
transitoire. L'ancien service `stalwart` (`h7vpjks3…`, `mail.tandem-agenda.app`) est **arrêté** (aucun conflit de ports).
- API v0.16 = **JMAP** (`POST /jmap/`, `using: urn:stalwart:jmap`, objets `x:Domain`, `x:Account`, `x:DkimSignature`,
  `x:NetworkListener`, `x:AcmeProvider`, `x:Certificate`, `x:SystemSettings` id `singleton`, `x:Task`) ; les anciens
  `/api/principal`, `/api/settings`, `/api/dkim` renvoient 404. `GET /api/account` liste les droits de la clé.
- État relevé : nom d'hôte `mail.fs0ciety.org` ✓ ; 5 domaines créés (`fs0ciety.org`, `empire.fs0ciety.org`,
  `cardormedia.com`, `tandem-agenda.app`, `tasks.tandem-agenda.app`) avec DKIM automatique RSA + Ed25519
  (sélecteurs `v1-rsa-AAAAMMJJ` / `v1-ed25519-AAAAMMJJ`, rotation 90 j : **les enregistrements DNS suivent la rotation**) ;
  seul compte `admin@fs0ciety.org` ; **pas de listener 587** (à créer : `submission`, STARTTLS) ; **aucun certificat**.
- **Certificat** : le fournisseur ACME est en TLS-ALPN-01 (port 443 tenu par Traefik → échec) et **HTTP-01 est
  impossible** : Traefik (Coolify) intercepte `/.well-known/acme-challenge/` sur le port 80 pour ses propres
  certificats (404 vide). Solutions : DNS-01 avec un jeton Cloudflare **limité** à `Zone › DNS › Edit` de
  `fs0ciety.org` (recommandé), ou routeur TCP Traefik en passthrough `HostSNI(mail.fs0ciety.org)` → port 443 du conteneur.
  Sans certificat valide, PocketBase refuse le STARTTLS : ne pas poser `CSM_SMTP_*` avant.
- CSM (à faire) : `CSM_SMTP_HOST=mail.fs0ciety.org`, `CSM_SMTP_PORT=587`, `CSM_SMTP_USER=csm@fs0ciety.org`,
  `CSM_SMTP_PASSWORD` (fichier hors dépôt, mode 600), `CSM_MAIL_SENDER=csm@fs0ciety.org`,
  `CSM_MAIL_SENDER_NAME=CSM · Client Solutions` sur `csm-pocketbase` puis `csm-pocketbase-prod` (aucune variable
  `CSM_SMTP_*` n'y était posée le 10 oct.), redémarrage preview → test « Envoyer un test » → prod.
- Autres services à basculer ensuite (noms de variables relevés le 10 oct., valeurs jamais lues) : OCC Deliveries
  (`OCC_SMTP_*`, `OCC_MAIL_FROM*`), agenda / Tandem (`SMTP_*`, `RESEND_*`, `INBOUND_EMAIL_*` : réception entrante à
  revoir), rail-cards (`SMTP_*`, `EMAIL_FROM`), elo (`RESEND_*`), fs0ciety (`RESEND_API_KEY`), documenso
  (`NEXT_PRIVATE_SMTP_*`, `NEXT_PRIVATE_RESEND_API_KEY`), ntfy (`NTFY_SMTP_SENDER_*`). Un compte d'envoi par service
  (mot de passe propre, révocable). Code des services à adapter quand ils n'envoient que par l'API Resend.
- DNS : SPF **fusionné** (un seul par nom, `ip4:152.53.176.13` ajouté sans retirer les `include:`), DKIM Stalwart,
  DMARC existant gardé ; MX de `cardormedia.com` (aucun) / `tandem-agenda.app` (Tutanota) / `tasks.tandem-agenda.app`
  (Amazon SES) = décision de l'utilisateur ; `empire.fs0ciety.org` est un CNAME proxifié → ni MX ni SPF possibles
  tant qu'il le reste (envoi aligné DMARC par DKIM seulement).

### Preview (environnement `production` historique, branche de session)

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
| `csm-web` + `csm-pocketbase` | `CSM_INTERNAL_SECRET` | même valeur des deux côtés, ≥ 32 caractères, **runtime** : routes internes des passkeys (posée par l'API le 10 oct. ; à régénérer = changer les deux puis redéployer). `csm-web` : `CSM_PUBLIC_URL` **obligatoire** pour les passkeys (identifiant WebAuthn ; posée le 10 oct. : `https://test-csm.fs0ciety.org`, à changer pour la prod) |
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
- **Hors serveur : Cloudflare R2** — **réservé à la production depuis le 10 octobre** (la rotation de PocketBase supprime les
  sauvegardes des autres instances d'un bucket partagé ; la preview sauvegarde sur son volume) :
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
