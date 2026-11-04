import { describe, expect, it } from "vitest";

import { SEEK, seekDecision, shouldPush, skipFrom, stepAfter } from "./seek";

describe("seekDecision", () => {
  it("cible trouvée = montrée", () => {
    expect(seekDecision({ elapsed: 0, onPageFor: 0, found: true })).toBe("show");
  });

  it("attend tant que la page n'est pas posée", () => {
    expect(seekDecision({ elapsed: 500, onPageFor: null, found: false })).toBe("wait");
    expect(seekDecision({ elapsed: 3000, onPageFor: 1000, found: false })).toBe("wait");
  });

  it("sur la page depuis `settle` sans cible : carte centrée si prévue, sinon sautée", () => {
    const base = { elapsed: 4000, onPageFor: SEEK.settle, found: false };
    expect(seekDecision({ ...base, fallback: "center" })).toBe("center");
    expect(seekDecision(base)).toBe("skip");
  });

  it("jamais au-delà du plafond ; page jamais atteinte = sautée même avec carte centrée", () => {
    expect(
      seekDecision({ elapsed: SEEK.navMax, onPageFor: null, found: false, fallback: "center" }),
    ).toBe("skip");
  });
});

describe("navigation", () => {
  it("une demande au départ, relancée toutes les 2 s, 3 au plus, jamais une fois sur la page", () => {
    expect(shouldPush({ onPage: false, elapsed: 0, pushes: 0 })).toBe(true);
    expect(shouldPush({ onPage: false, elapsed: 1000, pushes: 1 })).toBe(false);
    expect(shouldPush({ onPage: false, elapsed: 2000, pushes: 1 })).toBe(true);
    expect(shouldPush({ onPage: false, elapsed: 9000, pushes: 3 })).toBe(false);
    expect(shouldPush({ onPage: true, elapsed: 0, pushes: 0 })).toBe(false);
  });

  it("Suivant / Précédent depuis l'étape demandée", () => {
    expect(stepAfter(3, 1, 10)).toBe(4);
    expect(stepAfter(9, 1, 10)).toBe("done");
    expect(stepAfter(0, -1, 10)).toBeNull();
  });

  it("étape sautée : même sens, repart en avant avant la première, fin après la dernière", () => {
    expect(skipFrom(4, 1, 10)).toEqual({ index: 5, dir: 1 });
    expect(skipFrom(4, -1, 10)).toEqual({ index: 3, dir: -1 });
    expect(skipFrom(0, -1, 10)).toEqual({ index: 1, dir: 1 });
    expect(skipFrom(9, 1, 10)).toBe("done");
  });
});
