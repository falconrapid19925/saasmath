import { describe, expect, it } from "vitest";

import { normalizeHint } from "./hints";

describe("normalizeHint — part-whole", () => {
  it("accepts one unknown part", () => {
    const h = normalizeHint("part-whole", { total: 12, parts: [7, null], unit: "buah" });
    expect(h).toEqual({
      model: "part-whole",
      hint: { total: 12, parts: [7, null], unit: "buah", caption: undefined },
    });
  });

  it("accepts an unknown total", () => {
    expect(normalizeHint("part-whole", { total: null, parts: [7, 5] })).not.toBeNull();
  });

  it("rejects payloads without exactly one unknown", () => {
    expect(normalizeHint("part-whole", { total: 12, parts: [7, 5] })).toBeNull();
    expect(normalizeHint("part-whole", { total: null, parts: [7, null] })).toBeNull();
  });

  it("rejects malformed payloads", () => {
    expect(normalizeHint("part-whole", { total: "12", parts: [7, null] })).toBeNull();
    expect(normalizeHint("part-whole", { total: 12, parts: [7] })).toBeNull();
    expect(normalizeHint("part-whole", null)).toBeNull();
  });
});

describe("normalizeHint — comparison", () => {
  it("accepts 2-4 rows with one unknown", () => {
    const h = normalizeHint("comparison", {
      rows: [
        { label: "Budi", value: 24 },
        { label: "Ani", value: null },
      ],
      unit: "kelereng",
    });
    expect(h?.model).toBe("comparison");
    if (h?.model === "comparison") {
      expect(h.hint.rows[1]).toEqual({ label: "Ani", value: null });
    }
  });

  it("rejects rows without an unknown and out-of-range row counts", () => {
    expect(
      normalizeHint("comparison", {
        rows: [
          { label: "A", value: 1 },
          { label: "B", value: 2 },
        ],
      }),
    ).toBeNull();
    expect(
      normalizeHint("comparison", {
        rows: [{ label: "A", value: null }],
      }),
    ).toBeNull();
  });
});

describe("normalizeHint — fraction-bar", () => {
  it("accepts shaded or unknown shaded counts within range", () => {
    expect(normalizeHint("fraction-bar", { wholes: 2, partsPerWhole: 4, shadedParts: 3 })).not.toBeNull();
    expect(normalizeHint("fraction-bar", { wholes: 1, partsPerWhole: 4, shadedParts: null })).not.toBeNull();
  });

  it("rejects out-of-range geometry", () => {
    expect(normalizeHint("fraction-bar", { wholes: 5, partsPerWhole: 4, shadedParts: 1 })).toBeNull();
    expect(normalizeHint("fraction-bar", { wholes: 1, partsPerWhole: 0, shadedParts: 0 })).toBeNull();
    expect(normalizeHint("fraction-bar", { wholes: 1, partsPerWhole: 4, shadedParts: 9 })).toBeNull();
  });
});

describe("normalizeHint — number-line", () => {
  it("accepts marks with a draggable unknown", () => {
    const h = normalizeHint("number-line", {
      min: 0,
      max: 10,
      stepValue: 1,
      marks: [3, null, 7],
      majorEvery: 5,
      unit: "cm",
    });
    expect(h?.model).toBe("number-line");
    if (h?.model === "number-line") {
      expect(h.hint.majorEvery).toBe(5);
      expect(h.hint.marks).toEqual([3, null, 7]);
    }
  });

  it("rejects marks outside the range and impossible ticks", () => {
    expect(
      normalizeHint("number-line", { min: 0, max: 10, stepValue: 1, marks: [11] }),
    ).toBeNull();
    expect(
      normalizeHint("number-line", { min: 0, max: 10, stepValue: 0, marks: [1] }),
    ).toBeNull();
    expect(
      normalizeHint("number-line", { min: 5, max: 5, stepValue: 1, marks: [1] }),
    ).toBeNull();
  });
});

describe("normalizeHint — base-ten", () => {
  it("accepts blocks with an optional unknown place", () => {
    expect(
      normalizeHint("base-ten", {
        variant: "blocks",
        thousands: 0,
        hundreds: 2,
        tens: 3,
        ones: null as unknown as number,
      }),
    ).toBeNull(); // null ones count is not valid for blocks
    const h = normalizeHint("base-ten", {
      variant: "blocks",
      thousands: 1,
      hundreds: 2,
      tens: 3,
      ones: 4,
      unknown: "tens",
    });
    expect(h?.model).toBe("base-ten");
  });

  it("accepts arrays with exactly one unknown dimension", () => {
    expect(
      normalizeHint("base-ten", { variant: "array", rows: 4, cols: null }),
    ).toMatchObject({ model: "base-ten", hint: { variant: "array", rows: 4, cols: null } });
    expect(
      normalizeHint("base-ten", { variant: "array", rows: null, cols: null }),
    ).toBeNull();
    expect(
      normalizeHint("base-ten", { variant: "array", rows: 4, cols: 5 }),
    ).toBeNull();
  });

  it("rejects unknown variants", () => {
    expect(normalizeHint("base-ten", { variant: "money" })).toBeNull();
  });
});
