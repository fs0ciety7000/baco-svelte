"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Barre de chargement entre deux pages (audit UX du 9 oct. 2026 : aucun retour pendant 350–800 ms). Démarre au clic
 * sur un lien interne ou à l'envoi d'un formulaire de filtres (GET), s'arrête quand l'URL a changé. N'apparaît
 * qu'après 150 ms (navigations rapides : rien), garde-fou de 10 s.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);

  useEffect(() => setActive(false), [pathname, search]);

  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => setActive(false), 10_000);
    return () => window.clearTimeout(t);
  }, [active]);

  useEffect(() => {
    const changes = (url: URL) =>
      url.origin === location.origin &&
      (url.pathname !== location.pathname || url.search !== location.search);
    const onClick = (e: MouseEvent) => {
      // Phase de capture : next/link annule le clic par défaut avant qu'un écouteur en phase de bulle ne le voie.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      if (changes(new URL(a.href))) setActive(true);
    };
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (form.method.toLowerCase() !== "get") return;
      const url = new URL(form.action);
      const data = new FormData(form, e.submitter);
      url.search = new URLSearchParams(
        [...data.entries()].map(([k, v]) => [k, typeof v === "string" ? v : v.name]),
      ).toString();
      if (changes(url)) setActive(true);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  return (
    <div
      aria-hidden
      data-testid="nav-progress"
      data-active={active || undefined}
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden"
    >
      {active ? <span className="block h-full origin-left animate-nav-progress bg-accent" /> : null}
    </div>
  );
}
