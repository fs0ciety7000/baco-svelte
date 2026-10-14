import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

/** jsdom : ni matchMedia (mode desktop = Popover), ni ResizeObserver (Radix Popper) ; rAF synchrone. */
export function setupPickerEnv() {
  // jsdom : ni matchMedia (mode desktop = Popover), ni ResizeObserver (Radix Popper).
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
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
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  };
}

export const STATUTS = [
  { value: "brouillon", label: "Brouillon" },
  { value: "termine", label: "Terminé" },
  { value: "envoye", label: "Envoyé / finalisé" },
  { value: "annule", label: "Annulé", disabled: true },
];

/** Formulaire GET avec écoute `change` (comme `FormAutoSubmit`) : renvoie les soumissions observées. */
export function renderInForm(ui: React.ReactNode) {
  const changes: Record<string, string>[] = [];
  const utils = render(
    <form
      data-testid="form"
      ref={(f) => {
        f?.addEventListener("change", () =>
          changes.push(Object.fromEntries(new FormData(f) as never)),
        );
      }}
    >
      {ui}
    </form>,
  );
  return { ...utils, changes, form: () => screen.getByTestId("form") as HTMLFormElement };
}
