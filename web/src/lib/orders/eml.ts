// Brouillon d'e-mail `.eml` (RFC 5322 / 2045 / 2047 / 2231) : l'agent le télécharge, Outlook l'ouvre en
// mode édition grâce à `X-Unsent: 1`, l'agent vérifie l'expéditeur (boîte fonctionnelle) puis envoie.
// Pas de `From` : Outlook propose la boîte de l'agent (ou la boîte fonctionnelle qu'il choisit) ; un `From`
// imposé ici serait soit faux, soit ignoré. Pas de SMTP ni de Graph : CSM n'envoie jamais rien lui-même.

export type EmlAttachment = { filename: string; contentType: string; content: Uint8Array };

export type EmlInput = {
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  text: string;
  attachments: EmlAttachment[];
  date?: Date;
};

const CRLF = "\r\n";
const ADDRESS =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

// ---------------------------------------------------------------------------------------------------
// Encodages

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 sans dépendance (navigateur et Node). */
export function base64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    out += b === undefined ? "=" : B64[(n >> 6) & 63]!;
    out += c === undefined ? "=" : B64[n & 63]!;
  }
  return out;
}

/** Base64 en lignes de 76 caractères (RFC 2045). */
function base64Lines(bytes: Uint8Array): string {
  return (base64(bytes).match(/.{1,76}/g) ?? []).join(CRLF);
}

const utf8 = (s: string) => new TextEncoder().encode(s);

/** Retire tout caractère de contrôle (CR, LF, NUL…) : aucune injection d'en-tête possible. */
function oneLine(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim();
}

/**
 * Valeur d'en-tête en mots encodés RFC 2047 (UTF-8, base64), chacun ≤ 75 caractères, séparés par un pli.
 * Un caractère n'est jamais coupé entre deux mots.
 */
export function encodeHeaderWords(value: string): string {
  const clean = oneLine(value);
  if (/^[\x20-\x7e]*$/.test(clean) && clean.length <= 60) return clean;
  const words: string[] = [];
  let chunk: number[] = [];
  // « =?UTF-8?B?» + «?=» = 12 caractères ; 45 octets → 60 caractères base64 → mot de 72 caractères.
  for (const ch of clean) {
    const bytes = utf8(ch);
    if (chunk.length + bytes.length > 45) {
      words.push(`=?UTF-8?B?${base64(Uint8Array.from(chunk))}?=`);
      chunk = [];
    }
    chunk.push(...bytes);
  }
  if (chunk.length) words.push(`=?UTF-8?B?${base64(Uint8Array.from(chunk))}?=`);
  return words.join(`${CRLF} `);
}

/** Nom de fichier ASCII de repli (`filename="…"`) : accents retirés, caractères spéciaux remplacés. */
export function asciiFilename(name: string): string {
  const ascii = oneLine(name)
    .replace(/→/g, "-")
    .replace(/[·•–—]/g, "-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\/:*?<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return ascii || "document";
}

/** Valeur RFC 2231 / 5987 (`UTF-8''…`, octets hors attr-char encodés en %XX). */
export function rfc2231Value(name: string): string {
  let out = "";
  for (const byte of utf8(oneLine(name))) {
    const c = String.fromCharCode(byte);
    out += /[A-Za-z0-9!#$&+.^_`|~-]/.test(c)
      ? c
      : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return `UTF-8''${out}`;
}

/** En-tête HTTP / MIME `Content-Disposition` avec repli ASCII et nom UTF-8. */
export function contentDisposition(type: "inline" | "attachment", filename: string): string {
  return `${type}; filename="${asciiFilename(filename)}"; filename*=${rfc2231Value(filename)}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Date RFC 5322 en UTC (« Thu, 08 Oct 2026 10:00:00 +0000 »). */
export function rfc5322Date(d: Date): string {
  return (
    `${DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`
  );
}

function boundary(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `=_csm_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Liste d'adresses validées ; lève une erreur sur une adresse invalide (dont CR/LF). */
function addressList(name: string, list: string[]): string | null {
  const clean = list.map((a) => a.trim()).filter(Boolean);
  for (const a of clean) {
    if (!ADDRESS.test(a) || a.length > 254) throw new Error(`Adresse e-mail invalide (${name})`);
  }
  const unique = [...new Set(clean)];
  return unique.length ? unique.join(`,${CRLF} `) : null;
}

// ---------------------------------------------------------------------------------------------------
// Message

/** Construit le brouillon `.eml` (lignes CRLF). */
export function buildEml(input: EmlInput): string {
  const to = addressList("To", input.to);
  const cc = addressList("Cc", input.cc);
  const mixed = boundary();
  const alt = boundary();

  const headers = [
    "X-Unsent: 1",
    "MIME-Version: 1.0",
    `Date: ${rfc5322Date(input.date ?? new Date())}`,
    ...(to ? [`To: ${to}`] : []),
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${encodeHeaderWords(input.subject)}`,
    "X-Mailer: CSM",
    `Content-Type: multipart/mixed;${CRLF} boundary="${mixed}"`,
  ];

  const lines: string[] = [...headers, "", "This is a multi-part message in MIME format.", ""];
  lines.push(`--${mixed}`, `Content-Type: multipart/alternative;${CRLF} boundary="${alt}"`, "");
  for (const [type, body] of [
    ["text/plain", input.text],
    ["text/html", input.html],
  ] as const) {
    lines.push(
      `--${alt}`,
      `Content-Type: ${type}; charset="UTF-8"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(utf8(body.replace(/\r?\n/g, CRLF))),
      "",
    );
  }
  lines.push(`--${alt}--`, "");

  for (const a of input.attachments) {
    if (!MIME_TYPE.test(a.contentType)) throw new Error("Type de pièce jointe invalide");
    const ascii = asciiFilename(a.filename);
    lines.push(
      `--${mixed}`,
      `Content-Type: ${a.contentType};${CRLF} name="${ascii}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment;${CRLF} filename="${ascii}";${CRLF} filename*=${rfc2231Value(a.filename)}`,
      "",
      base64Lines(a.content),
      "",
    );
  }
  lines.push(`--${mixed}--`, "");
  return lines.join(CRLF);
}
