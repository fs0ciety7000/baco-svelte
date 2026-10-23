// Anciennes routes → nouvelles (navigation v3, 14 oct. 2026, docs/design/AUDIT-NAVIGATION.md §4.5). SOURCE UNIQUE des
// redirections permanentes de pages, lue par `next.config.ts` (`redirects()`) : Next garde la chaîne de requête
// (`?entree=`, `?pn=`, `?train=`… des notifications enregistrées en base, des favoris et de ⌘K). Chaque redirection va
// directement à sa cible finale (jamais deux redirections de suite). Les routes `/api/…` ne changent pas.
//
// Lu par Node sans compilation (next.config.ts) : aucune importation.
//
// Exception voulue : `/pmr/extension` reste servie (alias de `/extension`) tant que les extensions installées n'injectent
// leur script de connexion (`csm-link.js`) que sur ce chemin.

export type LegacyRedirect = { source: string; destination: string };

export const LEGACY_REDIRECTS: LegacyRedirect[] = [
  // Opérations : Trains en direct, Carte PN et Statistiques changent de module.
  { source: "/operations", destination: "/reseau" },
  // Services Quinyx : « non pourvus » renommés « non alignés » (23 oct. 2026, fusions +SE / +SO comprises).
  { source: "/ressources/planning/non-pourvus", destination: "/ressources/planning/non-alignes" },
  { source: "/operations/statistiques", destination: "/statistiques" },
  { source: "/operations/carte-pn", destination: "/reseau/pn" },
  // « Main courante » renommée « Journal » (9 oct. 2026).
  { source: "/operations/main-courante", destination: "/operations/journal" },
  { source: "/operations/main-courante/nouveau", destination: "/operations/journal" },
  // Ex-Ressources (`/referentiels`) : réseau d'un côté, contacts et documents de l'autre.
  { source: "/referentiels", destination: "/ressources" },
  { source: "/referentiels/trains", destination: "/reseau/horaires" },
  { source: "/referentiels/lignes", destination: "/reseau/lignes" },
  { source: "/referentiels/gares", destination: "/reseau/gares" },
  { source: "/referentiels/ptcar", destination: "/reseau/ptcar" },
  { source: "/referentiels/ebp", destination: "/reseau/ebp" },
  { source: "/referentiels/documents", destination: "/ressources/documents" },
  { source: "/referentiels/documents/voir/:id", destination: "/ressources/documents/voir/:id" },
  { source: "/admin/lignes", destination: "/reseau/lignes" },
  // Module Équipe supprimé.
  { source: "/equipe", destination: "/ressources/equipe" },
  { source: "/equipe/planning", destination: "/ressources/planning" },
  { source: "/equipe/profil", destination: "/profil" },
  { source: "/equipe/nouveautes", destination: "/changelog" },
  // B201 (15 oct. 2026) : la Relève devient « B201 » (Opérations) et remplace la remise B201 de Ressources.
  { source: "/commandes/b201", destination: "/operations/b201" },
  { source: "/ressources/b201", destination: "/operations/b201" },
  { source: "/operations/releve", destination: "/operations/b201" },
  // PMR : Groupes en route courte (9 oct. 2026).
  { source: "/pmr/groupes", destination: "/groupes" },
];
