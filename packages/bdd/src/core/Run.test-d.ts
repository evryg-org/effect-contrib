import { Context, Effect, Scope } from "effect"
import { expectTypeOf, it } from "vitest"
import * as Interpreter from "../EffectInterpreter.js"
import { Observations } from "../harness/Probe.js"
import { Scenario } from "../index.js"
import * as Given from "./Given.js"
import { run } from "./Run.js"
import type { ScenarioError } from "./Run.js"
import * as Then from "./Then.js"
import * as When from "./When.js"

class Used extends Context.Service<Used, number>()("Used") {}
class Unused extends Context.Service<Unused, string>()("Unused") {}
const action = When.define<{}, number, "bad">()("action", (amount: number) => `${amount}`)
const other = When.define<{}, string, { code: number }>()("other", () => "other")
const check = Then.success<{}, number>()("check", () => "check")
const spec = Scenario.make("typed").when(action(1)).then(check())
it("preserves operation-specific requirements and coverage", () => {
  const bindings = Interpreter.make(
    Interpreter.bind(action, { execute: ([amount]) => Effect.map(Used, (value) => value + amount) }),
    Interpreter.bind(other, { execute: () => Unused }),
    Interpreter.bind(check, (_, __, value) => {
      expectTypeOf(value).toEqualTypeOf<number>()
      return Effect.void
    })
  )
  expectTypeOf(run(spec, bindings)).toEqualTypeOf<Effect.Effect<void, ScenarioError, Used>>()
  // @ts-expect-error incomplete interpreter
  const incompleteRun = run(spec, Interpreter.make(bindings.bindings[0]))
  void incompleteRun
  // @ts-expect-error operation result must be number
  Interpreter.bind(action, { execute: () => Effect.succeed("wrong") })
  // This negative fixture deliberately returns an undeclared error to verify bind rejects it.
  // @ts-expect-error operation domain error must be literal bad
  // @effect-diagnostics-next-line missingEffectError:off
  Interpreter.bind(action, { execute: () => Effect.fail({ code: 1 }) })
  const scoped = Interpreter.make(
    Interpreter.bind(action, {
      execute: () =>
        Effect.gen(function*() {
          yield* Observations
          yield* Scope.Scope
          return yield* Used
        })
    }),
    bindings.bindings[2]
  )
  expectTypeOf(run(spec, scoped)).toEqualTypeOf<Effect.Effect<void, ScenarioError, Used>>()
  const emptySetup = Given.define<{}, {}>()("empty-setup", () => "empty")
  const emptyAction = When.define<{}, number>()("empty-action", () => "empty")
  Interpreter.bind(emptySetup, () => Effect.succeed({}))
  Interpreter.bind(emptyAction, { execute: () => Effect.succeed(1), update: () => ({}) })
  // @ts-expect-error empty setup patches must be named-field records
  Interpreter.bind(emptySetup, () => Effect.succeed(123))
  // @ts-expect-error arrays cannot be empty setup patches
  Interpreter.bind(emptySetup, () => Effect.succeed([]))
  // @ts-expect-error primitive action patches are rejected even when no fields were declared
  Interpreter.bind(emptyAction, { execute: () => Effect.succeed(1), update: () => 123 })
  // @ts-expect-error array action patches are rejected even when no fields were declared
  Interpreter.bind(emptyAction, { execute: () => Effect.succeed(1), update: () => [] })
  const namedSetup = Given.define<{}, { count: number }>()("named-setup", () => "named")
  const namedAction = When.define<{}, number, never, { count: number }>()("named-action", () => "named")
  // @ts-expect-error undeclared fields could overwrite extra caller context
  Interpreter.bind(namedSetup, () => Effect.succeed({ count: 1, extra: "wrong" }))
  // @ts-expect-error updates may contribute only their declared context fields
  Interpreter.bind(namedAction, { execute: () => Effect.succeed(1), update: () => ({ count: 1, extra: "wrong" }) })
  interface NamedPatch {
    readonly count: number
  }
  const namedPatch: NamedPatch = { count: 1 }
  Interpreter.bind(namedSetup, () => Effect.succeed(namedPatch))
  Interpreter.bind(namedAction, { execute: () => Effect.succeed(1), update: () => namedPatch })

  // @ts-expect-error fields in any returned union branch must be declared
  Interpreter.bind(namedSetup, () => Effect.succeed(Math.random() > 0.5 ? { count: 1 } : { count: 1, extra: "wrong" }))
  // @ts-expect-error update union branches cannot hide undeclared fields
  Interpreter.bind(namedAction, {
    execute: () => Effect.succeed(1),
    update: () => Math.random() > 0.5 ? { count: 1 } : { count: 1, extra: "wrong" }
  })
})
