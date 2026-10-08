import { Timeline } from "@/components/ui/form-kit";
import { statusColor } from "@/components/ui/status-badge";
import { STATUS_LABEL } from "@/lib/orders/status";
import { pbDate } from "@/lib/orders/time";
import type { OrderEvent } from "@/server/data/orders";

const at = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Historique horodaté des statuts (qui, quand, depuis quel statut), affiché en heure belge. */
export function OrderHistory({ events }: { events: OrderEvent[] }) {
  if (events.length === 0) return <p className="text-small text-fg-muted">Aucun historique.</p>;
  return (
    <Timeline
      items={events.map((e) => {
        const d = pbDate(e.at);
        return {
          id: e.id,
          color: statusColor(e.to),
          title: e.from ? (
            <>
              {STATUS_LABEL[e.from as keyof typeof STATUS_LABEL] ?? e.from} →{" "}
              <strong className="font-semibold">{STATUS_LABEL[e.to]}</strong>
            </>
          ) : (
            <>
              Création · <strong className="font-semibold">{STATUS_LABEL[e.to]}</strong>
            </>
          ),
          meta: `${e.by}${d ? ` · ${at.format(d)}` : ""}${e.legacy ? " · repris de BACO" : ""}`,
          note: e.note || undefined,
        };
      })}
    />
  );
}
