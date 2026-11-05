import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it } from "vitest";

import { setupPickerEnv } from "@/components/ui/picker-test-utils";
import { normalizeLayout, type DashboardLayout, type WidgetId } from "@/design/dashboard-layout";

import { WidgetEditor } from "./widget-editor";

beforeAll(setupPickerEnv);

const TITLE: Partial<Record<WidgetId, string>> = {
  service: "Fin de service",
  impacts: "Missions impactées",
  trains: "Trains perturbés",
};

function Harness({ initial }: { initial: DashboardLayout }) {
  const [layout, setLayout] = useState(initial);
  const ids = layout.order.filter((id) => id in TITLE);
  return (
    <WidgetEditor
      layout={layout}
      visible={ids.filter((id) => !layout.hidden.includes(id))}
      hidden={ids.filter((id) => layout.hidden.includes(id))}
      meta={(id) => ({ eyebrow: "Test", title: TITLE[id] ?? id })}
      onChange={setLayout}
    />
  );
}

const order = () =>
  [...document.querySelectorAll("[data-widget-row]")].map((r) => r.getAttribute("data-widget-row"));

describe("WidgetEditor", () => {
  const initial = normalizeLayout({ order: ["service", "impacts", "trains"], hidden: [] });

  it("monte, descend, masque puis réaffiche un widget", () => {
    render(<Harness initial={initial} />);
    expect(order().slice(0, 3)).toEqual(["service", "impacts", "trains"]);
    expect(screen.getByRole("button", { name: "Monter « Fin de service »" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Monter « Trains perturbés »" }));
    expect(order()).toEqual(["service", "trains", "impacts"]);
    fireEvent.click(screen.getByRole("button", { name: "Descendre « Fin de service »" }));
    expect(order()).toEqual(["trains", "service", "impacts"]);

    fireEvent.click(screen.getByRole("button", { name: "Masquer « Fin de service »" }));
    expect(order()).toEqual(["trains", "impacts"]);
    const hidden = screen.getByTestId("hidden-widgets");
    fireEvent.click(within(hidden).getByRole("button", { name: "Afficher « Fin de service »" }));
    // Réaffiché à sa place dans l'ordre enregistré.
    expect(order()).toEqual(["trains", "service", "impacts"]);
  });

  it("poignée nommée et focalisable, redimensionnement au clavier", () => {
    render(<Harness initial={initial} />);
    const handle = screen.getByRole("button", { name: "Déplacer « Missions impactées »" });
    expect(handle).toHaveAttribute("aria-roledescription", "widget déplaçable");
    const resize = screen.getByRole("button", { name: /^Redimensionner « Missions impactées »/ });
    // jsdom n'a pas de grille CSS : `gridMetrics` retombe sur 6 colonnes (une colonne = 2 sur 12).
    const before = resize.getAttribute("aria-label");
    fireEvent.keyDown(resize, { key: "ArrowDown" });
    const after = screen
      .getByRole("button", { name: /^Redimensionner « Missions impactées »/ })
      .getAttribute("aria-label");
    expect(after).not.toBe(before);
    expect(after).toMatch(/5 rangées/);
  });
});
