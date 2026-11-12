import { describe, expect, it } from "@effect/vitest"
import { Arbitrary, Equal, Schema } from "effect"
import { SetMap } from "./SetMap.js"

// A bounded join-semilattice: an associative, idempotent, commutative `op` with `id` as its identity.
const boundedSemilatticeLaws = <A>(opts: {
  readonly name: string
  readonly arb: Arbitrary.Arbitrary<A>
  readonly op: (a: A, b: A) => A
  readonly id: A
  readonly eq: (a: A, b: A) => void
}): void => {
  const { arb, eq, id, name, op } = opts
  describe(`Associativity: ${name}`, () => {
    it.prop("op(op(a, b), c) = op(a, op(b, c))", [arb, arb, arb], ([a, b, c]) => eq(op(op(a, b), c), op(a, op(b, c))))
  })
  describe(`Binary Idempotence: ${name}`, () => {
    it.prop("op(a, a) = a", [arb], ([a]) => eq(op(a, a), a))
  })
  describe(`Commutativity: ${name}`, () => {
    it.prop("op(a, b) = op(b, a)", [arb, arb], ([a, b]) => eq(op(a, b), op(b, a)))
  })
  describe(`Left Identity: ${name}`, () => {
    it.prop("op(id, a) = a", [arb], ([a]) => eq(op(id, a), a))
  })
  describe(`Right Identity: ${name}`, () => {
    it.prop("op(a, id) = a", [arb], ([a]) => eq(op(a, id), a))
  })
}

// SetMap is the MERGE-dedup carrier: keys accumulate, values union, re-applying is a no-op -- a
// BOUNDED JOIN-SEMILATTICE under (concat, empty). Small constant pools below so generated maps
// overlap, exercising idempotence/commutativity meaningfully.
const arbSetMap: Arbitrary.Arbitrary<SetMap> = Arbitrary.array(
  Arbitrary.all([
    Arbitrary.schema(Schema.Literals(["Class", "Method", "File"])),
    Arbitrary.schema(Schema.Literals(["a", "b", "c", "d"]))
  ])
).pipe(Arbitrary.map(SetMap.of))

// Laws are stated against the exposed `SetMap.Reducer` instance itself, not the `concat`
// instance method it wraps -- proving the NATIVE surface consumers reach for is lawful.
boundedSemilatticeLaws({
  name: "SetMap.Reducer (MERGE-dedup)",
  arb: arbSetMap,
  op: (a, b) => SetMap.Reducer.combine(a, b),
  id: SetMap.Reducer.initialValue,
  eq: (a, b) => {
    expect(Equal.equals(a, b)).toBe(true)
  }
})

// The product reducer is a per-key struct fold over SetMap.Reducer -- same bounded
// join-semilattice laws, one dimension up, for a fixed two-key record shape.
const productReducer = SetMap.makeProductReducer(["x", "y"] as const)

const arbProduct: Arbitrary.Arbitrary<Record<"x" | "y", SetMap>> = Arbitrary.all({ x: arbSetMap, y: arbSetMap })

boundedSemilatticeLaws({
  name: "SetMap.makeProductReducer (per-key MERGE-dedup)",
  arb: arbProduct,
  op: (a, b) => productReducer.combine(a, b),
  id: productReducer.initialValue,
  eq: (a, b) => {
    expect(Equal.equals(a.x, b.x)).toBe(true)
    expect(Equal.equals(a.y, b.y)).toBe(true)
  }
})
