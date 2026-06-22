import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { ScenarioDocument, steps, tags, toDocument, toGherkin } from "./Gherkin.js"
import { scenario } from "./Scenario.js"

const cart = scenario("adding to an empty cart", { tags: ["cart", "smoke"] })
  .given("an empty cart", () => Effect.succeed({ items: [] as ReadonlyArray<string> }))
  .and("a known user", () => Effect.succeed({ user: "ada" }))
  .when("the user adds a book", () => Effect.succeed({ count: 1 }))
  .then("the cart holds one item", (receipt) => {
    expect(receipt.count).toBe(1)
  })
  .and("the cart is not empty", (receipt) => {
    expect(receipt.count).toBeGreaterThan(0)
  })

describe("Gherkin", () => {
  it("lists steps with their Gherkin keywords", () => {
    expect(steps(cart).map((step) => `${step.keyword} ${step.text}`)).toEqual([
      "Given an empty cart",
      "And a known user",
      "When the user adds a book",
      "Then the cart holds one item",
      "And the cart is not empty"
    ])
  })

  it("records the expected outcome on then steps only", () => {
    expect(steps(cart).map((step) => step.outcome)).toEqual([
      undefined,
      undefined,
      undefined,
      "success",
      "success"
    ])
  })

  it("returns the tags", () => {
    expect(tags(cart)).toEqual(["cart", "smoke"])
  })

  it("renders Gherkin text", () => {
    expect(toGherkin(cart)).toBe(
      [
        "@cart @smoke",
        "Scenario: adding to an empty cart",
        "  Given an empty cart",
        "  And a known user",
        "  When the user adds a book",
        "  Then the cart holds one item",
        "  And the cart is not empty"
      ].join("\n")
    )
  })

  it.effect("projects to a document that round-trips through its Schema", () =>
    Effect.gen(function*() {
      const document = toDocument(cart)
      expect(document.name).toBe("adding to an empty cart")

      const encoded = yield* Schema.encodeEffect(ScenarioDocument)(document)
      const decoded = yield* Schema.decodeEffect(ScenarioDocument)(encoded)
      expect(decoded).toEqual(document)
    }))
})
