// CHANGELOG.md (racine du dépôt) → versions structurées. Pur, sans dépendance : utilisé par le serveur (page
// /changelog, fenêtre « CSM a été mis à jour ») et testé. Format : `## [AAAA.MM.JJ] — titre`, puis des
// sous-sections `### Nouveautés | Améliorations | Corrections | Sécurité` contenant des puces `- …`.

export type ChangelogSection = { name: string; items: string[] };
export type Release = {
  /** « 2026.10.14 » (un suffixe « .2 » est admis pour une 2e livraison le même jour). */
  version: string;
  /** Jour de la livraison, AAAA-MM-JJ. */
  date: string;
  title: string;
  sections: ChangelogSection[];
};

/** Ordre d'affichage des sous-sections (une sous-section inconnue est gardée, après celles-ci). */
export const SECTION_ORDER = ["Nouveautés", "Améliorations", "Corrections", "Sécurité"] as const;

const VERSION = /^\d{4}\.\d{2}\.\d{2}(?:\.\d{1,3})?$/;
const RELEASE = /^##\s+\[([^\]]+)\]\s*(?:[—–-]\s*(.*))?$/;
const SECTION = /^###\s+(.+)$/;
const ITEM = /^[-*]\s+(.*)$/;

export function isVersion(value: unknown): value is string {
  return typeof value === "string" && VERSION.test(value);
}

/** Compare deux versions datées (négatif si a < b). Une valeur invalide vaut « plus ancienne que tout ». */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => (isVersion(v) ? v.split(".").map(Number) : [-1]);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function sortSections(sections: ChangelogSection[]): ChangelogSection[] {
  const rank = (name: string) => {
    const i = (SECTION_ORDER as readonly string[]).indexOf(name);
    return i === -1 ? SECTION_ORDER.length : i;
  };
  return sections
    .filter((s) => s.items.length > 0)
    .map((s, i) => ({ s, i }))
    .sort((x, y) => rank(x.s.name) - rank(y.s.name) || x.i - y.i)
    .map(({ s }) => s);
}

/**
 * Lit le changelog : une entrée par `## [version]` valide (les autres titres sont ignorés), de la plus récente à la
 * plus ancienne. Une puce peut continuer sur les lignes suivantes indentées ; le texte hors puce est ignoré.
 */
export function parseChangelog(markdown: string): Release[] {
  const releases: Release[] = [];
  let release: Release | null = null;
  let section: ChangelogSection | null = null;
  let item: number | null = null;

  for (const raw of String(markdown ?? "").split(/\r?\n/)) {
    const line = raw.trimEnd();
    const r = RELEASE.exec(line);
    if (r) {
      const version = (r[1] ?? "").trim();
      release = isVersion(version)
        ? {
            version,
            date: version.slice(0, 10).replaceAll(".", "-"),
            title: (r[2] ?? "").trim(),
            sections: [],
          }
        : null;
      if (release) releases.push(release);
      section = null;
      item = null;
      continue;
    }
    if (!release) continue;
    if (/^#{1,2}\s/.test(line)) {
      // Autre titre de niveau 1 ou 2 : fin de la version courante.
      release = null;
      section = null;
      item = null;
      continue;
    }
    const s = SECTION.exec(line);
    if (s) {
      section = { name: (s[1] ?? "").trim(), items: [] };
      release.sections.push(section);
      item = null;
      continue;
    }
    if (!section) continue;
    const it = ITEM.exec(line);
    if (it) {
      section.items.push((it[1] ?? "").trim());
      item = section.items.length - 1;
    } else if (item !== null && /^\s+\S/.test(raw)) {
      section.items[item] = `${section.items[item]} ${line.trim()}`;
    } else if (line.trim() === "") {
      item = null;
    }
  }

  for (const rel of releases) rel.sections = sortSections(rel.sections);
  return releases.sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * Version à présenter dans la fenêtre « CSM a été mis à jour » : la plus récente si l'agent ne l'a pas encore vue
 * (`seen` absent, invalide ou plus ancien), sinon `null`.
 */
export function pendingRelease(releases: Release[], seen: unknown): Release | null {
  const latest = releases[0];
  if (!latest) return null;
  if (isVersion(seen) && compareVersions(seen, latest.version) >= 0) return null;
  return latest;
}

/** Version vue enregistrée dans `users.preferences.changelogSeen` (ou `null`). */
export function seenVersion(preferences: unknown): string | null {
  if (!preferences || typeof preferences !== "object") return null;
  const v = (preferences as Record<string, unknown>).changelogSeen;
  return isVersion(v) ? v : null;
}

/** Résumé court d'une version : au plus `perSection` puces par sous-section, `more` = puces non montrées. */
export function releaseSummary(
  release: Release,
  perSection = 3,
): { version: string; date: string; title: string; sections: ChangelogSection[]; more: number } {
  let more = 0;
  const sections = release.sections.map((s) => {
    more += Math.max(0, s.items.length - perSection);
    return { name: s.name, items: s.items.slice(0, perSection) };
  });
  return { version: release.version, date: release.date, title: release.title, sections, more };
}

export type ReleaseSummary = ReturnType<typeof releaseSummary>;
