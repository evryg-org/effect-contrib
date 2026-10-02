import { expect, it } from "vitest"
import { feature, filterByTags, Scenario, selectByTags } from "../index.js"

it("groups and filters heterogeneous scenarios preserving identity", () => {
  const a = Scenario.make("a", { tags: ["fast"] }).build()
  const b = Scenario.make("b", { tags: ["slow"] }).build()
  const suite = feature("suite", [a, b], { description: "two cases" })
  expect(filterByTags(suite.scenarios, ["fast"])).toEqual([a])
  expect(selectByTags(suite, ["slow"]).scenarios).toEqual([b])
  expect(suite.description).toBe("two cases")
})
