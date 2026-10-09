import { describe, expect, it } from "vitest";

import { cancelledPref } from "./cancelled-pref";

describe("cancelledPref", () => {
  it("le paramètre d'URL l'emporte sur le cookie", () => {
    expect(cancelledPref("affichees", "masquees")).toBe("affichees");
    expect(cancelledPref("masquees", undefined)).toBe("masquees");
  });
  it("sans paramètre : dernier choix mémorisé, sinon affichées", () => {
    expect(cancelledPref(undefined, "masquees")).toBe("masquees");
    expect(cancelledPref(undefined, undefined)).toBe("affichees");
    expect(cancelledPref("n'importe quoi", "autre")).toBe("affichees");
  });
});
