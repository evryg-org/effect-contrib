import { describe, expect, it } from "@effect/vitest"
import { Array } from "effect"
import { FastCheck as fc } from "effect/testing"
import { EdgeDropped, EdgeMaterialized, type EdgeOutcome, EdgeShape, EdgeTally } from "./EdgeTally.js"

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

const expectTallyEq = (a: EdgeTally, b: EdgeTally): void => {
  expect(tallyEq(a, b)).toBe(true)
}

const law = <Ts extends Array<unknown>>(suite: string, statement: string, property: fc.IProperty<Ts>): void => {
  describe(suite, () => {
    it(statement, () => fc.assert(property))
  })
}

// Small constant pools so generated tallies overlap — exercises commutativity/associativity meaningfully.
const arbShape: fc.Arbitrary<string> = fc.constantFrom("Alpha-[:LINKS]->Beta", "Beta-[:OWNS]->Gamma")

const arbOutcome: fc.Arbitrary<EdgeOutcome> = fc.oneof(
  arbShape.map((shape) => new EdgeMaterialized({ shape: EdgeShape.make(shape) })),
  arbShape.map((shape) => new EdgeDropped({ shape: EdgeShape.make(shape) }))
)

// Built only through EdgeTally.of — the same restriction production code lives under.
const arbTally: fc.Arbitrary<EdgeTally> = fc.array(arbOutcome).map(EdgeTally.of)

// Laws are stated against the exposed `EdgeTally.Reducer` instance, not the `combine` instance
// method it wraps -- proving the NATIVE surface consumers reach for (e.g. `.combineAll`) is lawful.
const op = (a: EdgeTally, b: EdgeTally): EdgeTally => EdgeTally.Reducer.combine(a, b)
const id = EdgeTally.Reducer.initialValue

law(
  "Associativity: EdgeTally.Reducer",
  "op(op(a, b), c) = op(a, op(b, c))",
  fc.property(arbTally, arbTally, arbTally, (a, b, c) => expectTallyEq(op(op(a, b), c), op(a, op(b, c))))
)
law("Left Identity: EdgeTally.Reducer", "op(id, a) = a", fc.property(arbTally, (a) => expectTallyEq(op(id, a), a)))
law("Right Identity: EdgeTally.Reducer", "op(a, id) = a", fc.property(arbTally, (a) => expectTallyEq(op(a, id), a)))
law(
  "Commutativity: EdgeTally.Reducer",
  "op(a, b) = op(b, a)",
  fc.property(arbTally, arbTally, (a, b) => expectTallyEq(op(a, b), op(b, a)))
)

law(
  "Homomorphism: EdgeTally.of is an accounting homomorphism",
  "h(opA(a, b)) = opB(h(a), h(b))",
  fc.property(
    fc.array(arbOutcome),
    fc.array(arbOutcome),
    (a, b) => expectTallyEq(EdgeTally.of(Array.appendAll(a, b)), EdgeTally.of(a).combine(EdgeTally.of(b)))
  )
)

law(
  "Homomorphism: opCount is a counting homomorphism into (number, +, 0)",
  "h(opA(a, b)) = opB(h(a), h(b))",
  fc.property(arbTally, arbTally, (a, b) => {
    expect(a.combine(b).opCount()).toBe(a.opCount() + b.opCount())
  })
)

describe("Identity-preserving: EdgeTally.of([]) is EdgeTally.empty", () => {
  it("h(idA) = idB", () => expectTallyEq(EdgeTally.of([]), EdgeTally.empty))
})

const nonNegative = (t: EdgeTally): boolean =>
  Array.every(Array.fromIterable(t.entries.values()), (count) => count.written >= 0 && count.dropped >= 0)

law(
  "Invariant Preservation: combine never produces a negative count",
  "∀s. inv(s) ⟹ ∀a. inv(step(s, a))",
  fc.property(arbTally, arbTally, (s, a) => {
    fc.pre(nonNegative(s))
    expect(nonNegative(s.combine(a))).toBe(true)
  })
)
