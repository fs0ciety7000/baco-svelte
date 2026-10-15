import { describe, expect, it } from "vitest";
import { at, pmr, tech } from "./test-fixtures";
import { isCancelled, linkConnections, pmrCategory, taskWindow } from "./window";
import { DEFAULT_PLANNER_SETTINGS } from "./types";

const iso = (time: string) => new Date(at(time)).toISOString();

describe("taskWindow", () => {
  it("light IN : T−15 → T+5, OUT : T−5 → T+15", () => {
    expect(taskWindow(pmr("a", { time: "07:16", dir: "IN", type: "NV" }))).toEqual({
      start: iso("07:01"),
      end: iso("07:21"),
    });
    expect(taskWindow(pmr("b", { time: "08:43", dir: "OUT", type: "MR" }))).toEqual({
      start: iso("08:38"),
      end: iso("08:58"),
    });
    expect(taskWindow(pmr("c", { time: "08:43", dir: "OUT", type: "DCO" })).end).toBe(iso("08:58"));
  });

  it("fauteuil IN : T−20 → T+10, OUT : T−10 → T+20", () => {
    expect(taskWindow(pmr("a", { time: "06:20", dir: "IN", type: "CRF" }))).toEqual({
      start: iso("06:00"),
      end: iso("06:30"),
    });
    expect(taskWindow(pmr("b", { time: "10:00", dir: "OUT", type: "CRE" }))).toEqual({
      start: iso("09:50"),
      end: iso("10:20"),
    });
    expect(taskWindow(pmr("c", { time: "10:00", dir: "OUT", type: "crp" })).end).toBe(iso("10:20"));
  });

  it("type inconnu = light, sauf assistance complète déclarée (light: false)", () => {
    expect(pmrCategory({ pmrType: "AUTRE", light: true })).toBe("light");
    expect(pmrCategory({ pmrType: undefined, light: true })).toBe("light");
    expect(pmrCategory({ pmrType: undefined, light: false })).toBe("wheelchair");
    expect(pmrCategory({ pmrType: "NV", light: false })).toBe("light");
  });

  it("garde start / end d'une tâche technique ou sans heure de train", () => {
    const t = tech("x", "07:00", "07:15", "Mons");
    expect(taskWindow(t)).toEqual({ start: t.start, end: t.end });
    const noTrain = {
      ...pmr("y", { time: "07:00" }),
      trainAt: undefined,
      start: at("07:00"),
      end: at("07:30"),
    };
    expect(taskWindow(noTrain)).toEqual({ start: at("07:00"), end: at("07:30") });
  });

  it("taxi : même fenêtre, heure du taxi", () => {
    const t = { ...pmr("t", { time: "06:30", type: "NV" }), train: undefined };
    expect(taskWindow(t)).toEqual({ start: iso("06:15"), end: iso("06:35") });
  });

  it("suit les réglages", () => {
    const s = structuredClone(DEFAULT_PLANNER_SETTINGS);
    s.windows.light.in = { before: 30, after: 0 };
    expect(taskWindow(pmr("a", { time: "07:30" }), s)).toEqual({
      start: iso("07:00"),
      end: iso("07:30"),
    });
  });
});

describe("isCancelled", () => {
  it("statut CSM ou statut DICOS", () => {
    expect(isCancelled({ status: "annulee" })).toBe(true);
    expect(isCancelled({ status: "a_attribuer", dicosStatus: "Cancelled" })).toBe(true);
    expect(isCancelled({ status: "a_attribuer", dicosStatus: "Proposal" })).toBe(false);
  });
});

describe("linkConnections", () => {
  const D = "2026-10-15-0001";

  it("OUT puis IN du même dossier dans la même gare à moins de 30 min : un seul agent", () => {
    const out = pmr("o", { time: "07:04", dir: "OUT", dossier: D, train: "E1", station: "MONS" });
    const inn = pmr("i", { time: "07:20", dir: "IN", dossier: D, train: "E2", station: "Mons" });
    const [o, i] = linkConnections([out, inn]);
    expect(o!.linkKey).toBe("cx:o");
    expect(i!.linkKey).toBe("cx:o");
    expect(o!.start).toBe(iso("06:59"));
    expect(o!.end).toBe(iso("07:20"));
    expect(i!.start).toBe(iso("07:20"));
    expect(i!.end).toBe(iso("07:25"));
  });

  it("fauteuil : IN de T à T+10", () => {
    const out = pmr("o", { time: "09:00", dir: "OUT", dossier: D, type: "CRF", train: "E1" });
    const inn = pmr("i", { time: "09:29", dir: "IN", dossier: D, type: "CRF", train: "E2" });
    const [o, i] = linkConnections([out, inn]);
    expect(o!.end).toBe(iso("09:29"));
    expect(i!.end).toBe(iso("09:39"));
  });

  it("30 min ou plus : deux tâches standard ; autre gare ou autre dossier : pas de lien", () => {
    const out = pmr("o", { time: "09:00", dir: "OUT", dossier: D, train: "E1" });
    const late = pmr("i", { time: "09:30", dir: "IN", dossier: D, train: "E2" });
    const elsewhere = pmr("j", {
      time: "09:10",
      dir: "IN",
      dossier: D,
      train: "E3",
      station: "Ath",
    });
    const other = pmr("k", { time: "09:10", dir: "IN", dossier: "2026-10-15-0002", train: "E4" });
    const res = linkConnections([out, late, elsewhere, other]);
    expect(res.every((t) => !t.linkKey)).toBe(true);
    expect(res[1]!.start).toBe(iso("09:15"));
  });

  it("IN avant le OUT : pas une correspondance ; plusieurs IN : le plus proche", () => {
    const before = pmr("b", { time: "08:50", dir: "IN", dossier: D, train: "E0" });
    const out = pmr("o", { time: "09:00", dir: "OUT", dossier: D, train: "E1" });
    const far = pmr("f", { time: "09:25", dir: "IN", dossier: D, train: "E3" });
    const near = pmr("n", { time: "09:10", dir: "IN", dossier: D, train: "E2" });
    const res = linkConnections([before, out, far, near]);
    expect(res.find((t) => t.id === "b")!.linkKey).toBeUndefined();
    expect(res.find((t) => t.id === "n")!.linkKey).toBe("cx:o");
    expect(res.find((t) => t.id === "f")!.linkKey).toBeUndefined();
  });

  it("une tâche annulée n'est pas liée", () => {
    const out = pmr("o", { time: "09:00", dir: "OUT", dossier: D, train: "E1" });
    const inn = pmr("i", {
      time: "09:10",
      dir: "IN",
      dossier: D,
      train: "E2",
      dicosStatus: "Cancelled",
    });
    expect(linkConnections([out, inn]).every((t) => !t.linkKey)).toBe(true);
  });

  it("plusieurs PMR d'un même train, même gare, même heure : lien « train »", () => {
    const a = pmr("a", { time: "17:05", train: "E 3839", station: "Mons" });
    const b = pmr("b", { time: "17:05", train: "e3839", station: "MONS", type: "CRF" });
    const c = pmr("c", { time: "17:05", train: "E3839", station: "Ath" });
    const res = linkConnections([a, b, c]);
    expect(res[0]!.linkKey).toBe(res[1]!.linkKey);
    expect(res[0]!.linkKey).toMatch(/^tr:E3839:mons:/);
    expect(res[2]!.linkKey).toBeUndefined();
  });

  it("ne modifie pas l'entrée, recalcule les fenêtres et garde un lien manuel", () => {
    const out = pmr("o", { time: "07:04", dir: "OUT", dossier: D, train: "E1" });
    const inn = pmr("i", { time: "07:20", dir: "IN", dossier: D, train: "E2" });
    const manual = { ...pmr("m", { time: "12:00" }), linkKey: "manuel:1", start: at("00:00") };
    const before = JSON.stringify([out, inn, manual]);
    const res = linkConnections([
      out,
      inn,
      { ...inn, id: "stale", linkKey: "cx:old", dossier: undefined },
      manual,
    ]);
    expect(JSON.stringify([out, inn, manual])).toBe(before);
    expect(res[2]!.linkKey).toBeUndefined();
    expect(res[3]!.linkKey).toBe("manuel:1");
    expect(res[3]!.start).toBe(iso("11:45"));
  });
});
