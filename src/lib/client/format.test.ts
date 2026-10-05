import { describe, expect, it } from "vitest";

import {
  formatAnswer,
  formatDateIdId,
  formatDurationId,
  formatNumberId,
  sctZone,
} from "./format";

describe("formatNumberId", () => {
  it("groups thousands with dots", () => {
    expect(formatNumberId(1000)).toBe("1.000");
    expect(formatNumberId(1234567)).toBe("1.234.567");
  });

  it("uses comma for decimals", () => {
    expect(formatNumberId(0.5)).toBe("0,5");
    expect(formatNumberId(12345.6)).toBe("12.345,6");
  });
});

describe("formatAnswer", () => {
  it("renders every answer kind in Indonesian convention", () => {
    expect(formatAnswer({ kind: "integer", value: 72 })).toBe("72");
    expect(formatAnswer({ kind: "decimal", value: 0.5, places: 1 })).toBe("0,5");
    expect(formatAnswer({ kind: "fraction", n: -3, d: 4 })).toBe("-3/4");
    expect(formatAnswer({ kind: "mixed", w: -2, n: 1, d: 4 })).toBe("-2 1/4");
    expect(formatAnswer({ kind: "mixed", w: 5, n: 0, d: 4 })).toBe("5");
    expect(formatAnswer({ kind: "moneyRupiah", value: 150000 })).toBe("Rp150.000");
    expect(formatAnswer({ kind: "unitValue", value: 250, unit: "cm" })).toBe("250 cm");
  });

  it("delegates to the engine: unit values format as whole numbers", () => {
    expect(() => formatAnswer({ kind: "unitValue", value: 0.5, unit: "m" })).toThrow(
      /not an integer/,
    );
  });
});

describe("formatDurationId", () => {
  it("renders minutes and seconds", () => {
    expect(formatDurationId(23_000)).toBe("23 dtk");
    expect(formatDurationId(60_000)).toBe("1 mnt");
    expect(formatDurationId(83_000)).toBe("1 mnt 23 dtk");
  });
});

describe("sctZone", () => {
  it("is pink when accuracy is below 80%", () => {
    expect(sctZone({ timeMs: 1000, sctSeconds: 100, accuracy: 0.5 })).toBe("pink");
  });
  it("is blue within SCT", () => {
    expect(sctZone({ timeMs: 90_000, sctSeconds: 120, accuracy: 1 })).toBe("blue");
  });
  it("is yellow over SCT with good accuracy", () => {
    expect(sctZone({ timeMs: 130_000, sctSeconds: 120, accuracy: 0.9 })).toBe("yellow");
  });
  it("treats exactly-at-SCT as within", () => {
    expect(sctZone({ timeMs: 120_000, sctSeconds: 120, accuracy: 0.96 })).toBe("blue");
  });
});

describe("Indonesian date labels", () => {
  it("formatDateIdId renders an Indonesian date", () => {
    expect(formatDateIdId("2026-10-04")).toBe("4 Oktober 2026");
  });
});
