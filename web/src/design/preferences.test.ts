import { describe, expect, it } from "vitest";

import { DEFAULT_UI, parseUiCookie } from "./preferences";

describe("parseUiCookie", () => {
  it("lit un cookie valide", () => {
    expect(parseUiCookie('{"theme":"rail","density":"compact"}')).toEqual({
      theme: "rail",
      density: "compact",
    });
  });

  it("garde les identifiants jour / nuit (Signal) et accepte les automatiques des directions (v4)", () => {
    expect(parseUiCookie('{"theme":"jour","density":"confortable"}').theme).toBe("jour");
    expect(parseUiCookie('{"theme":"nuit","density":"confortable"}').theme).toBe("nuit");
    expect(parseUiCookie('{"theme":"quai-auto","density":"confortable"}').theme).toBe("quai-auto");
    expect(parseUiCookie('{"theme":"cabine-nuit","density":"compact"}').theme).toBe("cabine-nuit");
  });

  it("retombe sur les valeurs par défaut si le cookie est absent, invalide ou falsifié", () => {
    expect(parseUiCookie(undefined)).toEqual(DEFAULT_UI);
    expect(parseUiCookie("{")).toEqual(DEFAULT_UI);
    expect(parseUiCookie('{"theme":"<script>","density":"énorme"}')).toEqual(DEFAULT_UI);
  });
});
