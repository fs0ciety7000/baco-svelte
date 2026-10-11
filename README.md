# CSM — Client Solutions Management Tool

Outil métier de l'équipe **Client Solutions** (ex-PACO, SNCB) : commandes de bus et de taxis de remplacement, missions PMR
et groupes (DICOS), Journal, trains en direct (iRail), annuaire et données (lignes, PtCar, EBP, procédures), équipe,
administration.

Production : **https://csm.fs0ciety.org** (branche `csm-prod`) · préversion : **https://test-csm.fs0ciety.org**
(branche `csm-preview`).

## Dépôt

| Dossier | Contenu |
|---|---|
| [`web/`](web) | Application Next.js 15 (TypeScript, Tailwind v4) — voir [`web/CLAUDE.md`](web/CLAUDE.md) |
| [`pocketbase/`](pocketbase) | Base PocketBase 0.40.4 : migrations, règles, hooks, import — voir [`pocketbase/CLAUDE.md`](pocketbase/CLAUDE.md) |
| [`extension/`](extension) | Extension de navigateur « DICOS Connector » (missions PMR, horaires ATMS) |
| [`docs/`](docs) | Cahier des charges, déploiement, design, audits, note DPO |
| [`scripts/`](scripts) | Sauvegarde de la base BACO (Supabase, lecture seule) |
| [`supabase/`](supabase) | Migrations de sécurité de BACO (jusqu'à sa fermeture) |

**BACO** (prédécesseur SvelteKit + Supabase) reste en service sur la branche `main` (Vercel) jusqu'à la transition
officielle ; sa référence de code est la branche `ccr-5dca0da8-4yg4i6`.

## Démarrage

```bash
# PocketBase (binaire 0.40.4)
cd pocketbase && pocketbase serve --http 127.0.0.1:8090 --dir pb_data --migrationsDir pb_migrations --hooksDir pb_hooks
# Web
cd web && npm ci && npm run dev    # http://localhost:3000
```

Documentation : [`CLAUDE.md`](CLAUDE.md) (contraintes, workflow, journal), [`docs/CSM-V2.md`](docs/CSM-V2.md),
[`docs/DEPLOIEMENT-V2.md`](docs/DEPLOIEMENT-V2.md), [`docs/DESIGN-DIRECTION.md`](docs/DESIGN-DIRECTION.md).
