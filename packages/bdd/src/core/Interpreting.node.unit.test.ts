import { expect, it } from "vitest"
import { Given, Scenario, toDocument } from "../index.js"

it("a specification remains stable across repeated projections", () => {
  const setup = Given.define<{}, { n: number }>()("n", () => "a number")
  const scenario = Scenario.make("projection").given(setup()).build()
  expect(toDocument(scenario)).toEqual(toDocument(scenario))
  expect(Scenario.inspect(scenario)[0].descriptor.definition).toBe(setup)
})
