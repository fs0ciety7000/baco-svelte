import { describe, expect, it } from "vitest";

import { todoItems } from "./todo";

const bus = (id: string, day: string) =>
  ({
    id,
    order_date: `${day} 00:00:00.000Z`,
    origin: "Mons",
    destination: "Namur",
    call_time: "06:10",
    status: "envoye",
  }) as never;

describe("todoItems", () => {
  it("trie par gravité et marque les bons à clôturer", () => {
    const items = todoItems({
      today: "2026-10-11",
      stats: {
        active: 2,
        toConfirm: 2,
        today: 0,
        running: 0,
        pending: [bus("b1", "2026-10-12"), bus("b2", "2026-10-03")],
      } as never,
      impacts: [
        {
          id: "m1",
          kind: "pmr",
          train: "IC 2116",
          time: "12:41",
          route: "Mons → Namur",
          detail: "1 × CRF",
          impact: { delay: 18, cancelled: false },
          href: "/pmr",
        },
      ] as never,
      mentions: [
        {
          id: "n1",
          kind: "mention",
          title: "Léa te mentionne",
          body: "",
          link: "/operations/journal",
          readAt: "",
          created: "2026-10-11 10:00:00.000Z",
        },
        {
          id: "n2",
          kind: "mention",
          title: "lu",
          body: "",
          link: "",
          readAt: "2026-10-11 10:05:00.000Z",
          created: "2026-10-11 10:00:00.000Z",
        },
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
    expect(items.map((i) => i.severity)).toEqual(["danger", "warn", "warn", "info", "neutral"]);
    expect(items[0]!.title).toBe("IC 2116 +18 min");
    expect(items.find((i) => i.key === "bus-b2")!.action).toBe("Clôturer");
    expect(items.find((i) => i.key === "bus-b1")!.action).toBe("Confirmer");
    expect(items.some((i) => i.key === "notif-n2")).toBe(false);
  });

  it("vide sans données", () => {
    expect(todoItems({ stats: null, impacts: null, mentions: null, log: null })).toEqual([]);
  });
});
