import { describe, expect, it } from "vitest";

import {
  asciiFilename,
  buildEml,
  contentDisposition,
  encodeHeaderWords,
  rfc2231Value,
} from "./eml";

const pdf = new Uint8Array(200).map((_, i) => (i * 37) % 256);
const base = {
  to: ["planning@bus-exemple.be"],
  cc: ["paco.mons@belgiantrain.be"],
  subject: "Réquisitoire bus C3 n° 42 – 08/10/2026 – Mons → Tournai",
  html: "<p>Bonjour</p>",
  text: "Bonjour\nLigne 2",
  attachments: [
    {
      filename: "2026-10-08 · C3-2 · Mons → Tournai.pdf",
      contentType: "application/pdf",
      content: pdf,
    },
  ],
  date: new Date("2026-10-08T10:05:09Z"),
};

/** Valeur d'un en-tête (déplié) dans une partie MIME. */
function header(src: string, name: string): string | undefined {
  const head = src.split("\r\n\r\n")[0] ?? "";
  const unfolded = head.replace(/\r\n[ \t]/g, " ");
  return unfolded
    .split("\r\n")
    .find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`))
    ?.slice(name.length + 1)
    .trim();
}

function decodeWords(v: string): string {
  return v
    .split(/\s+/)
    .map((w) => {
      const m = /^=\?UTF-8\?B\?(.*)\?=$/.exec(w);
      return m ? Buffer.from(m[1]!, "base64") : null;
    })
    .reduce<Buffer>((acc, b) => (b ? Buffer.concat([acc, b]) : acc), Buffer.alloc(0))
    .toString("utf8");
}

describe("buildEml", () => {
  it("pose les en-têtes du brouillon, sans From", () => {
    const eml = buildEml(base);
    expect(eml.startsWith("X-Unsent: 1\r\n")).toBe(true);
    expect(header(eml, "MIME-Version")).toBe("1.0");
    expect(header(eml, "Date")).toBe("Thu, 08 Oct 2026 10:05:09 +0000");
    expect(header(eml, "To")).toBe("planning@bus-exemple.be");
    expect(header(eml, "Cc")).toBe("paco.mons@belgiantrain.be");
    expect(header(eml, "From")).toBeUndefined();
    expect(header(eml, "Content-Type")).toMatch(
      /^multipart\/mixed; boundary="=_csm_[0-9a-f]{32}"$/,
    );
    expect(eml).toContain("Content-Type: multipart/alternative;");
  });

  it("encode le sujet accentué en mots RFC 2047 de 75 caractères au plus", () => {
    const eml = buildEml(base);
    const head = eml.split("\r\n\r\n")[0]!;
    const words = head.match(/=\?UTF-8\?B\?[^?]*\?=/g) ?? [];
    expect(words.length).toBeGreaterThan(1);
    for (const w of words) expect(w.length).toBeLessThanOrEqual(75);
    expect(decodeWords(header(eml, "Subject")!)).toBe(base.subject);
    expect(encodeHeaderWords("Commande 42")).toBe("Commande 42");
  });

  it("n'autorise aucune injection d'en-tête", () => {
    const eml = buildEml({ ...base, subject: "Test\r\nBcc: pirate@exemple.be" });
    expect(eml).not.toMatch(/^Bcc:/m);
    expect(decodeWords(header(eml, "Subject")!) || header(eml, "Subject")).toBe(
      "Test Bcc: pirate@exemple.be",
    );
    expect(() => buildEml({ ...base, to: ["a@exemple.be\r\nBcc: pirate@exemple.be"] })).toThrow();
    expect(() => buildEml({ ...base, cc: ["pas une adresse"] })).toThrow();
    expect(() =>
      buildEml({
        ...base,
        attachments: [{ filename: "x.pdf", contentType: "application/pdf\r\nX: y", content: pdf }],
      }),
    ).toThrow();
    const named = buildEml({
      ...base,
      attachments: [
        { filename: 'a"\r\nX-Evil: 1.pdf', contentType: "application/pdf", content: pdf },
      ],
    });
    expect(named).not.toMatch(/^X-Evil/m);
  });

  it("joint le PDF en base64 décodable, nom UTF-8 (RFC 2231) et repli ASCII", () => {
    const eml = buildEml(base);
    const part = eml
      .split(/\r\n--=_csm_[0-9a-f]{32}\r\n/)
      .find((p) => p.includes("application/pdf"))!;
    expect(header(part, "Content-Disposition")).toBe(
      `attachment; filename="2026-10-08 - C3-2 - Mons - Tournai.pdf"; filename*=UTF-8''2026-10-08%20%C2%B7%20C3-2%20%C2%B7%20Mons%20%E2%86%92%20Tournai.pdf`,
    );
    const body = part.split("\r\n\r\n")[1]!.trim();
    for (const line of body.split("\r\n")) expect(line.length).toBeLessThanOrEqual(76);
    expect(new Uint8Array(Buffer.from(body.replace(/\r\n/g, ""), "base64"))).toEqual(pdf);
  });

  it("encode les corps en UTF-8 base64 et n'utilise que des fins de ligne CRLF", () => {
    const eml = buildEml({ ...base, text: "Arrêt à Mons\nFin" });
    expect(eml.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const line of eml.split("\r\n")) expect(line.length).toBeLessThanOrEqual(998);
    const plain = eml.split(/\r\n--=_csm_[0-9a-f]{32}\r\n/).find((p) => p.includes("text/plain"))!;
    const body = plain.split("\r\n\r\n")[1]!.replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toBe("Arrêt à Mons\r\nFin");
  });

  it("tire des délimiteurs différents à chaque appel", () => {
    expect(header(buildEml(base), "Content-Type")).not.toBe(header(buildEml(base), "Content-Type"));
  });
});

describe("noms de fichier", () => {
  it("repli ASCII et valeur RFC 2231", () => {
    expect(asciiFilename("Évacuation « test ».pdf")).toBe("Evacuation _ test _.pdf");
    expect(rfc2231Value("é a.pdf")).toBe("UTF-8''%C3%A9%20a.pdf");
    expect(contentDisposition("inline", "a→b.pdf")).toBe(
      `inline; filename="a-b.pdf"; filename*=UTF-8''a%E2%86%92b.pdf`,
    );
  });
});
