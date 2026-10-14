import { describe, expect, it } from "vitest";

import { archiveCutoff, isArchivedOrder, orderClosedAt } from "./archive";

describe("archivage des bons après 30 jours (14 oct. 2026)", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");

  it("envoyé / finalisé depuis plus de 30 jours : archivé", () => {
    expect(isArchivedOrder({ status: "envoye", sent_at: "2026-09-13 08:00:00.000Z" }, now)).toBe(
      true,
    );
    expect(isArchivedOrder({ status: "envoye", sent_at: "2026-09-15 08:00:00.000Z" }, now)).toBe(
      false,
    );
  });

  it("annulé : même règle sur la date d'annulation", () => {
    expect(
      isArchivedOrder({ status: "annule", cancelled_at: "2026-09-01 08:00:00.000Z" }, now),
    ).toBe(true);
    expect(
      isArchivedOrder({ status: "annule", cancelled_at: "2026-10-10 08:00:00.000Z" }, now),
    ).toBe(false);
  });

  it("brouillon et terminé (dont un bon rouvert) : jamais archivés", () => {
    expect(isArchivedOrder({ status: "brouillon", updated: "2025-01-01 00:00:00.000Z" }, now)).toBe(
      false,
    );
    expect(
      isArchivedOrder(
        {
          status: "termine",
          sent_at: "2026-01-01 00:00:00.000Z",
          updated: "2026-01-01 00:00:00.000Z",
        },
        now,
      ),
    ).toBe(false);
  });

  it("bons repris de BACO sans horodatage d'envoi : fin de service, puis dernière modification", () => {
    expect(orderClosedAt({ status: "envoye", ended_at: "2026-08-01 10:00:00.000Z" })).toBe(
      Date.parse("2026-08-01T10:00:00Z"),
    );
    expect(isArchivedOrder({ status: "envoye", updated: "2026-08-01 10:00:00.000Z" }, now)).toBe(
      true,
    );
    expect(isArchivedOrder({ status: "annule", updated: "2026-10-13 10:00:00.000Z" }, now)).toBe(
      false,
    );
    expect(isArchivedOrder({ status: "envoye" }, now)).toBe(false);
  });

  it("limite au format PocketBase", () => {
    expect(archiveCutoff(now)).toBe("2026-09-14 12:00:00.000Z");
  });
});
