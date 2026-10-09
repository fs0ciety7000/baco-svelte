import { cn, pl } from "@/lib/utils";

// Graphiques des statistiques en HTML / CSS simple (pas de Chart.js, décision du 8 octobre 2026) : couleurs par jetons,
// valeurs lisibles sans la couleur (titre au survol, tableau équivalent pour les lecteurs d'écran).

const fmtBucket = (label: string) =>
  label.length === 7
    ? `${label.slice(5)}/${label.slice(2, 4)}`
    : `${label.slice(8, 10)}/${label.slice(5, 7)}`;

export function StackedBars({
  series,
  caption,
}: {
  series: { label: string; bus: number; taxi: number }[];
  caption: string;
}) {
  // HTML plutôt que SVG mis à l'échelle : le texte garde sa taille réelle quelle que soit la largeur (audit UI du
  // 9 oct. 2026 : axe à 20 px en desktop, 5 px en mobile). Repères 0 / moitié / max.
  const max = Math.max(1, ...series.map((s) => s.bus + s.taxi));
  const top = max <= 4 ? max : Math.ceil(max / 2) * 2;
  const every = Math.max(1, Math.ceil(series.length / 10));
  const gap = series.length > 40 ? "1px" : series.length > 20 ? "2px" : "4px";
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2" role="img" aria-label={caption}>
        <div
          aria-hidden
          className="flex h-44 flex-col justify-between text-right font-mono text-small text-fg-muted tabular"
        >
          <span className="-translate-y-1/2">{top}</span>
          <span>{top / 2 === Math.round(top / 2) ? top / 2 : ""}</span>
          <span className="translate-y-1/2">0</span>
        </div>
        <div className="relative h-44 border-b border-border-strong">
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 border-t border-dashed border-border"
          />
          <span
            aria-hidden
            className="absolute inset-x-0 top-1/2 border-t border-dashed border-border"
          />
          <div className="absolute inset-0 flex items-end" style={{ gap }}>
            {series.map((s) => (
              <div
                key={s.label}
                title={`${fmtBucket(s.label)} : ${s.bus} bus, ${s.taxi} ${pl(s.taxi, "taxi")}`}
                className="flex h-full min-w-0 flex-1 flex-col justify-end"
              >
                <span
                  className="block bg-[color-mix(in_oklab,var(--info)_45%,var(--surface))]"
                  style={{ height: `${(s.taxi / top) * 100}%` }}
                />
                <span className="block bg-info" style={{ height: `${(s.bus / top) * 100}%` }} />
              </div>
            ))}
          </div>
        </div>
        <span />
        <div aria-hidden className="mt-1 flex" style={{ gap }}>
          {series.map((s, i) => (
            <span
              key={s.label}
              className={cn(
                "min-w-0 flex-1 overflow-visible text-center font-mono text-small whitespace-nowrap text-fg-muted tabular",
                i % every !== 0 && "invisible",
                i % (every * 2) !== 0 && "max-sm:invisible",
              )}
            >
              {fmtBucket(s.label)}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="flex flex-wrap gap-4 text-small text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 bg-info" /> Bus C3
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 bg-[color-mix(in_oklab,var(--info)_45%,var(--surface))]"
          />{" "}
          Taxis
        </span>
        <span>max {max} par période</span>
      </figcaption>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {series.map((s) => (
            <tr key={s.label}>
              <th>{s.label}</th>
              <td>{s.bus} bus</td>
              <td>{s.taxi} taxis</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function BarList({
  items,
  empty = "Aucune donnée.",
  unit = "",
}: {
  items: { label: string; value: number }[];
  empty?: string;
  unit?: string;
}) {
  if (!items.length) return <p className="text-small text-fg-muted">{empty}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-2">
          <div className="relative min-h-8 overflow-hidden border border-border">
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-[color-mix(in_oklab,var(--info)_22%,var(--surface))]"
              style={{ width: `${(i.value / max) * 100}%` }}
            />
            <span className="relative block truncate px-2 py-1 text-small">{i.label}</span>
          </div>
          <span className="text-right font-mono text-small tabular">
            {i.value}
            {unit}
          </span>
        </li>
      ))}
    </ul>
  );
}
