import { Context, Effect } from "effect"
import { describe, expectTypeOf, it } from "vitest"
import type { ScenarioError } from "./Run.js"
import { run } from "./Run.js"
import { scenario } from "./Scenario.js"

describe("run channels", () => {
  it("requires exactly the services accumulated by the scenario", () => {
    class Svc extends Context.Service<Svc, { readonly go: Effect.Effect<number> }>()("Svc") {}

    const s = scenario("x")
      .when("act", () =>
        Effect.gen(function*() {
          const svc = yield* Svc
          return yield* svc.go
        }))
      .then("ok", (n) => {
        expectTypeOf(n).toEqualTypeOf<number>()
      })

    expectTypeOf(run(s)).toEqualTypeOf<Effect.Effect<void, ScenarioError, Svc>>()
  })

  it("requires nothing for a service-free scenario", () => {
    const s = scenario("x")
      .when("act", () => Effect.succeed(1))
      .then("ok", () => {})

    expectTypeOf(run(s)).toEqualTypeOf<Effect.Effect<void, ScenarioError, never>>()
  })
})
