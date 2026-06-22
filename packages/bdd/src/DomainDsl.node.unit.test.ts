import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import type { Assertion, Given, When } from "./index.js"
import { assertion, given, run, scenario, ScenarioError, when } from "./index.js"

// A compact domain vocabulary built from the framework combinators, exercised
// end-to-end through `run`.
interface Item {
  readonly name: string
  readonly price: number
}
interface Cart {
  readonly items: ReadonlyArray<Item>
}
interface HasCart {
  readonly cart: Cart
}

const item = (name: string, price: number): Item => ({ name, price })

const anEmptyCart = (): Given<{}, HasCart, never> =>
  given("an empty cart", () => Effect.succeed({ cart: { items: [] as ReadonlyArray<Item> } }))

const adds = (added: Item): When<HasCart, Cart, never, never> =>
  when(`the user adds ${added.name}`, (context: HasCart) => Effect.succeed({ items: [...context.cart.items, added] }))

const holds = (count: number): Assertion<Cart, never> =>
  assertion(`the cart holds ${count} item(s)`, (cart: Cart) => {
    if (cart.items.length !== count) {
      throw new Error(`expected ${count} item(s) but the cart holds ${cart.items.length}`)
    }
  })

describe("authoring a domain DSL", () => {
  it.effect("runs a scenario written in the domain vocabulary", () =>
    run(
      scenario("adding an item to an empty cart")
        .given(anEmptyCart())
        .when(adds(item("book", 10)))
        .then(holds(1))
    ))

  it.effect("fails with ScenarioError when a domain assertion does not hold", () =>
    Effect.gen(function*() {
      const failing = scenario("adding an item to an empty cart")
        .given(anEmptyCart())
        .when(adds(item("book", 10)))
        .then(holds(2))

      const error = yield* Effect.flip(run(failing))
      expect(error).toBeInstanceOf(ScenarioError)
    }))
})
