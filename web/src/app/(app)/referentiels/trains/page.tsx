import type { Metadata } from "next";
import Link from "next/link";

import { TimetableRefresh } from "@/components/referentiels/timetable-refresh";
import {
  DaysText,
  LinesChain,
  RelationLink,
  SeriesText,
  StopList,
  TrainLink,
  TypeBadge,
  trainsHref,
} from "@/components/referentiels/trains";
import { Button } from "@/components/ui/button";
import { FilterForm } from "@/components/ui/filter-form";
import { FilterChip, ChipRow } from "@/components/ui/filters";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { Input, Select } from "@/components/ui/input";
import { Select as CustomSelect } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { lineLabel } from "@/lib/lines";
import { brusselsDay, formatShortDay } from "@/lib/orders/time";
import { isAdmin } from "@/lib/permissions";
import {
  DAY_FILTERS,
  dayFilterOf,
  daysLabel,
  relationKey,
  seriesLabel,
  type DayFilter,
} from "@/lib/timetable/model";
import { pl } from "@/lib/utils";
import { requireRoute } from "@/server/auth";
import { STALE_RUN_MS } from "@/server/timetable/import";
import {
  getTrain,
  getTrainRelation,
  lineBoard,
  listTrainRelations,
  normLine,
  stationBoard,
  timetableState,
  type BoardRow,
  type RelationRow,
} from "@/server/data/timetable";

export const metadata: Metadata = { title: "Trains · CSM" };

// Référentiel des relations de trains (demande du 14 oct. 2026) : par relation (IC14, S1-1, L31…), par gare (trains qui
// s'arrêtent ou passent), par ligne d'infrastructure. Fiches d'une relation (`?rel=`) et d'un train (`?train=`).

type Search = {
  vue?: string;
  type?: string;
  ligne?: string;
  gare?: string;
  q?: string;
  rel?: string;
  train?: string;
  jours?: string;
};

const VIEWS = [
  { id: "relations", label: "Relations" },
  { id: "gare", label: "Par gare" },
  { id: "ligne", label: "Par ligne" },
] as const;

function weekday(): number {
  const d = brusselsDay();
  return (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** Un paramètre répété (`?gare=a&gare=b`) arrive en tableau : seule la première valeur compte. */
function first(raw: Record<string, string | string[] | undefined>): Search {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const one = Array.isArray(v) ? v[0] : v;
    if (typeof one === "string") out[k] = one;
  }
  return out as Search;
}

/** Date tierce (horaire SNCB, Infrabel) affichée seulement si elle est bien au format AAAA-MM-JJ. */
const safeDay = (d: string | undefined) =>
  d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? formatShortDay(d) : "";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRoute("/referentiels/trains");
  const sp = first(await searchParams);
  const q = (sp.q ?? "").trim().slice(0, 40);
  const trainNo = Number(sp.train ?? (/^\d{1,5}$/.test(q) ? q : ""));
  const view = sp.rel
    ? "rel"
    : trainNo > 0
      ? "train"
      : (VIEWS.find((v) => v.id === sp.vue)?.id ?? "relations");
  const day = dayFilterOf(sp.jours, weekday());
  const state = await timetableState();
  const admin = isAdmin(user);
  // « En cours » depuis plus de 30 min = import interrompu (redéploiement) : le bouton redevient disponible.
  const running =
    state?.state === "running" && Date.now() - Date.parse(state.startedAt ?? "") < STALE_RUN_MS;

  return (
    <section className="flex flex-col gap-4" aria-label="Trains">
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          {VIEWS.map((v) => (
            <FilterChip key={v.id} asChild pressed={view === v.id}>
              <Link
                href={trainsHref({ vue: v.id === "relations" ? undefined : v.id })}
                data-testid={`trains-view-${v.id}`}
              >
                {v.label}
              </Link>
            </FilterChip>
          ))}
        </ChipRow>
        {admin ? <TimetableRefresh running={running} /> : null}
      </div>
      <StatusLine state={state} admin={admin} running={running} />

      {!state?.lastOkAt ? (
        <EmptyState
          title="Référentiel pas encore construit"
          description={
            running
              ? "Première construction en cours (environ une minute)."
              : "Il est construit chaque matin à partir de l'horaire SNCB et des données ouvertes d'Infrabel."
          }
        />
      ) : view === "rel" ? (
        <RelationView rkey={sp.rel!} />
      ) : view === "train" ? (
        <TrainView number={trainNo} />
      ) : view === "gare" ? (
        <StationView gare={(sp.gare ?? "").trim().slice(0, 60)} day={day} />
      ) : view === "ligne" ? (
        <LineView line={normLine(sp.ligne)} day={day} />
      ) : (
        <RelationsView sp={sp} q={q} />
      )}
    </section>
  );
}

function StatusLine({
  state,
  admin,
  running,
}: {
  state: Awaited<ReturnType<typeof timetableState>>;
  running: boolean;
  admin: boolean;
}) {
  if (!state) return null;
  const parts: string[] = [];
  if (safeDay(state.feedVersion)) parts.push(`Horaire SNCB du ${safeDay(state.feedVersion)}`);
  if (state.window)
    parts.push(`semaine du ${safeDay(state.window[0])} au ${safeDay(state.window[1])}`);
  if (safeDay(state.d1Day)) parts.push(`relations et lignes Infrabel au ${safeDay(state.d1Day)}`);
  return (
    <p
      className="flex flex-wrap items-center gap-2 text-small text-fg-muted"
      data-testid="timetable-status"
    >
      <span>{parts.join(" · ")}</span>
      {state.state === "error" && admin ? (
        <Badge tone="danger" title={state.error}>
          Dernière mise à jour en échec : {state.error}
        </Badge>
      ) : null}
      {running ? <Badge tone="info">Mise à jour en cours</Badge> : null}
    </p>
  );
}

function DayChips({ base, day }: { base: Record<string, string>; day: DayFilter }) {
  return (
    <ChipRow>
      {(Object.keys(DAY_FILTERS) as DayFilter[]).map((d) => (
        <FilterChip key={d} asChild pressed={d === day}>
          <Link href={trainsHref({ ...base, jours: d })}>{DAY_FILTERS[d].label}</Link>
        </FilterChip>
      ))}
    </ChipRow>
  );
}

// ---------------------------------------------------------------------------------------------------
// Relations

async function RelationsView({ sp, q }: { sp: Search; q: string }) {
  const type = (sp.type ?? "").toUpperCase();
  const { rows, lines } = await listTrainRelations({ type, line: sp.ligne, gare: sp.gare, q });
  return (
    <>
      <FilterForm action="/referentiels/trains" className="flex flex-wrap items-end gap-2">
        <FormAutoSubmit live />
        <label className="flex min-w-0 flex-col gap-1 md:w-36">
          <span className="text-small text-fg-muted">Type</span>
          <CustomSelect
            name="type"
            defaultValue={type}
            options={[
              { value: "", label: "Tous" },
              { value: "IC", label: "IC" },
              { value: "L", label: "L" },
              { value: "S", label: "S" },
              { value: "P", label: "P" },
              { value: "AUTRES", label: "Autres" },
            ]}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-36">
          <span className="text-small text-fg-muted">Ligne</span>
          <Select name="ligne" defaultValue={normLine(sp.ligne)}>
            <option value="">Toutes</option>
            {lines.map((l) => (
              <option key={l} value={l}>
                {lineLabel(l)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-52">
          <span className="text-small text-fg-muted">Dessert la gare</span>
          <Input name="gare" defaultValue={sp.gare ?? ""} placeholder="Mons, FMS…" maxLength={60} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-52">
          <span className="text-small text-fg-muted">Relation ou n° de train</span>
          <Input name="q" defaultValue={q} placeholder="IC14, S1, 1706…" maxLength={40} />
        </label>
        <Button type="submit" variant="secondary">
          Afficher
        </Button>
      </FilterForm>
      <p className="text-small text-fg-muted">
        <span className="font-mono text-fg tabular">{rows.length}</span>{" "}
        {pl(rows.length, "relation")}
      </p>
      {rows.length === 0 ? (
        <EmptyState
          title="Aucune relation"
          description="Aucune relation ne correspond à ces filtres."
        />
      ) : (
        <RelationTable rows={rows} />
      )}
    </>
  );
}

function RelationTable({ rows }: { rows: RelationRow[] }) {
  return (
    <>
      <div className="hidden md:block">
        <Table data-testid="relations-table">
          <THead>
            <tr>
              <Th>Type</Th>
              <Th>Relation</Th>
              <Th>Origine – terminus</Th>
              <Th>Série</Th>
              <Th>Lignes</Th>
              <Th numeric>Trains</Th>
              <Th>Jours</Th>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.key}>
                <Td>
                  <TypeBadge type={r.type} />
                </Td>
                <Td className="whitespace-nowrap">
                  <RelationLink relation={r.relation} rkey={r.key} />
                </Td>
                <Td className="max-w-80">
                  <span className="line-clamp-2">{r.label}</span>
                  {r.variants.length > 1 ? (
                    <span className="text-small text-fg-muted">
                      {" "}
                      · +{r.variants.length - 1} {pl(r.variants.length - 1, "variante")}
                    </span>
                  ) : null}
                </Td>
                <Td>
                  <SeriesText series={r.series} />
                </Td>
                <Td className="max-w-72">
                  <LinesChain lines={r.lines} />
                </Td>
                <Td numeric>{r.trains}</Td>
                <Td>
                  <DaysText days={r.days} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <li key={r.key} className="min-w-0">
            <Link href={trainsHref({ rel: r.key })} className="block">
              <ListCard
                title={
                  <span className="flex items-center gap-2">
                    <TypeBadge type={r.type} />
                    <span className="font-mono">{r.relation}</span>
                    <span className="truncate font-normal text-fg-muted">{r.label}</span>
                  </span>
                }
                meta={`${r.series.map(seriesLabel).join(" · ")} · ${r.lines.map(lineLabel).join(" › ") || "—"} · ${r.trains} ${pl(r.trains, "train")}`}
              />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
// Fiche d'une relation

async function RelationView({ rkey }: { rkey: string }) {
  const data = await getTrainRelation(rkey);
  if (!data)
    return (
      <EmptyState title="Relation introuvable" description="Elle n'existe plus dans l'horaire." />
    );
  const { relation: r, services } = data;
  return (
    <div className="flex flex-col gap-5" data-testid="relation-detail">
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type={r.type} />
        <h2 className="font-mono text-h3">{r.relation}</h2>
        <span className="text-body-lg">{r.label}</span>
        <Button asChild variant="ghost" size="sm" className="ml-auto border border-border">
          <Link href={trainsHref({})}>Toutes les relations</Link>
        </Button>
      </div>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-small text-fg-muted">Série</dt>
          <dd>
            <SeriesText series={r.series} />
          </dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-small text-fg-muted">Lignes empruntées</dt>
          <dd>
            <LinesChain lines={r.lines} />
          </dd>
        </div>
      </dl>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col gap-2" aria-label="Arrêts">
          <h3 className="text-h3">
            Arrêts <span className="text-small font-normal text-fg-muted">({r.label})</span>
          </h3>
          <StopList stops={r.pattern} />
        </section>
        <section className="flex min-w-0 flex-col gap-3" aria-label="Variantes et trains">
          {r.variants.length > 1 ? (
            <>
              <h3 className="text-h3">Variantes</h3>
              <ul className="flex flex-col gap-1 text-body">
                {r.variants.map((v) => (
                  <li key={`${v.from}-${v.to}`} className="flex flex-wrap gap-x-2">
                    <span>
                      {v.from} → {v.to}
                    </span>
                    <span className="text-small text-fg-muted">
                      {v.trains} {pl(v.trains, "train")} · {daysLabel(v.days)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <h3 className="text-h3">
            Trains <span className="text-small font-normal text-fg-muted">({services.length})</span>
          </h3>
          <ul
            className="flex flex-col divide-y divide-border rounded-box border border-border bg-surface"
            data-testid="relation-trains"
          >
            {services.map((s) => (
              <li
                key={s.key}
                className="grid grid-cols-[3.5rem_6.5rem_minmax(0,1fr)] items-baseline gap-x-2 px-3 py-1.5 text-body sm:grid-cols-[3.5rem_6.5rem_minmax(0,1fr)_auto]"
              >
                <TrainLink number={s.number} />
                <span className="font-mono text-small tabular text-fg-muted">
                  {s.firstDep}–{s.lastArr}
                </span>
                <span className="min-w-0 truncate text-small">
                  {s.origin} → {s.terminus}
                </span>
                <span className="col-start-3 sm:col-start-auto">
                  <DaysText days={s.days} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Fiche d'un train

async function TrainView({ number }: { number: number }) {
  const services = await getTrain(number);
  if (!services.length)
    return (
      <EmptyState
        title={`Train ${number} introuvable`}
        description="Il ne circule pas dans la semaine de référence (ou ce numéro n'existe pas)."
      />
    );
  return (
    <div className="flex flex-col gap-6" data-testid="train-detail">
      {services.map((s) => (
        <section key={s.key} className="flex flex-col gap-3" aria-label={`Train ${s.number}`}>
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={s.type} />
            <h2 className="font-mono text-h3">
              {s.type !== s.relation ? `${s.relation} ` : ""}
              {s.number}
            </h2>
            <span className="text-body-lg">
              {s.origin} → {s.terminus}
            </span>
            <DaysText days={s.days} />
            <Button asChild variant="ghost" size="sm" className="ml-auto border border-border">
              <Link href={trainsHref({ rel: relationKey(s) })}>Voir la relation</Link>
            </Button>
          </div>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-small text-fg-muted">Série</dt>
              <dd className="font-mono text-small">
                {seriesLabel(s.series)} <span className="text-fg-muted">({s.series})</span>
              </dd>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-small text-fg-muted">Lignes</dt>
              <dd>
                <LinesChain lines={s.lines} />
                {s.linesSource === "deduite" ? (
                  <span className="text-small text-fg-muted"> (déduites des gares)</span>
                ) : null}
              </dd>
            </div>
          </dl>
          {s.relationSource !== "infrabel" ? (
            <p className="text-small text-fg-muted">
              {s.relationSource === "serie"
                ? "Relation déduite de la série de numéros (train absent des données Infrabel récentes)."
                : "Relation inconnue chez Infrabel : seul le type est donné par l'horaire SNCB."}
            </p>
          ) : null}
          <StopList stops={s.stops} showPasses />
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Par gare

async function StationView({ gare, day }: { gare: string; day: DayFilter }) {
  const board = gare ? await stationBoard(gare, day) : null;
  return (
    <>
      <FilterForm action="/referentiels/trains" className="flex flex-wrap items-end gap-2">
        <FormAutoSubmit live />
        <input type="hidden" name="vue" value="gare" />
        <input type="hidden" name="jours" value={day} />
        <label className="flex min-w-0 flex-col gap-1 md:w-64">
          <span className="text-small text-fg-muted">Gare</span>
          <Input
            name="gare"
            defaultValue={gare}
            placeholder="Nom ou abréviation (FMS)…"
            maxLength={60}
          />
        </label>
        <Button type="submit" variant="secondary">
          Afficher
        </Button>
      </FilterForm>
      <DayChips base={{ vue: "gare", gare }} day={day} />
      {!board ? (
        <EmptyState
          title="Choisis une gare"
          description="Trains qui s'y arrêtent et trains qui y passent sans arrêt."
        />
      ) : !board.station ? (
        <EmptyState
          title="Aucun train"
          description="Aucun train ne dessert ni ne traverse cette gare ce jour-là."
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <BoardTable
            title={`S'arrêtent à ${board.station}`}
            rows={board.stops}
            testid="board-stops"
            withLine
          />
          <BoardTable title="Passent sans s'arrêter" rows={board.passes} testid="board-passes" />
        </div>
      )}
    </>
  );
}

function BoardTable({
  title,
  rows,
  testid,
  withLine = false,
}: {
  title: string;
  rows: BoardRow[];
  testid: string;
  withLine?: boolean;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={title} data-testid={testid}>
      <h3 className="text-h3">
        {title} <span className="text-small font-normal text-fg-muted">({rows.length})</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-small text-fg-muted">Aucun.</p>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <Th>Heure</Th>
                  <Th>Train</Th>
                  <Th>Relation</Th>
                  <Th>Origine → terminus</Th>
                  {withLine ? <Th>Ligne</Th> : null}
                  <Th>Jours</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={`${r.number}-${r.time}-${r.days}`}>
                    <Td
                      className="font-mono tabular whitespace-nowrap"
                      title={r.arr && r.dep ? `arrivée ${r.arr}, départ ${r.dep}` : undefined}
                    >
                      {r.time}
                      {!r.dep && r.arr ? (
                        <span className="text-small text-fg-muted"> arr.</span>
                      ) : null}
                    </Td>
                    <Td>
                      <TrainLink number={r.number} />
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <TypeBadge type={r.type} />
                        <RelationLink relation={r.relation} rkey={r.relationKey} />
                      </span>
                    </Td>
                    <Td className="max-w-72 truncate">
                      {r.origin} → {r.terminus}
                    </Td>
                    {withLine ? (
                      <Td className="font-mono text-small">{r.line ? lineLabel(r.line) : ""}</Td>
                    ) : null}
                    <Td>
                      <DaysText days={r.days} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((r) => (
              <li key={`${r.number}-${r.time}-${r.days}`}>
                <Link href={trainsHref({ train: r.number })} className="block">
                  <ListCard
                    title={
                      <span className="flex items-center gap-2">
                        <span className="font-mono tabular">
                          {r.approx ? "≈ " : ""}
                          {r.time}
                        </span>
                        <TypeBadge type={r.type} />
                        <span className="font-mono">
                          {r.relation} {r.number}
                        </span>
                      </span>
                    }
                    meta={`${r.origin} → ${r.terminus}${r.line ? ` · ${lineLabel(r.line)}` : ""} · ${daysLabel(r.days)}`}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------
// Par ligne

async function LineView({ line, day }: { line: string; day: DayFilter }) {
  const [{ lines }, board] = await Promise.all([
    listTrainRelations({}),
    line ? lineBoard(line, day) : Promise.resolve(null),
  ]);
  return (
    <>
      <FilterForm action="/referentiels/trains" className="flex flex-wrap items-end gap-2">
        <FormAutoSubmit live />
        <input type="hidden" name="vue" value="ligne" />
        <input type="hidden" name="jours" value={day} />
        <label className="flex min-w-0 flex-col gap-1 md:w-48">
          <span className="text-small text-fg-muted">Ligne</span>
          <Select name="ligne" defaultValue={line}>
            <option value="">—</option>
            {lines.map((l) => (
              <option key={l} value={l}>
                {lineLabel(l)}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="secondary">
          Afficher
        </Button>
      </FilterForm>
      <DayChips base={{ vue: "ligne", ligne: line }} day={day} />
      {!board ? (
        <EmptyState
          title="Choisis une ligne"
          description="Relations qui l'empruntent et trains à chaque gare."
        />
      ) : (
        <div className="flex flex-col gap-5" data-testid="line-board">
          <section className="flex flex-col gap-2" aria-label="Relations">
            <h3 className="text-h3">
              Relations sur la {lineLabel(board.line)}{" "}
              <span className="text-small font-normal text-fg-muted">
                ({board.relations.length})
              </span>
            </h3>
            {board.relations.length ? (
              <RelationTable rows={board.relations} />
            ) : (
              <p className="text-small text-fg-muted">Aucune.</p>
            )}
          </section>
          <section className="flex flex-col gap-2" aria-label="Gares de la ligne">
            <h3 className="text-h3">Gares ({DAY_FILTERS[day].label.toLowerCase()})</h3>
            {board.stations.length === 0 ? (
              <p className="text-small text-fg-muted">Aucune gare desservie ce jour-là.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-box border border-border bg-surface">
                {board.stations.map((s) => (
                  <li
                    key={s.name}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2"
                  >
                    <Link
                      href={trainsHref({ vue: "gare", gare: s.name, jours: day })}
                      className="link min-w-40 font-medium"
                    >
                      {s.name}
                    </Link>
                    <span className="text-small tabular">
                      {s.stops} {pl(s.stops, "arrêt")}
                      {s.passes ? (
                        <span className="text-fg-muted"> · {s.passes} sans arrêt</span>
                      ) : null}
                    </span>
                    <span className="min-w-0 font-mono text-small text-fg-muted">
                      {s.relations.join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
