import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { feature, filterByTags, selectByTags } from "./Feature.js"
import { scenario } from "./Scenario.js"

const login = scenario("logging in", { tags: ["auth", "smoke"] })
  .when("the user signs in", () => Effect.succeed(1))
  .then("it succeeds", () => {})

const checkout = scenario("checking out", { tags: ["cart"] })
  .when("the user pays", () => Effect.succeed(1))
  .then("it succeeds", () => {})

const search = scenario("searching", { tags: ["smoke"] })
  .when("the user searches", () => Effect.succeed(1))
  .then("it succeeds", () => {})

describe("Feature", () => {
  it("groups scenarios under a name", () => {
    const storefront = feature("storefront", [login, checkout], { description: "core flows" })
    expect(storefront.name).toBe("storefront")
    expect(storefront.description).toBe("core flows")
    expect(storefront.scenarios.map((scenario) => scenario.name)).toEqual(["logging in", "checking out"])
  })

  it("filters a suite by tag (any match), preserving order", () => {
    const suite = [login, checkout, search]
    expect(filterByTags(suite, ["smoke"]).map((scenario) => scenario.name)).toEqual(["logging in", "searching"])
    expect(filterByTags(suite, ["cart", "auth"]).map((scenario) => scenario.name)).toEqual([
      "logging in",
      "checking out"
    ])
    expect(filterByTags(suite, ["absent"])).toEqual([])
  })

  it("narrows a feature's scenarios by tag while keeping its name", () => {
    const storefront = feature("storefront", [login, checkout, search])
    const smoke = selectByTags(storefront, ["smoke"])
    expect(smoke.name).toBe("storefront")
    expect(smoke.scenarios.map((scenario) => scenario.name)).toEqual(["logging in", "searching"])
  })
})
