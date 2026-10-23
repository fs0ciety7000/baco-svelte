import { inflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { colName, crc32, xlsxParts, xlsxWorkbook, zipStore } from "./xlsx";

const enc = new TextEncoder();

/** Lit une archive « stockée » (méthode 0) : nom → texte. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Map<string, string>();
  let p = 0;
  while (v.getUint32(p, true) === 0x04034b50) {
    const method = v.getUint16(p + 8, true);
    const size = v.getUint32(p + 18, true);
    const nameLen = v.getUint16(p + 26, true);
    const extra = v.getUint16(p + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nameLen));
    const start = p + 30 + nameLen + extra;
    const data = bytes.subarray(start, start + size);
    expect(crc32(data)).toBe(v.getUint32(p + 14, true));
    out.set(name, new TextDecoder().decode(method ? inflateRawSync(data) : data));
    p = start + size;
  }
  return out;
}

describe("xlsx", () => {
  it("CRC32 de référence", () => {
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("lettres de colonnes", () => {
    expect([0, 25, 26, 27, 701, 702].map(colName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });

  it("archive lisible et intègre", () => {
    const files = unzip(
      zipStore([
        ["a.txt", enc.encode("bonjour")],
        ["dossier/é.xml", enc.encode("<x/>")],
      ]),
    );
    expect([...files.entries()]).toEqual([
      ["a.txt", "bonjour"],
      ["dossier/é.xml", "<x/>"],
    ]);
  });

  it("classeur : feuilles, texte échappé, nombres, en-tête en gras, formules jamais évaluées", () => {
    const files = unzip(
      xlsxWorkbook([
        {
          name: "Non pourvus",
          rows: [
            ["Date", "Zone"],
            ["2026-10-05", "OCC <Mons> & co"],
            ["=1+1", 3],
          ],
          widths: [12, 18],
        },
        { name: "Totaux [2026]", rows: [["Total", 2]] },
      ]),
    );
    expect([...files.keys()]).toEqual(
      xlsxParts([
        { name: "x", rows: [] },
        { name: "y", rows: [] },
      ]).map(([n]) => n),
    );
    const s1 = files.get("xl/worksheets/sheet1.xml")!;
    expect(s1).toContain('<c r="A1" t="inlineStr" s="1">');
    expect(s1).toContain("OCC &lt;Mons&gt; &amp; co");
    expect(s1).toContain('<c r="B3"><v>3</v></c>');
    expect(s1).toContain('<t xml:space="preserve">=1+1</t>');
    expect(s1).not.toContain("<f>");
    expect(files.get("xl/workbook.xml")).toContain('name="Totaux  2026"');
  });
});
