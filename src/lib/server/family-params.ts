/**
 * Bridge between the authored content params (src/data/skills/params.ts —
 * zod strictObject schemas keyed by `mode`/`minA`/`maxA`/`allowRemainder`/…)
 * and the generator families' param convention (src/lib/engine/families-*.ts
 * headers — keyed by `kinds`/`tablesMax`/`dividendMax`/…).
 *
 * Without this translation the authored params never reach the generators:
 * families miss their expected keys and silently fall back to defaults,
 * serving wrong-level and off-topic items (reviewer probe: k4-div-remainder
 * served 0 remainder items, k4-mult-2x1 served 1x1 tables, …).
 *
 * Pure and deterministic: (family, authored params) -> engine params. The
 * families keep their own defaults for anything the authored schema does not
 * express (documented per family below); no family-internal key is invented.
 */

import type { GeneratorFamilyId } from "@/lib/engine/families";

type Params = Record<string, unknown>;

const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

/** Clamp a value into [lo, hi] (families throw outside their own bounds). */
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function engineParamsFor(family: GeneratorFamilyId, authored: Params): Params {
  switch (family) {
    // -----------------------------------------------------------------------
    case "addsub": {
      // Authored {itemCount, min, max, operation, regroup, missingPosition?}.
      // Engine reads {itemCount, min, max, kinds, regroup, missingPosition}:
      // `min` floors both operands (the engine never serves 0) and
      // missingPosition selects the result form (a + b = ...) or the operand
      // form (... + b = c / a - ... = c).
      const operation = str(authored.operation) ?? "add";
      return {
        itemCount: authored.itemCount,
        min: num(authored.min) ?? 1,
        max: authored.max,
        kinds: operation === "mixed" ? ["add", "sub"] : [operation],
        regroup: bool(authored.regroup) ?? false,
        missingPosition: str(authored.missingPosition) ?? "result",
      };
    }

    // -----------------------------------------------------------------------
    case "mult": {
      // Authored {itemCount, minA, maxA, minB, maxB, missingPosition?}.
      // Engine reads {itemCount, kinds, aMin/aMax/bMin/bMax, missingPosition}:
      // the ranges pass through verbatim and bound the operands; the kind
      // only picks the CPA model (both ≤ 12 -> tables + tablesMax; maxB ≤ 9
      // -> 2x1; else 2x2). Tables operands are floored at 2 (multiplication
      // tables).
      const minA = num(authored.minA) ?? 2;
      const maxA = num(authored.maxA) ?? 9;
      const minB = num(authored.minB) ?? 2;
      const maxB = num(authored.maxB) ?? 9;
      const missingPosition = str(authored.missingPosition) ?? "result";
      if (maxA <= 12 && maxB <= 12) {
        return {
          itemCount: authored.itemCount,
          kinds: ["tables"],
          tablesMax: clamp(Math.max(maxA, maxB), 2, 12),
          aMin: clamp(minA, 2, 12),
          aMax: clamp(maxA, 2, 12),
          bMin: clamp(minB, 2, 12),
          bMax: clamp(maxB, 2, 12),
          missingPosition,
        };
      }
      return {
        itemCount: authored.itemCount,
        kinds: [maxB <= 9 ? "2x1" : "2x2"],
        aMin: minA,
        aMax: maxA,
        bMin: minB,
        bMax: maxB,
        missingPosition,
      };
    }

    // -----------------------------------------------------------------------
    case "div": {
      // Authored {itemCount, minDividend, maxDividend, minDivisor,
      // maxDivisor, allowRemainder}. allowRemainder selects the kind; the
      // ranges map 1:1 (dividend into [dividendMin, dividendMax], divisor
      // into [divisorMin, divisorMax], floored at 2 by the engine).
      return {
        itemCount: authored.itemCount,
        kinds: [bool(authored.allowRemainder) ? "remainder" : "quotient"],
        dividendMin: num(authored.minDividend) ?? 0,
        dividendMax: authored.maxDividend,
        divisorMin: num(authored.minDivisor) ?? 2,
        divisorMax: authored.maxDivisor,
      };
    }

    // -----------------------------------------------------------------------
    case "placevalue": {
      // Authored {itemCount, max, mode, roundTo?, descending?} ->
      // engine kinds digitValue|compose|compare|order|round (+roundTo).
      // identify -> digitValue; compose/decompose -> compose (the engine's
      // single expanded-form kind); round -> the engine's round kind.
      const mode = str(authored.mode) ?? "identify";
      const kinds: string[] =
        mode === "identify"
          ? ["digitValue"]
          : mode === "compose" || mode === "decompose"
            ? ["compose"]
            : mode === "compare"
              ? ["compare"]
              : mode === "order"
                ? ["order"]
                : ["round"];
      const out: Params = { itemCount: authored.itemCount, max: authored.max, kinds };
      if (mode === "round") out.roundTo = num(authored.roundTo) ?? 100;
      return out;
    }

    // -----------------------------------------------------------------------
    case "factorsmultiples": {
      // Authored {itemCount, max, mode, op?, factorMax?} -> engine kinds +
      // optional max ceiling. pattern maps to the geometric sequence kinds
      // (op "x" -> patternX, op "div" -> patternDiv, default "x") with
      // factorMax bounding the ratio.
      const mode = str(authored.mode) ?? "multiples";
      const kinds: string[] =
        mode === "factors"
          ? ["faktor"]
          : mode === "kpk"
            ? ["kpk"]
            : mode === "fpb"
              ? ["fpb"]
              : mode === "pattern"
                ? [(str(authored.op) ?? "x") === "div" ? "patternDiv" : "patternX"]
                : ["kelipatan", "kelipatanSeq"];
      const out: Params = { itemCount: authored.itemCount, max: authored.max, kinds };
      const factorMax = num(authored.factorMax);
      if (factorMax !== undefined) out.factorMax = factorMax;
      return out;
    }

    // -----------------------------------------------------------------------
    case "fractions": {
      // Authored {itemCount, mode, sameDen, denominators, requireSimplify?,
      // maxWhole?} -> engine kinds + maxDen + the same-named passthroughs.
      // identify -> compare (the engine's no-arithmetic fraction kind); order
      // -> compare (single-item comparisons; no sort kind). add/sub split on
      // sameDen; maxDen = largest authored; denominators bound the engine's
      // draws to the authored penyebut set (values above the maxDen cap of 24
      // are unreachable and drop out); maxWhole bounds the whole operand of
      // mult/div; requireSimplify forces simplified canonical answers.
      const mode = str(authored.mode) ?? "compare";
      const sameDen = bool(authored.sameDen) ?? true;
      const denominators = Array.isArray(authored.denominators)
        ? (authored.denominators as unknown[]).filter(num).map(Number)
        : [];
      const kinds: string[] =
        mode === "add"
          ? [sameDen ? "addSame" : "addDiff"]
          : mode === "sub"
            ? [sameDen ? "subSame" : "subDiff"]
            : mode === "mult"
              ? ["multWhole"]
              : mode === "div"
                ? ["divWhole"]
                : mode === "equivalent"
                  ? ["equivalent"]
                  : ["compare"];
      const maxDen = Math.max(4, ...denominators, 4);
      const out: Params = { itemCount: authored.itemCount, kinds, maxDen: clamp(maxDen, 4, 24) };
      const allowed = denominators.filter((d) => d >= 2 && d <= 24);
      if (allowed.length > 0) out.denominators = allowed;
      const maxWhole = num(authored.maxWhole);
      if (maxWhole !== undefined) out.maxWhole = clamp(maxWhole, 2, 20);
      if (bool(authored.requireSimplify) === true) out.requireSimplify = true;
      return out;
    }

    // -----------------------------------------------------------------------
    case "decimals": {
      // Authored {itemCount, mode, places, max?, denominators?, descending?}
      // -> engine kinds + optional places + optional scaled-units cap.
      // read/convert -> fromFraction; order -> compare (no sort kind).
      const mode = str(authored.mode) ?? "read";
      const kinds: string[] =
        mode === "add"
          ? ["add"]
          : mode === "sub"
            ? ["sub"]
            : mode === "compare" || mode === "order"
              ? ["compare"]
              : ["fromFraction"]; // read | convert
      const out: Params = { itemCount: authored.itemCount, kinds };
      const places = num(authored.places);
      if (places === 1 || places === 2) out.places = places;
      const max = num(authored.max);
      if (max !== undefined && max >= 10) out.maxUnits = max; // below 10: engine default cap is already >= the range
      return out;
    }

    // -----------------------------------------------------------------------
    case "money": {
      // Authored {itemCount, mode, max} -> engine kinds + maxTotal + step.
      // count -> add (summing amounts is the engine's closest kind). The
      // engine needs maxTotal >= 40 * step, so the step shrinks for small
      // authored maxima (amounts stay plausible whole-rupiah values).
      const mode = str(authored.mode) ?? "add";
      const kinds: string[] =
        mode === "sub" ? ["sub"] : mode === "change" ? ["change"] : ["add"]; // add | count
      const maxTotal = clamp(num(authored.max) ?? 100000, 4000, 10_000_000);
      const step = Math.max(100, Math.floor(Math.min(500, maxTotal / 40) / 100) * 100);
      return { itemCount: authored.itemCount, kinds, maxTotal, step };
    }

    // -----------------------------------------------------------------------
    case "measurement": {
      // Authored {itemCount, mode, max, units?, direction?, shape?,
      // withCarry?} -> engine conversion kinds by units pair + direction.
      // keliling/luas pick the shape kind by authored shape (rectangle
      // default; triangle and polygon have their own kinds — polygon luas
      // has no honest SD-level generator and falls back to the rectangle
      // kind).
      const mode = str(authored.mode) ?? "convert";
      if (mode === "keliling") {
        const shape = str(authored.shape) ?? "rectangle";
        return {
          itemCount: authored.itemCount,
          kinds: [
            shape === "triangle"
              ? "kelilingTriangle"
              : shape === "polygon"
                ? "kelilingPolygon"
                : "keliling",
          ],
        };
      }
      if (mode === "luas") {
        const shape = str(authored.shape) ?? "rectangle";
        return {
          itemCount: authored.itemCount,
          kinds: [shape === "triangle" ? "luasTriangle" : "luas"],
        };
      }
      if (mode === "duration") {
        // units [menit, jam]. withCarry (menit melewati 60 — menyimpan)
        // selects the compound-to-minutes carry kind ("2 jam 15 menit =
        // ... menit"); without it, direction picks menit->jam (toLarger) or
        // jam->menit (toSmaller/mixed).
        if (bool(authored.withCarry)) {
          return { itemCount: authored.itemCount, kinds: ["jamMenitCarry"] };
        }
        const direction = str(authored.direction) ?? "toLarger";
        return {
          itemCount: authored.itemCount,
          kinds: [direction === "toLarger" ? "menitToJam" : "jamToMenit"],
        };
      }
      const units = Array.isArray(authored.units)
        ? (authored.units as unknown[]).map(str).filter((u): u is string => !!u)
        : [];
      const pair = units.join("|");
      const direction = str(authored.direction) ?? "mixed";
      const smaller = pair === "g|kg" ? ["kgToG"] : pair === "mm|cm" ? ["mmToCm"] : ["mToCm"];
      const larger = pair === "cm|m" ? ["cmToM"] : pair === "g|kg" ? ["gToKg"] : smaller;
      const kinds =
        direction === "toSmaller" ? smaller : direction === "toLarger" ? larger : [...new Set([...smaller, ...larger])];
      return { itemCount: authored.itemCount, kinds };
    }

    // -----------------------------------------------------------------------
    case "geometry": {
      // Authored {itemCount, mode, max, shapes?, pieces?, angleTask?,
      // sumTo?} -> engine kinds. compose maps to the engine's compose kind
      // with pieces/max passed through; angleTask picks classify (angleType),
      // complement (siku-siku, 90°) or supplement (berpelurus, 180°).
      const mode = str(authored.mode) ?? "properties";
      if (mode === "angles") {
        const task = str(authored.angleTask) ?? "classify";
        const kind = task === "supplement" ? "supplement" : task === "complement" ? "complement" : "angleType";
        return { itemCount: authored.itemCount, kinds: [kind] };
      }
      if (mode === "compose") {
        return {
          itemCount: authored.itemCount,
          kinds: ["compose"],
          pieces: clamp(num(authored.pieces) ?? 2, 1, 12),
          max: clamp(num(authored.max) ?? 100, 4, 1_000_000),
        };
      }
      return { itemCount: authored.itemCount, kinds: ["sides", "corners"] }; // properties
    }

    // -----------------------------------------------------------------------
    case "datareading": {
      // Authored {itemCount, mode, task, maxRows, maxScale, maxTotal} ->
      // engine {kinds, rows, maxValue}. table/pictogram/bar all use the
      // engine's single (text-table) modality; the task picks the question.
      const task = str(authored.task) ?? "read";
      const kinds: string[] =
        task === "total" ? ["sum"] : task === "compare" || task === "difference" ? ["diff"] : ["read"];
      return {
        itemCount: authored.itemCount,
        kinds,
        rows: clamp(num(authored.maxRows) ?? 3, 2, 5),
        maxValue: clamp(num(authored.maxTotal) ?? 30, 5 + 5, 1_000_000),
      };
    }

    // -----------------------------------------------------------------------
    case "wordproblems": {
      // Authored {itemCount, max, steps, operations} -> engine kinds per
      // operation (add -> total, sub -> difference, mult -> groups,
      // div -> share). steps: 2 has no engine kind (single-step templates).
      const operations = Array.isArray(authored.operations)
        ? (authored.operations as unknown[]).map(str).filter((o): o is string => !!o)
        : [];
      const byOp: Record<string, string> = {
        add: "total",
        sub: "difference",
        mult: "groups",
        div: "share",
      };
      const kinds = [...new Set(operations.map((op) => byOp[op] ?? "total"))];
      return {
        itemCount: authored.itemCount,
        kinds,
        max: authored.max,
        moneyMax: 100000,
        moneyStep: 500,
      };
    }
  }
}
