import { describe, expect, it } from "vitest";

import { ASSIST_STATUSES, parseStatuses } from "./model";

describe("parseStatuses (filtre à cases multiples)", () => {
  it("paramètre répété ou liste, ordre du catalogue, inconnus ignorés", () => {
    expect(parseStatuses(["absent", "prevue"], ASSIST_STATUSES)).toEqual(["prevue", "absent"]);
    expect(parseStatuses("realisee,prevue,xx", ASSIST_STATUSES)).toEqual(["prevue", "realisee"]);
    expect(parseStatuses(undefined, ASSIST_STATUSES)).toEqual([]);
    expect(parseStatuses("", ASSIST_STATUSES)).toEqual([]);
  });
});
