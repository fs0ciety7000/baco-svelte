// Ancienne adresse de l'Extension CSM, gardée en ALIAS (rendu identique, pas de redirection) : le script `csm-link.js`
// des extensions installées (≤ 1.8.0) n'est injecté que sur `/pmr/extension*` (manifest `content_scripts`), et le bouton
// « Ouvrir la page » de leur popup y mène. Une redirection casserait « Connecter l'extension à mon compte » jusqu'à la
// prochaine version de l'extension (qui devra ajouter `/extension*`). À remplacer alors par une redirection (lib/redirects.ts).
export { default, metadata } from "../../extension/page";
