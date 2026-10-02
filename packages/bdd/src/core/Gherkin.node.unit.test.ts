import { expect, it } from "vitest"
import { Given, Scenario, Then, toDocument, toGherkin } from "../index.js"

it("projects ordered metadata without invoking implementations", () => {
  const setup = Given.define<{}, { n: number }>()("n", (n: number) => `${n} items`)
  const check = Then.context<{ n: number }>()("check", () => "the count")
  const scenario = Scenario.make("count", { tags: ["fast"] }).given(setup(1)).then(check()).but(check())
  expect(toGherkin(scenario)).toBe("@fast\nScenario: count\n  Given 1 items\n  Then the count\n  But the count")
  expect(toDocument(scenario).steps).toHaveLength(3)
})
