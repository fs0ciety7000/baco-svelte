// Nouveautés du Connecteur DICOS, affichées sur la page PMR › Extension DICOS (la plus récente en premier).
// À compléter à chaque version : un test vérifie que la première entrée = version du manifest et des paquets.

export type ExtensionNote = { version: string; date: string; notes: string[] };

export const EXTENSION_NOTES: ExtensionNote[] = [
  {
    version: "1.10.0",
    date: "2026-10-22",
    notes: [
      "Export ALEA : choisis le jour dans la fenêtre ALEA de CSM et clique « Synchroniser ce jour » : l'extension lit les missions de ce jour dans ton onglet DICOS ouvert et les envoie à CSM, sans passer par le popup.",
      "Seule l'adresse CSM à laquelle l'extension est connectée peut demander une synchro ; la page ne reçoit qu'un résumé chiffré (nombre de missions et de groupes).",
    ],
  },
  {
    version: "1.9.1",
    date: "2026-10-15",
    notes: [
      "Planificateur PMR : le nombre de voyageurs d'un dossier « à vérifier » n'est plus compté deux fois quand DICOS les décrit sous deux formes.",
    ],
  },
  {
    version: "1.9.0",
    date: "2026-10-15",
    notes: [
      "Planificateur PMR : à chaque synchro DICOS, les dossiers « à vérifier » (en attente d'acceptation) de tes gares partent aussi vers CSM. Seuls le n° de dossier, son statut, les trains, gares, heures, sens, type et nombre de voyageurs et la vérification par gare sont envoyés : ni nom, ni coordonnées, ni remarques.",
      "Horaires Quinyx : les groupes réglés « Gares » dans Administration › Quinyx envoient les prestations des agents de gare (CPI, SPI, OPI, PA, EXTRA) ; repos, congés et absences ne quittent jamais Quinyx.",
      "Le popup affiche les totaux « Dossiers en attente ».",
    ],
  },
  {
    version: "1.8.0",
    date: "2026-10-14",
    notes: [
      "Horaires Quinyx : à l'ouverture du planning dans Quinyx (au plus toutes les 3 h) ou par le bouton « Synchroniser le planning Quinyx », les prestations publiées des PACO / RCCA (AM, PM, nuit, extra) partent vers Équipe › Planning.",
      "Seuls le type de prestation, le lieu, le début, la fin et le nom de l'agent sont envoyés : ni repos, ni absences, ni coordonnées.",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-10-09",
    notes: [
      "Connexion en un clic depuis CSM (PMR › Extension DICOS) avec ton jeton personnel : plus de jeton à demander.",
      "Bouton « Autoriser CSM » dans l'extension tant que l'envoi n'est pas autorisé.",
      "L'extension annonce sa version : CSM et l'extension signalent quand une mise à jour est disponible.",
      "Une synchro interrompue en cours de route s'affiche « incomplète » dans CSM ; un jour sans mission compte comme synchronisé.",
    ],
  },
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

/** `a` plus récente que `b` (versions « x.y.z »). */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}
