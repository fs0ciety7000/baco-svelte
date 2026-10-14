import { Timeline } from "@/components/ui/form-kit";
import { statusColor } from "@/components/ui/status-badge";
import { historyLabel, isStatus } from "@/lib/orders/status";
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
          color: isStatus(e.to) ? statusColor(e.to) : "var(--fg-muted)",
          // Relance du fournisseur : événement « envoyé → envoyé » (11 oct. 2026).
          title:
            e.from === e.to ? (
              <>
                <strong className="font-semibold">Relance du fournisseur</strong> · bon toujours{" "}
                {historyLabel(e.to).toLowerCase()}
              </>
            ) : e.from ? (
              <>
                {historyLabel(e.from)} →{" "}
                <strong className="font-semibold">{historyLabel(e.to)}</strong>
              </>
            ) : (
              <>
                Création · <strong className="font-semibold">{historyLabel(e.to)}</strong>
              </>
            ),
          meta: `${e.by}${d ? ` · ${at.format(d)}` : ""}${e.legacy ? " · repris de BACO" : ""}`,
          note: e.note || undefined,
        };
      })}
    />
  );
}
