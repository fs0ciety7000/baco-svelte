import { describe, expect, it } from "vitest";

import { deviceLabel, maskIp } from "./sessions";

describe("sessions ouvertes", () => {
  it("nomme l'appareil", () => {
    expect(
      deviceLabel(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0",
      ),
    ).toBe("Edge · Windows");
    expect(
      deviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari · iPhone");
    expect(deviceLabel("")).toBe("Appareil inconnu");
  });
  it("masque la fin de l'adresse IP", () => {
    expect(maskIp("81.240.12.34")).toBe("81.240.12.x");
    expect(maskIp("2a02:a03f:1:2::5")).toBe("2a02:a03f:1:…");
  });
});
