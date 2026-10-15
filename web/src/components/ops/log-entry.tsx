import { FileText, Link2, Pin, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/status-badge";
import { TrainChip } from "@/components/ui/train-chip";
import { CATEGORY } from "@/lib/ops/log";
import { brusselsTime, formatDay, dayOf, pbDate } from "@/lib/orders/time";
import type { LogEntry } from "@/server/data/ops";

const at = (v: string) => {
  const d = pbDate(v);
  return d ? brusselsTime(d) : "--:--";
};

export function LogMeta({ entry, showDay }: { entry: LogEntry; showDay?: boolean }) {
  const c = CATEGORY[entry.category];
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-mono text-body font-medium tabular text-fg">
        {showDay ? `${formatDay(dayOf(entry.occurredAt))} · ` : ""}
        {at(entry.occurredAt)}
      </span>
      <Badge tone={c.tone}>{c.label}</Badge>
      {entry.urgent ? (
        <Badge tone="danger">
          <TriangleAlert aria-hidden className="size-3" /> Urgent
        </Badge>
      ) : null}
      {entry.pinnedUntil && (pbDate(entry.pinnedUntil)?.getTime() ?? 0) > Date.now() ? (
        <Badge tone="info">
          <Pin aria-hidden className="size-3" /> Épinglée
        </Badge>
      ) : null}
      {entry.status === "retiree" ? <Badge tone="neutral">Retirée</Badge> : null}
      <span className="text-small text-fg-muted">
        {entry.authorName}
        {entry.district ? ` · ${entry.district}` : ""}
        {entry.editedAt ? " · modifiée" : ""}
      </span>
    </div>
  );
}

export function LogLinks({ entry }: { entry: LogEntry }) {
  if (!entry.links.length && !entry.train && !entry.attachments.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {entry.train ? (
        <Link
          href={`/reseau?train=${encodeURIComponent(entry.train)}`}
          className="inline-flex min-h-8 items-center rounded-control hover:opacity-85"
          aria-label={`Train ${entry.train} : trains en direct`}
        >
          <TrainChip train={entry.train} size="sm" />
        </Link>
      ) : null}
      {entry.links.map((l) =>
        l.href ? (
          <Link
            key={`${l.kind}-${l.id}`}
            href={l.href}
            className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-pill bg-surface-2 px-2.5 text-small hover:bg-surface-3"
          >
            <Link2 aria-hidden className="size-3.5 shrink-0 text-fg-muted" />
            <span className="truncate">{l.label}</span>
          </Link>
        ) : (
          <span
            key={`${l.kind}-${l.id}`}
            className="inline-flex min-h-8 items-center gap-1 rounded-pill border border-dashed border-border-strong px-2.5 text-small text-fg-muted"
          >
            {l.label}
          </span>
        ),
      )}
      {entry.attachments.map((name) => {
        const href = `/api/operations/main-courante/${entry.id}/fichiers/${encodeURIComponent(name)}`;
        return /\.(png|jpe?g|webp)$/i.test(name) ? (
          <a
            key={name}
            href={href}
            target="_blank"
            rel="noopener"
            className="block overflow-hidden rounded-control border border-border hover:border-border-strong"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={href}
              alt={`Pièce jointe ${name}`}
              className="h-16 w-24 object-cover"
              loading="lazy"
            />
          </a>
        ) : (
          <a
            key={name}
            href={href}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-8 items-center gap-1 rounded-pill bg-surface-2 px-2.5 text-small hover:bg-surface-3"
          >
            <FileText aria-hidden className="size-3.5" /> PDF
          </a>
        );
      })}
    </div>
  );
}
