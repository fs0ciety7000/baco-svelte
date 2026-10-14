import { describe, expect, it } from "vitest";

import { fitTabs } from "./module-tabs";

describe("fitTabs", () => {
  it("tout tient : pas de « Plus »", () => {
    expect(fitTabs([100, 100, 100], 400, 0)).toEqual({ shown: [0, 1, 2], more: [] });
  });
  it("le reste passe dans « Plus », l'onglet ouvert reste visible", () => {
    // 400 px − 84 pour « Plus » = 316 : l'actif (5) + deux autres.
    expect(fitTabs([100, 100, 100, 100, 100, 100], 400, 5)).toEqual({
      shown: [0, 1, 5],
      more: [2, 3, 4],
    });
    expect(fitTabs([100, 100, 100, 100, 100, 100], 400, -1)).toEqual({
      shown: [0, 1, 2],
      more: [3, 4, 5],
    });
  });
});
