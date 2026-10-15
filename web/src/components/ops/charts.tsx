import { cn, pl } from "@/lib/utils";

// Graphiques des statistiques en HTML / CSS simple (pas de Chart.js, décision du 8 octobre 2026) : couleurs par jetons,
// valeurs lisibles sans la couleur (titre au survol, tableau équivalent pour les lecteurs d'écran).
// v4 lot 6 (15 oct. 2026) : barres en `info` / `progress`, axes en `fg-subtle`, valeurs en chiffres tabulaires, fond
// `surface`, une ligne de base et des repères courts au lieu d'un quadrillage.

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
  const half = top / 2 === Math.round(top / 2) ? top / 2 : null;
  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2" role="img" aria-label={caption}>
        {/* Axe : valeurs en `fg-subtle`, repère court de 6 px à chaque valeur (pas de ligne sur toute la largeur). */}
        <div aria-hidden className="relative h-44 text-right text-label text-fg-subtle tabular">
          <span className="absolute top-0 right-2 -translate-y-1/2">{top}</span>
          {half !== null ? (
            <span className="absolute top-1/2 right-2 -translate-y-1/2">{half}</span>
          ) : null}
          <span className="absolute right-2 bottom-0 translate-y-1/2">0</span>
          <span className="absolute top-0 right-0 h-px w-1.5 bg-border-strong" />
          <span className="absolute top-1/2 right-0 h-px w-1.5 bg-border-strong" />
        </div>
        <div className="relative h-44 border-b border-l border-border-strong">
          <div className="absolute inset-0 flex items-end pl-px" style={{ gap }}>
            {series.map((s) => (
              <div
                key={s.label}
                title={`${fmtBucket(s.label)} : ${s.bus} bus, ${s.taxi} ${pl(s.taxi, "taxi")}`}
                className="flex h-full min-w-0 flex-1 flex-col justify-end gap-px"
              >
                {s.taxi ? (
                  <span
                    className="block rounded-t-[min(var(--r-control),3px)] bg-progress"
                    style={{ height: `${(s.taxi / top) * 100}%` }}
                  />
                ) : null}
                {s.bus ? (
                  <span
                    className={cn(
                      "block bg-info",
                      !s.taxi && "rounded-t-[min(var(--r-control),3px)]",
                    )}
                    style={{ height: `${(s.bus / top) * 100}%` }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <span />
        <div aria-hidden className="mt-1.5 flex" style={{ gap }}>
          {series.map((s, i) => (
            <span
              key={s.label}
              className={cn(
                "min-w-0 flex-1 overflow-visible text-center text-label whitespace-nowrap text-fg-subtle tabular",
                i % every !== 0 && "invisible",
                i % (every * 2) !== 0 && "max-sm:invisible",
              )}
            >
              {fmtBucket(s.label)}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[min(var(--r-control),2px)] bg-info" /> Bus
          C3
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[min(var(--r-control),2px)] bg-progress" />{" "}
          Taxis
        </span>
        <span className="text-fg-subtle">
          max <span className="tabular">{max}</span> par période
        </span>
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

/**
 * Liste de barres horizontales : libellé et valeur sur une ligne, piste fine `surface-2` dessous avec la barre `info`
 * (pas de cadre par ligne). La valeur est écrite : la couleur n'est jamais seule.
 */
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
    <ul className="flex flex-col gap-2.5">
      {items.map((i) => (
        <li key={i.label} className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-small text-fg">{i.label}</span>
            <span className="figures shrink-0 text-small text-fg">
              {i.value}
              {unit}
            </span>
          </div>
          <div aria-hidden className="h-1.5 overflow-hidden rounded-pill bg-surface-2">
            <span
              className="block h-full rounded-pill bg-info"
              style={{ width: `${(i.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
