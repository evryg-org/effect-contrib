import { expectTypeOf } from "vitest"
import { Given, Scenario, Steps, Then, When } from "../index.js"
import type { AnyDescriptor } from "./Step.js"

const initial = Given.define<{}, { value: number; extra: boolean }>()("initial", (n: number) => String(n))
const replace = Given.define<{ value: number }, { value: string }>()("replace", () => "replace")
const needsString = Then.context<{ value: string; extra: boolean }>()("string", () => "string")
const action = When.define<{ value: number }, string, { reason: string }>()("action", () => "action")
const success = Then.success<{}, string>()("success", () => "success")
const failure = Then.failure<{}, { reason: string }>()("failure", () => "failure")
const incompatible = Then.success<{}, number>()("number", () => "number")
const setup = Steps.from(initial(1))
const fluent = Scenario.make("test").use(setup).when(action()).then(success()).build()
const piped = Scenario.make("test").pipe(
  Scenario.use(setup),
  Scenario.when(action()),
  Scenario.then(success()),
  Scenario.build
)
expectTypeOf(piped).toEqualTypeOf(fluent)
Scenario.make("overwrite").given(initial(0)).given(replace()).then(needsString()).build()
Scenario.make("failure").given(initial(0)).when(action()).then(failure()).build()
// @ts-expect-error missing required context
Scenario.make("missing").when(action())
// @ts-expect-error invalid assertion subject
Scenario.make("incompatible").given(initial(0)).when(action()).then(incompatible())
// @ts-expect-error assertion requires an action
Scenario.make("no action").then(success())
// @ts-expect-error fragment dependencies are checked at application
Scenario.make("fragment").use(Steps.from(action(), success()))
// @ts-expect-error wrong argument type
initial("one")
// @ts-expect-error primitive patches cannot be authored
Given.define<{}, number>()("invalid", () => "invalid")
// @ts-expect-error arrays cannot contribute named context
Given.define<{}, Array<string>>()("array", () => "array")
// @ts-expect-error optional top-level patch fields cannot be promised
Given.define<{}, { x?: string }>()("optional", () => "optional")
Given.define<{}, { x: string | undefined }>()("required", () => "required")
// @ts-expect-error builders are not completed scenarios
Scenario.inspect(Scenario.make("unfinished"))
// @ts-expect-error and inherits preceding semantic kind
Scenario.make("kind").given(initial(0)).and(action())

// @ts-expect-error date patches are not named records
Given.define<{}, Date>()("date", () => "date")
// @ts-expect-error map patches are not named records
Given.define<{}, Map<string, number>>()("map", () => "map")
// @ts-expect-error function patches are not named records
Given.define<{}, () => number>()("function", () => "function")
// @ts-expect-error numeric patch keys are not named fields
Given.define<{}, { 0: number }>()("numeric", () => "numeric")

const widened = [action()]
// @ts-expect-error widened arrays cannot erase fragment dependencies and operation requirements
Scenario.make("widened").use(Steps.from(...widened))
const assertionGroup = Steps.from(needsString())
Scenario.make("preserved").use(setup).use(Steps.from(replace())).use(assertionGroup).build()
const workflow = Steps.concat(setup, Steps.from(action(), success()))
expectTypeOf(Scenario.make("workflow").use(workflow).build()).toEqualTypeOf(fluent)
const identity = Scenario.make("identity").use(Steps.concat(Steps.empty, setup)).when(action()).then(success()).build()
expectTypeOf(identity).toEqualTypeOf(fluent)

// @ts-expect-error alternative contribution shapes cannot promise named fields unconditionally
Given.define<{}, { value: string } | { other: number }>()("union", () => "union")
const secondAction = When.define<{ value: number }, number>()("second", () => "second")
// @ts-expect-error repeated actions replace the latest assertion subject
Scenario.make("repeated").given(initial(0)).when(action()).when(secondAction()).then(success())
// @ts-expect-error workflow fragments replace the latest assertion subject
Scenario.make("repeated fragment").use(Steps.from(initial(0), action(), secondAction(), success()))
declare const unionCheck: ReturnType<typeof success> | ReturnType<typeof incompatible>
// @ts-expect-error every member of a descriptor union must be compatible
Scenario.make("union assertion").given(initial(0)).when(action()).then(unionCheck)
declare const unionSetup: ReturnType<typeof initial> | ReturnType<typeof replace>
// @ts-expect-error every member of a descriptor union must have its dependencies satisfied
Scenario.make("union setup").given(unionSetup)
const dataFirstGiven = Scenario.given(Scenario.make("given"), initial(0))
const fluentGiven = Scenario.make("given").given(initial(0))
expectTypeOf(dataFirstGiven).toEqualTypeOf(fluentGiven)
const dataFirstAnd = Scenario.and(dataFirstGiven, initial(0))
expectTypeOf(dataFirstAnd).toEqualTypeOf(fluentGiven.and(initial(0)))
const nestedFirst = Scenario.and(Scenario.given(Scenario.make("nested"), initial(0)), initial(0))
expectTypeOf(nestedFirst).toEqualTypeOf(fluentGiven.and(initial(0)))

// @ts-expect-error descriptor arguments are immutable tuple data
initial(0).args[0] = 1

const _anotherField = Given.define<{ value: number }, { other: boolean }>()("other", () => "other")
declare const unionReplacement: ReturnType<typeof replace> | ReturnType<typeof _anotherField>
const numericContext = Then.context<{ value: number }>()("numericContext", () => "numeric context")
// @ts-expect-error a compatible descriptor union can replace value with a string at runtime
Scenario.make("union replacement").given(initial(0)).given(unionReplacement).then(numericContext())

const longFluent = Scenario.make("long").given(initial(0)).and(initial(1)).but(initial(2)).when(action()).then(
  success()
).and(success()).but(success()).build()
const longPipe = Scenario.make("long").pipe(
  Scenario.given(initial(0)),
  Scenario.and(initial(1)),
  Scenario.but(initial(2)),
  Scenario.when(action()),
  Scenario.then(success()),
  Scenario.and(success()),
  Scenario.but(success()),
  Scenario.build
)
expectTypeOf(longPipe).toEqualTypeOf(longFluent)
const identityPipe = Scenario.make("identity")
expectTypeOf(identityPipe.pipe()).toEqualTypeOf(identityPipe)
Scenario.make("late incompatible").pipe(
  Scenario.given(initial(0)),
  Scenario.and(initial(1)),
  Scenario.but(initial(2)),
  Scenario.when(action()),
  Scenario.then(success()),
  Scenario.and(success()),
  // @ts-expect-error late pipe stages retain the latest success type
  Scenario.but(incompatible()),
  Scenario.build
)

const maximumPipe = Scenario.make("twenty stages").pipe(
  Scenario.given(initial(0)),
  Scenario.when(action()),
  Scenario.then(success()),
  Scenario.and(success()),
  Scenario.and(success()),
  Scenario.and(success()),
  Scenario.and(success()),
  Scenario.and(success()),
  Scenario.and(success()),
  Scenario.and(success()),
  Scenario.and(success()),
  Scenario.and(success()),
  Scenario.and(success()),
  Scenario.and(success()),
  Scenario.and(success()),
  Scenario.and(success()),
  Scenario.and(success()),
  Scenario.and(success()),
  Scenario.and(success()),
  Scenario.build
)
expectTypeOf(maximumPipe).toEqualTypeOf(longFluent)
const genericFragment = <D extends AnyDescriptor>(descriptor: D) => Steps.from(descriptor)
Scenario.make("generic fragment").use(genericFragment(initial(0))).use(genericFragment(replace())).then(needsString())
  .build()
