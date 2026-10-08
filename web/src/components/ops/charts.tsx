// Graphiques des statistiques en SVG simple (pas de Chart.js, décision du 8 octobre 2026) : couleurs par jetons,
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
  const max = Math.max(1, ...series.map((s) => s.bus + s.taxi));
  const w = 640;
  const h = 180;
  const gap = series.length > 40 ? 1 : 3;
  const bw = Math.max(2, (w - gap * series.length) / Math.max(1, series.length));
  const every = Math.ceil(series.length / 10);
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${w} ${h + 22}`} className="h-auto w-full" role="img" aria-label={caption}>
        <line x1={0} x2={w} y1={h} y2={h} stroke="var(--border-strong)" />
        {series.map((s, i) => {
          const x = i * (bw + gap);
          const hb = (s.bus / max) * (h - 8);
          const ht = (s.taxi / max) * (h - 8);
          return (
            <g key={s.label}>
              <title>{`${fmtBucket(s.label)} : ${s.bus} bus, ${s.taxi} taxi(s)`}</title>
              <rect x={x} y={h - hb} width={bw} height={hb} fill="var(--accent)" />
              <rect x={x} y={h - hb - ht} width={bw} height={ht} fill="var(--info)" />
              {i % every === 0 ? (
                <text
                  x={x + bw / 2}
                  y={h + 15}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--fg-muted)"
                  fontFamily="var(--font-mono, monospace)"
                >
                  {fmtBucket(s.label)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-4 text-small text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 bg-accent" /> Bus C3
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 bg-info" /> Taxis
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
              className="absolute inset-y-0 left-0 bg-[color-mix(in_oklab,var(--accent)_22%,var(--surface))]"
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
