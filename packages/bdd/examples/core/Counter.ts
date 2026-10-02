/** Vocabulary and specifications contain no implementation callbacks. */
import { feature, filterByTags, Given, Scenario, Steps, Then, When } from "@evryg/effect-bdd"
import { EffectInterpreter, run } from "@evryg/effect-bdd/effect"
import { Effect } from "effect"

export interface Count {
  readonly count: number
}
export const startsAt = Given.define<{}, Count>()("counter.starts", (count: number) => `a counter at ${count}`)
export const increment = When.define<Count, number, never, Count>()(
  "counter.increment",
  (amount: number) => `incremented by ${amount}`
)
export const decrement = When.define<Count, number, "below-zero", Count>()(
  "counter.decrement",
  (amount: number) => `decremented by ${amount}`
)
export const reads = Then.success<Count, number>()("counter.reads", (expected: number) => `the count reads ${expected}`)
export const rejectsUnderflow = Then.failure<Count, "below-zero">()(
  "counter.rejects",
  () => "it refuses to go below zero"
)

export const incrementing = Scenario.make("incrementing", { tags: ["happy"] })
  .use(Steps.from(startsAt(0)))
  .when(increment(3))
  .then(reads(3))
export const rejectingUnderflow = Scenario.make("decrementing below zero", { tags: ["edge"] })
  .given(startsAt(1))
  .when(decrement(5))
  .then(rejectsUnderflow())
export const counting = feature("counting", [incrementing, rejectingUnderflow])
export const edgeCases = filterByTags(counting.scenarios, ["edge"])

export const interpreter = EffectInterpreter.make(
  EffectInterpreter.bind(startsAt, ([count]) => Effect.succeed({ count })),
  EffectInterpreter.bind(increment, {
    execute: ([amount], context) => Effect.succeed(context.count + amount),
    update: (context, outcome) => ({ count: outcome._tag === "Success" ? outcome.value : context.count })
  }),
  EffectInterpreter.bind(decrement, {
    execute: ([amount], context) =>
      context.count < amount
        ? Effect.fail("below-zero" as const)
        : Effect.succeed(context.count - amount),
    update: (context, outcome) => ({ count: outcome._tag === "Success" ? outcome.value : context.count })
  }),
  EffectInterpreter.bind(reads, ([expected], _context, actual) =>
    Effect.sync(() => {
      if (actual !== expected) throw new Error(`Expected ${expected}, received ${actual}`)
    })),
  EffectInterpreter.bind(rejectsUnderflow, (_args, _context, error) =>
    Effect.sync(() => {
      if (error !== "below-zero") throw new Error(`Unexpected error: ${error}`)
    }))
)
export const demo = Effect.gen(function*() {
  yield* run(incrementing, interpreter)
  yield* run(rejectingUnderflow, interpreter)
})
