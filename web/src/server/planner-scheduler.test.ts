import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/dicos-service", () => ({ ingestConfigured: () => false, serviceAuth: vi.fn() }));
vi.mock("@/server/planner-sync", () => ({ syncPlannerFromAssists: vi.fn() }));
vi.mock("@/server/pocketbase", () => ({ createPb: vi.fn() }));

import { plannerSyncDays } from "./planner-scheduler";

describe("plannerSyncDays", () => {
  it("reprend la veille, le jour et les deux jours suivants", () => {
    expect(plannerSyncDays("2026-10-31")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});
