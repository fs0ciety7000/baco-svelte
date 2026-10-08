# Message de lancement — session CSM v2 n° 2

À copier tel quel dans une nouvelle session Claude Code, sur le dépôt `fs0ciety7000/baco-svelte`.

**Avant de lancer** (facultatif mais utile) : dans les réglages de l'environnement, ajoute `COOLIFY_API_URL`
et `COOLIFY_API_TOKEN` si tu veux que Claude crée lui-même les ressources Coolify. Sinon, il préparera
les fichiers et la procédure, et tu cliqueras dans Coolify.

---

Tu reprends **CSM — Client Solutions Management Tool**, le successeur de BACO. C'est un outil métier ferroviaire SNCB de l'équipe Client Solutions : commandes de bus et de taxis de remplacement, assistance PMR, lignes, EBP, répertoire, trains en direct (iRail), planning, main courante, statistiques et administration.

**Point de départ.** La session précédente a travaillé sur la branche `claude/eloquent-cori-a9kk4x`. Elle contient les docs v2, les scripts de sauvegarde et le `CLAUDE.md` à jour. Récupère-la avec `git fetch origin claude/eloquent-cori-a9kk4x` et crée ta branche de session à partir d'elle. Lis ensuite, dans l'ordre :
1. `CLAUDE.md` (§0 à §8), qui donne l'état du projet, les variables d'environnement, les contraintes et le journal ;
2. `docs/CSM-V2.md`, le cahier des charges ;
3. `docs/DESIGN-DIRECTION.md` et `docs/references/*.jpg` ;
4. `docs/SAUVEGARDE-SUPABASE.md` ;
5. `docs/AUDIT.md` et `docs/PROPOSITION.md` §3 à §6.

**Décisions déjà prises** (ne pas les rediscuter) :
- Next.js et **PocketBase**, dans une instance PocketBase **dédiée à CSM sur Coolify**, déployée avec l'app web ;
- migration des données **en une fois** à une date de bascule, sans synchronisation avec BACO ;
- export des empreintes de mot de passe **autorisé**, pour les importer dans PocketBase ;
- plan des étapes 1 à 3 validé.

**Règles de base**
- **BACO reste en production et on n'y touche pas.** Pas de commit sur `main`. Supabase est en **lecture seule** : uniquement des SELECT par le connecteur, et seulement des GET avec la clé de service.
- `PREPROD_PB_*` est le PocketBase de mon jeu (test.fs0ciety.org), **pas** celui de CSM : n'y écris rien.
- Le nouveau code va dans `/web` et `/pocketbase`. Le SvelteKit à la racine sert de référence métier, ne le modifie pas.
- **Mobile obligatoire** : vérifie chaque écran en 390×844 avec Playwright (Chromium dans `/opt/pw-browsers`).
- Le navigateur ne parle qu'au domaine CSM : ni `*.supabase.co`, ni WebSocket, ni appel direct à PocketBase.
- Les données personnelles ne vont jamais dans Git ni dans un artefact publié.
- Commits atomiques en français.
- **Tiens à jour, dans le même commit que chaque changement, `CLAUDE.md` et tous les fichiers d'instructions** (§4.8) : `docs/CSM-V2.md`, `docs/DESIGN-DIRECTION.md`, `docs/DEPLOIEMENT-V2.md`, `docs/NOUVELLE-SESSION.md`, ainsi que `web/CLAUDE.md` et `pocketbase/CLAUDE.md` dès que ces dossiers existent.

**Ce que je veux dans cette session, dans l'ordre**
0. **Données de travail.** Le conteneur de la session précédente a été effacé. Relance `scripts/supabase-backup.mjs` avec la nouvelle `SUPABASE_SECRET_KEY`, qui exporte aussi les comptes. Exporte ensuite par le connecteur, en SELECT, l'`id` et l'`encrypted_password` de `auth.users`. Recoupe les comptes de lignes avec `docs/SAUVEGARDE-SUPABASE.md` §5. Tout reste hors Git, dans `/home/user/csm-backup`.
1. **Prototype et squelette.**
   - Squelette `/web` : Next 15 standalone, TypeScript strict, Tailwind v4, shadcn, zod, TanStack Query.
   - Couche d'accès aux données côté serveur.
   - PocketBase **local** dans `/pocketbase` : migrations, hooks, script d'import depuis la sauvegarde.
   - Teste l'import des comptes avec les empreintes bcrypt, la connexion par cookie httpOnly, les règles d'accès, le relais SSE et les sauvegardes.
   - Écris une recommandation chiffrée dans `docs/BACKEND-DECISION.md` (effort de migration des 51 tables, de Storage et des triggers d'audit) et soumets-la-moi.
2. **Design system** : jetons des 5 thèmes avec un test de contraste AA, mode automatique, densité, polices, composants dans `web/src/components/ui`, GSAP avec `matchMedia`, et la page `/design`. Lance en parallèle des agents UI (références) et UX (audit des parcours Commandes de la v1). **Soumets-moi des captures desktop et mobile avant de généraliser.**
3. **Shell et tableau de bord** : 6 entrées, onglets en routes, ⌘K, menu utilisateur avec l'administration, mobile en 4 onglets plus « Plus », widgets en container queries réorganisables. Captures à faire valider.
4. **Déploiement Coolify** sur https://test-csm.fs0ciety.org :
   - `csm-web` (Next standalone) ;
   - `csm-pocketbase` (volume `/pb_data`, sauvegardes planifiées) ;
   - CI GitHub ;
   - `docs/DEPLOIEMENT-V2.md`.

   Si `COOLIFY_API_*` est absent, prépare les fichiers et dis-moi exactement quoi créer. Une fois PocketBase déployé, je créerai `CSM_PB_URL`, `CSM_PB_ADMIN_EMAIL` et `CSM_PB_ADMIN_PASSWORD`.
5. Ensuite seulement, les modules, en commençant par les **Commandes** (bus C3 et taxi) :
   - statuts unifiés ;
   - brouillon `.eml` avec le PDF joint (sans SMTP) ;
   - modèles et duplication ;
   - enregistrement automatique ;
   - suivi commun.

Commence par l'étape 0, puis enchaîne l'étape 1 et arrête-toi à la recommandation pour que je la valide.

Rappels :
- la migration de sécurité `supabase/migrations/20261008120000_security_hotfix.sql` n'est **pas appliquée** (escalade admin, données PMR lisibles sans connexion, 11 tables sans RLS, 30 fonctions exécutables par `anon`) : ne l'applique pas sans mon accord explicite, mais rappelle-la-moi ;
- les clés Supabase collées dans la conversation précédente doivent avoir été tournées.
