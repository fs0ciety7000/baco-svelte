# Relais de session — 10 nov. 2026

> Pour la prochaine session. Contexte complet : `CLAUDE.md` (§1 état, §7 pièges, §8 journal) et `docs/NOUVELLE-SESSION.md`.

## État

- **Production** (`csm.fs0ciety.org`, branche `csm-prod`) = **preview** (`test-csm`, branche `csm-preview`) = `43a648d`.
  Santé 200. La branche de session `claude/cool-mendel-gguyxi` a en plus `e85bd99` (doc seulement).
- **BACO est gelé** depuis le 5 nov. (`main` = `d51122a`). `/` renvoie vers `/transition`, les API et `/api-proxy` répondent 410.
  Retour arrière : variable Vercel `BACO_FROZEN=0`, puis redéployer.
- **Dernier bon BACO importé** : n° 366 (`CMD-NT8S6Q`). Aucun bon BACO ne manque dans CSM.
- **Envoi d'e-mails rétabli** (Stalwart v1.0.1) :
  - liste « Allowed IP addresses » complétée, puis service redémarré ;
  - CSM envoie par le port 465 (`CSM_SMTP_PORT=465`, prod et preview) ;
  - SPF, DKIM (RSA) et DMARC sont OK.
- Livré récemment, tout en production :
  - Annuaire v2 (Service / Fonction / Zone) ;
  - lien « Carte en direct » ;
  - « Fin de service » animé avec GSAP ;
  - petit bus dessiné dans le bandeau d'incident ;
  - Temps réel réorganisé (grille redimensionnable) ;
  - panneau ancré corrigé ;
  - Genesys (`tel:` en E.164).

## En cours / en attente de l'utilisateur

- **E-mail de campagne « BACO devient CSM »** et **liste des adresses des comptes** : faits par l'utilisateur (10 nov.).
- **Script de configuration de l'environnement cloud « CSM »** : il échoue au démarrage (code 128).
  - Cause : `git clone … ~/claude-kit 2>/dev/null || git -C ~/claude-kit pull` ; quand le clonage échoue, le `pull` part dans un dossier absent.
  - Correctif proposé (garder le `pull` si `.git` existe, sinon cloner, puis `install.sh` seulement s'il est présent) : refusé par l'utilisateur pour l'instant. Ne pas le reproposer sans demande.
  - Dans cette session, le kit a été installé à la main (`~/claude-kit`, `install.sh --cloud`, `kit update`, `kit doctor` OK).

## Prochaines étapes possibles

1. 6 tests E2E en échec, jamais examinés : les lancer en série, en isoler la cause.
2. Carte « Correspondances menacées » : source de données à définir.
3. Vérifier que la réception d'e-mails vers les adresses fs0ciety fonctionne depuis la correction Stalwart (probablement coupée avant).
4. Suite à donner : `20261008130000_hotfix_followup.sql` et `20261008140000_pn_data_update_fix.sql`, non appliqués. BACO est gelé : à classer ou à abandonner, avec l'accord de l'utilisateur.

## Pièges (récents, voir aussi CLAUDE.md §7)

- **Tâches Coolify** :
  - 255 caractères au plus par commande ;
  - des tâches créées ensemble s'exécutent **en parallèle** : envoyer des morceaux ordonnés une tâche à la fois ;
  - la sortie masque les e-mails et les secrets (`<REDACTED>`) ;
  - supprimer chaque tâche après son exécution.
- **Stalwart** : une connexion par l'IP publique ou par la passerelle Docker (`10.0.28.1`) est refusée tant qu'elle n'est pas dans « Allowed IP addresses ». Le réglage ne prend effet qu'après un **redémarrage**. Si 465 répond en local mais pas en public, c'est cette liste, pas les écouteurs.
- **Build `csm-web-prod`** : il échoue parfois sur `next/font` (Google Fonts, passager). Relancer seul par `POST /deploy`, sans redéployer PocketBase.
- **Import d'une ligne BACO sans jeton Supabase dans le conteneur** : lire la ligne ici (GET), l'envoyer en base64 + gzip par tâches successives dans `/pb_data/<dossier>/data/`, puis `csm-import-delta … --only …`. Faire un essai à blanc avant, une sauvegarde avant, et effacer le dossier après.
- **`csm-prod`** n'avance que par avance rapide depuis `csm-preview`, et seulement sur demande. Supabase : lecture seule.
