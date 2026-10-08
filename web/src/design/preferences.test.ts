import { describe, expect, it } from "vitest";

import { DEFAULT_UI, parseUiCookie } from "./preferences";

describe("parseUiCookie", () => {
  it("lit un cookie valide", () => {
    expect(parseUiCookie('{"theme":"rail","density":"compact"}')).toEqual({
      theme: "rail",
      density: "compact",
    });
  });

  it("retombe sur les valeurs par défaut si le cookie est absent, invalide ou falsifié", () => {
    expect(parseUiCookie(undefined)).toEqual(DEFAULT_UI);
    expect(parseUiCookie("{")).toEqual(DEFAULT_UI);
    expect(parseUiCookie('{"theme":"<script>","density":"énorme"}')).toEqual(DEFAULT_UI);
  });
});
