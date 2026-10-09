// Nouveautés du Connecteur DICOS, affichées sur la page PMR › Extension DICOS (la plus récente en premier).
// À compléter à chaque version : un test vérifie que la première entrée = version du manifest et des paquets.

export type ExtensionNote = { version: string; date: string; notes: string[] };

export const EXTENSION_NOTES: ExtensionNote[] = [
  {
    version: "1.6.1",
    date: "2026-10-09",
    notes: [
      "Temps d'arrêt ATMS lus même si l'onglet ATMS était ouvert avant l'installation ou la mise à jour.",
      "Sans onglet ATMS joignable, lecture directe avec la session ATMS du navigateur.",
      "Jusqu'à 100 trains par jour ; le popup indique la voie utilisée et les trains introuvables.",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-10-09",
    notes: [
      "Après chaque synchro, temps d'arrêt prévus lus dans un onglet ATMS connecté (export ALEA « Obligatoire »).",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-10-09",
    notes: ["Les réservations de groupe (écoles…) sont envoyées aussi : onglet Groupes."],
  },
  {
    version: "1.4.0",
    date: "2026-10-09",
    notes: [
      "Une ligne par trajet, reconstruite depuis la liste du jour ; seules les missions PMR sont lues.",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-10-08",
    notes: [
      "Avancement en direct dans le popup.",
      "Synchro de plusieurs jours d'affilée (1, 2, 3 ou 7).",
    ],
  },
];
