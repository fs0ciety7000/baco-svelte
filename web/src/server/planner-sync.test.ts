import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type PocketBase from "pocketbase";

import {
  PENDING_LIMITS,
  countPendingTasks,
  ingestPending,
  reservePendingQuota,
  syncPlannerFromAssists,
} from "./planner-sync";

// PocketBase simulé (données FICTIVES) : filtres ignorés (le code refiltre en JavaScript), champs demandés notés.
type Rec = Record<string, unknown> & { id: string };
function fakePb(seed: Record<string, Rec[]> = {}) {
  const db: Record<string, Rec[]> = { planner_tasks: [], pmr_assists: [], ...seed };
  const fields: string[] = [];
  let n = 0;
  const pb = {
    filter: (expr: string, params: Record<string, unknown> = {}) =>
      expr.replace(/\{:(\w+)\}/g, (_, k: string) => JSON.stringify(params[k])),
    collection: (name: string) => ({
      getFullList: async (o: { fields?: string } = {}) => {
        if (o.fields) fields.push(o.fields);
        return (db[name] ?? []).map((r) => ({ ...r }));
      },
      create: async (body: Record<string, unknown>) => {
        const r = { id: `t${String(++n).padStart(14, "0")}`, ...body };
        (db[name] ??= []).push(r);
        return r;
      },
      update: async (id: string, body: Record<string, unknown>) => {
        const r = db[name]!.find((x) => x.id === id)!;
        Object.assign(r, body);
        return r;
      },
    }),
  };
  return { pb: pb as unknown as PocketBase, db, fields };
}

const journey = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  trainNumber: "1234",
  departureName: "MONS / BERGEN",
  arrivalName: "TOURNAI / DOORNIK",
  departureTime: "2099-03-02T07:16:00+01:00",
  arrivalTime: "2099-03-02T08:08:00+01:00",
  withDepartureAssistance: true,
  withArrivalAssistance: false,
  isDepartureOk: true,
  isArrivalOk: null,
  isTrainCancelled: false,
  ...over,
});
const dossier = (journeys: unknown[]) => ({
  id: "2099-03-02-0042",
  displayId: "2099-03-02-0042",
  status: "Proposal",
  travels: [
    {
      travelDate: "2099-03-02T00:00:00+01:00",
      disableds: [{ symbol: "blind-person", assistanceType: "Light", quantity: 1 }],
      journeys,
    },
  ],
});
const all = () => true;

describe("dossiers en attente → tâches", () => {
  it("note le propriétaire du jeton ; ne lit jamais note ni label", async () => {
    const { pb, db, fields } = fakePb();
    const r = await ingestPending(pb, [dossier([journey("990001")])], all, "u00000000000001");
    expect(r.created).toBe(1);
    expect(db.planner_tasks![0]).toMatchObject({
      source_key: "990001:IN",
      synced_by: "u00000000000001",
    });
    expect(fields.length).toBeGreaterThan(0);
    for (const f of fields) expect(f.split(",")).not.toContain("note");
    for (const f of fields) expect(f.split(",")).not.toContain("label");
  });

  it("tâche attribuée dont l'heure change : agent gardé, « Modifiée par DICOS »", async () => {
    const { pb, db } = fakePb();
    await ingestPending(pb, [dossier([journey("990001")])], all);
    Object.assign(db.planner_tasks![0]!, {
      assignee_kind: "agent",
      assignee_agent: "a00000000000001",
      status: "attribuee",
    });
    const r = await ingestPending(
      pb,
      [dossier([journey("990001", { departureTime: "2099-03-02T07:46:00+01:00" })])],
      all,
    );
    expect(r.updated).toBe(1);
    expect(db.planner_tasks![0]).toMatchObject({
      assignee_agent: "a00000000000001",
      status: "attribuee",
      dicos_changed: true,
    });
    // Tâche non attribuée qui change : pas de marque.
    const other = fakePb();
    await ingestPending(other.pb, [dossier([journey("990001")])], all);
    await ingestPending(
      other.pb,
      [dossier([journey("990001", { departureTime: "2099-03-02T07:46:00+01:00" })])],
      all,
    );
    expect(other.db.planner_tasks![0]!.dicos_changed).toBeUndefined();
  });

  it("trajet disparu d'un dossier toujours présent → annulée (agent gardé), jamais supprimée", async () => {
    const { pb, db } = fakePb();
    await ingestPending(pb, [dossier([journey("990001"), journey("990002")])], all);
    expect(db.planner_tasks).toHaveLength(2);
    Object.assign(db.planner_tasks![1]!, {
      assignee_kind: "agent",
      assignee_agent: "a00000000000001",
      status: "attribuee",
    });
    const r = await ingestPending(pb, [dossier([journey("990001")])], all);
    expect(r.cancelled).toBe(1);
    expect(db.planner_tasks).toHaveLength(2);
    expect(db.planner_tasks![1]).toMatchObject({
      source_key: "990002:IN",
      status: "annulee",
      dicos_status: "cancelled",
      assignee_agent: "a00000000000001",
    });
    expect(db.planner_tasks![0]!.status).toBe("a_attribuer");
    // Bout qui n'est plus assisté = disparu aussi.
    await ingestPending(
      pb,
      [dossier([journey("990001", { withDepartureAssistance: false })])],
      all,
    );
    expect(db.planner_tasks![0]!.status).toBe("annulee");
  });

  it("plafonds : 2 000 tâches par requête, 6 000 par jeton et par jour", () => {
    expect(countPendingTasks([dossier([journey("1"), journey("2")])])).toBe(2);
    expect(reservePendingQuota("tok-a", PENDING_LIMITS.perRequest + 1, "2099-03-02")).toBe(false);
    expect(reservePendingQuota("tok-a", 2000, "2099-03-02")).toBe(true);
    expect(reservePendingQuota("tok-a", 2000, "2099-03-02")).toBe(true);
    expect(reservePendingQuota("tok-a", 2000, "2099-03-02")).toBe(true);
    expect(reservePendingQuota("tok-a", 1, "2099-03-02")).toBe(false);
    expect(reservePendingQuota("tok-b", 1, "2099-03-02")).toBe(true);
    expect(reservePendingQuota("tok-a", 1, "2099-03-03")).toBe(true);
  });
});

describe("missions acceptées → tâches", () => {
  const assist = (over: Record<string, unknown> = {}): Rec => ({
    id: "m00000000000001",
    dicos_id: "j990001",
    day: "2099-03-02",
    time: "07:16",
    arr_time: "08:08",
    station: "Mons",
    other_station: "Tournai",
    in_assist: true,
    out_assist: true,
    train: "1234",
    transport: "train",
    pmr_type: "NV",
    pax: 1,
    full_pax: 0,
    light_pax: 1,
    dicos_ref: "2099-03-02-0042",
    status: "prevue",
    in_status: "prevue",
    out_status: "prevue",
    ...over,
  });

  it("lot complet : bout dont l'assistance a disparu → tâche annulée, agent gardé", async () => {
    const { pb, db } = fakePb({ pmr_assists: [assist()] });
    await syncPlannerFromAssists(pb, "2099-03-02", undefined, { complete: true });
    expect(db.planner_tasks!.map((t) => t.source_key)).toEqual(["990001:IN", "990001:OUT"]);
    Object.assign(db.planner_tasks![1]!, {
      assignee_kind: "taxi",
      status: "attribuee",
    });
    db.pmr_assists![0]!.out_assist = false;
    // Lot incomplet : rien n'est annulé.
    await syncPlannerFromAssists(pb, "2099-03-02", undefined, { complete: false });
    expect(db.planner_tasks![1]!.status).toBe("attribuee");
    const r = await syncPlannerFromAssists(pb, "2099-03-02", undefined, {
      complete: true,
      syncedBy: "u00000000000001",
    });
    expect(r.cancelled).toBe(1);
    expect(db.planner_tasks![1]).toMatchObject({
      status: "annulee",
      dicos_status: "cancelled",
      assignee_kind: "taxi",
      synced_by: "u00000000000001",
    });
    expect(db.planner_tasks![0]!.status).toBe("a_attribuer");
  });

  it("tâche manuelle de même clé : jamais touchée", async () => {
    const { pb, db } = fakePb({
      pmr_assists: [assist({ out_assist: false })],
      planner_tasks: [
        { id: "x00000000000001", source: "manuel", source_key: "990001:OUT", status: "attribuee" },
      ],
    });
    await syncPlannerFromAssists(pb, "2099-03-02", undefined, { complete: true });
    expect(db.planner_tasks![0]!.status).toBe("attribuee");
  });
});
