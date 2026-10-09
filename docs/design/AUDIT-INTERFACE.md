# Audit d'interface CSM v2 — synthèse (9 oct. 2026)

Étape 7 « Finition de l'interface », lancée avec l'accord de l'utilisateur. Captures des 29 écrans en 1440×900 et
390×844 (thèmes Commandement et Ivoire, base locale, captures **hors dépôt** car les données sont importées), puis
quatre audits indépendants. Aucun code modifié à ce stade.

- Rapports détaillés : [`audit-interface/ui.md`](audit-interface/ui.md), [`ux.md`](audit-interface/ux.md),
  [`motion.md`](audit-interface/motion.md), [`typo-couleur.md`](audit-interface/typo-couleur.md) ;
  palettes candidates : [`audit-interface/palettes.json`](audit-interface/palettes.json).
- Référence fournie par l'utilisateur : [`references/GSAP-STYLE.md`](references/GSAP-STYLE.md).
- Planche interactive (palettes, forme, typographie, motion sur une maquette fictive) : artefact « Planche CSM v2 ».
- Contrôles automatiques : 0 débordement horizontal, 0 erreur JavaScript sur les 58 captures.

## Ce qu'il faut garder

Les trois voix typographiques (à resserrer, voir plus bas), rayon 0 sans ombre, bordure de statut à gauche, états
vides en pointillés, tables à 40–44 px, le formulaire de commande (meilleur écran), les raccourcis clavier, la rigueur
des jetons (test AA automatique), `prefers-reduced-motion` respecté partout.

## Constats critiques (convergents entre audits)

| # | Constat | Audits | Proposition |
|---|---|---|---|
| 1 | **L'accent est partout et se confond avec un statut** : bouton, sélection, liens, « Confirmé », n° de train, gare surlignée, graphiques, non-lus. Distance de teinte accent ↔ `warn` 0,046 (Ivoire), 0,085 (Commandement) ; accent ↔ `info` 0,06 (Nocturne). Confirmé indiscernable d'En cours / Envoyé. | UI, typo | Accent réservé à l'action (primaire, sélection, focus) ; jeton `progress` pour « Confirmé » ; n° de train en puce inversée neutre ; liens neutres ; test des jetons : écart de teinte minimal accent ↔ états. |
| 2 | **Texte trop petit et trop pâle** : 12 px = 2e taille rendue (tous les libellés), 11 px mono capitales = 3e ; `fg-muted` à Lc 37–43 (APCA) en sombre, 4,22:1 dans la gare surlignée. | typo | Rien sous 12 px, données ≥ 13 px, corps 15 px en confortable ; `fg-muted` relevé (~7:1) + `fg-subtle` ; badges et en-têtes en casse normale. |
| 3 | **Mobile : le premier écran est mangé** par l'en-tête et les filtres (1er résultat vers 560–590 px sur 844). | UI, UX | Recherche + bouton « Filtres (n) » en panneau (modèle repliable du Journal) ; en-tête compact. |
| 4 | **Missions PMR / Groupes sans date de synchro** : liste périmée possible, état vide trompeur. | UX | Bandeau « synchronisé il y a X min » (alerte au-delà d'un seuil) ; deux états vides distincts. |
| 5 | **Aucun `loading.tsx` / `error.tsx`** : pas de retour pendant la navigation, « Application error » en anglais sur erreur serveur. | UX | `error.tsx` français avec « Réessayer » ; barre de progression ou squelettes. |
| 6 | **Mouvements fautifs mesurés** : dialogues et ⌘K glissent en diagonale (288 px), accueil qui clignote au chargement, chaque filtre recharge la page entière. | motion | Animer `transform` (15 min) ; plus de `gsap.from` sur du HTML rendu serveur ; `next/form`. |
| 7 | **Graphiques des Statistiques** : texte mis à l'échelle avec le SVG (axe à 20 px desktop, 5 px mobile), pas d'échelle. | UI | Texte hors du `viewBox`, axe et repères. |

## Constats importants (extraits)

- En-tête qui répète quatre fois la même information (fil d'Ariane, sourcil, titre, onglet) ; action primaire qui
  change de place ; deux boutons ambre à la fois.
- 9 barres de filtres écrites à la main, 5 styles de puce, teintes de sélection en `color-mix` ad hoc → composants
  `ListToolbar` + `FilterChip` communs ; filtrage automatique absent de Commandes, Annuaire, Lignes/PtCar/EBP,
  Documents, Matériel, Clients.
- Focus clavier invisible dans les menus (1,07–1,15:1) ; désactivés par opacité (2,0–2,8:1) ; lignes hors district
  estompées à 1,8:1 ; bordures à 1,3–1,5:1.
- Sens IN / OUT en couleurs de statut ; zones de la carte PN en couleurs de statut ; bande arc-en-ciel des StatCards.
- ⌘K ne cherche aucune donnée (contacts, bons, gares, trains) ; pas de « Tout marquer lu » dans le Journal ; file
  « À confirmer » encrassée (bons de plus de 200 jours) ; raccourcis `/`, `N`, `J/K` non livrés.
- Panneau latéral à 500 ms (budget 300) ; squelette en boucle infinie ; données en direct sans signal ; « Copié » en
  toast de 4 s ; GSAP (~40 Ko gzip) chargé partout pour 3 usages.

## Décisions demandées à l'utilisateur

1. **Palette** : A « Commandement affiné », B « Craie » (d'après gsap.com, couleur par module, variante claire),
   C « Porcelaine » (jour, remplacerait Ivoire) — ou une combinaison (ex. B en sombre + C en clair).
2. **Forme** : angle + chanfrein (direction validée) ou pilules façon GSAP.
3. **Typographie** : Geist + Saira (actuel), Geist seule (recommandé par l'audit), IBM Plex ; corps 14 ou 15 px.
4. Questions UX : messages iRail dans les non-lus ? export ALEA commun PMR + groupes ? clôture des bons jamais
   confirmés (après combien de jours) ? Annuaire dans la barre du bas mobile ? tutoiement ou vouvoiement ?

## Plan proposé (après décisions)

| Lot | Contenu | Effort |
|---|---|---|
| 0 | Défauts visibles : glissement des dialogues / ⌘K, clignotement de l'accueil, squelette fixe, panneau à 300 ms, graphiques des Statistiques, `error.tsx` + `loading` ; test E2E du mouvement | ½ j |
| 1 | Jetons : palette choisie en OKLCH (sortie hex), `progress`, `fg-subtle`, test d'écart de teinte ; échelle typo (≥ 12 px, corps 15 px) ; focus et désactivés | 1 j |
| 2 | Structure : en-tête compact, `ListToolbar` + `FilterChip`, filtres repliables en mobile, filtrage automatique partout (`next/form`), place fixe de l'action primaire | 1,5 j |
| 3 | UX : date de synchro DICOS + états vides, « Tout marquer lu », file « À confirmer » (âge + clôture), ⌘K sur les données, raccourcis | 2 j |
| 4 | Motion : 7 primitives (`enter`, `exit`, `swap`, `highlight`, `count`, `slide-indicator`, `flip-panel`), signal des données en direct, « Copié » sur place, continuité ligne → panneau | 2 j |

Chaque lot : captures avant / après (1440 + 390), E2E, revue avant push.
