import { expect } from "@effect/vitest"
import fc from "fast-check"
import { Array } from "effect"
import { commutativeMonoidLaws, homomorphismLaw, identityPreservingLaw, invariantPreservationLaw } from "@evryg/effect-algebraic-laws"
import { EdgeDropped, EdgeMaterialized, EdgeShape, EdgeTally, type EdgeOutcome } from "./EdgeTally.js"

// EdgeTally is a COUNTER, not a dedup carrier like SetMap: combine adds, so it is a commutative
// monoid but not idempotent (combining a tally with itself doubles every count).

const tallyEq = (a: EdgeTally, b: EdgeTally): boolean => {
  const shapes = Array.union(a.entries.keys(), b.entries.keys())
  return Array.every(shapes, (shape) => {
    const ca = a.entries.get(shape) ?? { written: 0, dropped: 0 }
    const cb = b.entries.get(shape) ?? { written: 0, dropped: 0 }
    return ca.written === cb.written && ca.dropped === cb.dropped
  })
}

// Small constant pools so generated tallies overlap — exercises commutativity/associativity meaningfully.
const arbShape: fc.Arbitrary<string> = fc.constantFrom("Alpha-[:LINKS]->Beta", "Beta-[:OWNS]->Gamma")

const arbOutcome: fc.Arbitrary<EdgeOutcome> = fc.oneof(
  arbShape.map((shape) => new EdgeMaterialized({ shape: EdgeShape.make(shape) })),
  arbShape.map((shape) => new EdgeDropped({ shape: EdgeShape.make(shape) })),
)

// Built only through EdgeTally.of — the same restriction production code lives under.
const arbTally: fc.Arbitrary<EdgeTally> = fc.array(arbOutcome).map(EdgeTally.of)

commutativeMonoidLaws({
  name: "EdgeTally-combine",
  arb: arbTally,
  arbCtx: fc.constant(null),
  op: (a, b) => a.combine(b),
  id: EdgeTally.empty,
  eq: (a, b) => {
    expect(tallyEq(a, b)).toBe(true)
  },
})

homomorphismLaw({
  name: "EdgeTally.of is an accounting homomorphism",
  arb: fc.array(arbOutcome),
  arbCtx: fc.constant(null),
  h: EdgeTally.of,
  opA: (a, b) => Array.appendAll(a, b),
  opB: (a, b) => a.combine(b),
  eq: (a, b) => {
    expect(tallyEq(a, b)).toBe(true)
  },
})

homomorphismLaw({
  name: "opCount is a counting homomorphism into (number, +, 0)",
  arb: arbTally,
  arbCtx: fc.constant(null),
  h: (t) => t.opCount(),
  opA: (a, b) => a.combine(b),
  opB: (a, b) => a + b,
  eq: (a, b) => {
    expect(a).toBe(b)
  },
})

identityPreservingLaw({
  name: "EdgeTally.of([]) is EdgeTally.empty",
  arbCtx: fc.constant(null),
  h: EdgeTally.of,
  idA: [],
  idB: EdgeTally.empty,
  eq: (a, b) => {
    expect(tallyEq(a, b)).toBe(true)
  },
})

invariantPreservationLaw({
  name: "combine never produces a negative count",
  arbState: arbTally,
  arbAction: arbTally,
  inv: (t) => Array.every(Array.fromIterable(t.entries.values()), (count) => count.written >= 0 && count.dropped >= 0),
  step: (s, a) => s.combine(a),
})
