import { describe, expect, it } from "vitest";

import { normalizeNotificationLink as norm } from "./notification-link";

// 2026-11-03 23:30 UTC = 4 nov. 00:30 à Bruxelles : le jour vient de Bruxelles, pas d'UTC.
const created = "2026-11-03 23:30:00.000Z";

describe("normalizeNotificationLink", () => {
  it("refuse les liens externes ou invalides", () => {
    expect(norm("https://exemple.com/x", "mention")).toBe("");
    expect(norm("//exemple.com/x", "mention")).toBe("");
    expect(norm("", "mention")).toBe("");
    expect(norm("javascript:alert(1)", "mention")).toBe("");
  });

  it("garde les mentions et urgences dans Journal › Infos", () => {
    expect(norm("/operations/journal?entree=abc123def456ghi", "mention")).toBe(
      "/operations/journal?entree=abc123def456ghi",
    );
    expect(norm("/operations/perturbations?entree=abc", "urgent")).toBe(
      "/operations/journal?entree=abc",
    );
  });

  it("envoie les perturbations iRail dans Journal › Perturbations", () => {
    expect(norm("/operations/journal?entree=abc", "perturbation")).toBe(
      "/operations/perturbations?entree=abc",
    );
    expect(norm("/operations/main-courante?entree=abc", "perturbation")).toBe(
      "/operations/perturbations?entree=abc",
    );
  });

  it("suit les pages déplacées (redirects.ts)", () => {
    expect(norm("/operations/main-courante?entree=abc", "mention")).toBe(
      "/operations/journal?entree=abc",
    );
    expect(norm("/operations/carte-pn?pn=xyz", "systeme")).toBe("/reseau/pn?pn=xyz");
    expect(norm("/pmr/groupes?du=2026-11-04", "systeme")).toBe("/groupes?du=2026-11-04");
    expect(norm("/referentiels/documents/voir/abc", "systeme")).toBe(
      "/ressources/documents/voir/abc",
    );
  });

  it("train suivi : jour de la notification ajouté", () => {
    expect(norm("/operations?train=IC1234", "train", { created })).toBe(
      "/reseau?train=IC1234&jour=2026-11-04",
    );
    expect(norm("/reseau?train=IC1234&jour=2026-11-03", "train", { created })).toBe(
      "/reseau?train=IC1234&jour=2026-11-03",
    );
  });

  it("retard d'un train de mission : jour, tous districts, Groupes si seuls des groupes", () => {
    expect(
      norm("/pmr?q=4569", "train", {
        created,
        body: "1 mission PMR et 2 groupes concernées (iRail).",
      }),
    ).toBe("/pmr?q=4569&du=2026-11-04&au=2026-11-04&district=tous");
    expect(norm("/pmr?q=4569", "train", { created, body: "2 groupes concernés (iRail)." })).toBe(
      "/groupes?q=4569&du=2026-11-04&au=2026-11-04&district=tous",
    );
  });

  it("changement DICOS : district levé, train cherché, annulées affichées", () => {
    expect(
      norm("/pmr?du=2026-11-04&au=2026-11-04", "dicos", {
        created,
        title: "DICOS : mission annulée à Mons 10:12",
        body: "Embarquement · train 4569 · 2 × CRF",
      }),
    ).toBe("/pmr?du=2026-11-04&au=2026-11-04&district=tous&q=4569&statut=annulee");
    expect(
      norm("/groupes?du=2026-11-05&au=2026-11-05", "dicos", {
        created,
        title: "DICOS : nouveau groupe à Namur 08:00",
        body: "Débarquement · train ? · groupe de 25 pers.",
      }),
    ).toBe("/groupes?du=2026-11-05&au=2026-11-05&district=tous");
  });

  it("est idempotent sur les liens écrits par les hooks actuels", () => {
    const links: [string, string][] = [
      ["/operations/perturbations?entree=abc", "perturbation"],
      ["/operations/journal?entree=abc", "urgent"],
      ["/reseau?train=IC1234&jour=2026-11-04", "train"],
      ["/groupes?du=2026-11-04&au=2026-11-04&district=tous&q=4569", "train"],
      ["/pmr?du=2026-11-04&au=2026-11-04&district=DSO&q=4569&statut=annulee", "dicos"],
      ["/pmr", "systeme"],
    ];
    for (const [link, kind] of links) {
      const once = norm(link, kind, { created, body: "2 groupes concernés" });
      expect(once).toBe(link);
      expect(norm(once, kind, { created })).toBe(once);
    }
  });
});
