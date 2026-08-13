/**
 * Harness-mode example: the same counter domain as `../core/Counter.ts` via the
 * preset harness, showing a failure outcome (`thenFails`) and an observed event
 * log. Commands are a `Schema.TaggedUnion`; the decrement command fails on
 * underflow without emitting an event.
 *
 * Run with: `npx tsx packages/bdd/examples/harness/Counter.ts`
 */
import { dispatcher, makeHarness, probe, toGherkin } from "@evryg/effect-bdd"
import { Context, Effect, Schema } from "effect"

interface Counter {
  readonly count: number
}

const CounterCommand = Schema.TaggedUnion({
  Increment: { by: Schema.Number },
  Decrement: { by: Schema.Number }
})
const increment = (by: number) => CounterCommand.cases.Increment.make({ by })
const decrement = (by: number) => CounterCommand.cases.Decrement.make({ by })

// Observe the events the counter emits.
class Events extends Context.Service<Events, {
  readonly emit: (event: string) => Effect.Effect<void>
}>()("Events") {}

const events = probe<string>()("events", Events, (record) => ({ emit: (event) => record(event) }))

const counter = makeHarness({
  initial: { count: 0 } as Counter,
  probes: { events },
  dispatch: dispatcher<Counter, number, "below-zero", Events>()(
    CounterCommand,
    {
      Increment: (command) => (state) =>
        Effect.gen(function*() {
          const log = yield* Events
          yield* log.emit(`+${command.by}`)
          return state.count + command.by
        }),
      Decrement: (command) => (state) =>
        state.count - command.by < 0
          ? Effect.fail("below-zero" as const)
          : Effect.gen(function*() {
            const log = yield* Events
            yield* log.emit(`-${command.by}`)
            return state.count - command.by
          })
    },
    (command) =>
      CounterCommand.match(command, {
        Increment: (item) => `incremented by ${item.by}`,
        Decrement: (item) => `decremented by ${item.by}`
      })
  )
})

const incrementing = counter.scenario("incrementing from a seeded counter", { tags: ["happy"] })
  .given((state) => ({ count: state.count + 10 }))
  .when(increment(3))
  .then("an increment event is emitted", ({ events }) => {
    if (events[0] !== "+3") throw new Error(`unexpected events: [${events.join(", ")}]`)
  })

const refusingUnderflow = counter.scenario("decrementing below zero is rejected", { tags: ["edge"] })
  .when(decrement(5))
  .thenFails("no event is emitted on rejection", ({ events }) => {
    if (events.length !== 0) throw new Error(`expected no events, got [${events.join(", ")}]`)
  })

const demo = Effect.gen(function*() {
  yield* counter.run(incrementing)
  yield* counter.run(refusingUnderflow)
  yield* Effect.sync(() => {
    console.log(toGherkin(incrementing))
    console.log()
    console.log(toGherkin(refusingUnderflow))
  })
})

void Effect.runPromise(demo)
