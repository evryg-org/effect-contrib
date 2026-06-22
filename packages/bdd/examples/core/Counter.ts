/**
 * Core-mode example: a second domain vocabulary, showing a failure outcome and
 * grouping a suite into a `Feature` that can be filtered by tag (compare with
 * `../harness/Counter.ts`, the same domain via the preset harness).
 *
 * As in `./Cart.ts`, the `when` combinators declare they need a counter in
 * context, and the failure channel is part of the combinator's type — so
 * `.thenFails` receives the precise `"below-zero"` error.
 *
 * Run with: `npx tsx packages/bdd/examples/core/Counter.ts`
 */
import { assertion, feature, filterByTags, given, run, scenario, toGherkin, when } from "@evryg/effect-bdd"
import type { Assertion, Given, When } from "@evryg/effect-bdd"
import { Effect } from "effect"

interface HasCount {
  readonly count: number
}

const aCounterAt = (start: number): Given<{}, HasCount, never> =>
  given(`a counter at ${start}`, () => Effect.succeed({ count: start }))

const incrementedBy = (amount: number): When<HasCount, number, never, never> =>
  when(`incremented by ${amount}`, (context: HasCount) => Effect.succeed(context.count + amount))

const decrementedBy = (amount: number): When<HasCount, number, "below-zero", never> =>
  when(
    `decremented by ${amount}`,
    (context: HasCount) =>
      context.count - amount < 0 ? Effect.fail("below-zero" as const) : Effect.succeed(context.count - amount)
  )

const theCount = {
  reads: (expected: number): Assertion<number, never> =>
    assertion(`the count reads ${expected}`, (count: number) => {
      if (count !== expected) throw new Error(`expected ${expected} but read ${count}`)
    })
}

const incrementing = scenario("incrementing", { tags: ["happy"] })
  .given(aCounterAt(0))
  .when(incrementedBy(3))
  .then(theCount.reads(3))

const rejectingUnderflow = scenario("decrementing below zero is rejected", { tags: ["edge"] })
  .given(aCounterAt(1))
  .when(decrementedBy(5))
  .thenFails("it refuses to go below zero", (error) => {
    if (error !== "below-zero") throw new Error(`unexpected error: ${error}`)
  })

export const counting = feature("counting", [incrementing, rejectingUnderflow])

const demo = Effect.gen(function*() {
  yield* run(incrementing)
  yield* run(rejectingUnderflow)
  const edgeCases = filterByTags(counting.scenarios, ["edge"])
  yield* Effect.sync(() => {
    console.log(`Feature: ${counting.name}`)
    for (const spec of edgeCases) {
      console.log(toGherkin(spec))
    }
  })
})

void Effect.runPromise(demo)
