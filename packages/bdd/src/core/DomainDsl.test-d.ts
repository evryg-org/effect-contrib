import { Effect } from "effect"
import { describe, expectTypeOf, it } from "vitest"
import type { When } from "../index.js"
import { given, scenario, when } from "../index.js"

interface HasCart {
  readonly cart: { readonly items: ReadonlyArray<string> }
}

const aCart = () => given("a cart", () => Effect.succeed({ cart: { items: [] as ReadonlyArray<string> } }))

const adds = (name: string): When<HasCart, ReadonlyArray<string>, never, never> =>
  when(`the user adds ${name}`, (context: HasCart) => Effect.succeed([...context.cart.items, name]))

describe("specialised type safety of a domain combinator", () => {
  it("accepts a context-requiring combinator once its precondition is given", () => {
    const built = scenario("ok").given(aCart()).when(adds("book"))
    built.then("holds something", (items) => {
      expectTypeOf(items).toEqualTypeOf<ReadonlyArray<string>>()
    })
  })

  it("rejects a context-requiring combinator before its precondition", () => {
    // @ts-expect-error `adds` declares Needs = HasCart, absent from the empty context
    scenario("bad").when(adds("book"))
  })
})
