import { expect } from "@effect/vitest"
import fc from "fast-check"
import { Array } from "effect"
import { boundedSemilatticeLaws } from "@evryg/effect-algebraic-laws"
import { SetMap } from "./SetMap.js"

// SetMap is the MERGE-dedup carrier: keys accumulate, values union, re-applying is a no-op -- a
// BOUNDED JOIN-SEMILATTICE under (concat, empty). This is the algebra the append-only graph rests
// on: materializing the same fact twice, in either order, collapses to one node.

const structuralEq = (a: SetMap, b: SetMap): boolean => {
  const keys = Array.fromIterable(new Set([...a.keys(), ...b.keys()]))
  return Array.every(keys, (k) => {
    const sa = a.get(k) ?? new Set<string>()
    const sb = b.get(k) ?? new Set<string>()
    return sa.size === sb.size && !Array.fromIterable(sa).some((v) => !sb.has(v))
  })
}

// Small constant pools so generated maps overlap — exercises idempotence/commutativity meaningfully.
const arbSetMap: fc.Arbitrary<SetMap> = fc
  .array(fc.tuple(fc.constantFrom("Class", "Method", "File"), fc.constantFrom("a", "b", "c", "d")))
  .map(SetMap.of)

boundedSemilatticeLaws({
  name: "SetMap-union (MERGE-dedup)",
  arb: arbSetMap,
  arbCtx: fc.constant(null),
  op: SetMap.concat,
  id: SetMap.empty,
  eq: (a, b) => {
    expect(structuralEq(a, b)).toBe(true)
  },
})
