// Lecture CSV ligne à ligne (RFC 4180 : champs entre guillemets, "" pour un guillemet). Les fichiers GTFS et Infrabel
// n'ont pas de retour à la ligne dans un champ : une ligne = un enregistrement, lue en flux par l'import.

export function parseCsvLine(line: string, sep = ","): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** En-tête → index des colonnes (noms en minuscules, BOM retiré). */
export function headerIndex(line: string, sep = ","): Record<string, number> {
  const idx: Record<string, number> = {};
  parseCsvLine(line.replace(/^﻿/, ""), sep).forEach((h, i) => {
    idx[h.trim().toLowerCase()] = i;
  });
  return idx;
}

/** Lecteur de lignes : la 1re ligne donne l'en-tête, les suivantes sont rendues en objet { colonne: valeur }. */
export function csvReader(sep = ",") {
  let idx: Record<string, number> | null = null;
  return (line: string): Record<string, string> | null => {
    if (!line) return null;
    if (!idx) {
      idx = headerIndex(line, sep);
      return null;
    }
    const cells = parseCsvLine(line, sep);
    const row: Record<string, string> = {};
    for (const [k, i] of Object.entries(idx)) row[k] = cells[i] ?? "";
    return row;
  };
}
