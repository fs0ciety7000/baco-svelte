import "server-only";

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

import { busStops, c3Label, officeFor, pmrTypeLabel, type PacoOffice } from "@/lib/orders/mail";
import { parseEmails, type BusDraft, type TaxiDraft } from "@/lib/orders/schemas";
import { STATUS_LABEL, type Status } from "@/lib/orders/status";
import { brusselsDay, brusselsTime, formatLongDay, formatShortDay } from "@/lib/orders/time";
import type { OrderMeta, PmrClient, TaxiCompany } from "@/server/data/orders";

// Bons de commande PDF (bus C3 et taxi), vectoriels, A4 portrait, lisibles en noir et blanc.
// Polices standard (Helvetica) : encodage WinAnsi, d'où `safe()` sur tout texte dessiné.

export type PdfContext = {
  agentName: string;
  drivers?: { id: string; name: string; phone: string }[];
  generatedAt?: Date;
};

export type BusPdfDetail = {
  meta: Pick<OrderMeta, "number" | "status">;
  draft: BusDraft;
  company: { name: string; email: string; phone: string; address: string } | null;
};

export type TaxiPdfDetail = {
  meta: Pick<OrderMeta, "number" | "status">;
  draft: TaxiDraft;
  company: Pick<TaxiCompany, "name" | "emails" | "phones" | "addresses"> | null;
  client: Pick<PmrClient, "lastName" | "firstName" | "type"> | null;
  snapshot: {
    taxiName: string;
    taxiPhone: string;
    taxiAddress: string;
    pmrLastName: string;
    pmrFirstName: string;
    pmrFile: string;
  };
};

// ---------------------------------------------------------------------------------------------------
// Texte WinAnsi

/** Caractères de Windows-1252 hors Latin-1 (présents dans Helvetica standard). */
const CP1252_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const REPLACE: Record<string, string> = {
  "→": ">",
  "⇒": ">",
  "←": "<",
  "↔": "<>",
  "≥": ">=",
  "≤": "<=",
  "−": "-",
  "\u2010": "-",
  "\u2011": "-",
  "\u00a0": " ",
  "\u00ad": "",
  "\u2007": " ",
  "\u2009": " ",
  "\u200a": " ",
  "\u200b": "",
  "\u202f": " ",
  "\u2060": "",
  "\ufeff": "",
};

const encodable = (ch: string) => {
  const c = ch.codePointAt(0)!;
  return (c >= 0x20 && c <= 0x7e) || (c > 0xa0 && c <= 0xff) || CP1252_EXTRA.includes(ch);
};

/** Rend un texte dessinable en Helvetica (WinAnsi) : remplace ou translittère le reste, « ? » sinon. */
export function safe(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFC")) {
    const r = REPLACE[ch];
    if (r !== undefined) out += r;
    else if (encodable(ch)) out += ch;
    else if (/\s|[\u0000-\u001f\u007f-\u009f]/.test(ch)) out += " ";
    else {
      const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      out += base && [...base].every(encodable) ? base : "?";
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Mise en page

const PAGE: [number, number] = [595.28, 841.89];
const MARGIN = 42;
const WIDTH = PAGE[0] - 2 * MARGIN;
const BOTTOM = 56;
const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.35, 0.35, 0.35);
const RULE = rgb(0.75, 0.75, 0.75);
const FILL = rgb(0.92, 0.92, 0.92);
const LABEL_W = 150;

type TextOpts = { size?: number; bold?: boolean; color?: RGB };

class Layout {
  page!: PDFPage;
  y = 0;
  /** Redessiné en haut de chaque nouvelle page (ex. en-tête d'un tableau). */
  onBreak: (() => void) | null = null;

  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
    readonly runningTitle: string,
  ) {}

  addPage(first = false) {
    this.page = this.doc.addPage(PAGE);
    this.y = PAGE[1] - MARGIN;
    if (!first) {
      this.text(`${this.runningTitle} (suite)`, MARGIN, this.y - 8, { size: 8, color: GREY });
      this.y -= 24;
      this.onBreak?.();
    }
  }

  /** Nouvelle page si la hauteur demandée ne tient plus. */
  ensure(h: number) {
    if (this.y - h < BOTTOM) this.addPage();
  }

  fontOf(o: TextOpts) {
    return o.bold ? this.bold : this.font;
  }

  width(s: string, o: TextOpts = {}) {
    return this.fontOf(o).widthOfTextAtSize(safe(s), o.size ?? 9.5);
  }

  text(s: string, x: number, y: number, o: TextOpts = {}) {
    this.page.drawText(safe(s), {
      x,
      y,
      size: o.size ?? 9.5,
      font: this.fontOf(o),
      color: o.color ?? BLACK,
    });
  }

  textRight(s: string, right: number, y: number, o: TextOpts = {}) {
    this.text(s, right - this.width(s, o), y, o);
  }

  textCenter(s: string, y: number, o: TextOpts = {}) {
    this.text(s, MARGIN + (WIDTH - this.width(s, o)) / 2, y, o);
  }

  /** Découpe en lignes tenant dans `max` points (mots trop longs coupés). */
  wrap(s: string, max: number, o: TextOpts = {}): string[] {
    const lines: string[] = [];
    for (const para of s.split(/\r?\n/)) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        let w = word;
        while (this.width(w, o) > max) {
          let i = w.length - 1;
          while (i > 1 && this.width(w.slice(0, i), o) > max) i--;
          if (line) lines.push(line);
          lines.push(w.slice(0, i));
          line = "";
          w = w.slice(i);
        }
        const next = line ? `${line} ${w}` : w;
        if (this.width(next, o) > max) {
          lines.push(line);
          line = w;
        } else line = next;
      }
      lines.push(line);
    }
    return lines;
  }

  line(x1: number, y1: number, x2: number, y2: number, color = RULE, thickness = 0.6) {
    this.page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness });
  }

  section(title: string) {
    this.ensure(40);
    this.y -= 10;
    this.text(title.toUpperCase(), MARGIN, this.y - 10, { size: 9, bold: true });
    this.y -= 14;
    this.line(MARGIN, this.y, MARGIN + WIDTH, this.y, BLACK, 0.8);
    this.y -= 4;
  }

  /** Ligne « libellé : valeur » ; la valeur peut s'étendre sur plusieurs lignes (et pages). */
  field(label: string, value: string, o: TextOpts = {}) {
    const lines = this.wrap(value || "—", WIDTH - LABEL_W, o);
    const lh = 13;
    this.ensure(lh + 4);
    this.text(label, MARGIN, this.y - 10, { bold: true });
    lines.forEach((l, i) => {
      if (i > 0) this.ensure(lh);
      this.text(l, MARGIN + LABEL_W, this.y - 10, o);
      this.y -= lh;
    });
    this.y -= 1.5;
  }
}

// ---------------------------------------------------------------------------------------------------
// Blocs communs

type Party = { name: string; lines: string[] };

function header(l: Layout, office: PacoOffice, agentName: string, party: Party) {
  const top = l.y;
  let yl = top - 10;
  l.text("SNCB", MARGIN, yl, { size: 13, bold: true });
  yl -= 13;
  l.text("Client Solutions", MARGIN, yl, { bold: true });
  for (const s of [office.name, office.street, office.city, `Tél. ${office.phone}`, office.email]) {
    yl -= 12;
    l.text(s, MARGIN, yl, { size: 9 });
  }
  yl -= 14;
  l.text(`Agent : ${agentName || "—"}`, MARGIN, yl, { size: 9, bold: true });

  const right = MARGIN + WIDTH;
  let yr = top - 10;
  for (const s of l.wrap(party.name, 240, { size: 11, bold: true })) {
    l.textRight(s, right, yr, { size: 11, bold: true });
    yr -= 13;
  }
  for (const line of party.lines)
    for (const s of l.wrap(line, 240, { size: 9 })) {
      l.textRight(s, right, yr, { size: 9 });
      yr -= 12;
    }
  l.y = Math.min(yl, yr) - 18;
}

function title(l: Layout, main: string, sub: string | null, banner: string) {
  const h = sub ? 44 : 32;
  l.page.drawRectangle({
    x: MARGIN,
    y: l.y - h,
    width: WIDTH,
    height: h,
    borderColor: RULE,
    borderWidth: 0.8,
  });
  l.textCenter(main, l.y - 20, { size: 14, bold: true });
  if (sub) l.textCenter(sub, l.y - 35, { size: 9, color: GREY });
  l.y -= h + 8;
  l.page.drawRectangle({
    x: MARGIN,
    y: l.y - 22,
    width: WIDTH,
    height: 22,
    color: FILL,
    borderColor: BLACK,
    borderWidth: 1.2,
  });
  l.textCenter(banner, l.y - 15, { size: 11, bold: true });
  l.y -= 30;
}

function numberLine(l: Layout, label: string, number: number, status: Status) {
  l.text(`${label} n° ${number || "—"}`, MARGIN, l.y - 10, { size: 11, bold: true });
  const st = `Statut : ${STATUS_LABEL[status]}`;
  l.textRight(st, MARGIN + WIDTH, l.y - 10, { size: 10, bold: status === "annule" });
  l.y -= 16;
}

function footer(doc: PDFDocument, font: PDFFont, generatedAt: Date, ref: string) {
  const pages = doc.getPages();
  const when = `${formatShortDay(brusselsDay(generatedAt))} à ${brusselsTime(generatedAt)}`;
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: MARGIN, y: 36 },
      end: { x: MARGIN + WIDTH, y: 36 },
      color: RULE,
      thickness: 0.6,
    });
    const left = safe(
      `Généré par CSM le ${when} (Europe/Brussels) · page ${i + 1}/${pages.length}`,
    );
    p.drawText(left, { x: MARGIN, y: 24, size: 8, font, color: GREY });
    const r = safe(ref);
    p.drawText(r, {
      x: MARGIN + WIDTH - font.widthOfTextAtSize(r, 8),
      y: 24,
      size: 8,
      font,
      color: GREY,
    });
  });
}

async function setup(titleText: string, runningTitle: string, ctx: PdfContext) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const at = ctx.generatedAt ?? new Date();
  doc.setTitle(titleText);
  doc.setAuthor("SNCB – Client Solutions");
  doc.setCreator("CSM");
  doc.setProducer("CSM");
  doc.setLanguage("fr-BE");
  doc.setCreationDate(at);
  doc.setModificationDate(at);
  const l = new Layout(doc, font, bold, runningTitle);
  l.addPage(true);
  return { doc, font, l, at };
}

// ---------------------------------------------------------------------------------------------------
// Bus

type Col = { title: string; w: number };
const BUS_COLS: Col[] = [
  { title: "Bus", w: 50 },
  { title: "H. prévue", w: 50 },
  { title: "H. confirmée", w: 60 },
  { title: "Plaque", w: 66 },
  { title: "Chauffeur", w: 118 },
  { title: "Démob.", w: 44 },
  { title: "Trajet spécifique", w: WIDTH - 388 },
];
const CELL_PAD = 4;
const TABLE_SIZE = 8.5;
const TABLE_LH = 11;

function tableHeader(l: Layout) {
  const h = 18;
  l.page.drawRectangle({ x: MARGIN, y: l.y - h, width: WIDTH, height: h, color: FILL });
  let x = MARGIN;
  for (const c of BUS_COLS) {
    l.text(c.title, x + CELL_PAD, l.y - 12, { size: TABLE_SIZE, bold: true });
    x += c.w;
  }
  l.line(MARGIN, l.y - h, MARGIN + WIDTH, l.y - h, BLACK, 0.8);
  l.y -= h;
}

function busTable(l: Layout, d: BusDraft, drivers: PdfContext["drivers"]) {
  tableHeader(l);
  l.onBreak = () => tableHeader(l);
  d.buses.forEach((b, i) => {
    const driver = b.driver ? drivers?.find((x) => x.id === b.driver) : undefined;
    const cells: string[][] = [
      [`Bus ${i + 1}`],
      [b.planned || "—"],
      [b.confirmed || "—"],
      [b.plate || "—"],
      driver ? [driver.name, driver.phone].filter(Boolean) : ["—"],
      [b.demob || "—"],
      [b.specific_route ? `${b.origin || "?"} > ${b.destination || "?"}` : "—"],
    ];
    const wrapped = cells.map((c, j) =>
      c.flatMap((s) => l.wrap(s, BUS_COLS[j]!.w - 2 * CELL_PAD, { size: TABLE_SIZE })),
    );
    if (b.cancelled) wrapped[0]!.push("ANNULÉ");
    const h = Math.max(...wrapped.map((c) => c.length)) * TABLE_LH + 2 * CELL_PAD;
    l.ensure(h);
    let x = MARGIN;
    wrapped.forEach((lines, j) => {
      lines.forEach((s, k) => {
        const y = l.y - CELL_PAD - 8 - k * TABLE_LH;
        const flag = b.cancelled && j === 0 && k === lines.length - 1;
        l.text(s, x + CELL_PAD, y, { size: TABLE_SIZE, bold: flag || j === 0 });
        // Bus annulé : texte barré (sauf la mention « ANNULÉ »).
        if (b.cancelled && !flag && s !== "—") {
          const w = l.width(s, { size: TABLE_SIZE, bold: j === 0 });
          l.line(x + CELL_PAD, y + 3, x + CELL_PAD + w, y + 3, BLACK, 0.9);
        }
      });
      x += BUS_COLS[j]!.w;
    });
    l.y -= h;
    l.line(MARGIN, l.y, MARGIN + WIDTH, l.y);
  });
  l.onBreak = null;
}

export async function busOrderPdf(detail: BusPdfDetail, ctx: PdfContext): Promise<Uint8Array> {
  const d = detail.draft;
  const n = detail.meta.number;
  const office = officeFor(d.district);
  const { doc, font, l, at } = await setup(
    `Réquisitoire bus C3 n° ${n}`,
    `Réquisitoire bus C3 n° ${n}`,
    ctx,
  );
  const c = detail.company;
  header(l, office, ctx.agentName, {
    name: c?.name || "Société non renseignée",
    lines: [
      c?.address ?? "",
      `Tél. ${c?.phone || "—"}`,
      parseEmails(c?.email ?? "").join(", ") || "—",
    ].filter(Boolean),
  });
  title(
    l,
    "Demande de service de bus de remplacement",
    "Partie A – Services opérationnels SNCB",
    `C3-${d.c3_type} · ${c3Label(d.c3_type).toUpperCase()}`,
  );
  numberLine(l, "Bon", n, detail.meta.status);

  const relationLabel = d.c3_type === 3 ? "N° de commande / BNX" : "Relation";
  const stops = busStops(d);
  l.section("Service demandé");
  l.field("Date de circulation", formatLongDay(d.order_date), { bold: true });
  l.field("Heure d'appel", d.call_time || "—");
  l.field("Type", d.direct ? "DIRECT (sans arrêt)" : "OMNIBUS (avec arrêts)");
  l.field("Motif", d.reason);
  l.field(relationLabel, d.relation);
  l.section("Trajet");
  l.field("Origine", d.origin, { bold: true });
  if (!d.direct) l.field("Arrêts intermédiaires", stops.join(", "));
  l.field("Destination", d.destination, { bold: true });
  l.field("Deux sens", d.round_trip ? "OUI" : "NON");
  l.field("Lignes concernées", d.lines.join(", "));
  l.field(
    "Voyageurs",
    `${d.passengers || "non communiqué"} · dont PMR : ${d.pmr_count} · capacité par bus : ${d.bus_capacity} places`,
  );
  l.field("Nombre de bus", String(d.buses.filter((b) => !b.cancelled).length));

  l.section("Bus");
  busTable(l, d, ctx.drivers);

  l.section("Facturation");
  l.field(
    "Adresse de facturation",
    "SNCB – Purchase Accounting B-F.224, Rue de France 56, 1060 Bruxelles",
  );
  l.field("N° de TVA", "BE 0203 430 576");
  l.field("N° SAP de la commande (PO)", "4522 944 778");
  l.field(relationLabel, d.relation);

  footer(doc, font, at, `Réquisitoire C3 n° ${n}`);
  return doc.save();
}

// ---------------------------------------------------------------------------------------------------
// Taxi

const when = (day: string, time: string) => `${formatLongDay(day)}${time ? ` à ${time}` : ""}`;

export async function taxiOrderPdf(detail: TaxiPdfDetail, ctx: PdfContext): Promise<Uint8Array> {
  const d = detail.draft;
  const n = detail.meta.number;
  const s = detail.snapshot;
  const office = officeFor(d.district);
  const { doc, font, l, at } = await setup(`Commande taxi n° ${n}`, `Commande taxi n° ${n}`, ctx);
  const c = detail.company;
  const emails = parseEmails([...(c?.emails ?? []), d.taxi_email]);
  header(l, office, ctx.agentName, {
    name: c?.name || s.taxiName || "Société de taxi",
    lines: [
      c?.addresses[0] || s.taxiAddress,
      `Tél. ${c?.phones.join(", ") || s.taxiPhone || "—"}`,
      emails.join(", ") || "—",
    ].filter(Boolean),
  });
  title(l, "Demande de taxi", null, d.is_pmr ? "TAXI · CLIENT PMR" : "TAXI");
  numberLine(l, "Commande", n, detail.meta.status);

  l.section("Trajet");
  l.field("Aller", when(d.trip_day, d.trip_time), { bold: true });
  l.field("Départ", d.from_station);
  if (d.via_station) l.field("Via", d.via_station);
  l.field("Arrivée", d.to_station);
  if (d.round_trip) {
    l.field("Retour", when(d.return_day, d.return_time), { bold: true });
    l.field("De", d.return_from || d.to_station);
    l.field("Vers", d.return_to || d.from_station);
  } else l.field("Retour", "Non (aller simple)");
  if (d.confirmed_time) l.field("Heure confirmée", d.confirmed_time);

  l.section("Voyageurs");
  l.field("Passagers / véhicules", `${d.passengers} passager(s) · ${d.vehicles} véhicule(s)`);
  if (!d.is_pmr && d.passenger_name) l.field("Passager", d.passenger_name);
  l.field("Client PMR", d.is_pmr ? "OUI" : "NON", { bold: d.is_pmr });
  if (d.is_pmr) {
    l.field("Nom", detail.client?.lastName || s.pmrLastName);
    l.field("Prénom", detail.client?.firstName || s.pmrFirstName);
    l.field("Type", pmrTypeLabel(detail.client?.type || d.pmr_type));
    l.field("Nombre de PMR", String(d.pmr_count));
    l.field("Cause", d.pmr_reason);
    if (s.pmrFile) l.field("N° de dossier", s.pmrFile);
  }

  l.section("Référence et motif");
  l.field("Référence / relation", d.relation_number);
  l.field("Motif", d.reason);

  l.section("Facturation");
  l.field("À charge de", d.billing || "SNCB", { bold: true });
  l.field("Adresse de facturation", "SNCB – B-FI.224, Rue de France 56, 1060 Bruxelles");
  l.field("N° de TVA", "BE 0203 430 576");
  l.field(
    "N° de commande (PO)",
    d.is_pmr ? "4523122281 (voyageurs PMR)" : "4523207823 (voyageurs / personnel incident)",
  );

  // Cadres de signature.
  l.ensure(80);
  l.y -= 14;
  l.text(
    "Le prestataire certifie l'exécution du transport conformément aux données ci-dessus.",
    MARGIN,
    l.y - 9,
    { size: 8, color: GREY },
  );
  l.y -= 16;
  const boxW = (WIDTH - 16) / 2;
  for (const [i, label] of [
    "Signature et cachet du taxi",
    "Signature de l'agent SNCB (si présent)",
  ].entries()) {
    const x = MARGIN + i * (boxW + 16);
    l.page.drawRectangle({
      x,
      y: l.y - 48,
      width: boxW,
      height: 48,
      borderColor: BLACK,
      borderWidth: 0.6,
    });
    l.text(label, x + 6, l.y - 12, { size: 8 });
  }
  l.y -= 52;

  footer(doc, font, at, `Commande taxi n° ${n}`);
  return doc.save();
}

// ---------------------------------------------------------------------------------------------------
// Remise de service B201 (PDF vectoriel paginé ; la v1 faisait une capture d'écran)

export type B201PdfInput = {
  day: string;
  district: string;
  periods: {
    label: string;
    range: string;
    note: string;
    entries: {
      service: string;
      time: string;
      company: string;
      route: string;
      ref: string;
      manual: boolean;
    }[];
  }[];
  next: string;
};

export async function b201Pdf(input: B201PdfInput, ctx: PdfContext): Promise<Uint8Array> {
  const { doc, font, l, at } = await setup(
    `Remise B201 ${input.day}`,
    `Remise de service B201 du ${formatShortDay(input.day)}`,
    ctx,
  );
  const office = officeFor(input.district || "Sud-Ouest");
  header(l, office, ctx.agentName, {
    name: "Remise de service B201",
    lines: [
      formatShortDay(input.day),
      input.district ? `District ${input.district}` : "Tous districts",
    ],
  });
  title(
    l,
    "Remise de service",
    "Transports de remplacement commandés (bus, taxis, taxis PMR)",
    formatShortDay(input.day),
  );
  for (const p of input.periods) {
    l.section(`${p.label} (${p.range})`);
    if (p.entries.length === 0) l.field("Transports", "Aucun");
    for (const e of p.entries) {
      l.field(
        `${e.time || "--:--"} · ${e.service}`,
        `${e.route} · ${e.company || "?"}${e.ref ? ` · ${e.ref}` : ""}${e.manual ? " (saisie manuelle)" : ""}`,
      );
    }
    l.field("Commentaires", p.note || "—");
  }
  l.section("Pour le service suivant");
  l.field("Commentaires", input.next || "—");
  footer(doc, font, at, `B201 ${input.day}`);
  return doc.save();
}
