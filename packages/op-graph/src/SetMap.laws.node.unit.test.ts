import { expect } from "@effect/vitest"
import fc from "fast-check"
import { Equal } from "effect"
import { boundedSemilatticeLaws } from "@evryg/effect-algebraic-laws"
import { SetMap } from "./SetMap.js"

// SetMap is the MERGE-dedup carrier: keys accumulate, values union, re-applying is a no-op -- a
// BOUNDED JOIN-SEMILATTICE under (concat, empty). Small constant pools below so generated maps
// overlap, exercising idempotence/commutativity meaningfully.
const arbSetMap: fc.Arbitrary<SetMap> = fc
  .array(fc.tuple(fc.constantFrom("Class", "Method", "File"), fc.constantFrom("a", "b", "c", "d")))
  .map(SetMap.of)

boundedSemilatticeLaws({
  name: "SetMap-union (MERGE-dedup)",
  arb: arbSetMap,
  arbCtx: fc.constant(null),
  op: (a, b) => a.concat(b),
  id: SetMap.empty,
  eq: (a, b) => {
    expect(Equal.equals(a, b)).toBe(true)
  },
})
