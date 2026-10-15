// Rail d'étapes des bons bus et taxi (v4 lot 4, 15 oct. 2026) : une étape par section du formulaire, verte quand tous
// ses champs obligatoires sont remplis, rouge quand il en manque, neutre pour une section facultative. Logique pure, la
// même liste de champs manquants que la validation d'envoi (`checkBusForSend` / `checkTaxiForSend`).

export type StepState = "complete" | "todo" | "optional";

export type StepDef = {
  id: string;
  title: string;
  /** Champs de `missing` qui appartiennent à la section ; aucun = section facultative. */
  fields: readonly string[];
};

export type Step = StepDef & { index: number; state: StepState };

export function stepStates(
  defs: readonly StepDef[],
  missing: readonly { field: string }[],
): Step[] {
  const gaps = new Set(missing.map((m) => m.field));
  return defs.map((d, i) => ({
    ...d,
    index: i + 1,
    state: !d.fields.length ? "optional" : d.fields.some((f) => gaps.has(f)) ? "todo" : "complete",
  }));
}

/** État affiché sur la carte de section : vert si complète, rouge seulement après une tentative d'envoi. */
export function sectionState(
  step: Step | undefined,
  showErrors: boolean,
): "complete" | "error" | undefined {
  if (!step) return undefined;
  if (step.state === "complete") return "complete";
  return step.state === "todo" && showErrors ? "error" : undefined;
}

export const BUS_STEPS: readonly StepDef[] = [
  { id: "bon-incident", title: "Incident", fields: ["reason", "order_date"] },
  { id: "bon-trajet", title: "Trajet", fields: ["origin", "destination"] },
  { id: "bon-fournisseur", title: "Fournisseur", fields: ["company"] },
  { id: "bon-bus", title: "Bus", fields: ["buses"] },
  { id: "bon-options", title: "Options", fields: [] },
];

export const TAXI_STEPS: readonly StepDef[] = [
  { id: "bon-trajet", title: "Trajet", fields: ["trip", "from_station", "to_station", "return"] },
  { id: "bon-passager", title: "Passager", fields: ["pmr_count", "pmr_reason", "pmr_client"] },
  { id: "bon-fournisseur", title: "Fournisseur", fields: ["taxi_company", "taxi_email"] },
  { id: "bon-facturation", title: "Facturation", fields: [] },
];
