import { expect } from "@effect/vitest"
import fc from "fast-check"
import { boundedSemilatticeLaws } from "@evryg/effect-algebraic-laws"
import { SetMap } from "./SetMap.js"

// SetMap is the MERGE-dedup carrier: keys accumulate, values union, re-applying is a no-op. That makes
// it a BOUNDED JOIN-SEMILATTICE under (concat, empty) — idempotent, commutative, associative, identity.
// This is the algebra the append-only graph rests on: materializing the same fact twice (or in either
// order, across two runs) collapses to one node. Proving the law here keeps that guarantee honest and
// generic — the partition policy that decides WHICH key a fact merges on lives in the app.

const structuralEq = (a: SetMap, b: SetMap): boolean => {
  const keys = new Set([...a.keys(), ...b.keys()])
  for (const k of keys) {
    const sa = a.get(k) ?? new Set<string>()
    const sb = b.get(k) ?? new Set<string>()
    if (sa.size !== sb.size || [...sa].some((v) => !sb.has(v))) return false
  }
  return true
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
