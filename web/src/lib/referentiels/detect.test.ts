import { describe, expect, it } from "vitest";

import { detectDocument, previewKind } from "./detect";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );

describe("detectDocument", () => {
  it("reconnaît PDF et images par leurs octets, quel que soit le nom", () => {
    expect(detectDocument(bytes("%PDF-1.7"), "x.bin")?.type).toBe("application/pdf");
    expect(detectDocument(bytes([0x89], "PNG"), "a.pdf")?.ext).toBe("png");
    expect(detectDocument(bytes([0xff, 0xd8, 0xff, 0xe0]), "a")?.ext).toBe("jpg");
    expect(detectDocument(bytes("GIF89a"), "a")?.ext).toBe("gif");
    expect(detectDocument(bytes("RIFF", [0, 0, 0, 0], "WEBP"), "a")?.ext).toBe("webp");
  });

  it("départage les formats Office par l'extension, refuse un ZIP quelconque", () => {
    const zip = bytes([0x50, 0x4b, 0x03, 0x04]);
    expect(detectDocument(zip, "Procédure.DOCX")?.ext).toBe("docx");
    expect(detectDocument(zip, "tableau.xlsx")?.ext).toBe("xlsx");
    expect(detectDocument(zip, "archive.zip")).toBeNull();
    expect(detectDocument(bytes([0xd0, 0xcf, 0x11, 0xe0]), "vieux.doc")?.ext).toBe("doc");
  });

  it("accepte le texte sans octet nul, refuse le HTML et le SVG", () => {
    expect(detectDocument(bytes("a;b\n1;2"), "liste.csv")?.type).toBe("text/csv");
    expect(detectDocument(bytes("a", [0], "b"), "binaire.txt")).toBeNull();
    expect(detectDocument(bytes("<html><script>"), "page.html")).toBeNull();
    expect(detectDocument(bytes("<svg onload=x>"), "image.svg")).toBeNull();
  });
});

describe("previewKind", () => {
  it("aperçu des PDF et images, téléchargement du reste", () => {
    expect(previewKind("document.pdf")).toBe("pdf");
    expect(previewKind("photo.JPG")).toBe("image");
    expect(previewKind("tableau.xlsx")).toBeNull();
  });
});
