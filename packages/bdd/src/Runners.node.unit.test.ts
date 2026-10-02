import { describe, expect, it } from "@effect/vitest"
import { Given, Scenario, Then, When } from "@evryg/effect-bdd"
import { EffectInterpreter } from "@evryg/effect-bdd/effect"
import { toTest as toEffectTest } from "@evryg/effect-bdd/effect-vitest"
import { toTest } from "@evryg/effect-bdd/vitest"
import { Effect } from "effect"

const setup = Given.define<{}, { count: number }>()("runner.setup", () => "a counter")
const action = When.define<{ count: number }, number>()("runner.action", () => "increment")
const check = Then.success<{}, number>()("runner.check", () => "the result is one")
const scenario = Scenario.make("runner integration")
  .given(setup()).when(action()).then(check())

const makeInterpreter = (result: number, record: () => void) =>
  EffectInterpreter.make(
    EffectInterpreter.bind(setup, () =>
      Effect.sync(() => {
        record()
        return { count: 0 }
      })),
    EffectInterpreter.bind(action, { execute: () => Effect.succeed(result) }),
    EffectInterpreter.bind(check, (_args, _context, result) =>
      Effect.sync(() => {
        if (result !== 1) throw new Error("expected one")
      }))
  )

describe("runner adapters", () => {
  it("registers a fluent scenario through the Promise callback", toTest(scenario, makeInterpreter(1, () => {})))
  it("creates lazy Promise callbacks and executes each invocation afresh", async () => {
    let executions = 0
    const callback = toTest(
      scenario,
      makeInterpreter(1, () => {
        executions++
      })
    )
    expect(executions).toBe(0)
    await callback()
    await callback()
    expect(executions).toBe(2)
  })
  it("rejects Promise callbacks with scenario diagnostics", async () => {
    await expect(toTest(scenario, makeInterpreter(2, () => {}))()).rejects.toThrow("the result is one")
  })
  it.effect("accepts the Effect callback directly", toEffectTest(scenario, makeInterpreter(1, () => {})))
  it.effect("keeps Effect failures available for runner reporting", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(toEffectTest(scenario, makeInterpreter(2, () => {}))())
      expect(error._tag).toBe("ScenarioError")
      expect(error.step).toBe("the result is one")
    }))
})
