/**
 * Example: building a higher-level, domain-specific BDD vocabulary on top of
 * `@evryg/effect-bdd`.
 *
 * The framework ships the meta-combinators (`scenario`, `given`, `when`,
 * `assertion`). A domain builds *constrained* combinators on top — `aCart()`,
 * `user.adds(...)`, `theCart.holds(...)` — each resolving to a typed
 * `Given`/`When`/`Assertion`. Specialised type safety falls out of the types:
 * `user.adds` declares it *needs* a cart in context, so it cannot be used before
 * `aCart()` is given, and `theCart.holds` only accepts the cart the action
 * produced. Scenarios then read as ubiquitous language.
 *
 * Run with: `npx tsx packages/bdd/examples/CartDsl.ts`
 */
import { assertion, given, run, scenario, toGherkin, when } from "@evryg/effect-bdd"
import type { Assertion, Given, When } from "@evryg/effect-bdd"
import { Effect } from "effect"

// ── Domain model ──
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

// ── A constrained `given` sub-builder ──
// `aCart()` exposes only the operations that yield a valid cart precondition.
interface CartGiven {
  readonly empty: () => Given<{}, HasCart, never>
  readonly containing: (...items: ReadonlyArray<Item>) => Given<{}, HasCart, never>
}

const aCart = (): CartGiven => ({
  empty: () => given("an empty cart", () => Effect.succeed({ cart: { items: [] as ReadonlyArray<Item> } })),
  containing: (...items) =>
    given(`a cart containing ${items.map((entry) => entry.name).join(", ")}`, () => Effect.succeed({ cart: { items } }))
})

// ── `when` combinators that REQUIRE a cart in context ──
const user = {
  adds: (added: Item): When<HasCart, Cart, never, never> =>
    when(
      `the user adds ${added.name}`,
      (context: HasCart) => Effect.succeed({ items: [...context.cart.items, added] })
    ),
  removes: (removed: Item): When<HasCart, Cart, "item-not-in-cart", never> =>
    when(
      `the user removes ${removed.name}`,
      (context: HasCart) =>
        context.cart.items.some((entry) => entry.name === removed.name)
          ? Effect.succeed({ items: context.cart.items.filter((entry) => entry.name !== removed.name) })
          : Effect.fail("item-not-in-cart" as const)
    )
}

// ── `assertion` combinators specialised to the cart the action returns ──
const theCart = {
  holds: (count: number): Assertion<Cart, never> =>
    assertion(`the cart holds ${count} item(s)`, (cart: Cart) => {
      if (cart.items.length !== count) {
        throw new Error(`expected ${count} item(s) but the cart holds ${cart.items.length}`)
      }
    }),
  costs: (total: number): Assertion<Cart, never> =>
    assertion(`the cart costs ${total}`, (cart: Cart) => {
      const sum = cart.items.reduce((accumulator, entry) => accumulator + entry.price, 0)
      if (sum !== total) throw new Error(`expected total ${total} but it is ${sum}`)
    })
}

// ── Scenarios authored as ubiquitous language ──
export const addingAnItem = scenario("adding an item to an empty cart", { tags: ["cart"] })
  .given(aCart().empty())
  .when(user.adds(item("book", 10)))
  .then(theCart.holds(1))
  .and(theCart.costs(10))

export const removingAMissingItem = scenario("removing an item that is not in the cart", { tags: ["cart"] })
  .given(aCart().containing(item("book", 10)))
  .when(user.removes(item("pen", 2)))
  .thenFails("it reports the item is not in the cart", (error) => {
    if (error !== "item-not-in-cart") throw new Error(`unexpected error: ${error}`)
  })

// Specialised type safety: `user.adds` declares `Needs = HasCart`, so authoring
// it before a cart is given is a compile-time error — the combinator simply
// cannot be chained there:
//
//   scenario("no cart").when(user.adds(item("book", 10)))
//   //                       ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ 'cart' is missing in type {}

const demo = Effect.gen(function*() {
  yield* run(addingAnItem)
  yield* run(removingAMissingItem)
  yield* Effect.sync(() => {
    console.log(toGherkin(addingAnItem))
    console.log()
    console.log(toGherkin(removingAMissingItem))
  })
})

void Effect.runPromise(demo)
