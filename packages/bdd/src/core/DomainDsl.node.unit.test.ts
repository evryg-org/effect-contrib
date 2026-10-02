import { expect, it } from "vitest"
import { Given } from "../index.js"

it("vocabulary is immutable data with literal identity and frozen arguments", () => {
  const definition = Given.define<{}, { n: number }>()("number", (n: number) => `number ${n}`)
  const step = definition(3)
  expect(step.definition).toBe(definition)
  expect(step.description).toBe("number 3")
  expect(Object.isFrozen(step)).toBe(true)
  expect(Object.isFrozen(step.args)).toBe(true)
})
