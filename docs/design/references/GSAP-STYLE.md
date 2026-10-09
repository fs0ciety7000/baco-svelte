# Référence de style — gsap.com (fournie par l'utilisateur, 9 oct. 2026)

> Analyse du site public gsap.com transmise par l'utilisateur comme référence pour l'audit d'interface.
> C'est un site **vitrine** (marketing, défilement) : on en retient le langage (couleur = taxonomie, chaleur crème sur
> quasi-noir, motion, signature typographique), pas les tailles d'affichage (224 px) ni la mise en page éditoriale,
> inadaptées à un outil métier dense utilisé huit heures par jour.

## Synthèse

« Tableau noir animé dans un studio de design » : un fond quasi noir, une craie crème chaude et cinq surligneurs, un
par discipline d'animation. Thème sombre, une seule surface claire (crème `#fffce1`) sur fond `#0e100f`, chaque mot de
catégorie porte sa propre teinte vive : **la couleur sert de taxonomie, pas de décoration**. La typographie est le
héros (une seule famille, Mori, 400 et 600 ; titres très serrés, interlignage ≈ 0,9). Boutons presque tous en
**pilules fantômes** (rayon 100 px, bordure crème fine), aucun bouton plein ; seul le CTA principal a une bordure en
dégradé vert.

## Jetons

| Nom | Valeur | Rôle |
|---|---|---|
| Just Black | `#0e100f` | Fond de page |
| Surface Cream | `#fffce1` | Texte principal, bordures des boutons, titres |
| Surface 50 | `#7c7c6f` | Texte secondaire, icônes au repos |
| Surface 25 | `#42433d` | Filets, séparateurs |
| Off Black | `#191919` | Panneaux imbriqués, pied de page, code |
| Shockingly Green | `#0ae448` → `#abff84` (114°) | Marque, liens, CTA (bordure seulement) |
| Orangey | `#ff8709` | Catégorie SVG |
| Pink | `#fec5fb` | Catégorie Scroll |
| Lilac | `#9d95ff` | Catégorie Text |
| Blue | `#00bae2` | Catégorie UI |
| Core Green | `#dfffd1` | Lavis de fond lié au cœur |
| Lipstick Pink | `#f100cb` | Arrêt de dégradé décoratif seulement |

Typographie : Mori (substituts : Inter Tight, Söhne, DM Sans), 400 / 600. Échelle : 14 / 16 / 19 / 23 (corps),
34 / 44 / 66 / 101 / 224 (titres). Tracking négatif (−0,01 em corps, −0,011 em titres, −0,02 em affichage).
Base 4 px ; cartes rayon 8 px ; pilules 9999 px ; boutons 100 px ; padding de carte 24 px ; gouttière 16–24 px.

## Composants et signatures

- **Pilule crème contour** (contrôle par défaut) : fond transparent, bordure 1 px crème, 15 × 24 px, 18 px / 600.
- **CTA à bordure dégradée** : seule commande colorée du système.
- **Libellé de catégorie coloré** : un mot, une teinte par discipline ; même teinte dans la navigation et la section.
- **Annotation entre accolades** `{ Pourquoi GSAP }` : sourcil de section, signature typographique récurrente.
- **Filet 1 px `#42433d`** entre les blocs, pleine largeur.
- **Aucune ombre** : profondeur par paliers de surface et dégradés internes.
- Illustrations : formes 3D organiques en dégradés multi-arrêts, qui débordent sur le texte.

## À faire / à éviter (d'après la référence)

- Jamais `#ffffff` ni `#000000` : la chaleur crème / quasi-noir fait le caractère.
- Pas de nouvelle couleur de catégorie au-delà de la taxonomie : une couleur = une discipline, jamais réutilisée.
- Pas de bouton plein ; pas d'ombre portée ; corps entre 14 et 23 px.
- Marques proches citées : Framer, Linear, Vercel, Webflow, Spline.
