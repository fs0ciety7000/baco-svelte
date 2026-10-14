import { readFileSync } from "node:fs";
import path from "node:path";

import { CHANGELOG_MD } from "@/generated/changelog-source";

import {
  compareVersions,
  isVersion,
  parseChangelog,
  pendingRelease,
  releaseSummary,
  seenVersion,
} from "./changelog";

const SAMPLE = `# Nouveautés de CSM

Texte d'introduction ignoré.

## [2026.10.12] — Plus ancienne

### Corrections

- Un correctif.

## [2026.10.14] — Dernière livraison

### Corrections

- Heure vide corrigée.

### Nouveautés

- **Trains** : référentiel,
  sur deux lignes.
- Deuxième nouveauté.

### Vide

## [brouillon] — ignoré

### Nouveautés

- Pas une version.
`;

describe("parseChangelog", () => {
  it("lit les versions, trie de la plus récente à la plus ancienne et ordonne les sous-sections", () => {
    const releases = parseChangelog(SAMPLE);
    expect(releases.map((r) => r.version)).toEqual(["2026.10.14", "2026.10.12"]);
    const latest = releases[0]!;
    expect(latest.date).toBe("2026-10-14");
    expect(latest.title).toBe("Dernière livraison");
    expect(latest.sections.map((s) => s.name)).toEqual(["Nouveautés", "Corrections"]);
    expect(latest.sections[0]!.items).toEqual([
      "**Trains** : référentiel, sur deux lignes.",
      "Deuxième nouveauté.",
    ]);
  });

  it("ignore un titre sans version valide et le texte hors puces", () => {
    const releases = parseChangelog(SAMPLE);
    expect(releases.flatMap((r) => r.sections.flatMap((s) => s.items))).not.toContain(
      "Pas une version.",
    );
    expect(parseChangelog("")).toEqual([]);
  });

  it("accepte les fins de ligne CRLF et un titre sans tiret", () => {
    const releases = parseChangelog("## [2026.01.02]\r\n### Sécurité\r\n- Durci.\r\n");
    expect(releases).toEqual([
      {
        version: "2026.01.02",
        date: "2026-01-02",
        title: "",
        sections: [{ name: "Sécurité", items: ["Durci."] }],
      },
    ]);
  });
});

describe("versions", () => {
  it("compare des versions datées, suffixe compris", () => {
    expect(compareVersions("2026.10.14", "2026.10.12")).toBeGreaterThan(0);
    expect(compareVersions("2026.10.14", "2026.10.14")).toBe(0);
    expect(compareVersions("2026.10.14.2", "2026.10.14")).toBeGreaterThan(0);
    expect(compareVersions("2026.09.30", "2026.10.01")).toBeLessThan(0);
    expect(compareVersions("n'importe quoi", "2026.10.01")).toBeLessThan(0);
    expect(isVersion("2026.10.14")).toBe(true);
    expect(isVersion("2026-10-14")).toBe(false);
    expect(isVersion(20261014)).toBe(false);
  });

  it("présente la dernière version seulement si l'agent ne l'a pas encore vue", () => {
    const releases = parseChangelog(SAMPLE);
    expect(pendingRelease(releases, undefined)?.version).toBe("2026.10.14");
    expect(pendingRelease(releases, "2026.10.12")?.version).toBe("2026.10.14");
    expect(pendingRelease(releases, "pas une version")?.version).toBe("2026.10.14");
    expect(pendingRelease(releases, "2026.10.14")).toBeNull();
    expect(pendingRelease(releases, "9999.12.31")).toBeNull();
    expect(pendingRelease([], undefined)).toBeNull();
  });

  it("lit la version vue dans les préférences", () => {
    expect(seenVersion({ changelogSeen: "2026.10.14", shift: null })).toBe("2026.10.14");
    expect(seenVersion({ changelogSeen: "<script>" })).toBeNull();
    expect(seenVersion(null)).toBeNull();
    expect(seenVersion("texte")).toBeNull();
  });
});

describe("releaseSummary", () => {
  it("tronque chaque sous-section et compte le reste", () => {
    const latest = parseChangelog(SAMPLE)[0]!;
    const summary = releaseSummary(latest, 1);
    expect(summary.sections.map((s) => s.items.length)).toEqual([1, 1]);
    expect(summary.more).toBe(1);
  });
});

describe("CHANGELOG.md du dépôt", () => {
  // Vitest tourne depuis web/ (le fichier est à la racine du dépôt).
  const root = readFileSync(path.resolve(process.cwd(), "../CHANGELOG.md"), "utf8");

  it("la copie embarquée est à jour (npm run changelog)", () => {
    expect(CHANGELOG_MD).toBe(root);
  });

  it("chaque version est lisible, datée, sans doublon, avec des sous-sections connues", () => {
    const releases = parseChangelog(root);
    expect(releases.length).toBeGreaterThan(0);
    const versions = releases.map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);
    // Le fichier est écrit de la plus récente à la plus ancienne.
    const headings = [...root.matchAll(/^## \[([^\]]+)\]/gm)].map((m) => m[1]);
    expect(headings).toEqual(versions);
    for (const r of releases) {
      expect(r.title, r.version).not.toBe("");
      expect(r.sections.length, r.version).toBeGreaterThan(0);
      for (const s of r.sections) {
        expect(["Nouveautés", "Améliorations", "Corrections", "Sécurité"]).toContain(s.name);
      }
    }
  });
});
