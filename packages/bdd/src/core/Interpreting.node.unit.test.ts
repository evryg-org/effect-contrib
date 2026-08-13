import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { steps, tags, toGherkin } from "./Gherkin.js"
import { run } from "./Run.js"
import { scenario } from "./Scenario.js"

// A single scenario value, authored once and interpreted three different ways.
const cart = scenario("adding to an empty cart", { tags: ["cart"] })
  .given("an empty cart", () => Effect.succeed({ items: [] as ReadonlyArray<string> }))
  .when("the user adds a book", (context) => Effect.succeed([...context.items, "book"]))
  .then("the cart holds one item", (items) => {
    expect(items).toEqual(["book"])
  })

describe("interpreting one scenario many ways", () => {
  it.effect("runs to a passing Effect", () => run(cart))

  it("renders the same value to Gherkin", () => {
    expect(toGherkin(cart)).toContain("Scenario: adding to an empty cart")
    expect(toGherkin(cart)).toContain("  When the user adds a book")
  })

  it("exposes the same value as structure", () => {
    expect(steps(cart).map((step) => step.keyword)).toEqual(["Given", "When", "Then"])
    expect(tags(cart)).toEqual(["cart"])
  })
})
