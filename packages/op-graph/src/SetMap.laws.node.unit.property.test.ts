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

// Laws are stated against the exposed `SetMap.Reducer` instance itself, not the `concat`
// instance method it wraps -- proving the NATIVE surface consumers reach for is lawful.
boundedSemilatticeLaws({
  name: "SetMap.Reducer (MERGE-dedup)",
  arb: arbSetMap,
  arbCtx: fc.constant(null),
  op: (a, b) => SetMap.Reducer.combine(a, b),
  id: SetMap.Reducer.initialValue,
  eq: (a, b) => {
    expect(Equal.equals(a, b)).toBe(true)
  },
})

// The product reducer is a per-key struct fold over SetMap.Reducer -- same bounded
// join-semilattice laws, one dimension up, for a fixed two-key record shape.
const productReducer = SetMap.makeProductReducer(["x", "y"] as const)

const arbProduct: fc.Arbitrary<Record<"x" | "y", SetMap>> = fc.tuple(arbSetMap, arbSetMap).map(([x, y]) => ({ x, y }))

boundedSemilatticeLaws({
  name: "SetMap.makeProductReducer (per-key MERGE-dedup)",
  arb: arbProduct,
  arbCtx: fc.constant(null),
  op: (a, b) => productReducer.combine(a, b),
  id: productReducer.initialValue,
  eq: (a, b) => {
    expect(Equal.equals(a.x, b.x)).toBe(true)
    expect(Equal.equals(a.y, b.y)).toBe(true)
  },
})
