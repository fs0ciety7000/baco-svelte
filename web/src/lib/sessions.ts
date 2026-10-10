// Sessions ouvertes (demande du 10 oct. 2026) : libellé lisible d'un appareil à partir de son User-Agent. Pur, testé.

export function deviceLabel(ua: string): string {
  if (!ua) return "Appareil inconnu";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "Appareil";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /OPR\//.test(ua)
        ? "Opera"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "";
  return browser ? `${browser} · ${os}` : os;
}

/** Adresse IP abrégée pour l'affichage (le dernier octet masqué) : assez pour reconnaître un poste. */
export function maskIp(ip: string): string {
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.\d+$/.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.x`;
  if (ip.includes(":")) return `${ip.split(":").slice(0, 3).join(":")}:…`;
  return ip || "—";
}
