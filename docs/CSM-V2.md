# CSM v2 — Pivot Next.js / React (± PocketBase)

> Décision utilisateur du 8 octobre 2026, après revue de la v1 SvelteKit (branche `ccr-5dca0da8-4yg4i6`).
> Ce document est le **cahier des charges de la v2**. Il remplace les sections « stack » de `PROPOSITION.md`.

## 1. Règles du jeu

| Sujet | Décision |
|---|---|
| **BACO** | Reste en production (Vercel, branche `main`). **On n'y touche pas** : pas de commit sur `main`, pas de migration sur la base Supabase. |
| **Supabase** | Accès en **lecture seule**. Première action : une **sauvegarde complète** (schéma, données, Storage, utilisateurs). |
| **CSM v2** | Nouvelle branche dédiée, déployée sur **https://test-csm.fs0ciety.org** (Coolify, Docker). |
| **Framework** | **Next.js (App Router) + React + TypeScript**, choisi par l'utilisateur. |
| **Backend** | **PocketBase**, retenu par l'utilisateur le 8 octobre 2026, auto-hébergé sur Coolify dans une instance **dédiée à CSM**, déployée avec l'app web. Son temps réel en SSE passe le pare-feu de l'entreprise. Le prototype de l'étape 1 sert au chiffrage et à valider l'import des comptes (§3). |
| **Données non migrées** | `darts_games`, `temp_geo_data`, `profile_likes`, `remise_*` (4), `app_backups`, **`infractions`** (abandonnée). Avatars DiceBear → initiales. |
| **Commandes (réponses du 8 oct.)** | Statuts : brouillon → envoyé → confirmé → **en cours** (gardé) → terminé, ou annulé. **Pas de « facturé »** : confirmer l'envoi vaut facturation. Module **taxi utilisé** (refonte complète). `.eml` sur mobile : non prioritaire. Modèles : personnels par défaut, partageables avec l'équipe (réponse « oui » à interpréter, à confirmer à l'étape 5). |
| **Sauvegardes PocketBase** | Sauvegarde du volume par Coolify pour l'instant, Cloudflare R2 (S3) plus tard. |
| **Bascule des données** | Migration **en une fois**, à une date de bascule : gel de BACO, export Supabase, import PocketBase, vérification. Pas de synchronisation entre les deux bases. |
| **Mobile** | Obligatoire, pensé mobile d'abord dès la conception. |

### Point de sécurité ouvert sur BACO (à rappeler à l'utilisateur)
La base Supabase de production est toujours vulnérable, voir `docs/AUDIT.md` :
- n'importe quel compte peut se donner le rôle admin ;
- les déplacements PMR et les commandes taxi sont lisibles, modifiables et supprimables sans connexion.

La correction est prête et testée dans `supabase/migrations/20261008120000_security_hotfix.sql`, et elle reste compatible avec BACO. L'utilisateur a demandé de ne pas toucher BACO « pour l'instant ». **Ne pas l'appliquer sans accord explicite**, mais le lui rappeler.

## 2. Retours sur la v1 à corriger

1. **Trop d'entrées dans la barre latérale** (8 groupes, ~28 entrées). La cible est **6 entrées principales au maximum** :
   - Accueil
   - Commandes
   - PMR
   - Opérations
   - Référentiels
   - Équipe

   L'administration passe dans le menu utilisateur. Les sous-pages deviennent des **onglets à l'intérieur de chaque module** (par exemple Commandes → Bus | Taxi | Suivi | Remise B201). Le mobile garde 4 onglets en bas plus « Plus ».
2. **Widgets non responsive** : abandonner gridstack. Utiliser une grille CSS avec **container queries** ; chaque widget adapte son contenu à sa propre largeur. On réorganise par glisser-déposer simple (dnd-kit) et on mémorise la disposition par utilisateur.
3. **Lisibilité insuffisante** :
   - corps de texte à 14 px minimum ;
   - interlignage généreux ;
   - contraste AA partout ;
   - hiérarchie nette : un seul titre, un sous-titre, des actions groupées ;
   - moins de libellés en majuscules de 10 px ;
   - icônes accompagnées d'un libellé.
4. **Design pas assez moderne** : viser le niveau de Linear, Vercel, Attio ou Raycast, avec l'identité fs0ciety (voir §4).
5. **Composants réutilisables** : une vraie bibliothèque dans `web/src/components/ui` (shadcn/ui personnalisé), documentée par une page `/design` interne qui montre chaque composant dans chaque thème. Aucun style ad hoc dans les pages.
6. **Animations** : GSAP (`gsap` + `@gsap/react`, `useGSAP`) pour :
   - les transitions de page ;
   - les entrées en cascade des listes et cartes ;
   - les compteurs animés des indicateurs ;
   - les apparitions au défilement (ScrollTrigger, avec parcimonie) ;
   - les micro-interactions des boutons et de la palette.

   Durées courtes (120–350 ms), `prefers-reduced-motion` respecté via `gsap.matchMedia()`.

## 3. Stack v2 (à confirmer par un prototype en début de chantier)

| Couche | Choix |
|---|---|
| Framework | Next.js 15+ (App Router, Server Components, Server Actions), `output: 'standalone'` |
| Langage | TypeScript strict |
| UI | Tailwind CSS v4 + shadcn/ui (Radix) personnalisé + lucide-react |
| Animations | GSAP 3 + @gsap/react ; View Transitions si utile |
| Données côté client | TanStack Query (cache, invalidation) + TanStack Table (listes denses) |
| Formulaires | react-hook-form + zod (schémas partagés client/serveur) |
| Backend | **PocketBase 0.40.4** (Docker sur Coolify, volume persistant, sauvegardes planifiées), via le SDK `pocketbase` côté serveur Next et en SSE pour le temps réel. Plan B : rester sur Supabase via le serveur Next uniquement. Prototype et chiffrage : `docs/BACKEND-DECISION.md`. |
| Auth | Authentification PocketBase, jeton stocké dans un cookie httpOnly posé par Next. Le navigateur ne parle qu'au domaine CSM. |
| PDF / Excel | `@react-pdf/renderer` ou jspdf ; exceljs ; brouillon `.eml` avec PDF joint (pas de SMTP) |
| Tests | Vitest + Testing Library ; Playwright, y compris un passage à 390×844 sur chaque écran |
| Qualité | ESLint, Prettier, `tsc --noEmit`, CI GitHub Actions |

**Choix entre PocketBase et Supabase.** Un prototype de 1 à 2 jours, puis une recommandation chiffrée à l'utilisateur avant de migrer les données. Critères :
- import des 29 comptes : PocketBase stocke aussi des empreintes bcrypt, mais leur import est à vérifier, sinon une réinitialisation des mots de passe s'impose ;
- reprise des règles d'accès ;
- temps réel en SSE ;
- sauvegardes ;
- effort de migration des 51 tables, de Storage et des triggers d'audit.

⚠️ Les variables `PREPROD_PB_*` pointent vers le PocketBase de **test.fs0ciety.org** (le jeu Cosmic Empires), pas vers une instance CSM : **n'y rien écrire**. Le prototype tourne avec un PocketBase local, puis sur l'instance CSM dédiée de Coolify.

**Comptes** : l'export des empreintes bcrypt (`auth.users.encrypted_password`) est autorisé pour tester leur import dans PocketBase. Si l'import échoue, il faudra réinitialiser les mots de passe.

## 4. Direction artistique

**Document de référence : `docs/DESIGN-DIRECTION.md`** (« Tactical premium » : discipline HUD de fs0ciety + lisibilité SaaS ; 5 thèmes AA vérifiés, polices, formes, composants, recettes GSAP, références). Captures de l'utilisateur : `docs/references/`.


- **Référence principale** : test.fs0ciety.org/game et /decisions — captures fournies dans `docs/references/` (fond noir chaud, titres condensés en capitales, libellés mono espacés, angles vifs, bande multicolore sur les cartes de stats, bordure gauche colorée par statut, bordures pointillées pour les états vides, accent ambre, barre d'onglets mobile à 5 entrées).
- Jetons déjà extraits de test.fs0ciety.org (voir `docs/PROPOSITION.md` §2 et l'historique de la v1) :
  - **Thèmes** : `data-theme` posé sans flash ; panneaux en verre ; fond en dégradé radial ; liserés accentués.
  - **Polices** : Inter, Chakra Petch pour les titres, JetBrains Mono pour les chiffres.
  - **Accents** : cyan `#4BE8FF`, violet `#A78BFA`.
- **Thèmes** : les 5 de `DESIGN-DIRECTION.md` (Commandement par défaut, Ivoire, Rail, Contraste élevé, Nocturne bleu), mode automatique et densité.
- **Autres références à étudier et capturer** : Linear, Vercel Dashboard, Attio, Raycast, Plane, Supabase Studio, Stripe Dashboard. En extraire les codes pour un outil d'opérations dense mais lisible.

## 5. Ce qui se réutilise de la v1 (branche `ccr-5dca0da8-4yg4i6`)

| Élément | Où |
|---|---|
| Audit complet (sécurité, base, UX) | `docs/AUDIT.md` |
| Proposition, nouveautés, feuille de route métier | `docs/PROPOSITION.md` §3 à §6 |
| Navigation et permissions par module | `src/lib/navigation.js`, `src/lib/permissions.js`, `src/lib/server/guards.js` |
| Règles du proxy, redirections sûres, tests | `src/lib/server/proxy.js`, `redirect.js` |
| Jetons de thème (5 thèmes) | `src/app.css` |
| Logique métier existante (services, PDF, e-mails) | `src/lib/services/*`, `src/routes/**` (également sur `main`) |
| Contraintes (pare-feu, e-mail, mobile) | `CLAUDE.md` §6 |
| Migration de sécurité (BACO) | `supabase/migrations/` |

## 6. Organisation du dépôt v2

```
/            ← BACO SvelteKit (inchangé, référence métier, ne pas modifier)
/web         ← CSM v2 Next.js (Dockerfile propre)
/pocketbase  ← pb_migrations/, pb_hooks/, Dockerfile, scripts d'import
/scripts     ← sauvegarde Supabase, export → import PocketBase
/docs        ← docs (CSM-V2.md, DEPLOIEMENT-V2.md, …)
```

Dans Coolify, deux ressources :
- `csm-web` (base directory `/web`, domaine `test-csm.fs0ciety.org`) ;
- `csm-pocketbase` (volume `/pb_data`, domaine interne ou `pb-test-csm.fs0ciety.org` réservé à l'admin).

## 7. Feuille de route v2

| # | Étape | Livrable |
|---|---|---|
| 0 | **Sauvegarde Supabase** (schéma, données, rôles, Storage, liste des comptes) | ✅ 8 oct. — `docs/SAUVEGARDE-SUPABASE.md`, restauration testée |
| 1 | Prototype PocketBase ou Supabase + squelette Next (auth, 1 module) | 🔄 8 oct. — prototype fait, recommandation **`docs/BACKEND-DECISION.md`** soumise (PocketBase confirmé, ≈ 10,75 j de migration backend) |
| 2 | Design system : jetons, 5 thèmes, bibliothèque de composants, GSAP, page `/design` | ✅ 8 oct. — captures validées |
| 3 | Shell : 6 entrées, onglets par module, ⌘K, menu utilisateur, mobile | ✅ 8 oct. — captures validées |
| 4 | Données : schéma, règles d'accès, import depuis la sauvegarde | Données de test sur l'environnement de test |
| 5 | Modules, dans l'ordre Commandes → PMR → Opérations → Référentiels → Équipe → Admin | Un module validé à la fois |
| 6 | Déploiement sur test-csm.fs0ciety.org, CI, sauvegardes PocketBase | 🔄 8 oct. — ressources Coolify créées (`docs/DEPLOIEMENT-V2.md`) |
