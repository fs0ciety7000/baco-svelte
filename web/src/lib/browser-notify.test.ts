import { describe, expect, it } from "vitest";

import { notificationBody, shouldNotify } from "./browser-notify";

describe("notifications du navigateur", () => {
  it("ne montre jamais le texte d'une mention ou d'une urgence", () => {
    expect(notificationBody({ kind: "mention", body: "M. Dupont à Mons" })).toBe(
      "Mention au Journal",
    );
    expect(notificationBody({ kind: "urgent", body: "M. Dupont" })).toBe("Urgence au Journal");
    expect(notificationBody({ kind: "train", body: "2 missions PMR concernées (iRail)." })).toBe(
      "2 missions PMR concernées (iRail).",
    );
  });

  it("alerte seulement en arrière-plan, si activé, pour les types retenus", () => {
    expect(shouldNotify({ kind: "urgent" }, true, true)).toBe(true);
    expect(shouldNotify({ kind: "train" }, false, true)).toBe(false);
    expect(shouldNotify({ kind: "mention" }, true, false)).toBe(false);
    expect(shouldNotify({ kind: "perturbation" }, true, true)).toBe(false);
  });
});
