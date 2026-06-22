import { Effect, Schema } from "effect"
import { describe, expectTypeOf, it } from "vitest"
import type { When } from "../index.js"
import { dispatcher } from "./Command.js"

interface Ctx {
  readonly n: number
}

const Command = Schema.TaggedUnion({
  Inc: { by: Schema.Number },
  Reset: {}
})

describe("dispatcher typing", () => {
  it("requires a handler for every case", () => {
    const make = dispatcher<Ctx, number>()

    // ok: every case handled
    make(Command, {
      Inc: (command) => (context) => Effect.succeed(context.n + command.by),
      Reset: () => () => Effect.succeed(0)
    }, () => "a step")

    make(
      Command,
      // @ts-expect-error missing a handler for the "Reset" case
      { Inc: (command) => (context) => Effect.succeed(context.n + command.by) },
      () => "a step"
    )
  })

  it("produces a When over the context", () => {
    const apply = dispatcher<Ctx, number>()(Command, {
      Inc: (command) => (context) => Effect.succeed(context.n + command.by),
      Reset: () => () => Effect.succeed(0)
    }, () => "a step")

    expectTypeOf(apply(Command.cases.Reset.make({}))).toEqualTypeOf<When<Ctx, number, never, never>>()
  })
})
