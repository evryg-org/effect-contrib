import { Effect } from "effect"
import { describe, expectTypeOf, it } from "vitest"
import { scenario } from "./Scenario.js"
import { given } from "./Step.js"

describe("phase-typed builder", () => {
  it("rejects the then-family before when", () => {
    // @ts-expect-error `then` is not available in the Given phase
    scenario("x").then("too early", () => {})
    // @ts-expect-error `thenFails` is not available in the Given phase
    scenario("x").thenFails("too early", () => {})
    // @ts-expect-error `thenDies` is not available in the Given phase
    scenario("x").thenDies("too early", () => {})
  })

  it("accumulates context with named keys across given/and", () => {
    scenario("x")
      .given("a cart", () => Effect.succeed({ cart: 1 as number }))
      .and("a user", () => Effect.succeed({ user: "ada" }))
      .when("act", (context) => {
        expectTypeOf(context).toEqualTypeOf<{ cart: number; user: string }>()
        return Effect.succeed("ok")
      })
  })

  it("enforces context dependencies declared by a combinator", () => {
    const needsCart = given(
      "prices the cart",
      (context: { cart: number }) => Effect.succeed({ priced: context.cart })
    )

    // ok: the cart is present before the dependent given
    scenario("x")
      .given("a cart", () => Effect.succeed({ cart: 1 }))
      .given(needsCart)

    // @ts-expect-error `cart` is required by `needsCart` but absent from the empty context
    scenario("x").given(needsCart)
  })

  it("feeds the right payload to each outcome method", () => {
    const action: Effect.Effect<{ value: number }, { code: string }> = Effect.succeed({ value: 1 })
    const built = scenario("x").when("act", () => action)

    built.then("the success value", (value) => {
      expectTypeOf(value).toEqualTypeOf<{ value: number }>()
    })
    built.thenFails("the typed error", (error) => {
      expectTypeOf(error).toEqualTypeOf<{ code: string }>()
    })
    built.thenDies("the defect", (defect) => {
      expectTypeOf(defect).toEqualTypeOf<unknown>()
    })
  })

  it("keeps the chosen outcome for the terminal and", () => {
    const action: Effect.Effect<{ value: number }, { code: string }> = Effect.succeed({ value: 1 })
    scenario("x")
      .when("act", () => action)
      .thenFails("the typed error", (error) => {
        expectTypeOf(error).toEqualTypeOf<{ code: string }>()
      })
      .and("still the typed error", (error) => {
        expectTypeOf(error).toEqualTypeOf<{ code: string }>()
      })
  })
})
