"use client";

import { useState } from "react";

import { pl } from "@/lib/utils";
import { LiveHighlight } from "@/components/ui/live-highlight";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { formatDay } from "@/lib/orders/time";
import { DISTRICT_LABEL } from "@/lib/pmr/districts";
import { aleaGroupBlocks, type GroupEnd } from "@/lib/pmr/model";
import { missionImpact, type TrainStates } from "@/lib/pmr/train-delay";
import type { GroupMission } from "@/server/data/groups";

import { AleaButton } from "./alea-export";
import { HIGHLIGHT, IoBadges, type Leg } from "./assist-board";
import { PhoneLink } from "./phone-link";
import { DelayBadge, TrainChip } from "./train-chip";

// Missions de GROUPE DICOS (lecture seule, demande du 9 oct. 2026) : même présentation que les missions PMR
// (trajet, IN/OUT, district, gare assistée surlignée), avec le nom du groupe et ses comptages.

const STATUS = {
  prevue: { label: "Prévue", tone: "info" },
  realisee: { label: "Réalisée", tone: "ok" },
  annulee: { label: "Annulée", tone: "danger" },
} as const;

const legOf = (g: GroupMission): Leg => ({
  dep: g.station || "—",
  depTime: g.time,
  depDistrict: g.district,
  arr: g.otherStation || "—",
  arrTime: g.arrTime,
  arrDistrict: g.arrDistrict,
  inA: g.inAssist,
  outA: g.outAssist,
});
const total = (g: GroupMission) => g.adults + g.children + g.seniors;
const trainOf = (g: GroupMission) =>
  g.transport === "taxi" ? `Taxi${g.train ? ` ${g.train}` : ""}` : g.train || "—";

function Route({ g, district }: { g: GroupMission; district: string }) {
  const l = legOf(g);
  const end = (name: string, time: string, assisted: boolean, d: string) => (
    <span className={assisted && (!district || d === district) ? HIGHLIGHT : ""}>
      {time ? <span className="font-mono tabular text-fg-muted">{time} </span> : null}
      <span className={assisted ? "font-medium text-fg" : ""}>{name}</span>
    </span>
  );
  return (
    <span className={g.status === "annulee" ? "line-through" : ""}>
      {end(l.dep, l.depTime, l.inA, l.depDistrict)} <span className="text-fg-muted">→</span>{" "}
      {end(l.arr, l.arrTime, l.outA, l.arrDistrict)}
    </span>
  );
}

function groupEnds(rows: GroupMission[], district: string): GroupEnd[] {
  const ends: GroupEnd[] = [];
  for (const g of rows) {
    if (g.status === "annulee") continue;
    const l = legOf(g);
    const base = {
      day: g.day,
      train: trainOf(g),
      total: total(g),
      children: g.children,
      seniors: g.seniors,
      dossier: g.dicosRef,
    };
    if (l.inA && (!district || l.depDistrict === district))
      ends.push({ ...base, station: l.dep, time: l.depTime, io: "IN" });
    if (l.outA && (!district || l.arrDistrict === district))
      ends.push({ ...base, station: l.arr, time: l.arrTime, io: "OUT" });
  }
  return ends;
}

export function GroupBoard({
  rows,
  district = "",
  delays,
  canMark = false,
}: {
  rows: GroupMission[];
  /** Peut cocher « encodé » dans l'export ALEA. */
  canMark?: boolean;
  district?: string;
  /** États iRail des trains du jour : badge de retard à la gare assistée. */
  delays?: TrainStates;
}) {
  const [open, setOpen] = useState<GroupMission | null>(null);
  const days = [...new Set(rows.map((r) => r.day))];
  return (
    <>
      <LiveHighlight
        scope="groups"
        context={`${district}|${days[0] ?? ""}|${days.at(-1) ?? ""}`}
        sigs={Object.fromEntries(
          rows.map((r) => [r.id, `${r.status}|${r.time}|${r.arrTime}|${total(r)}`]),
        )}
      />
      <div className="flex justify-end">
        <AleaButton
          kind="groupe"
          canMark={canMark}
          disabled={!rows.length}
          eyebrow="// Groupes"
          description={`Par train et par gare, une ligne par groupe${district ? ` (district ${district})` : ""}. Missions annulées exclues.`}
          compute={() => aleaGroupBlocks(groupEnds(rows, district))}
        />
      </div>
      {days.map((d) => {
        const list = rows.filter((r) => r.day === d);
        return (
          <section key={d} className="flex flex-col gap-2" aria-label={formatDay(d)}>
            <h2 className="label-mono text-fg-muted first-letter:uppercase">
              {formatDay(d)} · {list.length} {pl(list.length, "trajet")}
            </h2>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    <Th>Train</Th>
                    <Th>Heure</Th>
                    <Th>Trajet (départ → arrivée)</Th>
                    <Th>Sens</Th>
                    <Th>Groupe</Th>
                    <Th>Adultes</Th>
                    <Th>Enfants</Th>
                    <Th>Seniors</Th>
                    <Th>Statut</Th>
                  </tr>
                </THead>
                <tbody data-testid="groups-table" data-hl-scope="groups">
                  {list.map((g) => (
                    <Tr
                      key={g.id}
                      data-hl={g.id}
                      selected={open?.id === g.id}
                      className="cursor-pointer"
                      onClick={() => setOpen(g)}
                    >
                      <Td>
                        <span className="inline-flex items-center gap-1.5">
                          <TrainChip train={g.train} taxi={g.transport === "taxi"} />
                          <DelayBadge impact={missionImpact(g, delays)} />
                        </span>
                      </Td>
                      <Td className="font-mono tabular">{g.time || g.arrTime || "—"}</Td>
                      <Td>
                        <Route g={g} district={district} />
                      </Td>
                      <Td>
                        <IoBadges leg={legOf(g)} district={district} />
                      </Td>
                      <Td className="max-w-56 truncate">
                        <button
                          type="button"
                          className="cursor-pointer text-left link"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpen(g);
                          }}
                        >
                          {g.groupName || "Groupe"}
                        </button>
                      </Td>
                      <Td className="tabular">{g.adults}</Td>
                      <Td className="tabular">{g.children}</Td>
                      <Td className="tabular">{g.seniors}</Td>
                      <Td>
                        <Badge tone={STATUS[g.status].tone}>{STATUS[g.status].label}</Badge>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <ul className="flex flex-col gap-2 md:hidden" data-hl-scope="groups">
              {list.map((g) => (
                <li key={g.id} className="min-w-0">
                  <button
                    type="button"
                    className="w-full cursor-pointer text-left"
                    onClick={() => setOpen(g)}
                  >
                    <ListCard
                      data-hl={g.id}
                      title={
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <TrainChip train={g.train} taxi={g.transport === "taxi"} />
                          <DelayBadge impact={missionImpact(g, delays)} />
                          <Route g={g} district={district} />
                        </span>
                      }
                      meta={`${g.groupName || "Groupe"} · ${total(g)} pers.${g.children ? ` dont ${g.children} enfants` : ""}`}
                      aside={<Badge tone={STATUS[g.status].tone}>{STATUS[g.status].label}</Badge>}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <Sheet
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open ? open.groupName || "Groupe" : ""}
        description={open ? `${formatDay(open.day)} · ${trainOf(open)}` : ""}
      >
        {open ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
            <dt className="text-small text-fg-muted">Trajet</dt>
            <dd>
              <Route g={open} district={district} />
            </dd>
            <dt className="text-small text-fg-muted">Assistance</dt>
            <dd>
              {[
                open.inAssist ? `IN · embarquement à ${open.station}` : "",
                open.outAssist ? `OUT · débarquement à ${open.otherStation}` : "",
              ]
                .filter(Boolean)
                .join(" ; ") || "—"}
            </dd>
            <dt className="text-small text-fg-muted">District</dt>
            <dd>
              {[open.district, open.arrDistrict]
                .filter(Boolean)
                .map((d) => `${d} · ${DISTRICT_LABEL[d as keyof typeof DISTRICT_LABEL] ?? ""}`)
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(" → ") || "—"}
            </dd>
            <dt className="text-small text-fg-muted">Composition</dt>
            <dd>
              {total(open)} {pl(total(open), "personne")} : {open.adults}{" "}
              {pl(open.adults, "adulte")}, {open.children} {pl(open.children, "enfant")},{" "}
              {open.seniors} {pl(open.seniors, "senior")}
            </dd>
            {open.coach ? (
              <>
                <dt className="text-small text-fg-muted">Voiture</dt>
                <dd>{open.coach}</dd>
              </>
            ) : null}
            {open.meetingPoint ? (
              <>
                <dt className="text-small text-fg-muted">Point de rencontre</dt>
                <dd>{open.meetingPoint}</dd>
              </>
            ) : null}
            <dt className="text-small text-fg-muted">Réf. DICOS</dt>
            <dd className="font-mono">{open.dicosRef || "—"}</dd>
            <dt className="text-small text-fg-muted">Contact</dt>
            <dd>{open.contactName || "—"}</dd>
            {open.contactPhone ? (
              <>
                <dt className="text-small text-fg-muted">Téléphone</dt>
                <dd>
                  <PhoneLink phone={open.contactPhone} />
                </dd>
              </>
            ) : null}
            {open.contactEmail ? (
              <>
                <dt className="text-small text-fg-muted">E-mail</dt>
                <dd className="break-all">
                  <a className="link" href={`mailto:${open.contactEmail}`}>
                    {open.contactEmail}
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </Sheet>
    </>
  );
}
