import "server-only";

import { open } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createInflateRaw } from "node:zlib";

// Lecture d'un zip sur disque, entrée par entrée et ligne par ligne (le GTFS de la SNCB pèse 26 Mo compressé et 270 Mo
// décompressé : jamais tout en mémoire). Sans dépendance : répertoire central + inflate de Node. Pas de ZIP64 (inutile ici).

export type ZipEntry = { name: string; method: number; size: number; offset: number };

export async function zipEntries(file: string): Promise<Map<string, ZipEntry>> {
  const fh = await open(file, "r");
  try {
    const { size } = await fh.stat();
    const tail = Math.min(size, 65_557);
    const buf = Buffer.alloc(tail);
    await fh.read(buf, 0, tail, size - tail);
    let eocd = -1;
    for (let i = tail - 22; i >= 0; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error("Zip illisible (fin de répertoire absente).");
    const count = buf.readUInt16LE(eocd + 10);
    const cdSize = buf.readUInt32LE(eocd + 12);
    const cdOffset = buf.readUInt32LE(eocd + 16);
    if (cdOffset === 0xffffffff) throw new Error("Zip64 non pris en charge.");
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOffset);
    const out = new Map<string, ZipEntry>();
    let p = 0;
    for (let n = 0; n < count && p + 46 <= cd.length; n++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error("Répertoire central du zip corrompu.");
      const method = cd.readUInt16LE(p + 10);
      const csize = cd.readUInt32LE(p + 20);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const local = cd.readUInt32LE(p + 42);
      const name = cd.toString("utf8", p + 46, p + 46 + nameLen);
      // En-tête local : sa longueur de nom / d'extra peut différer de celle du répertoire central.
      const lh = Buffer.alloc(30);
      await fh.read(lh, 0, 30, local);
      const offset = local + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      out.set(name.replace(/^.*\//, ""), { name, method, size: csize, offset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  } finally {
    await fh.close();
  }
}

/** Lignes d'une entrée (déflatée ou stockée), en flux. */
export function entryLines(file: string, entry: ZipEntry): AsyncIterable<string> {
  if (entry.method !== 0 && entry.method !== 8)
    throw new Error(`Compression ${entry.method} non prise en charge.`);
  const raw = createReadStream(file, { start: entry.offset, end: entry.offset + entry.size - 1 });
  const input = entry.method === 8 ? raw.pipe(createInflateRaw()) : raw;
  if (input !== raw) raw.on("error", (e) => input.destroy(e));
  return createInterface({ input, crlfDelay: Infinity });
}
