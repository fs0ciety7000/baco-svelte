# web/ — CSM v2 (Next.js 15)

Application web de CSM (voir `../CLAUDE.md`, `../docs/CSM-V2.md`, `../docs/DESIGN-DIRECTION.md`).
Next **15.5** App Router, `output: 'standalone'`, React 19, TypeScript strict (`noUncheckedIndexedAccess`),
Tailwind v4, shadcn/ui (composants écrits à la main dans `src/components/ui`, le CLI shadcn télécharge depuis
ui.shadcn.com), zod 4, TanStack Query 5, SDK `pocketbase` **côté serveur uniquement**.

## Commandes

```bash
npm ci
npm run dev                      # http://localhost:3000 (PB_URL=http://127.0.0.1:8090, CSM_COOKIE_SECURE=false)
npm run typecheck && npm run lint && npm run format && npm run test:run && npm run build   # avant chaque push
PB_URL=… CSM_COOKIE_SECURE=false npm run start:standalone   # serveur de production local (copie static + public)
# E2E (serveur + PocketBase local importé lancés à part ; desktop 1440×900 et mobile 390×844) :
E2E_IDENTITY=… E2E_PASSWORD=… PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… npm run e2e
```

Playwright est figé en **1.56.1** : seule version compatible avec le Chromium de `/opt/pw-browsers`
(ne jamais lancer `playwright install`).

## Architecture serveur (`src/server/`, `import "server-only"`)

- `env.ts` : variables serveur validées par zod (`PB_URL`, `CSM_COOKIE_SECURE`).
- `pocketbase.ts` : `createPb(token)` = **un client par requête**, authentifié avec le jeton de l'agent ; les
  règles PocketBase s'appliquent. Jamais de client partagé, jamais de jeton superuser dans l'app.
- `session.ts` : cookie `csm_session` **httpOnly**, `SameSite=Lax`, `Secure` en production, expiration = jeton.
- `auth.ts` : `getCurrentUser()` (relu dans PocketBase une fois par requête via `cache`), `requireUser()`.
- `data/*.ts` : accès aux données par module, paramètres validés par zod, filtres **liés** (`pb.filter`).
- `sse.ts` + `app/api/events/route.ts` : relais temps réel. Le navigateur ouvre `EventSource('/api/events?topics=…')`,
  le serveur s'abonne au SSE PocketBase avec le jeton de l'agent et ne renvoie que `{ collection, action, id }`
  (liste blanche de sujets). Côté client : `router.refresh()` ou invalidation TanStack Query.
- `middleware.ts` : redirige vers `/connexion` sans jeton valide ; rafraîchit le jeton à moins de 24 h d'expiration.

## Pièges

- Relancer `npm run build` pendant qu'un serveur standalone tourne remplace `.next/standalone` **sans** les
  fichiers statiques : le JS client répond 404, la page s'affiche mais rien n'est interactif (le formulaire de
  connexion marche quand même, il fonctionne sans JS). Toujours redémarrer par `npm run start:standalone`.

## Conventions

- **Le navigateur ne parle qu'au domaine CSM** : ni PocketBase, ni Supabase, ni WebSocket (test E2E dédié).
- Lecture : Server Components qui appellent `src/server/data`. Écriture : Server Actions validées par zod.
- Redirections après connexion : chemins internes uniquement (`safeNext`).
- Messages d'erreur de connexion identiques que le compte existe ou non.
- Mobile : chaque écran vérifié en 390×844 (pas de défilement horizontal, cibles ≥ 44 px, champs ≥ 16 px).
- **Design system** (`../docs/DESIGN-DIRECTION.md`) :
  - couleurs **uniquement** par jetons (`bg`, `surface`, `surface-2`, `border`, `border-strong`, `fg`, `fg-muted`,
    `accent`, `accent-fg`, `ok`, `warn`, `danger`, `info`) ; la palette Tailwind par défaut est désactivée ;
  - jetons dans `src/design/tokens.ts` → `npm run tokens` régénère `src/app/themes.css` (ne pas l'éditer à la main) ;
    `src/design/tokens.test.ts` échoue si le CSS n'est pas à jour ou si un contraste passe sous AA ;
  - thème et densité : cookie `csm_ui` lu par le layout racine (`data-theme`, `data-scheme`, `data-density`, aucun
    flash) ; `auto` suit `prefers-color-scheme` en CSS ; sélecteur `src/components/theme-switcher.tsx` ;
  - polices `next/font/google` (Geist, Geist Mono, Saira Condensed), auto-hébergées au build ;
  - utilitaires : `label-mono`, `display`, `tabular`, `chamfer` (+ `--frame`, `--fill`), `h-control`, `h-row`,
    `text-label|small|hint|body|body-lg|h3|h2|h1|stat`, `ease-hud`, `animate-fade-in|pop-in` ;
  - composants dans `src/components/ui` (Button, Input/Select/Textarea, Field, Checkbox/Switch, Card, StatCard,
    Badge/StatusBadge, Tabs, Dialog, Sheet, Toast, EmptyState, PageHeader, Kbd, Skeleton, Tooltip, Table/ListCard,
    Command) : **aucun style ad hoc dans les pages** ; tout nouveau composant est ajouté à `/design` ;
  - motion : `src/lib/motion.ts` (GSAP + `gsap.matchMedia()`, ease `hud`, `useStaggerIn`) ; budgets de DESIGN-DIRECTION.
- E2E `e2e/design.spec.ts` : `/design` dans les 5 thèmes × 2 formats (captures `test-results/design-*.png`, pas de
  défilement horizontal, pas d'erreur console, cibles ≥ 44 px sur mobile).
