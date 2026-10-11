// Détection du type réel d'un document de la bibliothèque (Ressources › Procédures et documents) : premiers octets,
// et extension seulement pour départager les formats Office (conteneurs ZIP et OLE). Utilisé par la route d'envoi.

const ascii = (b: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...b.slice(from, to));

/** Type réel du fichier (octets + extension pour les conteneurs ZIP / OLE d'Office), ou null s'il est refusé. */
export function detectDocument(
  bytes: Uint8Array,
  name: string,
): { type: string; ext: string } | null {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (ascii(bytes, 0, 5) === "%PDF-") return { type: "application/pdf", ext: "pdf" };
  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG") return { type: "image/png", ext: "png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { type: "image/jpeg", ext: "jpg" };
  if (ascii(bytes, 0, 4) === "GIF8") return { type: "image/gif", ext: "gif" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP")
    return { type: "image/webp", ext: "webp" };
  // Office récent : conteneur ZIP.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    const zip: Record<string, string> = {
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
    return zip[ext] ? { type: zip[ext], ext } : null;
  }
  // Office ancien : conteneur OLE.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    const ole: Record<string, string> = {
      doc: "application/msword",
      xls: "application/vnd.ms-excel",
      ppt: "application/vnd.ms-powerpoint",
    };
    return ole[ext] ? { type: ole[ext], ext } : null;
  }
  // Texte brut / CSV : pas d'octet nul dans le début du fichier.
  if ((ext === "txt" || ext === "csv") && !bytes.slice(0, 4096).includes(0))
    return { type: ext === "csv" ? "text/csv" : "text/plain", ext };
  return null;
}

/** Formats affichés dans la visionneuse (le reste se télécharge). */
export function previewKind(fileName: string): "pdf" | "image" | null {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  return null;
}
