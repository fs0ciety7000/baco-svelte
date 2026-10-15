import { describe, expect, it } from "vitest";

import { ageLabel, groupTodo, primaryTodo, todoItems } from "./todo";

const bus = (id: string, day: string) =>
  ({
    id,
    order_date: `${day} 00:00:00.000Z`,
    origin: "Mons",
    destination: "Namur",
    call_time: "06:10",
    status: "termine",
    relation: id === "b1" ? "TC_2026-1012-01" : "",
    number: id === "b1" ? 529 : 0,
    bus_count: 2,
    ended_at: "",
  }) as never;

const notif = (id: string, kind: string, title: string, readAt = "") => ({
  id,
  kind: kind as never,
  title,
  body: "",
  link: "",
  readAt,
  created: "2026-10-11 10:00:00.000Z",
});

describe("todoItems", () => {
  it("groupe par gravité, action nommée par ligne, une seule primaire", () => {
    const items = todoItems({
      today: "2026-10-11",
      stats: {
        active: 2,
        toSend: 2,
        today: 0,
        running: 0,
        pending: [bus("b1", "2026-10-11"), bus("b2", "2026-10-03")],
      } as never,
      impacts: [
        {
          id: "m1",
          kind: "pmr",
          train: "IC 2116",
          time: "12:41",
          route: "Mons → Namur",
          detail: "1 × CRF",
          impact: { delay: 18, cancelled: false, station: "Namur", left: false },
          href: "/pmr",
        },
      ] as never,
      mentions: [
        notif("n1", "mention", "Léa te mentionne"),
        notif("n2", "mention", "lu", "2026-10-11 10:05:00.000Z"),
      ],
      log: [
        {
          id: "l1",
          time: "08:30",
          category: "info",
          urgent: false,
          pinned: true,
          body: "Ascenseur hors service",
          author: "x",
        },
      ],
    });
    // Impact (urgent) → bons à envoyer + mention (aujourd'hui) → consigne (information).
    expect(items.map((i) => i.group)).toEqual(["urgent", "today", "today", "today", "info"]);
    expect(items.map((i) => i.severity)).toEqual(["danger", "warn", "info", "info", "neutral"]);
    expect(items[0]).toMatchObject({
      title: "Retard sur une prise en charge PMR à Namur",
      train: "IC 2116",
      delay: { label: "+18 min", tone: "danger" },
      action: "Ouvrir la mission",
      kind: "impact",
    });
    expect(items.find((i) => i.key === "bus-b2")).toMatchObject({
      action: "Valider l'envoi",
      title: "Bon bus terminé, à envoyer à la société",
      when: "il y a 8 jours",
      severity: "warn",
    });
    expect(items.find((i) => i.key === "bus-b1")).toMatchObject({
      title: "Bon C3 n° 529 terminé, à envoyer à la société",
      code: "TC_2026-1012-01",
      detail: "Mons → Namur · 2 bus",
      severity: "info",
    });
    expect(items.some((i) => i.key === "notif-n2")).toBe(false);
    expect(items.find((i) => i.key === "pin-l1")).toMatchObject({ group: "info", action: "Lire" });
    // Une seule primaire : le premier bon à envoyer.
    expect(primaryTodo(items)).toBe("bus-b2");
    expect(groupTodo(items).map((g) => [g.label, g.items.length])).toEqual([
      ["Urgent", 1],
      ["À faire aujourd'hui", 3],
      ["Pour information", 1],
    ]);
  });

  it("primaire = premier élément sans bon à envoyer ; groupes vides omis ; train ignoré", () => {
    const items = todoItems({
      today: "2026-10-11",
      stats: null,
      impacts: [
        {
          id: "g1",
          kind: "groupe",
          train: "L 6458",
          time: "20:16",
          route: "Mons → Quiévrain",
          detail: "Groupe · 25 pers.",
          impact: { delay: 0, cancelled: true, station: "Mons", left: false },
          href: "/groupes",
        },
      ] as never,
      log: null,
      mentions: [
        notif("u", "urgent", "Urgence"),
        notif("d", "dicos", "DICOS : groupe déplacé à Mons"),
        notif("p", "perturbation", "Travaux (L.96)"),
        notif("t", "train", "Retard"),
      ],
    });
    expect(items.map((i) => [i.group, i.action])).toEqual([
      ["urgent", "Voir le groupe"],
      ["urgent", "Lire"],
      ["today", "Voir le groupe"],
      ["info", "Lire"],
    ]);
    expect(items[0]).toMatchObject({
      title: "Train supprimé : prise en charge de groupe à Mons",
      delay: { label: "supprimé", tone: "danger" },
    });
    expect(items[3]!.detail).toBe("iRail · Travaux");
    expect(primaryTodo(items)).toBe("impact-g1");
    expect(primaryTodo([])).toBeNull();
    expect(groupTodo(items.slice(0, 2)).map((g) => g.id)).toEqual(["urgent"]);
  });

  it("vide sans données", () => {
    expect(todoItems({ stats: null, impacts: null, mentions: null, log: null })).toEqual([]);
  });
});

describe("ageLabel", () => {
  it("minutes, heures, jours", () => {
    const now = new Date("2026-10-11T12:00:00Z");
    expect(ageLabel("2026-10-11 11:20:00.000Z", now)).toBe("40 min");
    expect(ageLabel("2026-10-11 09:00:00.000Z", now)).toBe("3 h");
    expect(ageLabel("2026-10-09 09:00:00.000Z", now)).toBe("2 j");
    expect(ageLabel("", now)).toBe("");
  });
});
