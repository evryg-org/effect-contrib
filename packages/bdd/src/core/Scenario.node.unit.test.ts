import { describe, expect, it } from "vitest"
import { Given, Scenario, Steps, steps, Then, toGherkin, When } from "../index.js"

const initial = Given.define<{}, { count: number }>()("initial", (count: number) => `${count} items`)
const action = When.define<{ count: number }, string>()("add", (amount: number) => `add ${amount}`)
const check = Then.success<{ count: number }, string>()("check", () => "a result")
const context = Then.context<{ count: number }>()("count", () => "the count")
describe("Scenario authoring", () => {
  it("fluent and pipe authoring preserve ordered stages and keywords", () => {
    const fragment = Steps.from(initial(0))
    const fluent = Scenario.make("add").use(fragment).when(action(1)).then(check()).and(context()).but(context()).when(
      action(2)
    ).then(check()).build()
    const pipe = Scenario.make("add").pipe(
      Scenario.use(fragment),
      Scenario.when(action(1)),
      Scenario.then(check()),
      Scenario.and(context()),
      Scenario.but(context()),
      Scenario.build
    )
    expect(steps(fluent).map((step) => step.keyword)).toEqual(["Given", "When", "Then", "And", "But", "When", "Then"])
    expect(steps(pipe)).toEqual(steps(fluent).slice(0, 5))
    expect(toGherkin(pipe)).toContain("  But the count")
  })
  it("completed scenarios are immutable and never thenable", async () => {
    const completed = Scenario.make("context").given(initial(0)).then(context()).build()
    expect(Object.isFrozen(completed)).toBe(true)
    expect("then" in completed).toBe(false)
    expect(await Promise.resolve(completed)).toBe(completed)
    expect(() => steps(Scenario.make("unfinished") as unknown as Scenario.Scenario)).toThrow("completed")
  })
  it("fragment identity and associativity retain order", () => {
    const a = Steps.from(initial(0))
    const b = Steps.from(action(1))
    const c = Steps.from(check())
    const render = (scenario: Scenario.Scenario) => Scenario.inspect(scenario).map((s) => s.descriptor.description)
    const base = Scenario.make("composition")
    expect(render(base.use(Steps.concat(Steps.empty, a)).build())).toEqual(render(base.use(a).build()))
    expect(render(base.use(Steps.concat(a, Steps.empty)).build())).toEqual(render(base.use(a).build()))
    expect(render(base.use(Steps.concat(Steps.concat(a, b), c)).build())).toEqual(
      render(base.use(Steps.concat(a, Steps.concat(b, c))).build())
    )
  })
})
