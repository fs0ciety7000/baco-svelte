import { FUNCTION_LABEL, KIND_LABEL, type OpenFilter } from "./model";

/** Filtres en clair pour l'en-tête du PDF : « Zone : OCC Mons · Fonction : RCCA · Service : Nuit ». */
export function openFilterText(f: OpenFilter, zones: { groupId: string; label: string }[]): string {
  const names = new Map(zones.map((z) => [z.groupId, z.label]));
  return [
    f.groups.length
      ? `Zone : ${f.groups.map((g) => names.get(g) || `groupe ${g}`).join(", ")}`
      : "",
    f.functions.length ? `Fonction : ${f.functions.map((v) => FUNCTION_LABEL[v]).join(", ")}` : "",
    f.kinds.length ? `Service : ${f.kinds.map((v) => KIND_LABEL[v]).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
