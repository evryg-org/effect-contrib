import { Context, Effect, Schema } from "effect"
import { describe, expectTypeOf, it } from "vitest"
import type { ScenarioError } from "../index.js"
import { dispatcher, makeHarness, probe } from "../index.js"

class Repo extends Context.Service<Repo, {
  readonly save: (item: string) => Effect.Effect<void>
}>()("Repo") {}

interface Cart {
  readonly items: ReadonlyArray<string>
}

const CartCommand = Schema.TaggedUnion({
  AddItem: { name: Schema.String }
})

const makeCart = () => {
  const repo = probe<string>()("repo", Repo, (record) => ({ save: (item) => record(item) }))
  const apply = dispatcher<Cart, ReadonlyArray<string>, never, Repo>()(
    CartCommand,
    {
      AddItem: (command) => (preconditions) =>
        Effect.gen(function*() {
          yield* Effect.flatMap(Repo, (repository) => repository.save(command.name))
          return [...preconditions.items, command.name]
        })
    },
    (command) => CartCommand.match(command, { AddItem: (item) => `adds ${item.name}` })
  )
  return makeHarness({ initial: { items: [] } as Cart, probes: { repo }, dispatch: apply })
}

describe("harness typing", () => {
  it("injects observations keyed by probe name", () => {
    makeCart()
      .scenario("x")
      .when(CartCommand.cases.AddItem.make({ name: "book" }))
      .then((observations) => {
        expectTypeOf(observations).toEqualTypeOf<{ readonly repo: ReadonlyArray<string> }>()
      })
  })

  it("discharges the probe services from run", () => {
    const cart = makeCart()
    const built = cart.scenario("x").when(CartCommand.cases.AddItem.make({ name: "y" })).then(() => {})
    expectTypeOf(cart.run(built)).toEqualTypeOf<Effect.Effect<void, ScenarioError, never>>()
  })

  it("rejects a value that is not a command", () => {
    // @ts-expect-error a plain string is not a cart command
    makeCart().scenario("x").when("nope")
  })
})
