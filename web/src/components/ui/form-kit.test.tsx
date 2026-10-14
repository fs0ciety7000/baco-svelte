import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it } from "vitest";

import { mainActionOf, transitionsFor } from "@/lib/orders/status";

import { SwitchField } from "./checkbox";
import { Segmented, segmentedNeedsWrap } from "./form-kit";
import { renderInForm, setupPickerEnv } from "./picker-test-utils";

beforeAll(setupPickerEnv);

const C3 = [
  { value: "2", label: "Remplacement" },
  { value: "1", label: "Évacuation" },
  { value: "3", label: "Modif. service planifié" },
] as const;

describe("Segmented", () => {
  it("passe en grille seulement quand la largeur naturelle dépasse la place", () => {
    expect(segmentedNeedsWrap(420, 358)).toBe(true);
    expect(segmentedNeedsWrap(300, 358)).toBe(false);
    expect(segmentedNeedsWrap(359, 358)).toBe(false); // arrondi des sous-pixels
    expect(segmentedNeedsWrap(420, 0)).toBe(false); // pas encore mesuré (onglet caché)
  });

  it("name : valeur dans le champ caché, change émis au choix de l'agent seulement", () => {
    const { changes, form } = renderInForm(
      <Segmented label="Type C3" name="type" defaultValue="1" options={C3} />,
    );
    expect(new FormData(form()).get("type")).toBe("1");
    expect(changes).toEqual([]);
    fireEvent.click(screen.getByRole("radio", { name: "Modif. service planifié" }));
    expect(screen.getByRole("radio", { name: "Modif. service planifié" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(changes).toEqual([{ type: "3" }]);
    // Même option : rien.
    fireEvent.click(screen.getByRole("radio", { name: "Modif. service planifié" }));
    expect(changes).toHaveLength(1);
  });

  it("contrôlé : flèches du clavier, onChange", () => {
    function Demo() {
      const [v, setV] = useState<string>("2");
      return <Segmented label="Type C3" value={v} onChange={setV} options={C3} />;
    }
    render(<Demo />);
    const first = screen.getByRole("radio", { name: "Remplacement" });
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Évacuation" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.keyDown(screen.getByRole("radio", { name: "Évacuation" }), { key: "ArrowLeft" });
    expect(first).toHaveAttribute("aria-checked", "true");
  });
});

describe("SwitchField", () => {
  it("tout le libellé est cliquable", () => {
    render(<SwitchField label="Trajet spécifique" hint="Aide" />);
    const sw = screen.getByRole("switch", { name: /Trajet spécifique/ });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByText("Aide"));
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(sw.className).toContain("rounded-control");
  });
});

describe("mainActionOf (barre d'actions mobile des bons)", () => {
  const t = (status: Parameters<typeof transitionsFor>[0], coordinator = false, before?: string) =>
    transitionsFor(status, { coordinator, statusBeforeCancel: before });

  it("bon neuf : Créer le bon", () => {
    expect(mainActionOf({ canSend: false, canCreate: true, transitions: [] })).toEqual({
      type: "create",
    });
  });
  it("brouillon : Terminer, jamais l'annulation", () => {
    const main = mainActionOf({ canSend: false, canCreate: false, transitions: t("brouillon") });
    expect(main).toMatchObject({ type: "transition", t: { to: "termine" } });
  });
  it("terminé : Valider l'envoi", () => {
    expect(mainActionOf({ canSend: true, canCreate: false, transitions: t("termine") })).toEqual({
      type: "send",
    });
  });
  it("envoyé : Rouvrir (coordinateur), rien sinon", () => {
    expect(
      mainActionOf({ canSend: false, canCreate: false, transitions: t("envoye", true) }),
    ).toMatchObject({ type: "transition", t: { to: "termine" } });
    expect(mainActionOf({ canSend: false, canCreate: false, transitions: t("envoye") })).toBe(null);
  });
  it("annulé : Rétablir (coordinateur)", () => {
    expect(
      mainActionOf({
        canSend: false,
        canCreate: false,
        transitions: t("annule", true, "brouillon"),
      }),
    ).toMatchObject({ type: "transition", t: { label: "Rétablir" } });
  });
});
