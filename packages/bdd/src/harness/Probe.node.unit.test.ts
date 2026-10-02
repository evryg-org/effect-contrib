import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Fiber, Schedule } from "effect"
import { run } from "../core/Run.js"
import * as Then from "../core/Then.js"
import * as When from "../core/When.js"
import * as Interpreter from "../EffectInterpreter.js"
import { Scenario } from "../index.js"
import { probe } from "./Probe.js"

class Beacon extends Context.Service<Beacon, { readonly ping: (label: string) => Effect.Effect<void> }>()("Beacon") {}
const ping = When.define<{}, void>()("ping", (label: string) => `ping ${label}`)
const recorded = Then.context<{}>()("recorded", (label: string) => `recorded ${label}`)

describe("execution-scoped probes", () => {
  it.effect("isolates reused probes across concurrent, repeated and retried runs", () =>
    Effect.gen(function*() {
      const beacon = probe<string>()("beacon", Beacon, (record) => ({ ping: record }))
      let attempts = 0
      const interpreter = Interpreter.make(
        Interpreter.bind(ping, {
          execute: ([label]) =>
            Effect.flatMap(Beacon, (service) => service.ping(label)).pipe(Effect.provide(beacon.layer))
        }),
        Interpreter.bind(recorded, ([label]) =>
          Effect.flatMap(beacon.calls, (calls) =>
            Effect.sync(() => {
              expect(calls).toEqual([label])
            })))
      )
      const scenario = (label: string) => Scenario.make(label).when(ping(label)).then(recorded(label))
      yield* Effect.all([run(scenario("a"), interpreter), run(scenario("b"), interpreter)], {
        concurrency: "unbounded"
      })
      yield* run(scenario("a"), interpreter)
      const retry = Interpreter.make(
        interpreter.bindings[0],
        Interpreter.bind(recorded, ([label]) =>
          Effect.flatMap(beacon.calls, (calls) => {
            expect(calls).toEqual([label])
            return ++attempts === 1 ? Effect.fail("retry") : Effect.void
          }))
      )
      yield* run(scenario("retry"), retry).pipe(Effect.retry(Schedule.recurs(1)))
      expect(attempts).toBe(2)
    }))
  it.effect("discards failed and interrupted observation logs before reuse", () =>
    Effect.gen(function*() {
      const beacon = probe<string>()("beacon", Beacon, (record) => ({ ping: record }))
      let entered = false
      const scenario = Scenario.make("reuse").when(ping("a")).then(recorded("a"))
      const assertion = Interpreter.bind(recorded, () =>
        Effect.flatMap(beacon.calls, (calls) =>
          Effect.sync(() => {
            expect(calls).toEqual(["a"])
          })))
      const make = (mode: "fail" | "interrupt" | "pass") =>
        Interpreter.make(
          Interpreter.bind(ping, {
            execute: () =>
              Effect.gen(function*() {
                const service = yield* Beacon
                yield* service.ping("a")
                entered = true
                if (mode === "interrupt") return yield* Effect.never
              }).pipe(Effect.provide(beacon.layer))
          }),
          mode === "fail" ? Interpreter.bind(recorded, () => Effect.fail("failed")) : assertion
        )
      yield* Effect.flip(run(scenario, make("fail")))
      yield* run(scenario, make("pass"))
      entered = false
      const fiber = yield* Effect.forkChild(run(scenario, make("interrupt")))
      while (!entered) yield* Effect.yieldNow
      yield* Fiber.interrupt(fiber)
      yield* run(scenario, make("pass"))
    }))
})
