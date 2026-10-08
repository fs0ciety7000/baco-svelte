// « Coller depuis DICOS » : analyse d'une ligne de demande d'assistance (même logique que l'import,
// pocketbase/pb_hooks/lib/pmr.js). Les mots restants (souvent un nom) ne sont jamais repris.

export type DicosSegment = { direction: "arrivee" | "depart" | ""; train: string; time: string };
export type Dicos = { ref: string; pax: number; type: string; segments: DicosSegment[] };

export function parseDicos(text: string): Dicos {
  const t = String(text ?? "");
  const ref = /(\d{4}-\d{2}-\d{2}-\d{4})/.exec(t)?.[1] ?? "";
  const head = /(?:^|[\s,:])(\d{1,2})\s*(NV|CRF|CRE|CRP|MR|CR)\b/i.exec(t);
  const pax = head ? Number.parseInt(head[1] ?? "1", 10) : 1;
  let type = head?.[2]?.toUpperCase() ?? "";
  if (type === "CR") type = "AUTRE";
  const segments: DicosSegment[] = [];
  const re = /\b(IN|OUT)\s*(E\s*)?(\d{2,5})\s*(?:à|a|\))\s*(\d{1,2})\s*h\s*(\d{2})/gi;
  for (const m of t.matchAll(re)) {
    if (Number(m[4]) > 23 || Number(m[5]) > 59) continue;
    segments.push({
      direction: m[1]?.toUpperCase() === "IN" ? "arrivee" : "depart",
      train: (m[2] ? "E" : "") + (m[3] ?? ""),
      time: `${(m[4] ?? "").padStart(2, "0")}:${m[5] ?? ""}`,
    });
  }
  // Repli (train avant le sens, ou sans IN / OUT) : premier train, premier sens, première heure.
  if (segments.length === 0) {
    const time = /(\d{1,2})\s*h\s*(\d{2})/.exec(t);
    if (time && Number(time[1]) < 24 && Number(time[2]) < 60) {
      const dir = /\b(IN|OUT)\b/i.exec(t)?.[1]?.toUpperCase();
      const train = /\bE\s*(\d{2,5})\b/.exec(t)?.[1];
      segments.push({
        direction: dir === "IN" ? "arrivee" : dir === "OUT" ? "depart" : "",
        train: train ? `E${train}` : "",
        time: `${(time[1] ?? "").padStart(2, "0")}:${time[2] ?? ""}`,
      });
    }
  }
  return { ref, pax: pax > 0 && pax < 50 ? pax : 1, type, segments };
}
