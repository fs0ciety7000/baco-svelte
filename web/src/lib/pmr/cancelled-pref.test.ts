import { describe, expect, it } from "vitest";

import { cancelledPref, storedCancelledPref } from "./cancelled-pref";

describe("cancelledPref", () => {
  it("le paramètre d'URL l'emporte sur le choix mémorisé", () => {
    expect(cancelledPref("affichees", "masquees")).toBe("affichees");
    expect(cancelledPref("masquees", undefined)).toBe("masquees");
  });
  it("sans paramètre : dernier choix mémorisé, sinon affichées", () => {
    expect(cancelledPref(undefined, "masquees")).toBe("masquees");
    expect(cancelledPref(undefined, undefined)).toBe("affichees");
    expect(cancelledPref("n'importe quoi", "autre")).toBe("affichees");
  });
  it("lit les préférences de l'agent sans planter", () => {
    expect(storedCancelledPref({ pmr: { cancelled: "masquees" } })).toBe("masquees");
    expect(storedCancelledPref({ dashboard: {} })).toBeUndefined();
    expect(storedCancelledPref(null)).toBeUndefined();
    expect(storedCancelledPref({ pmr: { cancelled: "x" } })).toBeUndefined();
  });
});
