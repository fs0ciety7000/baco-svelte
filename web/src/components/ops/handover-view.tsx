"use client";

import {
  Bus,
  CalendarClock,
  ClipboardCheck,
  Megaphone,
  Pin,
  TrainFront,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";

import { pinHandover } from "@/app/(app)/operations/actions";
import { CopyIcon, useCopy } from "@/components/pmr/copy";
import { DelayBadge, TrainChip } from "@/components/pmr/train-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { handoverText, type Handover, type HandoverOrder } from "@/lib/ops/handover";
import { safeCall } from "@/lib/orders/safe-call";
import { cn, pl } from "@/lib/utils";

function Section({
  icon,
  title,
  count,
  tone = "neutral",
  children,
  empty,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  tone?: "neutral" | "warn" | "danger" | "info";
  children: ReactNode;
  empty: string;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            {icon} {title}
            <Badge tone={count ? tone : "neutral"} className="font-mono tabular">
              {count}
            </Badge>
          </span>
        }
      />
      <CardContent>
        {count ? children : <p className="text-small text-fg-muted">{empty}</p>}
      </CardContent>
    </Card>
  );
}

function Orders({ items }: { items: HandoverOrder[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.slice(0, 12).map((o) => (
        <li key={o.id}>
          <Link
            href={o.href}
            className="flex min-w-0 items-baseline gap-2 rounded-box px-1 py-1 hover:bg-surface-2"
          >
            <span className="min-w-0 flex-1 truncate text-body">{o.label}</span>
            <span className="shrink-0 font-mono text-small text-fg-muted tabular">
              {o.day}
              {o.time ? ` ${o.time}` : ""}
            </span>
            {o.late > 0 ? (
              <span className="shrink-0 text-small text-warn">
                {o.late} {pl(o.late, "jour")}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Relève de service : sections de ce qui reste ouvert, copie en texte, épinglage au Journal en consigne. */
export function HandoverView({
  data,
  scope,
  author,
  at,
  canPin,
}: {
  data: Handover;
  scope: string;
  author: string;
  at: string;
  canPin: boolean;
}) {
  const router = useRouter();
  const copy = useCopy();
  const [pending, start] = useTransition();
  const text = handoverText(data, { author, at, scope });
  const orders = data.toConfirm.length + data.toClose.length + data.running.length;
  return (
    <div className="flex flex-col gap-4" data-testid="handover">
      <div className="flex flex-wrap items-center gap-2" data-print="hide">
        <p className="mr-auto text-body text-fg-muted">
          Relève <span className="text-fg">{scope}</span> · mise à jour à{" "}
          <span className="font-mono tabular">{at}</span>
        </p>
        <Button
          variant="secondary"
          onClick={() => void copy.copy(text)}
          data-testid="handover-copy"
        >
          <CopyIcon copied={copy.copied} /> {copy.copied ? "Copié" : "Copier la relève"}
        </Button>
        {canPin ? (
          <Button
            variant="primary"
            loading={pending}
            data-testid="handover-pin"
            onClick={() =>
              start(async () => {
                const res = await safeCall(pinHandover(text));
                if (!res.ok) return void toast.error(res.error);
                toast.success("Relève épinglée au Journal (consigne, 12 h).");
                router.push(`/operations/journal?entree=${res.data.id}`);
              })
            }
          >
            <Pin aria-hidden /> Épingler au Journal
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          icon={<Bus aria-hidden className="size-4" />}
          title="Commandes ouvertes"
          count={orders}
          tone="warn"
          empty="Aucun bon à confirmer, à clôturer ni en cours."
        >
          <div className="flex flex-col gap-3">
            {data.running.length ? (
              <div>
                <p className="label-mono text-fg-muted">
                  Services en cours ({data.running.length})
                </p>
                <Orders items={data.running} />
              </div>
            ) : null}
            {data.toConfirm.length ? (
              <div>
                <p className="label-mono text-fg-muted">À confirmer ({data.toConfirm.length})</p>
                <Orders items={data.toConfirm} />
              </div>
            ) : null}
            {data.toClose.length ? (
              <div>
                <p className="label-mono text-warn">À clôturer ({data.toClose.length})</p>
                <Orders items={data.toClose} />
              </div>
            ) : null}
          </div>
        </Section>

        <Section
          icon={<TrainFront aria-hidden className="size-4" />}
          title="Trains en retard"
          count={data.delays.length}
          tone="danger"
          empty="Aucun train de mission en retard ni supprimé."
        >
          <ul className="flex flex-col gap-1.5">
            {data.delays.slice(0, 12).map((l) => (
              <li key={l.id} className="flex min-w-0 items-center gap-2">
                <TrainChip train={l.train} taxi={l.train === "Taxi"} />
                <DelayBadge impact={l.impact} />
                <span className="min-w-0 flex-1 truncate text-body">
                  {l.io === "IN" ? "Embarquement" : "Débarquement"} à{" "}
                  {l.impact?.station ?? l.station}
                </span>
                <span className="shrink-0 text-small text-fg-muted">{l.detail}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          icon={<CalendarClock aria-hidden className="size-4" />}
          title="Missions et groupes à venir"
          count={data.upcomingTotal}
          tone="info"
          empty="Plus aucune prise en charge d'ici demain 10 h."
        >
          <ul className="flex flex-col gap-1.5">
            {data.upcoming.slice(0, 15).map((l) => (
              <li key={l.id} className="flex min-w-0 items-center gap-2">
                <span className="w-24 shrink-0 font-mono text-small tabular text-fg-muted">
                  {l.day !== data.today ? "demain " : ""}
                  <span className="text-body text-fg">{l.time || "--:--"}</span>
                </span>
                <TrainChip train={l.train} taxi={l.train === "Taxi"} />
                <DelayBadge impact={l.impact} />
                <Badge tone={l.io === "IN" ? "info" : "ok"}>{l.io}</Badge>
                <span className="min-w-0 flex-1 truncate text-body">{l.station}</span>
                <span className="shrink-0 text-small text-fg-muted max-sm:hidden">{l.detail}</span>
              </li>
            ))}
            {data.upcomingTotal > 15 ? (
              <li className="text-small text-fg-muted">+ {data.upcomingTotal - 15} autres</li>
            ) : null}
          </ul>
        </Section>

        <Section
          icon={<ClipboardCheck aria-hidden className="size-4" />}
          title="ALEA à encoder"
          count={data.aleaTotal}
          tone="warn"
          empty="Tous les blocs ALEA du jour sont encodés."
        >
          <ul className="flex flex-col gap-1.5">
            {data.alea.slice(0, 12).map((a, i) => (
              <li
                key={`${a.kind}-${a.train}-${a.station}-${a.io}-${i}`}
                className="flex min-w-0 items-center gap-2"
              >
                <span className="w-12 shrink-0 font-mono text-small tabular">
                  {a.time || "--:--"}
                </span>
                <TrainChip train={a.train} />
                <Badge tone={a.io === "IN" ? "info" : "ok"}>{a.io}</Badge>
                <span className="min-w-0 flex-1 truncate text-body">{a.station}</span>
                {a.kind === "groupe" ? <Badge tone="neutral">Groupe</Badge> : null}
              </li>
            ))}
          </ul>
          <Link href="/pmr" className="link mt-2 inline-block text-small">
            Ouvrir l&apos;export ALEA
          </Link>
        </Section>

        <Section
          icon={<Megaphone aria-hidden className="size-4" />}
          title="Urgences et consignes"
          count={data.log.length}
          tone="danger"
          empty="Aucune urgence ces 12 dernières heures, aucune consigne épinglée."
        >
          <ul className="flex flex-col gap-1.5">
            {data.log.slice(0, 10).map((l) => (
              <li key={l.id}>
                <Link
                  href={`/operations/journal?entree=${l.id}`}
                  className="flex min-w-0 items-baseline gap-2 rounded-box px-1 py-1 hover:bg-surface-2"
                >
                  <span className="shrink-0 font-mono text-small tabular">{l.time}</span>
                  {l.urgent ? <Badge tone="danger">Urgent</Badge> : null}
                  {l.pinned ? <Badge tone="accent">Consigne</Badge> : null}
                  <span className="min-w-0 flex-1 truncate text-body">{l.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          icon={<TriangleAlert aria-hidden className="size-4" />}
          title="Perturbations en cours"
          count={data.disturbances.length}
          tone="warn"
          empty="Aucune perturbation iRail ces 12 dernières heures."
        >
          <ul className="flex flex-col gap-1.5">
            {data.disturbances.slice(0, 10).map((l) => (
              <li key={l.id}>
                <Link
                  href={`/operations/journal?entree=${l.id}`}
                  className={cn(
                    "flex min-w-0 items-baseline gap-2 rounded-box px-1 py-1 hover:bg-surface-2",
                  )}
                >
                  <span className="shrink-0 font-mono text-small tabular">{l.time}</span>
                  <span className="min-w-0 flex-1 truncate text-body">{l.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
