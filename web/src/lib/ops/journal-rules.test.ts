import { describe, expect, it } from "vitest";

import { ruleCategory, type JournalRule } from "./journal-rules";

const rules: JournalRule[] = [
  { source: "irail", match: "", category: "perturbation" },
  { source: "baco", match: "PMR, rampe", category: "pmr" },
  { source: "baco", match: "bus", category: "commande" },
  { source: "baco", match: "", category: "service" },
];

describe("tri automatique du Journal", () => {
  it("mot-clé sans casse ni accent", () => {
    expect(ruleCategory(rules, "baco", "Rampe en panne à Tournai", "info")).toBe("pmr");
    expect(ruleCategory(rules, "baco", "BUS commandé", "info")).toBe("commande");
  });
  it("règle sans mot-clé en dernier recours", () => {
    expect(ruleCategory(rules, "baco", "Relève faite", "info")).toBe("service");
  });
  it("catégorie imposée avant la règle générale (travaux iRail)", () => {
    expect(ruleCategory(rules, "irail", "Travaux à Mons", "perturbation", "travaux")).toBe(
      "travaux",
    );
    expect(ruleCategory(rules, "irail", "Panne de signalisation", "incident")).toBe("perturbation");
  });
  it("sans règle : valeur par défaut", () => {
    expect(ruleCategory([], "baco", "x", "info")).toBe("info");
  });
});
