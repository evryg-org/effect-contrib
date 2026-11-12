import { describe, expect, it, type Vitest } from "@effect/vitest"
import { Arbitrary, Array, Schema } from "effect"
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

const law = <const Arbs extends Vitest.Arbitraries>(
  suite: string,
  statement: string,
  arbitraries: Arbs,
  property: (values: { [K in keyof Arbs]: Vitest.ArbitraryValue<Arbs[K]> }) => void
): void => {
  describe(suite, () => {
    it.prop(statement, arbitraries, property)
  })
}

// Small constant pools so generated tallies overlap — exercises commutativity/associativity meaningfully.
const arbShape: Arbitrary.Arbitrary<string> = Arbitrary.schema(
  Schema.Literals(["Alpha-[:LINKS]->Beta", "Beta-[:OWNS]->Gamma"])
)

// Each shape is as likely to be written as dropped.
const arbOutcome: Arbitrary.Arbitrary<EdgeOutcome> = Arbitrary.all([arbShape, Arbitrary.schema(Schema.Boolean)]).pipe(
  Arbitrary.map(([shape, written]): EdgeOutcome =>
    written
      ? new EdgeMaterialized({ shape: EdgeShape.make(shape) })
      : new EdgeDropped({ shape: EdgeShape.make(shape) })
  )
)

const arbOutcomes = Arbitrary.array(arbOutcome)

// Built only through EdgeTally.of — the same restriction production code lives under.
const arbTally: Arbitrary.Arbitrary<EdgeTally> = arbOutcomes.pipe(Arbitrary.map(EdgeTally.of))

// Laws are stated against the exposed `EdgeTally.Reducer` instance, not the `combine` instance
// method it wraps -- proving the NATIVE surface consumers reach for (e.g. `.combineAll`) is lawful.
const op = (a: EdgeTally, b: EdgeTally): EdgeTally => EdgeTally.Reducer.combine(a, b)
const id = EdgeTally.Reducer.initialValue

law(
  "Associativity: EdgeTally.Reducer",
  "op(op(a, b), c) = op(a, op(b, c))",
  [arbTally, arbTally, arbTally],
  ([a, b, c]) => expectTallyEq(op(op(a, b), c), op(a, op(b, c)))
)
law("Left Identity: EdgeTally.Reducer", "op(id, a) = a", [arbTally], ([a]) => expectTallyEq(op(id, a), a))
law("Right Identity: EdgeTally.Reducer", "op(a, id) = a", [arbTally], ([a]) => expectTallyEq(op(a, id), a))
law(
  "Commutativity: EdgeTally.Reducer",
  "op(a, b) = op(b, a)",
  [arbTally, arbTally],
  ([a, b]) => expectTallyEq(op(a, b), op(b, a))
)

law(
  "Homomorphism: EdgeTally.of is an accounting homomorphism",
  "h(opA(a, b)) = opB(h(a), h(b))",
  [arbOutcomes, arbOutcomes],
  ([a, b]) => expectTallyEq(EdgeTally.of(Array.appendAll(a, b)), EdgeTally.of(a).combine(EdgeTally.of(b)))
)

law(
  "Homomorphism: opCount is a counting homomorphism into (number, +, 0)",
  "h(opA(a, b)) = opB(h(a), h(b))",
  [arbTally, arbTally],
  ([a, b]) => {
    expect(a.combine(b).opCount()).toBe(a.opCount() + b.opCount())
  }
)

describe("Identity-preserving: EdgeTally.of([]) is EdgeTally.empty", () => {
  it("h(idA) = idB", () => expectTallyEq(EdgeTally.of([]), EdgeTally.empty))
})

const nonNegative = (t: EdgeTally): boolean =>
  Array.every(Array.fromIterable(t.entries.values()), (count) => count.written >= 0 && count.dropped >= 0)

law(
  "Invariant Preservation: combine never produces a negative count",
  "∀s. inv(s) ⟹ ∀a. inv(step(s, a))",
  // The premise inv(s) is a precondition: only states satisfying it are drawn.
  [arbTally.pipe(Arbitrary.filter(nonNegative)), arbTally],
  ([s, a]) => {
    expect(nonNegative(s.combine(a))).toBe(true)
  }
)
