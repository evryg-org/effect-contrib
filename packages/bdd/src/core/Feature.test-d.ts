import { Effect } from "effect"
import { expectTypeOf } from "vitest"
import { EffectInterpreter, run } from "../effect.js"
import { feature, filterByTags, Given, Scenario, selectByTags } from "../index.js"

const one = Given.define<{}, { one: number }>()("one", () => "one")
const two = Given.define<{}, { two: string }>()("two", () => "two")
const a = Scenario.make("a").given(one()).build()
const b = Scenario.make("b").given(two()).build()
const suite = feature("heterogeneous", [a, b])
expectTypeOf(suite.scenarios).toEqualTypeOf<ReadonlyArray<typeof a | typeof b>>()
const selected = selectByTags(suite, ["fast"])
expectTypeOf(selected.scenarios).toEqualTypeOf(suite.scenarios)
const filtered = filterByTags(suite.scenarios, ["fast"])
expectTypeOf(filtered).toEqualTypeOf(suite.scenarios)
const complete = EffectInterpreter.make(
  EffectInterpreter.bind(one, () => Effect.succeed({ one: 1 })),
  EffectInterpreter.bind(two, () => Effect.succeed({ two: "two" }))
)
for (const scenario of filtered) run(scenario, complete)
const incomplete = EffectInterpreter.make(EffectInterpreter.bind(one, () => Effect.succeed({ one: 1 })))
for (const scenario of selected.scenarios) {
  // @ts-expect-error selection retains operation requirements from every heterogeneous member
  run(scenario, incomplete)
}
