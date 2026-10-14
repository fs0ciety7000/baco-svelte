import { describe, expect, it } from "vitest";

import { handoverText, type Handover } from "./handover";

const empty: Handover = {
  generatedAt: "2026-10-10T18:00:00Z",
  today: "2026-10-10",
  districts: ["DSO"],
  toSend: [],
  running: [],
  upcoming: [],
  upcomingTotal: 0,
  delays: [],
  alea: [],
  aleaTotal: 0,
  log: [],
  disturbances: [],
};

describe("texte de la relève", () => {
  it("rien d'ouvert", () => {
    const t = handoverText(empty, { author: "Agent", at: "20:00", scope: "DSO" });
    expect(t).toContain("**Relève DSO** — 20:00, par Agent");
    expect(t).toContain("Rien d'ouvert");
  });
  it("sections non vides, demain signalé, liste bornée", () => {
    const upcoming = Array.from({ length: 14 }, (_, i) => ({
      id: `m${i}`,
      kind: "pmr" as const,
      day: i === 13 ? "2026-10-11" : "2026-10-10",
      time: i === 13 ? "07:10" : "21:00",
      train: "IC 2108",
      station: "Mons",
      io: "IN" as const,
      detail: "1 × CRF",
      impact: null,
    }));
    const t = handoverText(
      {
        ...empty,
        upcoming,
        upcomingTotal: 14,
        delays: [
          {
            ...upcoming[0]!,
            impact: { delay: 12, cancelled: false, station: "Mons", left: false },
          },
        ],
      },
      { author: "A", at: "20:00", scope: "DSO" },
    );
    expect(t).toContain("**Missions et groupes à venir (14)**");
    expect(t).toContain("IC 2108 +12 min à Mons");
    expect(t).toContain("… et 2 de plus");
    expect(t).not.toContain("Rien d'ouvert");
  });
  it("bons terminés à envoyer en tête, puis en cours", () => {
    const o = {
      id: "b1",
      kind: "bus" as const,
      label: "Bus n° 12 Mons → Ath",
      day: "ven. 09/10",
      time: "14:00",
      late: 1,
      href: "/commandes/bus/b1",
    };
    const t = handoverText(
      { ...empty, toSend: [o], running: [{ ...o, id: "b2", label: "Bus n° 13", late: 0 }] },
      { author: "A", at: "13:15", scope: "DSO" },
    );
    expect(t).toContain("**Bons terminés à envoyer (1)**");
    expect(t).toContain("Bus n° 12 Mons → Ath · ven. 09/10 (depuis 1 j)");
    expect(t.indexOf("à envoyer")).toBeLessThan(t.indexOf("**Bons en cours (1)**"));
  });
});
