# 🚂 BACO - Application de Gestion Ferroviaire SNCB

Application SvelteKit moderne pour la gestion des opérations ferroviaires SNCB.

## 🚀 Démarrage Rapide

### Prérequis
- Node.js 18+
- npm
- Compte Supabase

### Installation

```bash
# 1. Cloner le repo
git clone https://github.com/fs0ciety7000/baco-svelte.git
cd baco-svelte

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env
# Puis éditez .env avec vos vraies valeurs Supabase

# 4. Lancer en développement
npm run dev

# 5. Ouvrir http://localhost:5173
```

## 🔐 Configuration Supabase

### Variables d'environnement requises

Créez un fichier `.env` à la racine du projet:

```env
PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
PUBLIC_SUPABASE_ANON_KEY=votre-cle-anon-key-ici
```

**Où trouver ces valeurs?**
1. Connectez-vous à [Supabase](https://supabase.com)
2. Allez dans Settings > API
3. Copiez:
   - Project URL → `PUBLIC_SUPABASE_URL`
   - Project API keys > anon public → `PUBLIC_SUPABASE_ANON_KEY`

### Configuration Vercel (Production)

Dans votre projet Vercel:
- Allez dans **Settings > Environment Variables**
- Ajoutez les mêmes variables:
  - `PUBLIC_SUPABASE_URL`
  - `PUBLIC_SUPABASE_ANON_KEY`

## 🧪 Tests

```bash
# Mode watch
npm run test

# Exécution unique
npm run test:run

# Interface UI
npm run test:ui

# Avec coverage
npm run test:coverage
```

**27 tests unitaires** sur les helpers et services du module déplacements PMR.

## 📦 Build & Déploiement

```bash
# Build production
npm run build

# Prévisualiser le build
npm run preview
```

Le déploiement sur Vercel est automatique à chaque push sur `main`.

## 📚 Documentation

- **[REFACTORING.md](./REFACTORING.md)** - Documentation complète du refactoring du module déplacements PMR
  - Architecture services
  - Composants modulaires
  - Améliorations email/PDF
  - Guide de migration

## 🏗️ Architecture

```
src/
├── lib/
│   ├── components/       # Composants UI réutilisables
│   ├── services/         # Services (déplacements, email, PDF)
│   ├── stores/           # Stores Svelte 5 (Runes)
│   └── utils/            # Helpers et constantes
│
├── routes/               # Pages (file-based routing)
│   ├── +layout.svelte    # Layout global avec auth
│   ├── +page.svelte      # Page de connexion
│   ├── accueil/          # Dashboard personnalisable
│   ├── deplacements/     # Module PMR refactoré ⭐
│   ├── otto/             # Commandes C3
│   ├── pmr/              # Gestion rampes
│   └── ...               # 20+ autres modules
│
└── tests/                # Configuration Vitest + mocks
```

## 🛠️ Stack Technique

- **Framework**: SvelteKit 2.49 + Svelte 5 (Runes API)
- **Styles**: Tailwind CSS 4 + plugins forms/typography
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Tests**: Vitest + Testing Library
- **PDF**: jsPDF + jspdf-autotable
- **Cartes**: Leaflet, MapLibre GL
- **Charts**: Chart.js
- **Déploiement**: Vercel

## 📂 Modules Principaux

| Module | Description | État |
|--------|-------------|------|
| `/deplacements` | Gestion déplacements PMR | ✅ Refactoré |
| `/otto` | Commandes C3/réquisitoires | 🟡 Legacy |
| `/pmr` | Gestion rampes PMR | 🟡 Legacy |
| `/operationnel` | Vue opérationnelle temps réel | 🟡 Legacy |
| `/journal` | Main courante collaborative | 🟡 Legacy |
| `/planning` | Gestion effectifs journaliers | 🟡 Legacy |
| `/admin` | Gestion utilisateurs (RBAC) | 🟡 Legacy |

⭐ **Module déplacements** = Refactoring complet avec architecture services + 27 tests

## 🎨 Design System

- **Thèmes**: 13 thèmes dynamiques (Deep Space, Ocean, Cyberpunk, etc.)
- **Composants**: Glass panels, animations, effets visuels
- **Dark mode**: Par défaut
- **Responsive**: Mobile-first

## 🔧 Scripts Disponibles

| Script | Description |
|--------|-------------|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build production |
| `npm run preview` | Prévisualiser build |
| `npm run test` | Tests en mode watch |
| `npm run test:ui` | Interface UI tests |
| `npm run test:coverage` | Coverage tests |
| `npm run format` | Formater avec Prettier |
| `npm run lint` | Vérifier avec Prettier |

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. Commit vos changements
   ```bash
   git commit -m 'feat: add some AmazingFeature'
   ```
4. Push vers la branche
   ```bash
   git push origin feature/AmazingFeature
   ```
5. Ouvrir une Pull Request

### Convention de commits

Utilisez les préfixes:
- `feat:` - Nouvelle fonctionnalité
- `fix:` - Correction de bug
- `docs:` - Documentation
- `refactor:` - Refactoring
- `test:` - Ajout/modification tests
- `chore:` - Tâches diverses

## 🐛 Debugging

### Build échoue sur Vercel?

Vérifiez que les variables d'environnement sont bien configurées dans Vercel:
```
Settings > Environment Variables
```

### Erreur Supabase?

Vérifiez que votre fichier `.env` contient les bonnes valeurs et n'est pas commité (il doit être dans `.gitignore`).

### Tests échouent?

```bash
# Réinstaller les dépendances
rm -rf node_modules package-lock.json
npm install

# Relancer les tests
npm run test:run
```

## 📊 Métriques du Projet

- **Total lignes de code Svelte**: ~15,000 lignes
- **Composants**: 54+ fichiers .svelte
- **Routes**: 25+ modules fonctionnels
- **Tests**: 27 tests unitaires (module déplacements)
- **Performance**: Lighthouse score > 90

## 📝 Licence

Ce projet est **privé** et destiné à un usage interne **SNCB** uniquement.

## 🙋 Support

Pour toute question ou problème, contactez l'équipe de développement.

---

**Version**: 1.0.0
**Dernière mise à jour**: 2026-01-22
**Mainteneur**: [@fs0ciety7000](https://github.com/fs0ciety7000)
