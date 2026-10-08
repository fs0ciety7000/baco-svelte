# Message de lancement — session CSM v2

À copier tel quel dans une nouvelle session Claude Code, sur le dépôt `fs0ciety7000/baco-svelte`.

---

Tu reprends le projet **CSM — Client Solutions Management Tool**, successeur de BACO : outil métier ferroviaire SNCB de l'équipe Client Solutions (ex-PACO). Il sert à commander des bus et des taxis de remplacement, à gérer l'assistance PMR, et réunit les lignes, l'EBP, le répertoire, les trains en direct (iRail), le planning, la main courante, les statistiques et l'administration.

**Contexte à lire en premier.** Tout est sur la branche `ccr-5dca0da8-4yg4i6` (v1 SvelteKit, gelée comme référence). Récupère-la avec `git fetch origin ccr-5dca0da8-4yg4i6`, puis lis :
1. `docs/CSM-V2.md` : le cahier des charges de cette session (pivot, décisions, retours UX, stack, feuille de route) ;
2. `CLAUDE.md` : contraintes non négociables, workflow, journal des décisions ;
3. `docs/AUDIT.md` et `docs/PROPOSITION.md` : audit complet, nouveautés et parcours métier.

**Règles de base**
- **BACO reste en production et on n'y touche pas** : pas de commit sur `main`, rien n'est modifié dans la base Supabase. Supabase est en **lecture seule**.
- Travaille sur **ta branche de session**, créée à partir de `ccr-5dca0da8-4yg4i6` pour récupérer les docs. Le nouveau code va dans `/web` (Next.js) et `/pocketbase`. Le code SvelteKit à la racine sert de référence métier, ne le modifie pas.
- **Mobile obligatoire** : chaque écran doit être vérifié en 390×844 (Playwright, Chromium dans `/opt/pw-browsers`).
- Le réseau de l'entreprise bloque `*.supabase.co` et les WebSockets : le navigateur ne parle qu'au domaine CSM.
- Commits atomiques en français. `CLAUDE.md` est à mettre à jour à chaque décision.

**Ce que je veux dans cette session, dans l'ordre**
0. **Sauvegarde complète de Supabase** avant toute autre chose : schéma, données des 51 tables, rôles et policies, fonctions, triggers, fichiers Storage (`avatars`, `documents`, `taxis`, `movements_pdf`) et liste des comptes. L'archive reste **hors Git** car elle contient des données personnelles. Documente la procédure de restauration. Utilise ce que l'environnement fournit (connecteur Supabase, variables d'environnement). S'il manque un accès, dis-moi lequel.
1. **Stack** : Next.js (App Router) + React + TypeScript + Tailwind v4 + shadcn/ui personnalisé + **GSAP** (@gsap/react) + TanStack Query/Table + zod. **PocketBase** est probable comme backend, auto-hébergé sur Coolify ; une instance de préproduction est dans les variables `PREPROD_PB_*`. Fais un prototype rapide, PocketBase contre Supabase via le serveur Next, et donne-moi une recommandation chiffrée (import des comptes, règles d'accès, temps réel en SSE, sauvegardes, effort de migration) **avant** de migrer les données.
2. **Design system** et **bibliothèque de composants réutilisables**, avec une page interne `/design` qui montre chaque composant dans chaque thème. Thèmes : les 5 de la v1 (Nocturne, Ivoire, Rail, Contraste élevé, Tactique), un mode automatique et la densité. Animations GSAP courtes et fluides, qui respectent `prefers-reduced-motion`.
3. **Shell** :
   - **6 entrées principales au maximum** (Accueil, Commandes, PMR, Opérations, Référentiels, Équipe), avec des onglets à l'intérieur des modules ;
   - l'administration dans le menu utilisateur ;
   - la palette ⌘K ;
   - sur mobile, 4 onglets en bas plus « Plus ».
4. **Tableau de bord** : widgets vraiment responsive (container queries) et réorganisables.
5. **UI/UX** : nettement plus lisible et moderne que la v1. La v1 a été jugée trop chargée, peu lisible et pas assez moderne.

   **Référence principale : https://test.fs0ciety.org/decisions.** Cette page est derrière une connexion : demande-moi des identifiants ou des captures. Étudie aussi Linear, Vercel, Attio et Raycast. Lance des agents UI/UX en parallèle pour la recherche de références et l'audit d'ergonomie. **Soumets-moi des captures desktop et mobile pour validation avant de généraliser.**
6. **Déploiement Docker sur Coolify** en **https://test-csm.fs0ciety.org** :
   - `web` en Next standalone ;
   - `pocketbase` avec volume et sauvegardes ;
   - CI GitHub ;
   - doc `docs/DEPLOIEMENT-V2.md`.
7. Ensuite seulement, les modules un par un, en commençant par les **Commandes** (bus C3 et taxi). Au programme :
   - statuts unifiés ;
   - brouillon Outlook `.eml` avec le PDF joint (envoi manuel depuis la boîte fonctionnelle, aucun SMTP) ;
   - modèles et duplication ;
   - enregistrement automatique ;
   - suivi commun.

Les identifiants de test et d'administration sont dans les variables d'environnement de cette session. Liste les noms disponibles, sans afficher leurs valeurs. Commence par l'étape 0, puis présente-moi ton plan pour les étapes 1 à 3 avant de coder.

Rappel : la migration de sécurité Supabase prête dans `supabase/migrations/20261008120000_security_hotfix.sql` corrige des failles graves en production (escalade admin, données PMR accessibles sans connexion). Ne l'applique pas sans mon accord explicite, mais rappelle-la-moi.
