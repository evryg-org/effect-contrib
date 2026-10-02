import { describe, expect, it } from "@effect/vitest"
import { Cause, Effect, Exit, Fiber, Schedule } from "effect"
import * as Interpreter from "../EffectInterpreter.js"
import { Scenario } from "../index.js"
import * as Given from "./Given.js"
import { run } from "./Run.js"
import * as Steps from "./Steps.js"
import * as Then from "./Then.js"
import * as When from "./When.js"

const setup = Given.define<{}, { count: number }>()("setup", () => "a fresh counter")
const increment = When.define<{ count: number }, number, string, { count: number }>()("increment", () => "incrementing")
const number = Then.success<{ count: number }, number>()("number", () => "the result matches the counter")
const rejected = Then.failure<{ count: number }, string>()("rejected", () => "the rejection is acknowledged")
const context = Then.context<{ count: number }>()("context", () => "the context exists")
const spec = Scenario.make("counter").given(setup()).when(increment()).then(number()).build()
const model = (offset = 1) =>
  Interpreter.make(
    Interpreter.bind(setup, () => Effect.succeed({ count: 0 })),
    Interpreter.bind(increment, {
      execute: (_, world) => Effect.succeed(world.count + offset),
      update: (_, outcome) => ({ count: outcome._tag === "Success" ? outcome.value : -1 })
    }),
    Interpreter.bind(number, (_, world, value) =>
      Effect.sync(() => {
        expect(world.count).toBe(value)
      }))
  )

describe("ordered execution", () => {
  it.effect("runs the same object against two interpreters and concurrent fresh worlds", () =>
    Effect.gen(function*() {
      yield* run(spec, model())
      yield* run(spec, model(2))
      yield* Effect.all(Array.from({ length: 8 }, () => run(spec, model())), { concurrency: "unbounded" })
    }))
  it.effect("captures synchronous setup, action, update and assertion throws with original causes", () =>
    Effect.gen(function*() {
      const original = new Error("original")
      const throwing = () => {
        throw original
      }
      const interpreters = [
        Interpreter.make(Interpreter.bind(setup, throwing), model().bindings[1], model().bindings[2]),
        Interpreter.make(
          model().bindings[0],
          Interpreter.bind(increment, { execute: throwing, update: () => ({ count: 0 }) }),
          model().bindings[2]
        ),
        Interpreter.make(
          model().bindings[0],
          Interpreter.bind(increment, { execute: () => Effect.succeed(1), update: throwing }),
          model().bindings[2]
        ),
        Interpreter.make(model().bindings[0], model().bindings[1], Interpreter.bind(number, throwing))
      ]
      for (const execution of interpreters.map((interpreter) => run(spec, interpreter))) {
        const diagnostic = yield* Effect.flip(execution)
        expect(diagnostic.cause.reasons.some((reason) => Cause.isDieReason(reason) && reason.defect === original)).toBe(
          true
        )
        expect(diagnostic.step.length).toBeGreaterThan(0)
      }
    }))
  it.effect("requires domain failure acknowledgment and performs its context update", () =>
    Effect.gen(function*() {
      const bindings = Interpreter.make(
        model().bindings[0],
        Interpreter.bind(increment, {
          execute: () => Effect.fail("denied"),
          update: (_, outcome) => ({ count: outcome._tag === "Failure" ? -1 : 1 })
        }),
        Interpreter.bind(context, (_, world) =>
          Effect.sync(() => {
            expect(world.count).toBe(-1)
          })),
        Interpreter.bind(rejected, (_, world, error) =>
          Effect.sync(() => {
            expect(error).toBe("denied")
            expect(world.count).toBe(-1)
          }))
      )
      const unexpected = Scenario.make("unexpected").given(setup()).when(increment()).then(context()).build()
      expect((yield* Effect.flip(run(unexpected, bindings))).reason).toContain("not acknowledged")
      const expected = Scenario.make("expected").given(setup()).when(increment()).then(context()).then(rejected()).when(
        increment()
      ).then(rejected()).build()
      yield* run(expected, bindings)
    }))
  it.effect("does not accept mixed domain failures and defects", () =>
    Effect.gen(function*() {
      const mixed = Cause.combine(Cause.fail("denied"), Cause.die("defect"))
      const scenario = Scenario.make("mixed").given(setup()).when(increment()).then(rejected()).build()
      const interpreter = Interpreter.make(
        model().bindings[0],
        Interpreter.bind(increment, { execute: () => Effect.failCause(mixed), update: () => ({ count: 0 }) }),
        Interpreter.bind(rejected, () => Effect.void)
      )
      const error = yield* Effect.flip(run(scenario, interpreter))
      expect(error.cause).toBe(mixed)
      expect(error.reason).toContain("defect")
    }))
  it.effect("propagates cancellation and runs scoped cleanup", () =>
    Effect.gen(function*() {
      let acquired = false
      let released = 0
      const interpreter = Interpreter.make(
        model().bindings[0],
        Interpreter.bind(increment, {
          execute: () =>
            Effect.gen(function*() {
              yield* Effect.acquireRelease(
                Effect.sync(() => {
                  acquired = true
                }),
                () =>
                  Effect.sync(() => {
                    released++
                  })
              )
              return yield* Effect.never
            }),
          update: () => ({ count: 0 })
        }),
        model().bindings[2]
      )
      const fiber = yield* Effect.forkChild(run(spec, interpreter))
      while (!acquired) yield* Effect.yieldNow
      yield* Fiber.interrupt(fiber)
      const exit = yield* Fiber.await(fiber)
      expect(Exit.isFailure(exit) && exit.cause.reasons.some(Cause.isInterruptReason)).toBe(true)
      expect(released).toBe(1)
    }))
  it.effect("reallocates setup on retry and preserves assertion domain errors", () =>
    Effect.gen(function*() {
      let attempts = 0
      const original = { assertion: "failed" }
      const interpreter = Interpreter.make(
        Interpreter.bind(setup, () => Effect.sync(() => ({ count: ++attempts }))),
        model().bindings[1],
        Interpreter.bind(number, () => attempts === 1 ? Effect.fail(original) : Effect.void)
      )
      const error = yield* Effect.flip(run(spec, interpreter))
      expect(error.cause.reasons.filter(Cause.isFailReason)[0]?.error).toBe(original)
      attempts = 0
      yield* run(spec, interpreter).pipe(Effect.retry(Schedule.recurs(1)))
      expect(attempts).toBe(2)
    }))
  it.effect("rejects outcome mismatches and prevents unacknowledged failure from reaching another action", () =>
    Effect.gen(function*() {
      const wrong = Scenario.make("wrong").given(setup()).when(increment()).then(rejected()).build()
      const success = Interpreter.make(...model().bindings, Interpreter.bind(rejected, () => Effect.void))
      expect((yield* Effect.flip(run(wrong, success))).reason).toContain("expected outcome")
      let executions = 0
      const failing = Interpreter.make(
        model().bindings[0],
        Interpreter.bind(increment, {
          execute: () =>
            Effect.suspend(() => {
              executions++
              return Effect.fail("denied")
            }),
          update: () => ({ count: 1 })
        }),
        Interpreter.bind(context, () => Effect.void),
        model().bindings[2]
      )
      const next = Scenario.make("next").given(setup()).when(increment()).then(context()).when(increment()).build()
      expect((yield* Effect.flip(run(next, failing))).reason).toContain("not acknowledged")
      expect(executions).toBe(1)
      expect((yield* Effect.flip(run(spec, failing))).reason).toContain("expected outcome")
    }))
  it.effect("cleans up scoped resources on successful, setup-failed and assertion-failed runs", () =>
    Effect.gen(function*() {
      for (const mode of ["success", "setup", "assertion"] as const) {
        let released = 0
        const interpreter = Interpreter.make(
          Interpreter.bind(setup, () =>
            Effect.gen(function*() {
              yield* Effect.acquireRelease(Effect.void, () =>
                Effect.sync(() => {
                  released++
                }))
              if (mode === "setup") return yield* Effect.fail("setup")
              return { count: 0 }
            })),
          model().bindings[1],
          Interpreter.bind(number, () => mode === "assertion" ? Effect.fail("assertion") : Effect.void)
        )
        const exit = yield* Effect.exit(run(spec, interpreter))
        expect(Exit.isSuccess(exit)).toBe(mode === "success")
        expect(released).toBe(1)
      }
    }))

  it.effect("fluent and pipe workflow fragments execute in identical authored order", () =>
    Effect.gen(function*() {
      const workflow = Steps.from(setup(), increment(), number(), increment(), number())
      const fluent = Scenario.make("workflow").use(workflow).build()
      const piped = Scenario.make("workflow").pipe(Scenario.use(workflow), Scenario.build)
      const orders: Array<Array<string>> = []
      for (const scenario of [fluent, piped]) {
        const order: Array<string> = []
        orders.push(order)
        const interpreter = Interpreter.make(
          Interpreter.bind(setup, () =>
            Effect.sync(() => {
              order.push("given")
              return { count: 0 }
            })),
          Interpreter.bind(increment, {
            execute: (_, world) =>
              Effect.sync(() => {
                order.push("when")
                return world.count + 1
              }),
            update: (_, outcome) => ({ count: outcome._tag === "Success" ? outcome.value : -1 })
          }),
          Interpreter.bind(number, (_, world, value) =>
            Effect.sync(() => {
              order.push(`then:${value}`)
              expect(world.count).toBe(value)
            }))
        )
        yield* run(scenario, interpreter)
      }
      expect(orders).toEqual([["given", "when", "then:1", "when", "then:2"], [
        "given",
        "when",
        "then:1",
        "when",
        "then:2"
      ]])
    }))
  it.effect("validates plain context contributions inside captured execution", () =>
    Effect.gen(function*() {
      class Contribution {
        readonly count = 1
      }
      const invalid: ReadonlyArray<unknown> = [null, [], 1, "record", new Contribution(), {
        count: 1,
        [Symbol("hidden")]: 2
      }]
      for (const patch of invalid) {
        const interpreter = Interpreter.make(
          Interpreter.bind(setup, () => Effect.succeed(patch as { count: number })),
          model().bindings[1],
          model().bindings[2]
        )
        const error = yield* Effect.flip(run(spec, interpreter))
        expect(error.reason).toContain("contribution")
        expect(error.cause.reasons.some(Cause.isDieReason)).toBe(true)
      }
      const valid = Object.assign(Object.create(null) as { count: number }, { count: 0 })
      yield* run(
        spec,
        Interpreter.make(Interpreter.bind(setup, () => Effect.succeed(valid)), model().bindings[1], model().bindings[2])
      )
    }))
  it.effect("captures immutable bindings independently of the caller's implementation object", () =>
    Effect.gen(function*() {
      const implementation = { execute: () => Effect.succeed(1), update: () => ({ count: 1 }) }
      const binding = Interpreter.bind(increment, implementation)
      implementation.execute = () => Effect.succeed(99)
      const interpreter = Interpreter.make(
        model().bindings[0],
        binding,
        Interpreter.bind(number, (_, __, value) =>
          Effect.sync(() => {
            expect(value).toBe(1)
          }))
      )
      expect(Object.isFrozen(interpreter.bindings)).toBe(true)
      expect(Object.isFrozen(binding)).toBe(true)
      expect(Object.isFrozen(binding.implementation)).toBe(true)
      yield* run(spec, interpreter)
    }))
})
