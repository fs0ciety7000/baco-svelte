import { describe, expect, it } from "vitest";

import { escapeExitsFullscreen, nativeFullscreenAvailable } from "./fullscreen";

describe("plein écran d'un bloc", () => {
  it("détecte le plein écran natif (absent sur iPhone)", () => {
    const fn = () => Promise.resolve();
    expect(
      nativeFullscreenAvailable({
        fullscreenEnabled: true,
        documentElement: { requestFullscreen: fn },
      }),
    ).toBe(true);
    expect(nativeFullscreenAvailable({ documentElement: {} })).toBe(false);
    expect(
      nativeFullscreenAvailable({
        fullscreenEnabled: false,
        documentElement: { requestFullscreen: fn },
      }),
    ).toBe(false);
    expect(nativeFullscreenAvailable(undefined)).toBe(false);
  });

  it("Échap ferme d'abord un dialogue ou une liste ouverte", () => {
    expect(escapeExitsFullscreen({ key: "Escape", defaultPrevented: false }, false)).toBe(true);
    expect(escapeExitsFullscreen({ key: "Escape", defaultPrevented: false }, true)).toBe(false);
    expect(escapeExitsFullscreen({ key: "Escape", defaultPrevented: true }, false)).toBe(false);
    expect(escapeExitsFullscreen({ key: "Enter", defaultPrevented: false }, false)).toBe(false);
  });
});
