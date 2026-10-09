import { describe, expect, it } from "vitest";

import { isClosable, transitionsFor } from "./status";

describe("clôture d'un bon envoyé jamais confirmé (5 jours)", () => {
  it("n'est pas proposée avant 5 jours après la date de service", () => {
    expect(isClosable("envoye", "2026-10-05", "2026-10-09")).toBe(false);
    const list = transitionsFor("envoye", { coordinator: false, closable: false });
    expect(list.map((t) => t.to)).not.toContain("termine");
  });

  it("est proposée à partir de 5 jours", () => {
    expect(isClosable("envoye", "2026-10-04", "2026-10-09")).toBe(true);
    const list = transitionsFor("envoye", { coordinator: false, closable: true });
    expect(list.find((t) => t.to === "termine")?.label).toBe("Clôturer sans confirmation");
  });

  it("ne concerne que les bons envoyés", () => {
    expect(isClosable("confirme", "2026-09-01", "2026-10-09")).toBe(false);
    expect(isClosable("envoye", "", "2026-10-09")).toBe(false);
  });
});
