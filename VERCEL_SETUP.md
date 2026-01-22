# 🚀 Configuration Vercel pour BACO

Guide rapide pour configurer votre déploiement Vercel.

## ⚠️ Erreur de Build Actuelle

```
Error: "PUBLIC_SUPABASE_URL" is not exported by "virtual:env/static/public"
```

Cette erreur signifie que les **variables d'environnement Supabase ne sont pas configurées** dans Vercel.

## ✅ Solution: Configurer les Variables d'Environnement

### Étape 1: Aller dans les Settings Vercel

1. Allez sur votre projet Vercel: https://vercel.com/dashboard
2. Sélectionnez le projet `baco-svelte`
3. Cliquez sur **Settings** (onglet en haut)
4. Dans la sidebar, cliquez sur **Environment Variables**

### Étape 2: Ajouter les Variables

Ajoutez ces **2 variables** pour tous les environnements (Production, Preview, Development):

| Variable | Valeur | Où trouver? |
|----------|--------|-------------|
| `PUBLIC_SUPABASE_URL` | `https://mgljaheyimizrydazrxh.supabase.co` | Trouvé dans `vercel.json` |
| `PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Supabase Dashboard > Settings > API |

#### Comment trouver `PUBLIC_SUPABASE_ANON_KEY`:

1. Allez sur [Supabase](https://supabase.com/dashboard)
2. Sélectionnez votre projet `mgljaheyimizrydazrxh`
3. Allez dans **Settings** (icône engrenage)
4. Cliquez sur **API** dans la sidebar
5. Copiez la clé `anon` `public` (commence par `eyJ...`)

### Étape 3: Redéployer

Après avoir ajouté les variables:

1. **Option A**: Déclencher automatiquement
   - Faites un nouveau push sur votre branche
   ```bash
   git commit --allow-empty -m "chore: trigger redeploy"
   git push
   ```

2. **Option B**: Déclencher manuellement
   - Dans Vercel, allez dans **Deployments**
   - Cliquez sur les `...` du dernier déploiement
   - Cliquez sur **Redeploy**

### Étape 4: Vérifier

Le build devrait maintenant passer! ✅

Vous pouvez vérifier dans les logs de déploiement que les variables sont bien chargées.

## 📝 Configuration Locale

Pour développer en local, vous avez aussi besoin des variables:

```bash
# Copiez le template
cp .env.example .env

# Éditez .env et ajoutez vos vraies valeurs
PUBLIC_SUPABASE_URL=https://mgljaheyimizrydazrxh.supabase.co
PUBLIC_SUPABASE_ANON_KEY=votre-cle-anon-key-ici
```

**⚠️ IMPORTANT**: Ne committez **JAMAIS** le fichier `.env` (il est dans `.gitignore`)

## 🔍 Debugging

### Build échoue encore?

1. **Vérifier que les variables sont bien sauvegardées**
   - Vercel > Settings > Environment Variables
   - Les 2 variables doivent apparaître pour tous les environnements

2. **Vérifier l'orthographe exacte**
   - `PUBLIC_SUPABASE_URL` (pas `SUPABASE_URL`)
   - `PUBLIC_SUPABASE_ANON_KEY` (pas `SUPABASE_KEY`)

3. **Redéployer depuis zéro**
   - Vercel > Deployments
   - `...` > Redeploy
   - ✅ Cochez "Use existing Build Cache"

### Variables visibles dans les logs?

Si vous voyez `undefined` dans les logs:
- Les variables ne sont pas configurées dans Vercel
- Ou les noms ne correspondent pas exactement

### Toujours des erreurs?

Contactez le support Vercel ou vérifiez:
- Les permissions Supabase
- Que l'URL Supabase est accessible publiquement
- Que la clé `anon` n'a pas expiré

## 🎯 Checklist Finale

Avant de fermer ce guide:

- [ ] Variables ajoutées dans Vercel Settings
- [ ] `PUBLIC_SUPABASE_URL` configurée
- [ ] `PUBLIC_SUPABASE_ANON_KEY` configurée
- [ ] Variables activées pour Production + Preview + Development
- [ ] Redéploiement déclenché
- [ ] Build passe avec succès ✅
- [ ] `.env` local créé pour développement
- [ ] `.env` n'est PAS commité dans git

---

**Besoin d'aide?** Vérifiez le [README.md](./README.md) ou [REFACTORING.md](./REFACTORING.md)
