// Classeur Excel (.xlsx) minimal, sans dépendance (23 oct. 2026, export des services Quinyx non pourvus ; styles le 4 nov.
// 2026 pour le fichier de facturation) : texte en `inlineStr` (une valeur « =… » reste du texte : seule une cellule
// `{ f }` porte une formule), nombres, dates en numéro de série Excel avec un format de date, styles (police, fond,
// bordures, alignement, format numérique), largeurs de colonnes, hauteurs de lignes, cellules fusionnées, volet figé,
// mise en page. Aucune macro (classeur .xlsx simple). Archive ZIP « stockée » avec CRC32 maison. Pur, testé.

export type XlsxBorder = "thin" | "medium" | "thick";

/** Style d'une cellule ; couleurs en « RRGGBB ». */
export type XlsxStyle = {
  font?: { name?: string; size?: number; bold?: boolean; italic?: boolean; color?: string };
  fill?: string;
  border?: { left?: XlsxBorder; right?: XlsxBorder; top?: XlsxBorder; bottom?: XlsxBorder };
  align?: {
    h?: "left" | "center" | "right" | "justify";
    v?: "top" | "center" | "bottom" | "justify";
    wrap?: boolean;
  };
  /** Format numérique (« dd/mm/yyyy », « 0% »…). */
  numFmt?: string;
};

/** Cellule riche : valeur, style, formule (`f`, sans « = » ; `v` = valeur affichée avant recalcul). */
export type XlsxRich = {
  v?: string | number | null;
  s?: XlsxStyle;
  f?: string;
};

export type XlsxCell = string | number | null | undefined | XlsxRich;

export type XlsxSheet = {
  name: string;
  rows: XlsxCell[][];
  widths?: number[];
  /** Lignes en gras (index 0) quand aucune cellule n'a de style propre ; par défaut, la première seulement. */
  bold?: number[];
  /** Cellules fusionnées (« A1:C2 »). */
  merges?: string[];
  /** Hauteur de ligne en points (index 0 → hauteur). */
  heights?: Record<number, number>;
  /** Première cellule non figée (« A4 » fige les trois premières lignes). */
  freeze?: string;
  /** Mise en page : paysage, A4, ajusté à la largeur d'une page. */
  landscape?: boolean;
  fitWidth?: boolean;
  /** Police par défaut des cellules sans style (« Arial »). */
  defaultFont?: { name: string; size: number };
};

const enc = new TextEncoder();

const esc = (s: string) =>
  s
    // Caractères de contrôle interdits en XML 1.0 (sauf tabulation, retours).
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Lettres de colonne Excel (0 → A, 25 → Z, 26 → AA). */
export function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Jour « AAAA-MM-JJ » → numéro de série Excel (1900, jours depuis le 30/12/1899) ; null si invalide. */
export function excelDate(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const t = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!);
  return Number.isFinite(t) ? Math.round((t - Date.UTC(1899, 11, 30)) / 86_400_000) : null;
}

/** Nom de feuille accepté par Excel : 31 caractères, sans `[]:*?/\`. */
function sheetName(name: string, i: number): string {
  return (
    name
      .replace(/[[\]:*?/\\]/g, " ")
      .slice(0, 31)
      .trim() || `Feuille ${i + 1}`
  );
}

const hex = (c: string | undefined) =>
  c && /^[0-9A-Fa-f]{6}$/.test(c) ? `FF${c.toUpperCase()}` : "";

/** Registre des styles du classeur : polices, fonds, bordures, formats → index `cellXfs`. */
class StyleBook {
  fonts: string[];
  fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
  ];
  borders = ["<border><left/><right/><top/><bottom/><diagonal/></border>"];
  numFmts: string[] = [];
  xfs: string[];
  private keys = new Map<string, number>();

  constructor(base: { name: string; size: number }) {
    const f = (b: boolean) =>
      `<font>${b ? "<b/>" : ""}<sz val="${base.size}"/><name val="${esc(base.name)}"/></font>`;
    this.fonts = [f(false), f(true)];
    this.xfs = [
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    ];
  }

  private index(list: string[], xml: string): number {
    const i = list.indexOf(xml);
    if (i >= 0) return i;
    list.push(xml);
    return list.length - 1;
  }

  id(s: XlsxStyle | undefined): number {
    if (!s) return 0;
    const key = JSON.stringify(s);
    const known = this.keys.get(key);
    if (known !== undefined) return known;
    const f = s.font ?? {};
    const color = hex(f.color);
    const font = this.index(
      this.fonts,
      `<font>${f.bold ? "<b/>" : ""}${f.italic ? "<i/>" : ""}<sz val="${f.size ?? 10}"/>${color ? `<color rgb="${color}"/>` : ""}<name val="${esc(f.name ?? "Arial")}"/></font>`,
    );
    const fillColor = hex(s.fill);
    const fill = fillColor
      ? this.index(
          this.fills,
          `<fill><patternFill patternType="solid"><fgColor rgb="${fillColor}"/><bgColor indexed="64"/></patternFill></fill>`,
        )
      : 0;
    const b = s.border ?? {};
    const side = (n: "left" | "right" | "top" | "bottom") =>
      b[n] ? `<${n} style="${b[n]}"><color indexed="64"/></${n}>` : `<${n}/>`;
    const border =
      b.left || b.right || b.top || b.bottom
        ? this.index(
            this.borders,
            `<border>${side("left")}${side("right")}${side("top")}${side("bottom")}<diagonal/></border>`,
          )
        : 0;
    let numFmt = 0;
    if (s.numFmt) {
      const builtin: Record<string, number> = { "0": 1, "0.00": 2, "0%": 9, "0.00%": 10 };
      numFmt = builtin[s.numFmt] ?? 164 + this.index(this.numFmts, s.numFmt);
    }
    const a = s.align;
    const align = a
      ? `<alignment${a.h ? ` horizontal="${a.h}"` : ""}${a.v ? ` vertical="${a.v}"` : ""}${a.wrap ? ' wrapText="1"' : ""}/>`
      : "";
    const xf =
      `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"` +
      `${numFmt ? ' applyNumberFormat="1"' : ""} applyFont="1"${fill ? ' applyFill="1"' : ""}` +
      `${border ? ' applyBorder="1"' : ""}${align ? ' applyAlignment="1">' + align + "</xf>" : "/>"}`;
    const id = this.index(this.xfs, xf);
    this.keys.set(key, id);
    return id;
  }

  xml(): string {
    const fmts = this.numFmts.length
      ? `<numFmts count="${this.numFmts.length}">${this.numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join("")}</numFmts>`
      : "";
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      fmts +
      `<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join("")}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join("")}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>"
    );
  }
}

const isRich = (v: XlsxCell): v is XlsxRich => typeof v === "object" && v !== null;

function cellXml(ref: string, v: XlsxCell, style: number): string {
  const s = style ? ` s="${style}"` : "";
  const raw = isRich(v) ? v.v : v;
  if (isRich(v) && v.f) {
    const cached =
      typeof raw === "number" && Number.isFinite(raw)
        ? `<v>${raw}</v>`
        : raw
          ? `<v>${esc(String(raw))}</v>`
          : "";
    const t = typeof raw === "string" && raw ? ' t="str"' : "";
    return `<c r="${ref}"${s}${t}><f>${esc(v.f.replace(/^=/, ""))}</f>${cached}</c>`;
  }
  if (raw === null || raw === undefined || raw === "") return style ? `<c r="${ref}"${s}/>` : "";
  if (typeof raw === "number" && Number.isFinite(raw)) return `<c r="${ref}"${s}><v>${raw}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(String(raw))}</t></is></c>`;
}

function sheetXml(s: XlsxSheet, book: StyleBook): string {
  const cols = s.widths?.length
    ? `<cols>${s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const bold = new Set(s.bold ?? [0]);
  const valid = (s.merges ?? []).filter((m) => /^[A-Z]{1,3}\d{1,7}:[A-Z]{1,3}\d{1,7}$/.test(m));
  const merges = valid.length
    ? `<mergeCells count="${valid.length}">${valid.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
    : "";
  const rows = s.rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          const ref = `${colName(c)}${r + 1}`;
          const style = isRich(v) && v.s ? book.id(v.s) : bold.has(r) ? 1 : 0;
          return cellXml(ref, v, style);
        })
        .join("");
      const h = s.heights?.[r];
      return `<row r="${r + 1}"${h ? ` ht="${h}" customHeight="1"` : ""}>${cells}</row>`;
    })
    .join("");
  const freeze = s.freeze && /^([A-Z]{1,3})(\d{1,7})$/.exec(s.freeze);
  let views = '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  if (freeze) {
    const colIdx = freeze[1]!.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    const rowIdx = +freeze[2]! - 1;
    const pane =
      `<pane${colIdx ? ` xSplit="${colIdx}"` : ""}${rowIdx ? ` ySplit="${rowIdx}"` : ""}` +
      ` topLeftCell="${s.freeze}" activePane="${colIdx && rowIdx ? "bottomRight" : rowIdx ? "bottomLeft" : "topRight"}" state="frozen"/>`;
    views = `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>`;
  }
  const pr = s.fitWidth ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : "";
  const setup =
    s.landscape || s.fitWidth
      ? '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
        `<pageSetup paperSize="9"${s.landscape ? ' orientation="landscape"' : ""}${s.fitWidth ? ' fitToWidth="1" fitToHeight="0"' : ""}/>`
      : "";
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `${pr}${views}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>${merges}${setup}</worksheet>`
  );
}

/** Contenu (chemin → texte) du classeur, avant mise en archive. */
export function xlsxParts(sheets: XlsxSheet[]): [string, string][] {
  const list = sheets.length ? sheets : [{ name: "Feuille 1", rows: [] }];
  const names = list.map((s, i) => sheetName(s.name, i));
  const book = new StyleBook(list[0]?.defaultFont ?? { name: "Calibri", size: 11 });
  const sheetParts = list.map((s, i): [string, string] => [
    `xl/worksheets/sheet${i + 1}.xml`,
    sheetXml(s, book),
  ]);
  return [
    [
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        list
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        "</Types>",
    ],
    [
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>",
    ],
    [
      "xl/workbook.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names
          .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join("") +
        "</sheets>" +
        // Formules (totaux) recalculées à l'ouverture : la valeur écrite n'est qu'un aperçu.
        '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
    ],
    [
      "xl/_rels/workbook.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        list
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join("") +
        `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        "</Relationships>",
    ],
    ["xl/styles.xml", book.xml()],
    ...sheetParts,
  ];
}

let table: Uint32Array | null = null;
/** CRC32 (IEEE) d'un tableau d'octets. */
export function crc32(bytes: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = table[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Archive ZIP « stockée » (méthode 0), noms en UTF-8. */
export function zipStore(files: [string, Uint8Array][]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const n = enc.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // noms en UTF-8
    local.setUint16(8, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, n.length, true);
    chunks.push(new Uint8Array(local.buffer), n, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, n.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/** Classeur .xlsx prêt à télécharger. */
export function xlsxWorkbook(sheets: XlsxSheet[]): Uint8Array {
  return zipStore(xlsxParts(sheets).map(([name, text]) => [name, enc.encode(text)]));
}
