import { describe, expect, it } from "vitest"
import { feature, Given, Scenario, Steps, steps, Then, toGherkin, When } from "../index.js"

const initial = Given.define<{}, { count: number }>()("initial", (count: number) => `${count} items`)
const action = When.define<{ count: number }, string>()("add", (amount: number) => `add ${amount}`)
const check = Then.success<{ count: number }, string>()("check", () => "a result")
const context = Then.context<{ count: number }>()("count", () => "the count")
describe("Scenario authoring", () => {
  it("fluent and pipe authoring preserve ordered stages and keywords", () => {
    const fragment = Steps.from(initial(0))
    const fluent = Scenario.make("add").use(fragment).when(action(1)).then(check()).and(context()).but(context()).when(
      action(2)
    ).then(check())
    const piped = Scenario.make("add").pipe(
      Scenario.use(fragment),
      Scenario.when(action(1)),
      Scenario.then(check()),
      Scenario.and(context()),
      Scenario.but(context())
    )
    expect(steps(fluent).map((s) => s.keyword)).toEqual(["Given", "When", "Then", "And", "But", "When", "Then"])
    expect(steps(piped)).toEqual(steps(fluent).slice(0, 5))
    expect(toGherkin(piped)).toContain("  But the count")
  })
  it("every immutable prefix is usable and keeps independent authored order", () => {
    const empty = Scenario.make("prefix", { tags: ["fast"] })
    const setup = empty.given(initial(0))
    const full = setup.when(action(1)).then(check())
    for (const scenario of [empty, setup, full]) {
      expect(Object.isFrozen(scenario)).toBe(true)
      expect("build" in scenario).toBe(false)
      expect(scenario.tags).toEqual(["fast"])
    }
    expect(steps(empty)).toHaveLength(0)
    expect(steps(setup)).toHaveLength(1)
    expect(steps(full)).toHaveLength(3)
    expect(feature("prefixes", [empty, setup, full]).scenarios).toEqual([empty, setup, full])
    expect(() => Scenario.inspect({ name: "fake", tags: [] } as unknown as Scenario.Scenario)).toThrow("Scenario")
  })
  it("rejects Promise assimilation with a clear diagnostic", async () => {
    const scenario = Scenario.make("then-bearing").given(initial(0)).then(context())
    await expect(Promise.resolve(scenario as unknown)).rejects.toThrow("cannot be awaited")
    expect(() => (scenario.then as unknown as (a: unknown, b: unknown) => unknown)(() => {}, () => {})).toThrow(
      "execute them with run"
    )
  })
  it("fragment identity and associativity retain order", () => {
    const a = Steps.from(initial(0))
    const b = Steps.from(action(1))
    const c = Steps.from(check())
    const render = (scenario: Scenario.Scenario) => Scenario.inspect(scenario).map((s) => s.descriptor.description)
    const base = Scenario.make("composition")
    expect(render(base.use(Steps.concat(Steps.empty, a)))).toEqual(render(base.use(a)))
    expect(render(base.use(Steps.concat(a, Steps.empty)))).toEqual(render(base.use(a)))
    expect(render(base.use(Steps.concat(Steps.concat(a, b), c)))).toEqual(
      render(base.use(Steps.concat(a, Steps.concat(b, c))))
    )
  })
})
