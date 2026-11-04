import { describe, expect, it } from "vitest";

import { flipFrom, placeCard, sheetSide, spotlightBox } from "./position";
import {
  availableChapters,
  CHAPTERS,
  plannedSteps,
  readTourPref,
  shouldAutoStartTour,
  TOUR_VERSION,
  tourPending,
  tourPrefValue,
} from "./steps";

const paco = { role: "paco", perms: null } as const;
const guest = { role: "guest", perms: null } as const;
const screen = { role: "screen", perms: null } as const;
const vp = { width: 1440, height: 900 };

describe("plannedSteps", () => {
  it("toute la visite pour un PACO/RCCA en desktop, sans l'étape « Plus »", () => {
    const steps = plannedSteps(paco);
    expect(steps.map((s) => s.chapter)).toContain("bus");
    expect(steps.map((s) => s.chapter)).toContain("pmr");
    expect(steps.some((s) => s.id === "plus")).toBe(false);
    expect(steps[0]!.id).toBe("modules");
  });

  it("ajoute « Plus » en mobile, juste après les modules, et prend le texte mobile", () => {
    const steps = plannedSteps(paco, ["prise-en-main"], { mobile: true });
    expect(steps.map((s) => s.id).slice(0, 2)).toEqual(["modules", "plus"]);
    expect(steps[0]!.body).toMatch(/En bas/);
  });

  it("l'invité n'a ni PMR ni districts du jour, et pas de création de bon", () => {
    const steps = plannedSteps(guest);
    expect(steps.some((s) => s.chapter === "pmr")).toBe(false);
    expect(steps.some((s) => s.id === "districts")).toBe(false);
    expect(steps.some((s) => s.id === "suivi")).toBe(true);
    expect(steps.some((s) => s.id === "nouveau" || s.id === "envoi")).toBe(false);
  });

  it("sans droit bus ni taxi, le chapitre Bus et taxis disparaît", () => {
    const user = { role: "paco", perms: ["deplacements:read", "journal:read"] };
    expect(plannedSteps(user).some((s) => s.chapter === "bus")).toBe(false);
    expect(availableChapters(user).map((c) => c.id)).toEqual(["prise-en-main", "pmr"]);
  });

  it("chapitre demandé seulement, jamais rien pour l'Écran", () => {
    expect(new Set(plannedSteps(paco, ["pmr"]).map((s) => s.chapter))).toEqual(new Set(["pmr"]));
    expect(plannedSteps(screen)).toEqual([]);
  });

  it("textes courts (3 phrases au plus) et cibles présentes", () => {
    for (const c of CHAPTERS)
      for (const s of c.steps) {
        expect(s.targets.length).toBeGreaterThan(0);
        expect((s.body.match(/[.!?](\s|$)/g) ?? []).length).toBeLessThanOrEqual(3);
      }
  });
});

describe("préférence tour", () => {
  it("lit une valeur valide et refuse le reste", () => {
    expect(readTourPref({ tour: { seen: "2026-11-04T08:00:00.000Z", version: 1 } })).toEqual({
      seen: "2026-11-04T08:00:00.000Z",
      version: 1,
    });
    expect(readTourPref(null)).toBeNull();
    expect(readTourPref({ tour: true })).toBeNull();
    expect(readTourPref({ tour: { seen: "pas une date", version: 1 } })).toBeNull();
    expect(readTourPref({ tour: { seen: "2026-11-04", version: 0 } })).toBeNull();
  });

  it("à montrer tant que la version vue est plus ancienne", () => {
    expect(tourPending({})).toBe(true);
    expect(tourPending({ tour: tourPrefValue(new Date("2026-11-04T08:00:00Z")) })).toBe(false);
    expect(tourPending({ tour: { seen: "2026-11-04", version: TOUR_VERSION - 1 || 0 } })).toBe(
      true,
    );
  });

  it("jamais automatique pour l'Écran ni pendant « Voir en tant que »", () => {
    expect(shouldAutoStartTour({ ...paco, preferences: {} })).toBe(true);
    expect(shouldAutoStartTour({ ...screen, preferences: {} })).toBe(false);
    expect(shouldAutoStartTour({ ...paco, preferences: {}, impersonatedBy: { id: "a" } })).toBe(
      false,
    );
    expect(shouldAutoStartTour({ ...paco, preferences: { tour: tourPrefValue() } })).toBe(false);
  });
});

describe("placement", () => {
  it("découpe bornée à la fenêtre", () => {
    expect(spotlightBox({ top: 2, left: 2, width: 10, height: 10 }, vp)).toEqual({
      top: 0,
      left: 0,
      width: 18,
      height: 18,
    });
    expect(spotlightBox({ top: 100, left: 100, width: 50, height: 2000 }, vp).height).toBe(806);
  });

  it("sous la cible, sinon au-dessus, sinon à droite", () => {
    const card = { width: 360, height: 200 };
    expect(placeCard({ top: 10, left: 600, width: 40, height: 40 }, card, vp).side).toBe("bottom");
    expect(placeCard({ top: 800, left: 600, width: 40, height: 40 }, card, vp).side).toBe("top");
    const r = placeCard({ top: 0, left: 0, width: 230, height: 900 }, card, vp);
    expect(r.side).toBe("right");
    expect(r.left).toBe(242);
  });

  it("cible énorme : par-dessus, dans la fenêtre ; sans cible : centrée", () => {
    const card = { width: 360, height: 200 };
    const r = placeCard({ top: 0, left: 0, width: 1440, height: 900 }, card, vp);
    expect(r.side).toBe("over");
    expect(r.top + card.height).toBeLessThanOrEqual(vp.height);
    expect(placeCard(null, card, vp)).toEqual({ top: 350, left: 540, side: "center" });
  });

  it("jamais hors de l'écran à droite", () => {
    const r = placeCard(
      { top: 10, left: 1420, width: 20, height: 20 },
      { width: 360, height: 200 },
      vp,
    );
    expect(r.left + 360).toBeLessThanOrEqual(vp.width - 12);
  });

  it("feuille mobile en haut quand la cible est en bas", () => {
    const m = { width: 390, height: 844 };
    expect(sheetSide({ top: 790, left: 0, width: 390, height: 54 }, 260, m)).toBe("top");
    expect(sheetSide({ top: 60, left: 0, width: 390, height: 40 }, 260, m)).toBe("bottom");
    expect(sheetSide(null, 260, m)).toBe("bottom");
  });

  it("FLIP", () => {
    expect(
      flipFrom(
        { top: 0, left: 0, width: 50, height: 20 },
        { top: 10, left: 20, width: 100, height: 40 },
      ),
    ).toEqual({ x: -20, y: -10, sx: 0.5, sy: 0.5 });
  });
});
