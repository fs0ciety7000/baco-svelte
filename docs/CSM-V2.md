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
| **Commandes (réponses du 8 oct., session 3)** | **Tout agent** qui écrit des commandes **confirme** (fournisseur au téléphone ou par mail), heure confirmée, plaque et chauffeur **facultatifs**. **Une B201 par jour** pour toute l'équipe, filtre district. Un **bus annulé** reste barré sur le bon mais **n'apparaît pas dans la B201**. **Modèles tous partagés**, modifiables par tout agent qui écrit des commandes. Retour d'un cran permis ; annuler après « en cours », rouvrir un terminé et rétablir une annulée : coordinateurs (moderator, admin). |
| **B201 (8 oct.)** | Écrite par **tous les agents du district** (user, otto_agent rattachés à un district) et les moderators ; le district n'est plus modifiable par l'agent. PDF seul. |
| **Opérations (8 oct., session 3)** | Recommandations de l'audit validées (`docs/design/AUDIT-UX-OPERATIONS.md` §6) : main courante recentrée (catégories, liens, épinglage, « Lu », retrait avec motif), gares favorites + trains suivis (10, la journée), pas de classement nominatif, notifications par hooks, **tuiles relayées par le serveur (option B)**, graphiques SVG, PN modifiés par les coordinateurs, **seuls les PN de BACO (avec adresse)**. |
| **PMR (8 oct., session 3)** | Saisie de la **journée abandonnée** (inutilisée depuis le 3 mai 2026) : Clients + Matériel d'abord, historique en lecture. Prestation structurée par assistance (coller DICOS), réf. DICOS + client facultatif, données de santé anonymisées après 12 mois (DPO). Audit : `docs/design/AUDIT-UX-PMR.md`. |
| **Sauvegardes PocketBase** | Sauvegarde du volume par Coolify pour l'instant, Cloudflare R2 (S3) plus tard. |
| **Bascule des données** | Migration **en une fois**, à une date de bascule : gel de BACO, export Supabase, import PocketBase, vérification. Pas de synchronisation entre les deux bases. |
| **Mobile** | Obligatoire, pensé mobile d'abord dès la conception. |

### Point de sécurité sur BACO — hotfix **appliqué le 8 octobre 2026** (0 alerte ERROR)
Suite mineure préparée, non appliquée : `supabase/migrations/20261008130000_hotfix_followup.sql`. Historique :
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

> Mise à jour le 9 octobre 2026. L'état détaillé et le journal des décisions sont dans `CLAUDE.md` §1 et §8.

| # | Étape | État |
|---|---|---|
| 0 | **Sauvegarde Supabase** (schéma, données, rôles, Storage, comptes) | ✅ 8 oct. (`docs/SAUVEGARDE-SUPABASE.md`, restauration testée) |
| 1 | Prototype PocketBase + squelette Next | ✅ 8 oct. (PocketBase 0.40.4 retenu, `docs/BACKEND-DECISION.md`) |
| 2 | Design system, `/design` | ✅ 8 oct. |
| 3 | Shell (6 modules, onglets, ⌘K, mobile) + tableau de bord | ✅ 8 oct. |
| 4 | Données : schéma, règles, import | 🔄 données BACO importées sur l'instance de test ; **migration réelle à la bascule** |
| 5 | Modules | ✅ Commandes, PMR, Opérations, DICOS / Missions PMR et Groupes, Annuaire et données validés · **Équipe et Admin livrés, à valider** |
| 6 | Déploiement test-csm.fs0ciety.org, CI | ✅ 8 oct. (`docs/DEPLOIEMENT-V2.md`) ; sauvegardes hors serveur R2 prêtes (variables à poser) |
| 7 | Finition de l'interface (11 thèmes, motion, UX) | ✅ 9 oct. (lots 0 à 4 + GSAP) |
| 8 | Extension DICOS (Chrome / Edge / Firefox), jetons personnels | ✅ 9 oct. (v1.7.0, Firefox signé ; Chrome Web Store prêt, fiche à créer) |
| 9 | **Bascule** : import des référentiels reproductible, répétition, liste de contrôle, domaine de production, gel de BACO | ⏳ à planifier avec l'utilisateur |

Restent ouverts hors code : validation d'Équipe et Admin, réponses du DPO (`docs/DPO-CONSERVATION.md`), accès à
`pb-test-csm` à restreindre (Cloudflare Access / IP), retrait de `CSM_DICOS_TOKEN` quand toutes les extensions sont en
1.7.0, correctifs SQL BACO non appliqués (`20261008130000`, `20261008140000`).
