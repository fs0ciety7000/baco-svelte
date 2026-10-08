import { Accessibility, Bus, Car } from "lucide-react";

/** Icône du type de commande (bus, taxi, taxi PMR), toujours avec un libellé accessible. */
export function KindIconClient({ kind, pmr }: { kind: "bus" | "taxi"; pmr?: boolean }) {
  if (kind === "bus") return <Bus aria-label="Bus" className="size-4 shrink-0 text-fg-muted" />;
  return pmr ? (
    <Accessibility aria-label="Taxi PMR" className="size-4 shrink-0 text-fg-muted" />
  ) : (
    <Car aria-label="Taxi" className="size-4 shrink-0 text-fg-muted" />
  );
}
