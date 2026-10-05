import { describe, expect, it } from "vitest";

import { generatePlacementItems, placeFromResults, placementRungIndex, PLACEMENT_RUNGS, PLACEMENT_TOTAL_ITEMS } from "./placement";
import type { Item } from "./types";
import { verifyFamilyItem } from "../../../tests/helpers/verifyItem";

const ladder = generatePlacementItems(7);
const TOP_RUNG = PLACEMENT_RUNGS.length - 1;

/** Grade the ladder against its own verified answers. */
function correctFlags(items: Item[]): boolean[] {
  return items.map(() => true);
}

describe("placement ladder generation", () => {
  it("produces 20 items in 10 rungs of 2, ids encoding the rung", () => {
    expect(ladder.length).toBe(PLACEMENT_TOTAL_ITEMS);
    for (let rung = 0; rung < PLACEMENT_RUNGS.length; rung++) {
      const rungItems = ladder.filter((i) => placementRungIndex(i.id) === rung);
      expect(rungItems.length, `rung ${rung}`).toBe(2);
    }
    expect(placementRungIndex("placement-r9-1")).toBe(9);
    expect(placementRungIndex("placement-r10-0")).toBeNull();
    expect(placementRungIndex("mult-1")).toBeNull();
  });

  it("every item is family-correct (verified against its own numbers)", () => {
    for (const item of ladder) {
      const rung = placementRungIndex(item.id);
      expect(rung).not.toBeNull();
      verifyFamilyItem(PLACEMENT_RUNGS[rung as number]!.family, item);
    }
  });

  it("is deterministic in the seed and differs across seeds", () => {
    expect(JSON.stringify(generatePlacementItems(7))).toBe(JSON.stringify(ladder));
    expect(JSON.stringify(generatePlacementItems(8))).not.toBe(JSON.stringify(ladder));
  });
});

describe("placement stop rule and deliberate-low placement", () => {
  it("perfect run places at the top rung", () => {
    const outcome = placeFromResults(ladder, correctFlags(ladder));
    expect(outcome.placedSkillId).toBe(PLACEMENT_RUNGS[TOP_RUNG]!.skillId);
    expect(outcome.firstFailedRung).toBeNull();
    expect(outcome.rungsAttempted).toBe(PLACEMENT_RUNGS.length);
  });

  it("failing the first rung still places at the bottom rung", () => {
    const wrong = ladder.map(() => false);
    const outcome = placeFromResults(ladder, wrong);
    expect(outcome.placedSkillId).toBe(PLACEMENT_RUNGS[0]!.skillId);
    expect(outcome.lastPassedRung).toBe(0);
    expect(outcome.firstFailedRung).toBe(0);
    expect(outcome.note).toMatch(/bottom/);
  });

  it("failing mid-ladder places on the last cleanly passed rung", () => {
    // Pass rungs 0-4 (10 items), fail the first item of rung 5, junk after.
    const results = ladder.map((_, i) => i < 10);
    const outcome = placeFromResults(ladder, results);
    expect(outcome.lastPassedRung).toBe(4);
    expect(outcome.firstFailedRung).toBe(5);
    expect(outcome.placedSkillId).toBe(PLACEMENT_RUNGS[4]!.skillId);
    expect(outcome.placedStep).toBe(PLACEMENT_RUNGS[4]!.step);
    expect(outcome.note).toMatch(/deliberately low/);
  });

  it("ignores results after the stop rule fired", () => {
    const passToRung4 = ladder.map((_, i) => i < 10);
    const passToRung4ThenJunk = ladder.map((_, i) => i < 10 || (i >= 12 && i < 20));
    const a = placeFromResults(ladder, passToRung4);
    const b = placeFromResults(ladder, passToRung4ThenJunk);
    expect(a.placedSkillId).toBe(b.placedSkillId);
    expect(a.lastPassedRung).toBe(b.lastPassedRung);
  });

  it("a short results array treats the missing tail as wrong", () => {
    const firstTwelveCorrect = correctFlags(ladder).slice(0, 12);
    const outcome = placeFromResults(ladder, firstTwelveCorrect);
    expect(outcome.lastPassedRung).toBe(5);
    expect(outcome.firstFailedRung).toBe(6);
  });

  it("rejects foreign items and oversized result arrays", () => {
    expect(() =>
      placeFromResults([{ ...ladder[0]!, id: "other-1" }], [true]),
    ).toThrow(/non-placement/);
    expect(() => placeFromResults(ladder, correctFlags(ladder).concat([true]))).toThrow(
      /more results than items/,
    );
  });
});
