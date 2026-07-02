import { describe, it, expect } from "vitest";
import { evaluate } from "../src/index.js";
import { profile, OLD_AGE } from "./fixtures.js";

/**
 * Purity & determinism guarantees. The engine must have NO side effects, NO I/O,
 * and must never mutate its inputs. (PROJECT_BRIEF.md §2.1, §5: "pure function —
 * no I/O, no LLM, fully unit-testable".)
 */

/** Recursively freeze an object in place, returning it with its original type. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

describe("purity & determinism", () => {
  it("does not mutate the input profile or scheme (deep-frozen inputs)", () => {
    const p = deepFreeze(
      profile({ is_tamil_nadu: true, age: 70, monthly_income: 1000, income_tax_payer: false, govt_employee: false }),
    );
    const s = deepFreeze(structuredClone(OLD_AGE));

    // Would throw in strict mode if evaluate tried to mutate a frozen input.
    expect(() => evaluate(p, s)).not.toThrow();
    expect(evaluate(p, s).status).toBe("eligible");
  });

  it("is deterministic — identical inputs yield deep-equal verdicts", () => {
    const p = profile({ is_tamil_nadu: true, age: 70, monthly_income: 1000, income_tax_payer: false, govt_employee: false });
    const a = evaluate(p, OLD_AGE);
    const b = evaluate(p, OLD_AGE);
    expect(a).toEqual(b);
    expect(a).not.toBe(b); // a fresh object each call
  });

  it("leaves the profile object identical after evaluation", () => {
    const p = profile({ is_tamil_nadu: true, age: 70, monthly_income: 1000 });
    const snapshot = structuredClone(p);
    evaluate(p, OLD_AGE);
    expect(p).toEqual(snapshot);
  });

  it("source contains no I/O — evaluate.ts imports only @urimai/types", async () => {
    // Guards the invariant that the engine never reaches for a DB or the LLM.
    const fs = await import("node:fs");
    const url = await import("node:url");
    const path = new URL("../src/evaluate.ts", import.meta.url);
    const src = fs.readFileSync(url.fileURLToPath(path), "utf8");

    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports).toEqual(["@urimai/types"]);

    // belt-and-suspenders: no obvious I/O / LLM / clock / randomness tokens
    for (const banned of ["PrismaClient", "fetch(", "anthropic", "Anthropic", "Date.now", "Math.random", "process.env"]) {
      expect(src).not.toContain(banned);
    }
  });
});
