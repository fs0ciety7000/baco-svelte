"use client";

import { History, LayoutTemplate } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { duplicateOrder } from "@/app/(app)/commandes/actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { OrderKind } from "@/lib/orders/status";
import { safeCall } from "@/lib/orders/safe-call";

export type StartPanelProps = {
  kind: OrderKind;
  recent: { id: string; title: string; meta: string }[];
  templates: { id: string; name: string; author: string }[];
};

/** Bandeau « Démarrer » d'une nouvelle commande : refaire une commande récente, partir d'un modèle partagé. */
export function StartPanel({ kind, recent, templates }: StartPanelProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (recent.length === 0 && templates.length === 0) return null;
  const base = kind === "bus" ? "/commandes/nouveau" : "/commandes/taxi/nouveau";
  const redo = (id: string) =>
    start(async () => {
      const res = await safeCall(duplicateOrder({ kind, id }));
      if (!res.ok) return void toast.error(res.error);
      toast.success("Commande recopiée en brouillon daté d'aujourd'hui.");
      router.push(
        kind === "bus" ? `/commandes/bus/${res.data.id}` : `/commandes/taxi/${res.data.id}`,
      );
    });
  return (
    <section
      aria-label="Démarrer"
      className="flex flex-col gap-3 border border-dashed border-border-strong p-3"
    >
      {recent.length ? (
        <div className="flex flex-col gap-2">
          <p className="label-mono flex items-center gap-2 text-fg-muted">
            <History aria-hidden className="size-3.5" /> Refaire une commande récente
          </p>
          <ul className="flex flex-col gap-1.5">
            {recent.map((r) => (
              <li key={r.id}>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-auto min-h-11 w-full justify-start py-2 text-left whitespace-normal"
                  onClick={() => redo(r.id)}
                  disabled={pending}
                  data-testid="redo-order"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body text-fg">{r.title}</span>
                    <span className="truncate text-small text-fg-muted">{r.meta}</span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {templates.length ? (
        <div className="flex flex-col gap-2">
          <p className="label-mono flex items-center gap-2 text-fg-muted">
            <LayoutTemplate aria-hidden className="size-3.5" /> Depuis un modèle (partagé)
          </p>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <Button key={t.id} asChild variant="ghost" size="sm" className="border border-border">
                <Link
                  href={`${base}?modele=${t.id}`}
                  title={t.author ? `Créé par ${t.author}` : undefined}
                >
                  {t.name}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
