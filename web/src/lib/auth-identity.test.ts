import { describe, expect, it } from "vitest";

import { identityCandidates } from "./auth-identity";

describe("identityCandidates", () => {
  it("saisie puis minuscules, sans doublon", () => {
    expect(identityCandidates(" Nicolas.Dupont@Exemple.be ")).toEqual([
      "Nicolas.Dupont@Exemple.be",
      "nicolas.dupont@exemple.be",
    ]);
    expect(identityCandidates("agent.test")).toEqual(["agent.test"]);
    expect(identityCandidates("   ")).toEqual([]);
  });
});
