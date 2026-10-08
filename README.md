# CSM — Client Solutions Management Tool

Outil métier de l'équipe **Client Solutions** (ex-PACO, SNCB) : commandes de bus et de taxis de remplacement, assistance PMR, référentiels (lignes, PtCar, EBP), répertoire, trains en direct, planning, main courante, procédures, statistiques, administration.

Successeur de **BACO** (qui reste en service sur Vercel pendant la transition).

## Stack

- SvelteKit 2 · Svelte 5 (runes) · Tailwind CSS 4
- Supabase (Postgres + Auth + Storage), accédé **uniquement via le serveur CSM** : proxy same-origin et session en cookie, car le réseau de l'entreprise bloque `*.supabase.co`
- Docker (adapter-node) déployé sur Coolify : `csm.fs0ciety.org`

## Démarrage

```bash
cp .env.example .env   # renseigner les clés Supabase
npm ci
npm run dev            # http://localhost:5173
npx vitest run         # tests
npm run build          # build de production (node build)
```

## Documentation

| Document | Contenu |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Conventions, contraintes, workflow, journal des décisions |
| [`docs/AUDIT.md`](docs/AUDIT.md) | Audit initial : sécurité, base, architecture, performance, UX |
| [`docs/PROPOSITION.md`](docs/PROPOSITION.md) | Stack, design system, architecture de l'information, feuille de route |
| [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md) | Déploiement Coolify, variables, Supabase Auth, retour arrière |
| [`supabase/migrations/`](supabase/migrations) | Migrations SQL versionnées (appliquées manuellement) |
