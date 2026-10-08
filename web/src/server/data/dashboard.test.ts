import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../session", () => ({ readSessionToken: async () => null }));

const { brusselsDayBounds } = await import("./dashboard");

describe("brusselsDayBounds", () => {
  it("à 1 h du matin à Bruxelles (23 h UTC la veille), la journée est déjà celle de Bruxelles", () => {
    const b = brusselsDayBounds(new Date("2026-10-08T23:30:00Z"));
    expect(b.day).toBe("2026-10-09");
    expect(b.start).toBe("2026-10-09 00:00:00.000Z");
    expect(b.end).toBe("2026-10-10 00:00:00.000Z");
  });

  it("change de mois correctement", () => {
    expect(brusselsDayBounds(new Date("2026-10-31T12:00:00Z")).end).toBe(
      "2026-11-01 00:00:00.000Z",
    );
  });
});
