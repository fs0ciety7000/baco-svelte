# Déploiement CSM sur Coolify

Cible : **https://csm.fs0ciety.org** · image Docker Node 22 (SvelteKit `adapter-node`) · base Supabase hébergée (projet `mgljaheyimizrydazrxh`).

> BACO reste en production sur Vercel (branche `main`) pendant la transition. Les deux applications partagent **la même base**.

---

## 1. Prérequis

| Élément | Où |
|---|---|
| Serveur Coolify (v4) avec un proxy Traefik ou Caddy actif | Coolify |
| Enregistrement DNS `csm.fs0ciety.org` de type **A** (ou CNAME) pointant vers l'IP du serveur Coolify | DNS de `fs0ciety.org` |
| Clés Supabase : URL, clé `anon`, clé `service_role` | Supabase › Settings › API |
| Accès GitHub au dépôt `fs0ciety7000/baco-svelte` | Coolify › Sources |

**À vérifier depuis un poste de l'entreprise** : `https://test.fs0ciety.org` doit s'ouvrir. Si ce domaine est filtré, il faudra un autre domaine pour CSM.

## 2. Créer l'application dans Coolify

1. **Projects › + New › Application**, source *GitHub App* (ou *Public repository*), dépôt `fs0ciety7000/baco-svelte`.
2. Branche : celle de CSM (pour l'instant `ccr-5dca0da8-4yg4i6`, plus tard `main`).
3. **Build Pack : Dockerfile**. Laisser le chemin `/Dockerfile`.
4. **Ports Exposes : `3000`**.
5. **Domains** : `https://csm.fs0ciety.org`. Coolify génère le certificat Let's Encrypt.
6. **Health check** : chemin `/healthz`, port `3000`. L'image a aussi un `HEALTHCHECK` intégré.

## 3. Variables d'environnement

Dans **Environment Variables**, ajoutez les variables suivantes. Ne cochez **pas** « Build variable » : tout est lu au démarrage du conteneur.

| Variable | Valeur | Secret |
|---|---|---|
| `ORIGIN` | `https://csm.fs0ciety.org` | non |
| `PUBLIC_SUPABASE_URL` | `https://mgljaheyimizrydazrxh.supabase.co` | non |
| `PUBLIC_SUPABASE_ANON_KEY` | clé `anon` | non (publique par nature) |
| `SUPABASE_SERVICE_ROLE_KEY` | clé `service_role` | **oui** |
| `DATABASE_URL` | chaîne Postgres directe (*Session pooler*), utile pour la sauvegarde admin | **oui** |
| `BODY_SIZE_LIMIT` | `25M` | non |
| `ADDRESS_HEADER` | `X-Forwarded-For` | non |
| `XFF_DEPTH` | `1` | non |
| `PROTOCOL_HEADER` | `X-Forwarded-Proto` | non |
| `HOST_HEADER` | `X-Forwarded-Host` | non |

> `ORIGIN` est **obligatoire**. Sans lui, SvelteKit refuse les formulaires (protection CSRF) et la connexion échoue avec une erreur 403.

## 4. Configurer Supabase Auth

Dans Supabase, allez dans **Authentication › URL Configuration**.
- **Site URL** : `https://csm.fs0ciety.org`. Tant que BACO tourne, vous pouvez garder l'URL Vercel ici.
- **Redirect URLs** : ajoutez `https://csm.fs0ciety.org/auth/callback` et gardez celles de BACO.

Toujours dans Authentication, à faire une fois :
- activer **Leaked password protection** (Settings › Password security) ;
- vérifier que les inscriptions publiques sont **désactivées** (*Allow new users to sign up* = off). Les comptes sont créés par un admin.

## 5. Déployer

- Cliquez sur **Deploy**. Le premier build prend environ 3 à 5 minutes.
- Pour automatiser, activez **Auto Deploy** (webhook GitHub) : chaque push sur la branche configurée redéploie.
- La CI GitHub (`.github/workflows/ci.yml`) vérifie les tests, le build et l'image Docker sur chaque push.

Vérifications après le déploiement :

```bash
curl -s https://csm.fs0ciety.org/healthz            # {"status":"ok",...}
curl -sI https://csm.fs0ciety.org/ | grep -i location   # -> /login
curl -sI https://csm.fs0ciety.org/login | grep -i content-security-policy
```

## 6. Réseau de l'entreprise

Le navigateur ne contacte **que** `csm.fs0ciety.org` :
- **données** : `/api-proxy/*`, relayé vers Supabase par le serveur, avec liste blanche des chemins ;
- **connexion** : formulaire `/login`, traité côté serveur ;
- **temps réel** (à venir) : flux SSE servi par le serveur CSM, pas de WebSocket vers `supabase.co`.

Certains appels externes partent encore du navigateur : trains iRail, météo, fonds de carte, géocodage. S'ils sont bloqués au travail, ils seront relayés par le serveur lors de la refonte du module concerné.

## 7. Base de données

- Les migrations sont versionnées dans `supabase/migrations/`.
- **Elles ne sont jamais appliquées automatiquement par le déploiement.**
- Chaque migration doit rester compatible avec BACO tant qu'il est en service (voir `CLAUDE.md`).

Pour appliquer une migration :
1. Relire le fichier SQL.
2. Faire une sauvegarde (Supabase › Database › Backups, ou le bouton *Sauvegarde* de l'admin).
3. L'exécuter dans **SQL Editor**, ou avec `supabase db push` si le CLI est lié au projet.
4. Lancer **Advisors › Security** et vérifier que les alertes ont disparu.

Pour tester la migration de sécurité hors ligne, sans toucher à la base :

```bash
npm i --no-save @electric-sql/pglite
node supabase/tests/hotfix.test.mjs supabase/migrations/20261008120000_security_hotfix.sql
```

## 8. Retour arrière

- **Application** : dans Coolify › Deployments, choisissez un déploiement précédent puis **Redeploy**. Les images sont conservées.
- **Base** : chaque migration doit avoir son script inverse, ou on restaure la sauvegarde prise juste avant.

## 9. Lancer en local

```bash
cp .env.example .env      # renseigner les valeurs
npm ci
npm run dev               # http://localhost:5173

# ou avec l'image de production
docker compose up --build # http://localhost:3000 (ORIGIN=http://localhost:3000)
```
