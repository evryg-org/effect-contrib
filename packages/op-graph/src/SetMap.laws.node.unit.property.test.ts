import { describe, expect, it } from "@effect/vitest"
import { FastCheck as fc } from "effect/testing"
import { Equal } from "effect"
import { SetMap } from "./SetMap.js"

const law = <Ts extends Array<unknown>>(suite: string, statement: string, property: fc.IProperty<Ts>): void => {
  describe(suite, () => {
    it(statement, () => fc.assert(property))
  })
}

// A bounded join-semilattice: an associative, idempotent, commutative `op` with `id` as its identity.
const boundedSemilatticeLaws = <A>(opts: {
  readonly name: string
  readonly arb: fc.Arbitrary<A>
  readonly op: (a: A, b: A) => A
  readonly id: A
  readonly eq: (a: A, b: A) => void
}): void => {
  const { arb, eq, id, name, op } = opts
  law(
    `Associativity: ${name}`,
    "op(op(a, b), c) = op(a, op(b, c))",
    fc.property(arb, arb, arb, (a, b, c) => eq(op(op(a, b), c), op(a, op(b, c)))),
  )
  law(`Binary Idempotence: ${name}`, "op(a, a) = a", fc.property(arb, (a) => eq(op(a, a), a)))
  law(`Commutativity: ${name}`, "op(a, b) = op(b, a)", fc.property(arb, arb, (a, b) => eq(op(a, b), op(b, a))))
  law(`Left Identity: ${name}`, "op(id, a) = a", fc.property(arb, (a) => eq(op(id, a), a)))
  law(`Right Identity: ${name}`, "op(a, id) = a", fc.property(arb, (a) => eq(op(a, id), a)))
}

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
  op: (a, b) => productReducer.combine(a, b),
  id: productReducer.initialValue,
  eq: (a, b) => {
    expect(Equal.equals(a.x, b.x)).toBe(true)
    expect(Equal.equals(a.y, b.y)).toBe(true)
  },
})
