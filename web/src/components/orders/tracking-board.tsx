"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { loadOrderPanel, type OrderPanel } from "@/app/(app)/commandes/actions";
import { Button } from "@/components/ui/button";
import { EmptyState, Kbd, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Badge, StatusBadge, statusColor } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { isClosable, STATUS_LABEL } from "@/lib/orders/status";
import { brusselsDay, formatDay, pbDate, sinceLabel } from "@/lib/orders/time";
import type { OrderRow } from "@/server/data/orders";

import { KindIconClient } from "./kind-icon";
import { OrderHistory } from "./order-history";
import { TransitionButtons } from "./transitions";

const href = (r: { kind: string; id: string }) =>
  r.kind === "bus" ? `/commandes/bus/${r.id}` : `/commandes/taxi/${r.id}`;

/**
 * Suivi commun bus + taxi : table (cartes en mobile), détail en panneau latéral sans changer de page,
 * transitions contextuelles. Clavier : J/K ligne suivante/précédente, Entrée ouvrir, Échap fermer.
 */
export function TrackingBoard({
  rows,
  coordinator,
  showSince,
}: {
  rows: OrderRow[];
  coordinator: boolean;
  /** Vue « À confirmer » : ancienneté de l'envoi. */
  showSince: boolean;
}) {
  const today = brusselsDay();
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<OrderRow | null>(null);
  const [panel, setPanel] = useState<OrderPanel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rowRefs = useRef<(HTMLElement | null)[]>([]);

  // Dernière commande demandée : une réponse arrivée en retard pour une autre ligne est ignorée (sinon
  // « Confirmer » enverrait les bus d'une commande sur une autre).
  const wanted = useRef<string | null>(null);
  const load = useCallback(async (r: OrderRow) => {
    setError(null);
    const key = `${r.kind}-${r.id}`;
    wanted.current = key;
    let res: Awaited<ReturnType<typeof loadOrderPanel>>;
    try {
      res = await loadOrderPanel({ kind: r.kind, id: r.id });
    } catch {
      res = { ok: false, error: "Serveur injoignable : réessaie." };
    }
    if (wanted.current !== key) return;
    if (res.ok) setPanel(res.data);
    else setError(res.error);
  }, []);

  const show = useCallback(
    (r: OrderRow) => {
      setOpen(r);
      setPanel(null);
      void load(r);
    },
    [load],
  );

  // Ligne mise à jour par le temps réel : on recharge le panneau ouvert.
  const openRow = open ? rows.find((r) => r.id === open.id && r.kind === open.kind) : undefined;
  const openUpdated = openRow?.updated;
  useEffect(() => {
    if (open && openUpdated) void load(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openUpdated]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (open || e.ctrlKey || e.metaKey || e.altKey) return;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const next = Math.min(rows.length - 1, Math.max(0, active + (e.key === "j" ? 1 : -1)));
        setActive(next);
        rowRefs.current[next]?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && rows[active]) {
        e.preventDefault();
        show(rows[active]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, active, open, show]);

  if (rows.length === 0)
    return (
      <EmptyState
        title="Rien à traiter"
        description="Aucune commande dans cette vue pour le moment."
      />
    );

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <THead>
            <tr>
              <Th>N°</Th>
              <Th>Date</Th>
              <Th>Heure</Th>
              <Th>Trajet</Th>
              <Th>Société</Th>
              <Th numeric>Véh.</Th>
              <Th>Auteur</Th>
              <Th>Statut</Th>
            </tr>
          </THead>
          <tbody data-testid="tracking-table">
            {rows.map((r, i) => (
              <Tr
                key={`${r.kind}-${r.id}`}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                statusColor={statusColor(r.status)}
                selected={i === active}
                className="cursor-pointer"
                onClick={() => {
                  setActive(i);
                  show(r);
                }}
              >
                <Td className="font-mono text-fg-muted">
                  <span className="inline-flex items-center gap-2">
                    <KindIconClient kind={r.kind} pmr={r.isPmr} />
                    <button
                      type="button"
                      className="cursor-pointer focus-visible:outline-1 focus-visible:outline-accent"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActive(i);
                        show(r);
                      }}
                      aria-label={`Ouvrir la commande ${r.kind} n° ${r.number}`}
                    >
                      {r.number || "—"}
                    </button>
                  </span>
                </Td>
                <Td className="font-mono tabular">{formatDay(r.day)}</Td>
                <Td className="font-mono tabular">{r.time || "—"}</Td>
                <Td className={`max-w-72 truncate ${r.status === "annule" ? "line-through" : ""}`}>
                  {r.origin || "?"} → {r.destination || "?"}
                </Td>
                <Td className="max-w-44 truncate">{r.company || "—"}</Td>
                <Td numeric>{r.busCount}</Td>
                <Td className="max-w-36 truncate text-fg-muted">{r.author || "—"}</Td>
                <Td>
                  <span className="flex flex-col items-start gap-0.5">
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <StatusBadge status={r.status} />
                      {isClosable(r.status, r.day, today) ? (
                        <Badge tone="warn">À clôturer</Badge>
                      ) : null}
                    </span>
                    {showSince && r.sentAt ? (
                      <span className="text-hint text-fg-muted">
                        {sinceLabel(pbDate(r.sentAt) ?? new Date())}
                      </span>
                    ) : null}
                  </span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-2 flex items-center gap-2 text-hint text-fg-muted">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd> ligne suivante / précédente · <Kbd>Entrée</Kbd> ouvrir · <Kbd>Échap</Kbd>{" "}
          fermer
        </p>
      </div>

      <ul className="flex flex-col gap-2 md:hidden" data-testid="tracking-cards">
        {rows.map((r) => (
          <li key={`${r.kind}-${r.id}`}>
            <button
              type="button"
              className="block w-full cursor-pointer text-left"
              onClick={() => show(r)}
            >
              <ListCard
                statusColor={statusColor(r.status)}
                title={
                  <span className="inline-flex items-center gap-2">
                    <KindIconClient kind={r.kind} pmr={r.isPmr} />
                    {r.time ? <span className="font-mono tabular">{r.time}</span> : null}
                    {r.origin || "?"} → {r.destination || "?"}
                  </span>
                }
                meta={`n° ${r.number} · ${formatDay(r.day)}${r.company ? ` · ${r.company}` : ""}${showSince && r.sentAt ? ` · ${sinceLabel(pbDate(r.sentAt) ?? new Date())}` : ""}`}
                aside={
                  <span className="inline-flex flex-col items-end gap-1">
                    <StatusBadge status={r.status} />
                    {isClosable(r.status, r.day, today) ? (
                      <Badge tone="warn">À clôturer</Badge>
                    ) : null}
                  </span>
                }
              />
            </button>
          </li>
        ))}
      </ul>

      <Sheet
        open={!!open}
        onOpenChange={(o) => {
          if (!o) {
            setOpen(null);
            setPanel(null);
          }
        }}
        eyebrow={
          open
            ? `// ${open.kind === "bus" ? "Bus C3" : open.isPmr ? "Taxi PMR" : "Taxi"} n° ${open.number}`
            : undefined
        }
        title={open ? `${open.origin || "?"} → ${open.destination || "?"}` : "Commande"}
        description={
          open
            ? `${STATUS_LABEL[openRow?.status ?? open.status]} · ${formatDay(open.day)} ${open.time}`
            : undefined
        }
        footer={
          open && panel ? (
            <div className="flex w-full flex-wrap gap-2">
              <TransitionButtons
                serviceDay={open.day}
                kind={open.kind}
                id={open.id}
                status={panel.meta.status}
                statusBeforeCancel={panel.meta.statusBeforeCancel}
                coordinator={coordinator}
                buses={panel.buses}
                drivers={panel.drivers}
                companyId={panel.companyId}
                hideSend
                size="sm"
                onDone={() => {
                  void load(open);
                  router.refresh();
                }}
              />
              <Button asChild size="sm" variant="ghost" className="ml-auto">
                <Link href={href(open)}>
                  Ouvrir <ArrowUpRight aria-hidden />
                </Link>
              </Button>
            </div>
          ) : null
        }
      >
        {error ? (
          <p role="alert" className="text-body text-danger">
            {error}
          </p>
        ) : !panel ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-5" data-testid="order-panel">
            <div className="flex items-center gap-2">
              <StatusBadge status={panel.meta.status} />
              {panel.meta.status === "brouillon" ? (
                <span className="text-small text-fg-muted">
                  Envoi depuis la fiche (brouillon Outlook).
                </span>
              ) : null}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
              {panel.facts.map((f) => (
                <div key={f.label} className="contents">
                  <dt className="text-small text-fg-muted">{f.label}</dt>
                  <dd className={f.value === "Annulé" ? "text-danger line-through" : "text-fg"}>
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
            {panel.meta.status === "annule" && panel.meta.cancelReason ? (
              <p className="text-body text-danger">
                Motif d&apos;annulation : {panel.meta.cancelReason}
              </p>
            ) : null}
            <section className="flex flex-col gap-3" aria-label="Historique">
              <h3 className="label-mono text-fg-muted">Historique</h3>
              <OrderHistory events={panel.events} />
            </section>
          </div>
        )}
      </Sheet>
    </>
  );
}
