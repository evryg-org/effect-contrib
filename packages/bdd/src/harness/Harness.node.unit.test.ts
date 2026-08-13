import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Schema } from "effect"
import { dispatcher, makeHarness, probe, ScenarioError } from "../index.js"

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
          const repository = yield* Repo
          yield* repository.save(command.name)
          return [...preconditions.items, command.name]
        })
    },
    (command) => CartCommand.match(command, { AddItem: (item) => `the user adds ${item.name}` })
  )
  return makeHarness({ initial: { items: [] } as Cart, probes: { repo }, dispatch: apply })
}

describe("makeHarness", () => {
  it.effect("runs with bare commands, injected observations and auto-provided layers", () =>
    Effect.gen(function*() {
      const cart = makeCart()

      const adding = cart.scenario("adding an item", { tags: ["cart"] })
        .given((preconditions) => ({ items: [...preconditions.items, "apple"] }))
        .when(CartCommand.cases.AddItem.make({ name: "book" }))
        .then("the book was saved once", ({ repo }) => {
          expect(repo).toEqual(["book"])
        })

      // no manual Effect.provide — the harness provides the probe layer
      yield* cart.run(adding)
    }))

  it.effect("fails with ScenarioError when an injected observation does not hold", () =>
    Effect.gen(function*() {
      const cart = makeCart()

      const wrong = cart.scenario("wrong expectation")
        .when(CartCommand.cases.AddItem.make({ name: "book" }))
        .then(({ repo }) => {
          expect(repo).toEqual(["something-else"])
        })

      const error = yield* Effect.flip(cart.run(wrong))
      expect(error).toBeInstanceOf(ScenarioError)
    }))

  it.effect("does not accumulate observations across runs of the same harness", () =>
    Effect.gen(function*() {
      const cart = makeCart()

      const first = cart.scenario("first add")
        .when(CartCommand.cases.AddItem.make({ name: "book" }))
        .then("only book is recorded", ({ repo }) => {
          expect(repo).toEqual(["book"])
        })

      const second = cart.scenario("second add")
        .when(CartCommand.cases.AddItem.make({ name: "pen" }))
        .then("only pen is recorded (log reset between runs)", ({ repo }) => {
          expect(repo).toEqual(["pen"])
        })

      yield* cart.run(first)
      yield* cart.run(second)
    }))
})
