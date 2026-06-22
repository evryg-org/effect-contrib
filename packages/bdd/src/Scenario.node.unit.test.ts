import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { scenario } from "./Scenario.js"
import { assertion, given, when } from "./Step.js"

describe("scenario builder", () => {
  it("reifies a scenario from the sugar form (description + lambda)", () => {
    const s = scenario("adding to an empty cart", { tags: ["cart", "smoke"] })
      .given("an empty cart", () => Effect.succeed({ cart: [] as ReadonlyArray<string> }))
      .and("a known user", () => Effect.succeed({ user: "ada" }))
      .when("the user adds a book", () => Effect.succeed({ items: 1 }))
      .then("the cart holds one item", (receipt) => {
        expect(receipt.items).toBe(1)
      })

    expect(s.name).toBe("adding to an empty cart")
    expect(s.tags).toEqual(["cart", "smoke"])
    expect(s.givens.map((g) => g.description)).toEqual(["an empty cart", "a known user"])
    expect(s.when.description).toBe("the user adds a book")
    expect(s.thens).toHaveLength(1)
    expect(s.thens[0].outcome).toBe("success")
    expect(s.thens[0].assertion.description).toBe("the cart holds one item")
  })

  it("reifies a scenario from combinator values and records the chosen outcome", () => {
    const anEmptyCart = given("an empty cart", () => Effect.succeed({ cart: [] as ReadonlyArray<string> }))
    const addsABook = when(
      "the user adds a book",
      (_context: { cart: ReadonlyArray<string> }) => Effect.succeed({ items: 1 })
    )
    const holdsOne = assertion("the cart holds one item", (receipt: { items: number }) => {
      expect(receipt.items).toBe(1)
    })

    const s = scenario("adding to an empty cart")
      .given(anEmptyCart)
      .when(addsABook)
      .then(holdsOne)
      .and("and is not empty", (receipt) => {
        expect(receipt.items).toBeGreaterThan(0)
      })

    expect(s.tags).toEqual([])
    expect(s.thens.map((t) => t.outcome)).toEqual(["success", "success"])
    expect(s.thens.map((t) => t.assertion.description)).toEqual([
      "the cart holds one item",
      "and is not empty"
    ])
  })

  it("records the expected outcome for failure and defect terminals", () => {
    const failing = scenario("removing from an empty cart")
      .when("the user removes an item", () => Effect.fail("empty" as const))
      .thenFails("it reports the cart is empty", (error) => {
        expect(error).toBe("empty")
      })

    const dying = scenario("dividing by zero")
      .when("the calculator divides by zero", () => Effect.die(new Error("boom")))
      .thenDies("it dies with the cause", (defect) => {
        expect(defect).toBeInstanceOf(Error)
      })

    expect(failing.thens[0].outcome).toBe("failure")
    expect(dying.thens[0].outcome).toBe("defect")
  })
})
