import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer } from "effect"
import { run, ScenarioError } from "./Run.js"
import { scenario } from "./Scenario.js"

describe("run", () => {
  it.effect("passes when the action succeeds and the success assertion holds", () =>
    Effect.gen(function*() {
      const s = scenario("adding to an empty cart")
        .given("an empty cart", () => Effect.succeed({ items: [] as ReadonlyArray<string> }))
        .when("the user adds a book", (context) => Effect.succeed([...context.items, "book"]))
        .then("the cart holds one item", (items) => {
          expect(items).toEqual(["book"])
        })

      yield* run(s)
    }))

  it.effect("checks a typed failure with thenFails", () =>
    Effect.gen(function*() {
      const s = scenario("removing from an empty cart")
        .when("the user removes an item", () => Effect.fail({ code: "EMPTY" as const }))
        .thenFails("it reports the cart is empty", (error) => {
          expect(error.code).toBe("EMPTY")
        })

      yield* run(s)
    }))

  it.effect("checks a defect with thenDies", () =>
    Effect.gen(function*() {
      const s = scenario("dividing by zero")
        .when("the calculator divides by zero", () => Effect.die(new Error("boom")))
        .thenDies("it dies with the cause", (defect) => {
          expect(defect).toBeInstanceOf(Error)
        })

      yield* run(s)
    }))

  it.effect("fails with ScenarioError when an assertion does not hold", () =>
    Effect.gen(function*() {
      const s = scenario("a wrong assertion")
        .when("the calculator adds", () => Effect.succeed(1))
        .then("the result is two", (n) => {
          expect(n).toBe(2)
        })

      const error = yield* Effect.flip(run(s))
      expect(error).toBeInstanceOf(ScenarioError)
      expect(error.reason).toContain("assertion")
    }))

  it.effect("fails with ScenarioError on an unexpected outcome", () =>
    Effect.gen(function*() {
      const s = scenario("an unexpected success")
        .when("the calculator adds", () => Effect.succeed(1))
        .thenFails("it should have failed", () => {})

      const error = yield* Effect.flip(run(s))
      expect(error).toBeInstanceOf(ScenarioError)
      expect(error.reason).toContain("expected outcome")
    }))

  it.effect("threads required services through run", () =>
    Effect.gen(function*() {
      class Greeter extends Context.Service<Greeter, {
        readonly greet: (name: string) => Effect.Effect<string>
      }>()("Greeter") {}

      const s = scenario("greeting a user")
        .when("the service greets ada", () =>
          Effect.gen(function*() {
            const greeter = yield* Greeter
            return yield* greeter.greet("ada")
          }))
        .then("it greets ada", (message) => {
          expect(message).toBe("hi ada")
        })

      yield* run(s).pipe(
        Effect.provide(Layer.succeed(Greeter, { greet: (name) => Effect.succeed(`hi ${name}`) }))
      )
    }))
})
