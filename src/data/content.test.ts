/**
 * Content property tests for the authored skill graph, shop catalogue, and
 * demo account (plan sections 3.3 and 5). Data-side only: engine generator
 * implementations land in parallel, so these tests import only the roster
 * union and the contract types — never a generator.
 */

import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { GENERATOR_FAMILY_IDS } from "../lib/engine/families";
import { GRADES, SHOP_ITEM_KINDS, STRANDS, skills } from "../db/schema";
import { DEMO_ACCOUNT } from "./demo-account";
import {
  SKILL_SPECS,
  UNIT_DEFS,
  FREE_ISLAND_SKILL_IDS,
  getSkillSpec,
  skillSpecToRow,
  stepMonotonicityIssues,
  STEP_PARAM_SCHEMAS,
} from "./skills/index";
import { SHOP_ITEM_SPECS, STARTER_AVATAR_ID } from "./shop-items";

const SPECS_BY_ID = new Map(SKILL_SPECS.map((skill) => [skill.id, skill]));

/** Kahn's algorithm over prerequisite edges; empty result means a cycle. */
function topologicalSkillIds(): string[] {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const skill of SKILL_SPECS) {
    inDegree.set(skill.id, skill.prereqIds.length);
    for (const prereqId of skill.prereqIds) {
      dependents.set(prereqId, [...(dependents.get(prereqId) ?? []), skill.id]);
    }
  }
  const queue = SKILL_SPECS.filter((skill) => (inDegree.get(skill.id) ?? 0) === 0)
    .map((skill) => skill.id);
  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    sorted.push(id);
    for (const dependent of dependents.get(id) ?? []) {
      const remaining = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, remaining);
      if (remaining === 0) queue.push(dependent);
    }
  }
  return sorted;
}

describe("skill graph shape", () => {
  it("has 40-60 skills total", () => {
    expect(SKILL_SPECS.length).toBeGreaterThanOrEqual(40);
    expect(SKILL_SPECS.length).toBeLessThanOrEqual(60);
  });

  it("covers every grade and every strand at least once", () => {
    for (const grade of GRADES) {
      for (const strand of STRANDS) {
        expect(
          SKILL_SPECS.some((skill) => skill.grade === grade && skill.strand === strand),
          `no skills for grade ${grade} strand ${strand}`,
        ).toBe(true);
      }
    }
  });

  it("has unique, well-formed ids matching each skill's grade", () => {
    const ids = new Set(SKILL_SPECS.map((skill) => skill.id));
    expect(ids.size).toBe(SKILL_SPECS.length);
    for (const skill of SKILL_SPECS) {
      expect(skill.id).toMatch(/^k[45]-[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(skill.id.startsWith(`k${skill.grade}-`)).toBe(true);
    }
  });

  it("uses only roster family ids, and every roster family is used", () => {
    for (const skill of SKILL_SPECS) {
      expect(GENERATOR_FAMILY_IDS as readonly string[]).toContain(skill.family);
    }
    for (const family of GENERATOR_FAMILY_IDS) {
      expect(
        SKILL_SPECS.some((skill) => skill.family === family),
        `no skill uses family ${family}`,
      ).toBe(true);
    }
  });

  it("maps each family to the expected strand", () => {
    const familyStrand: Record<string, string> = {
      addsub: "Bilangan",
      mult: "Bilangan",
      div: "Bilangan",
      placevalue: "Bilangan",
      factorsmultiples: "Bilangan",
      fractions: "Bilangan",
      decimals: "Bilangan",
      money: "Bilangan",
      wordproblems: "Bilangan",
      measurement: "Pengukuran",
      geometry: "Geometri",
      datareading: "Data",
    };
    for (const skill of SKILL_SPECS) {
      expect(familyStrand[skill.family], skill.id).toBe(skill.strand);
    }
  });

  it("has positive, sane SCT estimates", () => {
    for (const skill of SKILL_SPECS) {
      expect(skill.baseSctSecondsPerItem).toBeGreaterThanOrEqual(4);
      expect(skill.baseSctSecondsPerItem).toBeLessThanOrEqual(120);
    }
  });
});

describe("prerequisite graph", () => {
  it("resolves every prerequisite id (no dangling or self edges)", () => {
    for (const skill of SKILL_SPECS) {
      for (const prereqId of skill.prereqIds) {
        expect(SPECS_BY_ID.has(prereqId), `${skill.id} -> ${prereqId}`).toBe(true);
        expect(prereqId).not.toBe(skill.id);
      }
    }
  });

  it("is acyclic (Kahn's algorithm drains every node)", () => {
    const sorted = topologicalSkillIds();
    expect(sorted).toHaveLength(SKILL_SPECS.length);
  });

  it("never requires a kelas 5 skill from a kelas 4 skill within a strand", () => {
    for (const skill of SKILL_SPECS) {
      for (const prereqId of skill.prereqIds) {
        const prereq = getSkillSpec(prereqId);
        if (prereq.strand === skill.strand) {
          expect(prereq.grade, `${prereqId} -> ${skill.id}`).toBeLessThanOrEqual(skill.grade);
        }
      }
    }
  });

  it("orders each grade+strand topologically (prereqs come first)", () => {
    for (const skill of SKILL_SPECS) {
      for (const prereqId of skill.prereqIds) {
        const prereq = getSkillSpec(prereqId);
        if (prereq.grade === skill.grade && prereq.strand === skill.strand) {
          expect(prereq.orderIndex, `${prereqId} should precede ${skill.id}`).toBeLessThan(
            skill.orderIndex,
          );
        }
      }
    }
    for (const grade of GRADES) {
      for (const strand of STRANDS) {
        const indices = SKILL_SPECS.filter(
          (skill) => skill.grade === grade && skill.strand === strand,
        ).map((skill) => skill.orderIndex);
        expect(new Set(indices).size).toBe(indices.length);
      }
    }
  });
});

describe("difficulty steps", () => {
  it("gives every skill 3-6 sequentially numbered steps", () => {
    for (const skill of SKILL_SPECS) {
      expect(skill.steps.length, skill.id).toBeGreaterThanOrEqual(3);
      expect(skill.steps.length, skill.id).toBeLessThanOrEqual(6);
      skill.steps.forEach((step, index) => {
        expect(step.step, `${skill.id} step index ${index}`).toBe(index + 1);
      });
    }
  });

  it("validates every authored step against its family schema", () => {
    for (const skill of SKILL_SPECS) {
      const schema = STEP_PARAM_SCHEMAS[skill.family];
      for (const step of skill.steps) {
        const result = schema.safeParse(step.params);
        expect(
          result.success,
          `${skill.id} step ${step.step}: ${result.success ? "" : JSON.stringify(result.error.issues)}`,
        ).toBe(true);
      }
    }
  });

  it("raises difficulty monotonically across every skill's steps", () => {
    for (const skill of SKILL_SPECS) {
      expect(stepMonotonicityIssues(skill.family, skill.steps), skill.id).toEqual([]);
    }
  });

  it("keeps every set within the 4-20 item contract", () => {
    for (const skill of SKILL_SPECS) {
      for (const step of skill.steps) {
        const itemCount = step.params.itemCount as number;
        expect(itemCount, `${skill.id} step ${step.step}`).toBeGreaterThanOrEqual(4);
        expect(itemCount, `${skill.id} step ${step.step}`).toBeLessThanOrEqual(20);
      }
    }
  });
});

describe("stepMonotonicityIssues checker itself", () => {
  const toSteps = (ladders: Record<string, unknown>[]) =>
    ladders.map((params, index) => ({ step: index + 1, params }));

  it("accepts a valid addsub ladder", () => {
    const issues = stepMonotonicityIssues(
      "addsub",
      toSteps([
        { itemCount: 10, min: 10, max: 99, operation: "add", regroup: false },
        { itemCount: 12, min: 10, max: 999, operation: "mixed", regroup: true },
      ]),
    );
    expect(issues).toEqual([]);
  });

  it("rejects a shrinking number range", () => {
    const issues = stepMonotonicityIssues(
      "addsub",
      toSteps([
        { itemCount: 10, min: 10, max: 999, operation: "add", regroup: false },
        { itemCount: 10, min: 10, max: 99, operation: "add", regroup: false },
      ]),
    );
    expect(issues.join(" ")).toMatch(/max must not decrease/);
  });

  it("rejects regroup flipping true -> false", () => {
    const issues = stepMonotonicityIssues(
      "addsub",
      toSteps([
        { itemCount: 10, min: 10, max: 999, operation: "add", regroup: true },
        { itemCount: 10, min: 10, max: 999, operation: "add", regroup: false },
      ]),
    );
    expect(issues.join(" ")).toMatch(/regroup must not go true -> false/);
  });

  it("rejects a denominators set that drops a value", () => {
    const issues = stepMonotonicityIssues(
      "fractions",
      toSteps([
        { itemCount: 10, mode: "add", sameDen: true, denominators: [2, 3, 4] },
        { itemCount: 10, mode: "add", sameDen: true, denominators: [2, 4] },
      ]),
    );
    expect(issues.join(" ")).toMatch(/denominators set must only grow/);
  });

  it("rejects an operation going backwards", () => {
    const issues = stepMonotonicityIssues(
      "addsub",
      toSteps([
        { itemCount: 10, min: 10, max: 99, operation: "mixed", regroup: false },
        { itemCount: 10, min: 10, max: 99, operation: "add", regroup: false },
      ]),
    );
    expect(issues.join(" ")).toMatch(/operation must not decrease/);
  });
});

describe("free island (plan section 5)", () => {
  it("has 8-10 skills", () => {
    expect(FREE_ISLAND_SKILL_IDS.length).toBeGreaterThanOrEqual(8);
    expect(FREE_ISLAND_SKILL_IDS.length).toBeLessThanOrEqual(10);
  });

  it("equals the first two units of the kelas-4 Bilangan strand", () => {
    const firstTwoUnits = UNIT_DEFS.filter(
      (unit) => unit.grade === 4 && unit.strand === "Bilangan" && unit.unit <= 2,
    ).flatMap((unit) => unit.skillIds);
    expect(new Set(FREE_ISLAND_SKILL_IDS)).toEqual(new Set(firstTwoUnits));
  });

  it("contains only kelas-4 Bilangan skills", () => {
    for (const id of FREE_ISLAND_SKILL_IDS) {
      const skill = getSkillSpec(id);
      expect(skill.grade).toBe(4);
      expect(skill.strand).toBe("Bilangan");
    }
  });

  it("is self-contained: every free skill's prerequisites are also free", () => {
    const freeSet = new Set(FREE_ISLAND_SKILL_IDS);
    for (const id of FREE_ISLAND_SKILL_IDS) {
      for (const prereqId of getSkillSpec(id).prereqIds) {
        expect(freeSet.has(prereqId), `${id} requires paid skill ${prereqId}`).toBe(true);
      }
    }
  });
});

describe("CPA hint layer (plan sections 3.2 and 5)", () => {
  const ALL_HINT_MODELS = ["part-whole", "comparison", "fraction-bar", "number-line", "base-ten"];

  it("covers 6-8 launch skills", () => {
    const cpaSkills = SKILL_SPECS.filter((skill) => skill.cpaModels.length > 0);
    expect(cpaSkills.length).toBeGreaterThanOrEqual(6);
    expect(cpaSkills.length).toBeLessThanOrEqual(8);
  });

  it("uses valid hint models, at most two per skill", () => {
    for (const skill of SKILL_SPECS) {
      expect(skill.cpaModels.length).toBeLessThanOrEqual(2);
      for (const model of skill.cpaModels) {
        expect(ALL_HINT_MODELS, `${skill.id}: ${model}`).toContain(model);
      }
      expect(new Set(skill.cpaModels).size).toBe(skill.cpaModels.length);
    }
  });

  it("sits on launch-core skills (kelas 4, or kelas 5 fractions)", () => {
    for (const skill of SKILL_SPECS) {
      if (skill.cpaModels.length === 0) continue;
      const launchCore =
        skill.grade === 4 || (skill.grade === 5 && skill.family === "fractions");
      expect(launchCore, `${skill.id} is outside the launch core`).toBe(true);
    }
  });

  it("uses the three launch models: part-whole bar, fraction bar, number line", () => {
    const used = new Set(
      SKILL_SPECS.flatMap((skill) => skill.cpaModels),
    );
    for (const model of ["part-whole", "fraction-bar", "number-line"] as const) {
      expect(used.has(model), `no launch CPA skill uses ${model}`).toBe(true);
    }
  });
});

describe("unit layout", () => {
  it("partitions every skill into exactly one unit with matching metadata", () => {
    const listed = UNIT_DEFS.flatMap((unit) => unit.skillIds);
    expect(new Set(listed).size).toBe(listed.length);
    expect(new Set(listed)).toEqual(new Set(SKILL_SPECS.map((skill) => skill.id)));
    for (const unit of UNIT_DEFS) {
      expect(unit.skillIds.length).toBeGreaterThanOrEqual(1);
      for (const id of unit.skillIds) {
        const skill = getSkillSpec(id);
        expect(skill.grade).toBe(unit.grade);
        expect(skill.strand).toBe(unit.strand);
        expect(skill.unit).toBe(unit.unit);
      }
    }
  });
});

describe("skillSpecToRow mapping", () => {
  it("produces exactly the skills-table columns", () => {
    const columnNames = Object.keys(getTableColumns(skills)).sort();
    for (const spec of SKILL_SPECS.slice(0, 3)) {
      expect(Object.keys(skillSpecToRow(spec)).sort()).toEqual(columnNames);
    }
  });

  it("preserves the authored content", () => {
    const spec = getSkillSpec("k4-mult-facts");
    const row = skillSpecToRow(spec);
    expect(row.family).toBe("mult");
    expect(row.steps).toEqual(spec.steps);
    expect(row.cpaModels).toContain("number-line");
  });
});

describe("shop catalogue", () => {
  it("offers a dozen items with unique ids and valid kinds", () => {
    expect(SHOP_ITEM_SPECS).toHaveLength(12);
    const ids = new Set(SHOP_ITEM_SPECS.map((item) => item.id));
    expect(ids.size).toBe(12);
    for (const item of SHOP_ITEM_SPECS) {
      expect(SHOP_ITEM_KINDS as readonly string[]).toContain(item.kind);
      expect(item.nameId.length).toBeGreaterThan(0);
    }
  });

  it("prices everything cheaply and keeps exactly one free starter avatar", () => {
    const free = SHOP_ITEM_SPECS.filter((item) => item.priceStars === 0);
    expect(free).toHaveLength(1);
    expect(free[0]?.id).toBe(STARTER_AVATAR_ID);
    expect(free[0]?.kind).toBe("avatar");
    for (const item of SHOP_ITEM_SPECS) {
      expect(item.priceStars).toBeGreaterThanOrEqual(0);
      expect(item.priceStars).toBeLessThanOrEqual(200);
    }
  });

  it("gives avatars an emoji and rooms a color", () => {
    for (const item of SHOP_ITEM_SPECS) {
      if (item.kind === "avatar") {
        expect(item.emojiOrColor.emoji, item.id).toBeTruthy();
        expect(item.emojiOrColor.color, item.id).toBeUndefined();
      } else {
        expect(item.emojiOrColor.color, item.id).toMatch(/^#[0-9a-f]{6}$/);
        expect(item.emojiOrColor.emoji, item.id).toBeUndefined();
      }
    }
  });
});

describe("demo account", () => {
  it("uses the demo@saasmath.id parent email with a usable password", () => {
    expect(DEMO_ACCOUNT.parent.email).toBe("demo@saasmath.id");
    expect(DEMO_ACCOUNT.parent.password.length).toBeGreaterThanOrEqual(8);
  });

  it("has a kelas-4 child with a 6-digit PIN", () => {
    expect(DEMO_ACCOUNT.child.grade).toBe(4);
    expect(DEMO_ACCOUNT.child.pin).toMatch(/^\d{6}$/);
  });

  it("references distinct, valid UUIDs", () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(DEMO_ACCOUNT.parent.id).toMatch(uuidPattern);
    expect(DEMO_ACCOUNT.child.id).toMatch(uuidPattern);
    expect(DEMO_ACCOUNT.parent.id).not.toBe(DEMO_ACCOUNT.child.id);
  });

  it("grants a shop item that exists and a positive star balance", () => {
    expect(
      SHOP_ITEM_SPECS.some((item) => item.id === DEMO_ACCOUNT.child.avatarItemId),
    ).toBe(true);
    expect(DEMO_ACCOUNT.child.startingStars).toBeGreaterThan(0);
  });
});
