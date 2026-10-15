import { describe, expect, it } from "vitest";
import { BASES, agent, at, pmr, tech, toAgent } from "./test-fixtures";
import { agentTimeline, type TimelineItem } from "./timeline";

const iso = (time: string) => new Date(at(time)).toISOString();
const short = (items: TimelineItem[]) =>
  items.map((i) =>
    i.type === "task"
      ? `T ${i.task.id}`
      : i.type === "trajet"
        ? `${i.label} (${i.minutes})`
        : `libre ${i.minutes}`,
  );

describe("agentTimeline", () => {
  const opi = agent("o1", "OPI", "FMS", [["06:00", "14:00"]]);

  it("départ, enchaînement gare → gare, retour à la base, temps libres et occupation", () => {
    const tasks = [
      pmr("ath", { time: "08:15", station: "Ath", assignee: toAgent("o1") }), // 08:00-08:20
      pmr("sg", {
        time: "10:15",
        station: "Saint-Ghislain",
        assignee: toAgent("o1"),
        train: "907",
      }), // 10:00-10:20
      pmr("autre", { time: "09:00", station: "Ath", assignee: toAgent("x") }),
    ];
    const tl = agentTimeline(opi, tasks, BASES);
    expect(short(tl.items)).toEqual([
      "libre 70",
      "Départ vers Ath (50)",
      "T ath",
      "libre 25",
      "Trajet vers Saint-Ghislain (75)",
      "T sg",
      "Retour à Mons (25)",
      "libre 195",
    ]);
    const dep = tl.items[1]!;
    expect(dep.start).toBe(iso("07:10"));
    expect(dep.end).toBe(iso("08:00"));
    const back = tl.items[6]!;
    expect(back.start).toBe(iso("10:20"));
    expect(back.end).toBe(iso("10:45"));
    expect(tl.serviceMinutes).toBe(480);
    // 50 + 20 + 75 + 20 + 25 = 190 min
    expect(tl.busyMinutes).toBe(190);
    expect(tl.freeMinutes).toBe(290);
    expect(tl.occupancy).toBe(40);
  });

  it("gare de base : aucun trajet ; plusieurs PMR du même train comptées une fois", () => {
    const pa = agent("p1", "PA", "FMS");
    const tasks = [
      pmr("a", { time: "07:16", assignee: toAgent("p1") }),
      pmr("b", { time: "07:16", assignee: toAgent("p1"), type: "CRF" }),
      tech("e", "07:30", "07:45", "Mons", { assignee: toAgent("p1") }),
    ];
    const tl = agentTimeline(pa, tasks, BASES);
    expect(tl.items.filter((i) => i.type === "trajet")).toHaveLength(0);
    // a 07:01-07:21, b 06:56-07:26, e 07:30-07:45 → 30 + 15
    expect(tl.busyMinutes).toBe(45);
  });

  it("trajet impossible signalé (conflit), retour après le service signalé", () => {
    const tasks = [
      pmr("m", { time: "07:00", assignee: toAgent("o1") }), // 06:45-07:05 à Mons
      pmr("a", { time: "07:30", station: "Ath", assignee: toAgent("o1"), train: "908" }), // 07:15 : 50 min impossible
      pmr("late", { time: "13:50", station: "Leuze", assignee: toAgent("o1"), train: "909" }),
    ];
    const tl = agentTimeline(opi, tasks, BASES);
    const trips = tl.items.filter((i) => i.type === "trajet");
    expect(trips[0]).toMatchObject({ label: "Départ vers Ath", conflict: true });
    expect(trips.at(-1)).toMatchObject({ label: "Retour à Mons", conflict: true });
  });

  it("tâche hors service listée sans trajet ; agent sans service", () => {
    const tasks = [pmr("n", { time: "23:00", station: "Ath", assignee: toAgent("o1") })];
    const tl = agentTimeline(opi, tasks, BASES);
    expect(tl.items.find((i) => i.type === "task")).toMatchObject({ outOfService: true });
    expect(tl.items.some((i) => i.type === "trajet")).toBe(false);
    const none = agentTimeline({ ...opi, shifts: [] }, tasks, BASES);
    expect(none.occupancy).toBe(0);
    expect(none.serviceMinutes).toBe(0);
  });

  it("services contigus fusionnés, service de nuit au-delà de minuit", () => {
    const spi = agent("s1", "SPI", "FMS", [
      ["14:00", "22:00"],
      ["22:00", "06:00"],
    ]);
    const tasks = [pmr("x", { time: "23:30", station: "Jurbise", assignee: toAgent("s1") })];
    const tl = agentTimeline(spi, tasks, BASES);
    expect(tl.serviceMinutes).toBe(16 * 60);
    expect(short(tl.items)).toContain("Départ vers Jurbise (30)");
    expect(short(tl.items)).toContain("Retour à Mons (30)");
  });

  it("tâches annulées et trajets en entrée ignorés", () => {
    const tasks = [
      pmr("c", {
        time: "08:00",
        station: "Ath",
        assignee: toAgent("o1"),
        dicosStatus: "Cancelled",
      }),
      {
        ...tech("t", "08:00", "09:00", "Ath", { assignee: toAgent("o1") }),
        kind: "trajet" as const,
      },
    ];
    const tl = agentTimeline(opi, tasks, BASES);
    expect(short(tl.items)).toEqual(["libre 480"]);
  });
});
