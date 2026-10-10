import type { Impact } from "@/lib/pmr/train-delay";

// Relève de service (demande du 10 oct. 2026) : synthèse de ce qui reste ouvert pour l'équipe suivante. Types partagés
// client / serveur et texte copiable (aussi épinglé au Journal en consigne). Aucun nom de voyageur.

export type HandoverOrder = {
  id: string;
  kind: "bus" | "taxi";
  label: string;
  day: string;
  time: string;
  late: number;
  href: string;
};

export type HandoverLeg = {
  id: string;
  kind: "pmr" | "groupe";
  day: string;
  time: string;
  train: string;
  station: string;
  io: "IN" | "OUT";
  detail: string;
  impact: Impact | null;
};

export type HandoverAlea = {
  kind: "pmr" | "groupe";
  train: string;
  station: string;
  io: "IN" | "OUT";
  time: string;
};

export type HandoverLog = {
  id: string;
  time: string;
  label: string;
  urgent: boolean;
  pinned: boolean;
};

export type Handover = {
  generatedAt: string;
  /** Jour de service (Bruxelles) de la relève. */
  today: string;
  districts: string[];
  toConfirm: HandoverOrder[];
  toClose: HandoverOrder[];
  running: HandoverOrder[];
  upcoming: HandoverLeg[];
  upcomingTotal: number;
  delays: HandoverLeg[];
  alea: HandoverAlea[];
  aleaTotal: number;
  log: HandoverLog[];
  disturbances: HandoverLog[];
};

const io = (v: "IN" | "OUT") => (v === "IN" ? "embarquement" : "débarquement");
const delayText = (i: Impact) => (i.cancelled ? "supprimé" : `+${i.delay} min`);

/** Texte brut de la relève (copie, consigne du Journal) : sections non vides seulement, listes bornées. */
export function handoverText(
  h: Handover,
  meta: { author: string; at: string; scope: string },
): string {
  const out: string[] = [`**Relève ${meta.scope}** — ${meta.at}, par ${meta.author}`];
  const section = (title: string, lines: string[], more = 0) => {
    if (!lines.length) return;
    out.push("", `**${title}**`, ...lines.map((l) => `- ${l}`));
    if (more > 0) out.push(`- … et ${more} de plus`);
  };
  section(
    `Bons à confirmer (${h.toConfirm.length})`,
    h.toConfirm.slice(0, 8).map((o) => `${o.label} · ${o.day}${o.time ? ` ${o.time}` : ""}`),
    h.toConfirm.length - 8,
  );
  section(
    `Bons à clôturer (${h.toClose.length})`,
    h.toClose.slice(0, 8).map((o) => `${o.label} · envoyé il y a ${o.late} j`),
    h.toClose.length - 8,
  );
  section(
    `Services de bus en cours (${h.running.length})`,
    h.running.slice(0, 8).map((o) => `${o.label}${o.time ? ` · ${o.time}` : ""}`),
    h.running.length - 8,
  );
  section(
    `Trains en retard (${h.delays.length})`,
    h.delays
      .slice(0, 10)
      .map((l) => `${l.train} ${delayText(l.impact!)} à ${l.impact!.station} · ${l.detail}`),
    h.delays.length - 10,
  );
  section(
    `Missions et groupes à venir (${h.upcomingTotal})`,
    h.upcoming
      .slice(0, 12)
      .map(
        (l) =>
          `${l.day !== h.today ? "demain " : ""}${l.time || "--:--"} ${l.train} · ${io(l.io)} à ${l.station} · ${l.detail}`,
      ),
    h.upcomingTotal - Math.min(12, h.upcoming.length),
  );
  section(
    `ALEA à encoder (${h.aleaTotal})`,
    h.alea
      .slice(0, 10)
      .map(
        (a) =>
          `${a.time ? `${a.time} ` : ""}${a.train} · ${io(a.io)} à ${a.station}${a.kind === "groupe" ? " (groupe)" : ""}`,
      ),
    h.aleaTotal - Math.min(10, h.alea.length),
  );
  section(
    "Urgences et consignes",
    h.log.slice(0, 8).map((l) => `${l.time} ${l.urgent ? "URGENT " : ""}${l.label}`),
    h.log.length - 8,
  );
  section(
    "Perturbations en cours",
    h.disturbances.slice(0, 8).map((l) => `${l.time} ${l.label}`),
    h.disturbances.length - 8,
  );
  if (out.length === 1) out.push("", "Rien d'ouvert : tout est à jour.");
  return out.join("\n").slice(0, 3900);
}
