import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EXTENSION_NOTES, isNewer } from "./extension-releases";

const root = path.join(__dirname, "../../../..");
const json = (p: string) =>
  JSON.parse(readFileSync(path.join(root, p), "utf8")) as { version: string };

describe("Connecteur DICOS : paquets à jour", () => {
  const manifest = json("extension/dicos-connector/manifest.json").version;

  it("les deux manifests ont la même version", () => {
    expect(json("extension/dicos-connector/manifest.firefox.json").version).toBe(manifest);
  });

  it("les paquets servis par CSM sont ceux de la version du manifest (relancer extension/build-zips.sh)", () => {
    expect(json("web/downloads/dicos-connector/release.json").version).toBe(manifest);
  });

  it("les nouveautés commencent par la version du manifest", () => {
    expect(EXTENSION_NOTES[0]?.version).toBe(manifest);
  });
});

describe("isNewer", () => {
  it("compare les versions champ par champ", () => {
    expect(isNewer("1.7.0", "1.6.1")).toBe(true);
    expect(isNewer("1.10.0", "1.9.9")).toBe(true);
    expect(isNewer("1.6.1", "1.6.1")).toBe(false);
    expect(isNewer("1.6.0", "1.6.1")).toBe(false);
    expect(isNewer("2.0.0", "1.99.99")).toBe(true);
  });
});
