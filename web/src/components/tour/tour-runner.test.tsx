import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlannedStep } from "@/lib/tour/steps";

import { TourRunner } from "./tour-runner";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeAll(() => {
  // Mouvement réduit (aucune animation Web Animations en jsdom), écran desktop.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = () => {};
});

/** Cible visible de 100 × 40 à (200, 100). */
function target(attr: string) {
  const el = document.createElement("button");
  el.setAttribute("data-tour", attr);
  el.getBoundingClientRect = () =>
    ({
      top: 100,
      left: 200,
      width: 100,
      height: 40,
      right: 300,
      bottom: 140,
      x: 200,
      y: 100,
    }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const step = (id: string, extra: Partial<PlannedStep> = {}): PlannedStep => ({
  id,
  title: `Titre ${id}`,
  body: `Texte ${id}.`,
  targets: [`[data-tour="${id}"]`],
  chapter: "prise-en-main",
  chapterTitle: "Prise en main",
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers();
  push.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

/** Avance le temps puis laisse React rejouer les effets (une étape sautée relance la recherche suivante). */
async function settle(ms = 0) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {
    vi.advanceTimersByTime(0);
  });
}

describe("TourRunner", () => {
  it("met la cible en lumière, compte les étapes, saute une cible absente, termine", async () => {
    target("a");
    target("c");
    const onEnd = vi.fn();
    render(
      <TourRunner
        steps={[step("a"), step("absente"), step("c"), step("vide", { fallback: "center" })]}
        onEnd={onEnd}
      />,
    );
    await settle();
    expect(screen.getByTestId("tour-card").dataset.step).toBe("a");
    expect(screen.getByTestId("tour-counter").textContent).toBe("1 / 4");
    expect(screen.getByTestId("tour-spotlight").dataset.target).toBe("on");
    expect(screen.getByRole("dialog", { name: "Titre a" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByTestId("tour-next"));
    // Annonce pour les lecteurs d'écran.
    expect(screen.getByText("Étape 1 sur 4 : Titre a")).toBeTruthy();

    fireEvent.click(screen.getByTestId("tour-next"));
    await settle(3000); // cible absente : étape sautée
    expect(screen.getByTestId("tour-card").dataset.step).toBe("c");
    expect(screen.getByTestId("tour-counter").textContent).toBe("3 / 4");

    // ← revient : l'étape absente est sautée en arrière.
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await settle(3000);
    expect(screen.getByTestId("tour-card").dataset.step).toBe("a");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await settle(3000);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await settle(3000); // cible absente, `fallback: center` : carte centrée sans découpe
    expect(screen.getByTestId("tour-card").dataset.step).toBe("vide");
    expect(screen.getByTestId("tour-spotlight").dataset.target).toBe("off");
    expect(screen.getByTestId("tour-next").textContent).toContain("Terminer");
    fireEvent.click(screen.getByTestId("tour-next"));
    expect(onEnd).toHaveBeenCalledWith("done");
  });

  it("Échap et « Passer » ferment ; les raccourcis de la page sont suspendus", async () => {
    target("a");
    const onEnd = vi.fn();
    const pageKey = vi.fn();
    window.addEventListener("keydown", pageKey);
    render(<TourRunner steps={[step("a"), step("b")]} onEnd={onEnd} />);
    await settle();
    fireEvent.keyDown(window, { key: "/" });
    expect(pageKey).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onEnd).toHaveBeenCalledWith("skipped");
    window.removeEventListener("keydown", pageKey);
  });

  it("change de page puis attend la cible", async () => {
    const onEnd = vi.fn();
    render(<TourRunner steps={[step("p", { path: "/commandes/suivi" })]} onEnd={onEnd} />);
    expect(push).toHaveBeenCalledWith("/commandes/suivi");
    window.history.pushState({}, "", "/commandes/suivi");
    await settle(300);
    expect(screen.queryByTestId("tour-card")).toBeNull();
    target("p");
    await settle(200);
    expect(screen.getByTestId("tour-card").dataset.step).toBe("p");
    window.history.pushState({}, "", "/");
  });
});
