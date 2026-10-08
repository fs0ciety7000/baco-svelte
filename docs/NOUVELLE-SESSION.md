# Message de lancement — session CSM v2 n° 3

À copier tel quel dans une nouvelle session Claude Code, sur le dépôt `fs0ciety7000/baco-svelte`, dans
l'environnement cloud **CSM**.

**Avant de lancer** (côté utilisateur) :
- dans l'environnement CSM, une variable par ligne :
  `CSM_PB_URL=https://pb-test-csm.fs0ciety.org`, `CSM_PB_ADMIN_EMAIL=admin@test-csm.fs0ciety.org`,
  `CSM_PB_ADMIN_PASSWORD=` (valeur de `PB_ADMIN_PASSWORD` de `csm-pocketbase` dans Coolify) ;
- domaines autorisés : ceux de `docs/ENVIRONNEMENT-CLOUD.md` (dont `pb-test-csm.fs0ciety.org`) ;
- facultatif : appliquer `supabase/migrations/20261008130000_hotfix_followup.sql` dans le SQL Editor et activer
  « Leaked password protection » (Supabase → Authentication).

---

Tu reprends **CSM — Client Solutions Management Tool**, le successeur de BACO : outil métier ferroviaire SNCB de l'équipe
Client Solutions (commandes de bus et de taxis de remplacement, assistance PMR, lignes, EBP, répertoire, trains en direct
iRail, planning, main courante, statistiques, administration). Utilisé toute la journée par une trentaine d'opérateurs.

**Point de départ.** La session 2 a travaillé sur `claude/admiring-thompson-1lkun9`. Récupère-la
(`git fetch origin claude/admiring-thompson-1lkun9`) et crée ta branche de session à partir d'elle. Lis, dans l'ordre :
1. `CLAUDE.md` (§0 à §8) : état, variables, contraintes, pièges, journal ;
2. `web/CLAUDE.md` et `pocketbase/CLAUDE.md` : conventions du code v2 ;
3. `docs/CSM-V2.md` (cahier des charges et décisions) et `docs/BACKEND-DECISION.md` ;
4. `docs/DESIGN-DIRECTION.md` (validé, écarts compris) et `docs/design/REFERENCES-UI.md` ;
5. `docs/design/AUDIT-UX-COMMANDES.md` : **base du module Commandes** ;
6. `docs/DEPLOIEMENT-V2.md` : ressources Coolify, sauvegardes, méthode d'import, pièges.

**Où on en est (fin de session 2, 8 octobre 2026)**
- Étapes 0 à 4 faites et validées : sauvegarde Supabase, prototype PocketBase 0.40.4 + Next 15.5, design system (5 thèmes
  AA, 19 composants, `/design`), shell (6 modules, onglets en routes, ⌘K, mobile 4 onglets + « Plus », tableau de bord
  réorganisable), déploiement Coolify.
- **https://test-csm.fs0ciety.org** en ligne (`csm-web` + `csm-pocketbase`, volume `/pb_data`, sauvegardes 2 h et 2 h 30),
  CI GitHub `csm-v2.yml` verte. Les **données BACO du 8 octobre sont importées** sur l'instance de test (29 comptes avec
  leur mot de passe BACO, 295 commandes bus, 3 taxi) : connexion réelle vérifiée.
- Collections PocketBase existantes : `users`, `bus_companies`, `bus_orders`, `taxi_orders`, `audit_log`. Les autres
  arrivent avec leur module.
- Hotfix sécurité de BACO **appliqué** (0 alerte ERROR). Suite `20261008130000_hotfix_followup.sql` non appliquée.

**Décisions déjà prises (ne pas les rediscuter)**
- Next.js + PocketBase dédié sur Coolify ; navigateur → domaine CSM uniquement (pas de WebSocket, pas d'appel direct à
  PocketBase) ; migration des données en une fois à la date de bascule, sans synchronisation.
- Statuts des commandes : brouillon → envoyé → confirmé → en cours → terminé, ou annulé. **Pas de « facturé »** :
  confirmer l'envoi vaut facturation.
- Module taxi **utilisé** (refonte complète, pas un formulaire minimal).
- Brouillon `.eml` (`X-Unsent: 1`) avec le PDF joint, sans SMTP ; ouverture sur mobile non prioritaire.
- Modèles de commande : la réponse « oui » a été lue comme « personnels, partageables avec l'équipe » → **à confirmer
  en début de session**.
- Tables non migrées : `darts_games`, `temp_geo_data`, `profile_likes`, les 4 `remise_*`, `app_backups`, `infractions`.
  Avatars DiceBear → initiales. Sauvegardes hors serveur (Cloudflare R2) plus tard.

**Règles de base**
- **BACO reste en production et on n'y touche pas.** Pas de commit sur `main`. Supabase en **lecture seule** (SELECT par le
  connecteur, GET avec la clé de service ; lectures autorisées sans redemander, toute écriture sur accord explicite).
- Nouveau code dans `/web` et `/pocketbase` ; le SvelteKit à la racine est la référence métier, ne pas le modifier.
- **Mobile obligatoire** : chaque écran vérifié en 1440×900 et 390×844 (Playwright, Chromium dans `/opt/pw-browsers`,
  Playwright figé en 1.56.1), cibles ≥ 44 px, pas de défilement horizontal.
- Garde de droits **dans chaque `page.tsx`** (pas seulement le layout) ; accès aux données par `src/server/data` avec le
  jeton de l'agent ; écritures par Server Actions validées par zod.
- Données personnelles jamais dans Git ni dans un artefact publié ; captures soumises sans données sensibles.
- Coolify : ne toucher qu'au projet **CSM**. Au début de la session, **changer la branche déployée** de `csm-web` et
  `csm-pocketbase` vers ta branche de session (API, voir `docs/DEPLOIEMENT-V2.md` §5).
- Commits atomiques en français ; tenir à jour dans le même commit `CLAUDE.md`, `web/CLAUDE.md`, `pocketbase/CLAUDE.md`,
  `docs/CSM-V2.md`, `docs/DESIGN-DIRECTION.md`, `docs/DEPLOIEMENT-V2.md`, `docs/ENVIRONNEMENT-CLOUD.md` et ce fichier.
- Environnement : scripts Node avec `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` ; PocketBase
  0.40.4 à installer s'il manque (somme vérifiée, voir `docs/ENVIRONNEMENT-CLOUD.md` §4) ; `/home/user/csm-backup` est
  vide dans un nouveau conteneur : relancer `scripts/supabase-backup.mjs` et l'export des empreintes seulement si besoin.

**Ce que je veux dans cette session : étape 5, le module Commandes (bus C3 et taxi)**
1. Confirme d'abord avec moi les questions encore ouvertes de `docs/design/AUDIT-UX-COMMANDES.md` §6 (qui confirme une
   commande et comment, B201 par jour ou par district, annulation partielle d'un bus, modèles personnels ou partagés).
2. Schéma PocketBase des commandes (migrations) : statut unifié avec **historique horodaté** (qui, quand, depuis quel
   statut), sociétés, chauffeurs, contacts et lignes de bus, taxis, modèles ; règles d'accès et contrôles ajoutés à
   `scripts/test-rules.mjs` ; import étendu (`csm-import`) et rejoué sur l'instance de test.
3. Écrans, desktop et mobile :
   - **Bus C3** : liste filtrable, création et édition en sections, valeurs par défaut (district de l'agent, date et heure
     à Bruxelles), enregistrement automatique du brouillon, duplication (« refaire la commande d'hier »), modèles ;
   - **Taxi** : même logique, fiche client PMR liée, clôture possible ;
   - **Envoi** : PDF généré côté serveur + brouillon `.eml` avec le PDF joint et les bons destinataires, puis passage à
     « envoyé » après confirmation de l'agent ;
   - **Suivi commun** bus + taxi : vues enregistrées (« À confirmer », « Aujourd'hui »…), transitions de statut,
     détail en panneau latéral, temps réel par le relais SSE ;
   - **Remise B201** générée depuis les commandes du service.
4. Lance en parallèle un agent *Security auditor* sur le module et un *Reviewer* sur le diff avant chaque push.
5. Soumets-moi des captures desktop et mobile (thèmes Commandement et Ivoire) **avant de généraliser** à PMR.

Rappels à me faire en début de session : suite du hotfix (`20261008130000_hotfix_followup.sql`), protection des mots de
passe compromis, variables `CSM_PB_*` si elles sont encore mal formées.
