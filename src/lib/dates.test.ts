import { describe, expect, it } from "vitest";

import { dayKeyJakarta, lastDayKeysJakarta } from "./dates";

/**
 * The Jakarta day key is the one calendar-day convention both tiers share
 * (client star calendar, server streaks.lastCompletedDate, dashboards).
 * Expected values are hand-computed WIB mappings: WIB = UTC+7, no DST.
 */
describe("dayKeyJakarta", () => {
  it("maps UTC instants to the WIB calendar day", () => {
    // 2026-10-03T17:30:00Z is 2026-10-04 00:30 WIB.
    expect(dayKeyJakarta(new Date("2026-10-03T17:30:00Z"))).toBe("2026-10-04");
    // 2026-10-03T16:59:00Z is still 2026-10-03 23:59 WIB.
    expect(dayKeyJakarta(new Date("2026-10-03T16:59:00Z"))).toBe("2026-10-03");
    // Midday UTC is same-day evening WIB.
    expect(dayKeyJakarta(new Date("2026-10-05T06:00:00Z"))).toBe("2026-10-05");
  });

  it("lists the last n day keys oldest-first", () => {
    const keys = lastDayKeysJakarta(3, new Date("2026-10-04T00:00:00Z"));
    expect(keys).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"]);
  });

  it("crosses the WIB day boundary inside the last-n window", () => {
    // 17:00Z on Oct 3 is already Oct 4 in WIB, so the 3-day window ends there.
    const keys = lastDayKeysJakarta(2, new Date("2026-10-03T17:00:00Z"));
    expect(keys).toEqual(["2026-10-03", "2026-10-04"]);
  });
});
