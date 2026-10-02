/** This fixture is compiled independently by unpatched TypeScript 5.9 and 7. */
import { feature, Given, Scenario, Steps, Then, toGherkin, When } from "@evryg/effect-bdd"
import { EffectInterpreter, run } from "@evryg/effect-bdd/effect"
import { toTest as toEffectTest } from "@evryg/effect-bdd/effect-vitest"
import { toTest } from "@evryg/effect-bdd/vitest"
import { Context, Effect } from "effect"

const setup = Given.define<{}, { count: number }>()("fixture.setup", (count: number) => `count ${count}`)
const rename = Given.define<{ count: number }, { count: string }>()("fixture.rename", () => "rename")
const action = When.define<{ count: number }, number, "rejected">()("fixture.action", () => "act")
const check = Then.success<{}, number>()("fixture.check", (expected: number) => `equals ${expected}`)
const failure = Then.failure<{}, "rejected">()("fixture.failure", () => "rejected")
const stringCheck = Then.context<{ count: string }>()("fixture.string", () => "string")
const unrelated = When.define<{}, string, Error>()("fixture.other", () => "other")
const fragment = Steps.from(setup(0))
const fluent = Scenario.make("fixture").use(fragment).when(action()).then(check(1)).build()
const piped = Scenario.make("fixture").pipe(
  Scenario.use(fragment),
  Scenario.when(action()),
  Scenario.then(check(1)),
  Scenario.build
)
const same: typeof fluent = piped
void same
Scenario.make("replacement").use(fragment).given(rename()).then(stringCheck()).build()
feature("heterogeneous", [fluent, Scenario.make("context").use(fragment).build()])
const interpreter = EffectInterpreter.make(
  EffectInterpreter.bind(setup, ([count]) => Effect.succeed({ count })),
  EffectInterpreter.bind(action, { execute: (_args, context) => Effect.succeed(context.count + 1) }),
  EffectInterpreter.bind(check, ([expected], _context, actual) =>
    Effect.sync(() => {
      if (actual !== expected) throw new Error("mismatch")
    })),
  EffectInterpreter.bind(unrelated, { execute: () => Effect.succeed("separate result") })
)
run(fluent, interpreter)
toTest(fluent, interpreter)
toEffectTest(fluent, interpreter)
// @ts-expect-error missing dependencies
Scenario.make("missing").when(action())
// @ts-expect-error assertion receives a number, not a string
Scenario.make("wrong subject").use(fragment).when(action()).then(Then.success<{}, string>()("wrong", () => "wrong")())
// @ts-expect-error failure assertion requires a matching action
Scenario.make("no action").then(failure())
// @ts-expect-error invalid primitive patch
Given.define<{}, number>()("primitive", () => "primitive")
// @ts-expect-error invalid array patch
Given.define<{}, Array<string>>()("array", () => "array")
// @ts-expect-error invalid optional top-level patch
Given.define<{}, { count?: number }>()("optional", () => "optional")
// @ts-expect-error incomplete interpreter
run(fluent, EffectInterpreter.make())
// @ts-expect-error only completed scenarios can render
toGherkin(Scenario.make("unfinished"))
class Port extends Context.Service<Port, { readonly count: number }>()("fixture/Port") {}
const requiresPort = EffectInterpreter.make(
  EffectInterpreter.bind(setup, () => Effect.map(Port, (port) => ({ count: port.count }))),
  EffectInterpreter.bind(action, { execute: () => Effect.succeed(1) }),
  EffectInterpreter.bind(check, () => Effect.void)
)
// @ts-expect-error Vitest callbacks require provided services
toTest(fluent, requiresPort)
const effectCallback: () => Effect.Effect<void, unknown, Port> = toEffectTest(fluent, requiresPort)
void effectCallback
const heterogeneous = feature("adapter suite", [fluent, Scenario.make("setup").given(setup(0)).build()])
for (const scenario of heterogeneous.scenarios) {
  toTest(scenario, interpreter)
  toEffectTest(scenario, interpreter)
}

// Exact equality avoids language-service or test-runner compiler plugins.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? (<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2) ? true : false
  : false
const equal = <A, B>(..._proof: Equal<A, B> extends true ? [] : [never]) => {}
equal<typeof fluent, typeof piped>()
equal<typeof setup.id, "fixture.setup">()

const _dualFluent = Scenario.make("dual").given(setup(0)).and(setup(1)).but(setup(2))
  .when(action()).then(check(1)).and(check(1)).but(check(1)).build()
const _dualFirst = Scenario.build(Scenario.but(
  Scenario.and(
    Scenario.then(
      Scenario.when(
        Scenario.but(
          Scenario.and(
            Scenario.given(
              Scenario.make("dual"),
              setup(0)
            ),
            setup(1)
          ),
          setup(2)
        ),
        action()
      ),
      check(1)
    ),
    check(1)
  ),
  check(1)
))
const _dualLast = Scenario.make("dual").pipe(
  Scenario.given(setup(0)),
  Scenario.and(setup(1)),
  Scenario.but(setup(2)),
  Scenario.when(action()),
  Scenario.then(check(1)),
  Scenario.and(check(1)),
  Scenario.but(check(1)),
  Scenario.build
)
equal<typeof _dualFluent, typeof _dualFirst>()
equal<typeof _dualFluent, typeof _dualLast>()
equal<typeof fluent, ReturnType<typeof _withUse>>()
function _withUse() {
  return Scenario.build(
    Scenario.then(Scenario.when(Scenario.use(Scenario.make("fixture"), fragment), action()), check(1))
  )
}
const workflow = Steps.concat(fragment, Steps.from(action(), check(1)))
const _curriedWorkflow = Steps.concat(Steps.from(action(), check(1)))(fragment)
equal<typeof workflow, typeof _curriedWorkflow>()
const _identity = Scenario.make("_identity").use(Steps.concat(Steps.empty, workflow)).build()
equal<typeof _identity, typeof fluent>()
const _leftAssociated = Steps.concat(Steps.concat(fragment, Steps.from(action())), Steps.from(check(1)))
const _rightAssociated = Steps.concat(fragment, Steps.concat(Steps.from(action()), Steps.from(check(1))))
equal<typeof _leftAssociated, typeof _rightAssociated>()

const withExtra = Given.define<{}, { count: number; extra: boolean }>()("fixture.extra", () => "extra")
const retainsExtra = Then.context<{ count: string; extra: boolean }>()("fixture.retains", () => "retains extra")
Scenario.make("replacement keeps extras").use(Steps.from(withExtra())).use(Steps.from(rename(), retainsExtra())).build()
// @ts-expect-error fragment needs are checked at the application site
Scenario.make("fragment needs").use(Steps.from(action(), check(1)))
// @ts-expect-error replacement changes the field type required by an action
Scenario.make("replaced context").given(setup(0)).given(rename()).when(action())
// @ts-expect-error fragment checks its current assertion subject
Scenario.make("wrong fragment subject").given(setup(0)).when(unrelated()).use(Steps.from(check(1)))
const stringSuccess = Then.success<{}, string>()("fixture.string.success", () => "string success")
// @ts-expect-error repeated actions replace their current assertion subject
Scenario.make("latest subject").given(setup(0)).when(unrelated()).when(action()).then(stringSuccess())
// @ts-expect-error workflow fragments also replace their current assertion subject
Scenario.make("latest fragment subject").use(Steps.from(setup(0), unrelated(), action(), stringSuccess()))
// @ts-expect-error incorrect execute result
EffectInterpreter.bind(action, { execute: () => Effect.succeed("wrong") })
// @ts-expect-error incorrect execute domain error
EffectInterpreter.bind(action, { execute: () => Effect.fail(new Error("wrong")) })
// @ts-expect-error implementation receives the inferred argument tuple
EffectInterpreter.bind(setup, (_args: readonly [string]) => Effect.succeed({ count: 1 }))
// @ts-expect-error implementation receives the declared required context
EffectInterpreter.bind(action, { execute: (_args, _context: { count: string }) => Effect.succeed(1) })
// @ts-expect-error assertion receives its own success type
EffectInterpreter.bind(check, (_args, _context, _subject: string) => Effect.void)
// @ts-expect-error failure assertion receives its own domain error type
EffectInterpreter.bind(failure, (_args, _context, _error: Error) => Effect.void)
const patchAction = When.define<{ count: number }, number, "rejected", { count: number }>()(
  "fixture.update",
  () => "update"
)
// @ts-expect-error nonempty action patches require update
EffectInterpreter.bind(patchAction, { execute: () => Effect.succeed(1) })
// @ts-expect-error update must return the declared patch
EffectInterpreter.bind(patchAction, { execute: () => Effect.succeed(1), update: () => ({ count: "wrong" }) })
EffectInterpreter.bind(patchAction, {
  execute: () => Effect.succeed(1),
  update: (context, outcome) => {
    if (outcome._tag === "Success") {
      equal<typeof outcome.value, number>()
      return { count: outcome.value }
    }
    equal<typeof outcome.error, "rejected">()
    return { count: context.count }
  }
})
const erased: EffectInterpreter.Interpreter<ReadonlyArray<EffectInterpreter.AnyBinding>> = interpreter
// @ts-expect-error erased binding arrays cannot guarantee complete operation coverage
run(fluent, erased)
// @ts-expect-error interpreter bindings cannot be mutated
interpreter.bindings[0] = EffectInterpreter.bind(setup, () => Effect.succeed({ count: 0 }))
// @ts-expect-error individual binding definitions are immutable
interpreter.bindings[0].definition = setup

class OtherPort extends Context.Service<OtherPort, { readonly label: string }>()("fixture/OtherPort") {}
const serviceInterpreter = EffectInterpreter.make(
  ...requiresPort.bindings,
  EffectInterpreter.bind(unrelated, { execute: () => Effect.map(OtherPort, (port) => port.label) }),
  EffectInterpreter.bind(stringSuccess, () => Effect.void)
)
const _usedEffect = run(fluent, serviceInterpreter)
equal<Effect.Services<typeof _usedEffect>, Port>()
const otherScenario = Scenario.make("other service").when(unrelated()).then(stringSuccess()).build()
const serviceSuite = feature("services", [fluent, otherScenario])
for (const scenario of serviceSuite.scenarios) {
  const _suiteEffect = run(scenario, serviceInterpreter)
  equal<Effect.Services<typeof _suiteEffect>, Port | OtherPort>()
  const _callback = toEffectTest(scenario, serviceInterpreter)
  equal<Effect.Services<ReturnType<typeof _callback>>, Port | OtherPort>()
  // @ts-expect-error every possible scenario's operations must have bindings
  run(scenario, requiresPort)
  // @ts-expect-error every possible scenario's services must be provided to Vitest
  toTest(scenario, serviceInterpreter)
}

const alternativeSetup = Given.define<{}, { count: number }>()("fixture.alternative", () => "alternative")
const selectedDefinition = Math.random() > 0.5 ? setup : alternativeSetup
// @ts-expect-error one selected runtime definition cannot promise bindings for every union member
EffectInterpreter.bind(selectedDefinition, () => Effect.succeed({ count: 0 }))
equal<Parameters<typeof setup>, [count: number]>()
const stringFailure = Then.failure<{}, Error>()("fixture.string.failure", () => "an error")
Scenario.make("string error").when(unrelated()).then(stringFailure()).build()
// @ts-expect-error independent commands retain distinct domain error types
Scenario.make("different error").given(setup(0)).when(action()).then(stringFailure())
// @ts-expect-error descriptors with incorrect argument types cannot be authored
setup("wrong")
Given.define<{}, { count: number | undefined }>()("fixture.undefined", () => "required but possibly undefined")
// @ts-expect-error named patch fields cannot be promised by alternative contribution shapes
Given.define<{}, { count: number } | { other: string }>()("fixture.union", () => "union")
// @ts-expect-error built-in object patches are not plain named-field records
Given.define<{}, Date>()("fixture.date", () => "date")
// @ts-expect-error function patches are not plain named-field records
Given.define<{}, () => void>()("fixture.function", () => "function")
const widenedDescriptors = [action()]
// @ts-expect-error widened fragments cannot erase ordered dependency checks
Scenario.make("widened fragment").use(Steps.from(...widenedDescriptors))
// @ts-expect-error completed scenarios are opaque
const _counterfeit: Scenario.Scenario = { name: "counterfeit", tags: [] }
const setupDescriptor = setup(0)
// @ts-expect-error frozen descriptor argument tuples are read-only
setupDescriptor.args[0] = 1
// @ts-expect-error descriptor argument tuples cannot be extended
setupDescriptor.args.push(1)

const emptySetup = Given.define<{}, {}>()("fixture.empty", () => "empty setup")
// @ts-expect-error empty setup patches still require named-field records
EffectInterpreter.bind(emptySetup, () => Effect.succeed(123))
// @ts-expect-error empty setup patches cannot return arrays
EffectInterpreter.bind(emptySetup, () => Effect.succeed([]))
EffectInterpreter.bind(emptySetup, () => Effect.succeed({}))
const emptyPatchAction = When.define<{}, number>()("fixture.empty.action", () => "empty patch action")
// @ts-expect-error optional empty updates still cannot produce primitive patches
EffectInterpreter.bind(emptyPatchAction, { execute: () => Effect.succeed(1), update: () => 123 })
// @ts-expect-error optional empty updates still cannot produce array patches
EffectInterpreter.bind(emptyPatchAction, { execute: () => Effect.succeed(1), update: () => [] })
EffectInterpreter.bind(emptyPatchAction, { execute: () => Effect.succeed(1), update: () => ({}) })
const _identityPipe = Scenario.make("pipe identity").pipe()
equal<typeof _identityPipe, ReturnType<typeof Scenario.make>>()
// Annotation-free consumers preserve the latest result through an ordinary long pipe.
Scenario.make("late incompatibility").pipe(
  Scenario.given(setup(0)),
  Scenario.and(setup(1)),
  Scenario.but(setup(2)),
  Scenario.when(action()),
  Scenario.then(check(1)),
  Scenario.and(check(1)),
  // @ts-expect-error a late assertion still requires the latest action's number result
  Scenario.but(stringSuccess()),
  Scenario.build
)

// The upper ordinary pipe arity preserves inference without caller annotations.
const _twentyStages = Scenario.make("twenty stages").pipe(
  Scenario.given(setup(0)),
  Scenario.and(setup(1)),
  Scenario.but(setup(2)),
  Scenario.when(action()),
  Scenario.then(check(1)),
  Scenario.and(check(1)),
  Scenario.and(check(1)),
  Scenario.and(check(1)),
  Scenario.and(check(1)),
  Scenario.and(check(1)),
  Scenario.and(check(1)),
  Scenario.and(check(1)),
  Scenario.and(check(1)),
  Scenario.and(check(1)),
  Scenario.and(check(1)),
  Scenario.and(check(1)),
  Scenario.and(check(1)),
  Scenario.and(check(1)),
  Scenario.and(check(1)),
  Scenario.build
)
equal<typeof _twentyStages, typeof _dualFluent>()
// Context patches cannot silently overwrite caller fields outside their declaration.
// @ts-expect-error a Given implementation cannot add undeclared context fields
EffectInterpreter.bind(setup, () => Effect.succeed({ count: 1, extra: "wrong" }))
// @ts-expect-error an update cannot add undeclared context fields
EffectInterpreter.bind(patchAction, { execute: () => Effect.succeed(1), update: () => ({ count: 1, extra: "wrong" }) })
// @ts-expect-error every possible Given patch branch must match the declaration
EffectInterpreter.bind(setup, () => Effect.succeed(Math.random() > 0.5 ? { count: 1 } : { count: 1, extra: "wrong" }))
// @ts-expect-error every possible update patch branch must match the declaration
EffectInterpreter.bind(patchAction, {
  execute: () => Effect.succeed(1),
  update: () => Math.random() > 0.5 ? { count: 1 } : { count: 1, extra: "wrong" }
})
interface NamedPatch {
  readonly count: number
}
const namedPatch: NamedPatch = { count: 1 }
EffectInterpreter.bind(setup, () => Effect.succeed(namedPatch))
EffectInterpreter.bind(patchAction, { execute: () => Effect.succeed(1), update: () => namedPatch })
