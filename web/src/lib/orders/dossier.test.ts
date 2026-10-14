import { describe, expect, it } from "vitest";

import { normalizeDossier } from "./dossier";

describe("n° de dossier DICOS d'un taxi PMR (AAAA-MM-JJ-NNNN)", () => {
  it("accepte le format exact", () => {
    expect(normalizeDossier("2026-10-14-0134")).toEqual({ value: "2026-10-14-0134", ok: true });
    expect(normalizeDossier("  2026-10-14-0134 ")).toEqual({ value: "2026-10-14-0134", ok: true });
  });

  it("remet au format une saisie sans ambiguïté", () => {
    expect(normalizeDossier("20261014134").value).toBe("2026-10-14-0134");
    expect(normalizeDossier("202610140134").value).toBe("2026-10-14-0134");
    expect(normalizeDossier("2026-10-14-134").value).toBe("2026-10-14-0134");
    expect(normalizeDossier("2026/10/14/134").value).toBe("2026-10-14-0134");
    expect(normalizeDossier("2026 1 4 7").value).toBe("2026-01-04-0007");
  });

  it("vide = rien à signaler", () => {
    expect(normalizeDossier("")).toEqual({ value: "", ok: true });
  });

  it("refuse en douceur ce qui n'est pas un dossier (saisie gardée, message clair)", () => {
    for (const raw of [
      "2026-10-14",
      "1234",
      "2026-13-01-0001",
      "abc",
      "2026-10-14-01345",
      "1999-10-14-1",
    ]) {
      const r = normalizeDossier(raw);
      expect(r.ok, raw).toBe(false);
      expect(r.value).toBe(raw);
      expect(r.message).toMatch(/AAAA-MM-JJ-NNNN/);
    }
  });
});
