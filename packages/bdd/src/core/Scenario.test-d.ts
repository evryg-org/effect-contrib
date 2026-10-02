import { expectTypeOf } from "vitest"
import { feature, Given, Scenario, Steps, steps, Then, When } from "../index.js"
import type { AnyDescriptor } from "./Step.js"

const initial = Given.define<{}, { value: number; extra: boolean }>()("initial", (n: number) => String(n))
const replace = Given.define<{ value: number }, { value: string }>()("replace", () => "replace")
const needsString = Then.context<{ value: string; extra: boolean }>()("string", () => "string")
const action = When.define<{ value: number }, string, { reason: string }>()("action", () => "action")
const success = Then.success<{}, string>()("success", () => "success")
const failure = Then.failure<{}, { reason: string }>()("failure", () => "failure")
const incompatible = Then.success<{}, number>()("number", () => "number")
const setup = Steps.from(initial(1))
const fluent = Scenario.make("test").use(setup).when(action()).then(success())
const piped = Scenario.make("test").pipe(Scenario.use(setup), Scenario.when(action()), Scenario.then(success()))
const dataFirst = Scenario.then(Scenario.when(Scenario.use(Scenario.make("test"), setup), action()), success())
expectTypeOf(piped).toEqualTypeOf(fluent)
expectTypeOf(dataFirst).toEqualTypeOf(fluent)
Scenario.make("overwrite").given(initial(0)).given(replace()).then(needsString())
Scenario.make("failure").given(initial(0)).when(action()).then(failure())
// @ts-expect-error missing required context
Scenario.make("missing").when(action())
// @ts-expect-error invalid assertion subject
Scenario.make("incompatible").given(initial(0)).when(action()).then(incompatible())
// @ts-expect-error assertion requires an action
Scenario.make("no action").then(success())
// @ts-expect-error fragment dependencies are checked
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
// @ts-expect-error explicit build removed
fluent.build()
// @ts-expect-error public completion combinator removed
void Scenario.build
// @ts-expect-error callback authoring removed
Scenario.make("callback", (s) => s)
// @ts-expect-error and inherits preceding semantic kind
Scenario.make("kind").given(initial(0)).and(action())
// @ts-expect-error date patches are not named records
Given.define<{}, Date>()("date", () => "date")
// @ts-expect-error map patches are not named records
Given.define<{}, Map<string, number>>()("map", () => "map")
// @ts-expect-error function patches are not named records
Given.define<{}, () => number>()("function", () => "function")
// @ts-expect-error numeric keys are not named fields
Given.define<{}, { 0: number }>()("numeric", () => "numeric")
const widened = [action()]
// @ts-expect-error widened arrays cannot erase dependencies
Scenario.make("widened").use(Steps.from(...widened))
const assertionGroup = Steps.from(needsString())
Scenario.make("preserved").use(setup).use(Steps.from(replace())).use(assertionGroup)
const workflow = Steps.concat(setup, Steps.from(action(), success()))
expectTypeOf(Scenario.make("workflow").use(workflow)).toEqualTypeOf(fluent)
const identity = Scenario.make("identity").use(Steps.concat(Steps.empty, setup)).when(action()).then(success())
expectTypeOf(identity).toEqualTypeOf(fluent)
// @ts-expect-error union contributions cannot promise fields unconditionally
Given.define<{}, { value: string } | { other: number }>()("union", () => "union")
const secondAction = When.define<{ value: number }, number>()("second", () => "second")
// @ts-expect-error repeated actions replace latest subject
Scenario.make("repeated").given(initial(0)).when(action()).when(secondAction()).then(success())
// @ts-expect-error fragments replace latest subject
Scenario.make("repeated fragment").use(Steps.from(initial(0), action(), secondAction(), success()))
declare const unionCheck: ReturnType<typeof success> | ReturnType<typeof incompatible>
// @ts-expect-error every union member must be compatible
Scenario.make("union assertion").given(initial(0)).when(action()).then(unionCheck)
declare const unionSetup: ReturnType<typeof initial> | ReturnType<typeof replace>
// @ts-expect-error every union member requires satisfied context
Scenario.make("union setup").given(unionSetup)
// @ts-expect-error args immutable
initial(0).args[0] = 1
const _anotherField = Given.define<{ value: number }, { other: boolean }>()("other", () => "other")
declare const unionReplacement: ReturnType<typeof replace> | ReturnType<typeof _anotherField>
const numericContext = Then.context<{ value: number }>()("numericContext", () => "numeric context")
// @ts-expect-error union replacement may change value to string
Scenario.make("union replacement").given(initial(0)).given(unionReplacement).then(numericContext())
const longFluent = Scenario.make("long").given(initial(0)).and(initial(1)).but(initial(2)).when(action()).then(
  success()
).and(success()).but(success())
const longPipe = Scenario.make("long").pipe(
  Scenario.given(initial(0)),
  Scenario.and(initial(1)),
  Scenario.but(initial(2)),
  Scenario.when(action()),
  Scenario.then(success()),
  Scenario.and(success()),
  Scenario.but(success())
)
expectTypeOf(longPipe).toEqualTypeOf(longFluent)
const zero = Scenario.make("identity")
expectTypeOf(zero.pipe()).toEqualTypeOf(zero)
Scenario.make("late incompatible").pipe(
  Scenario.given(initial(0)),
  Scenario.and(initial(1)),
  Scenario.but(initial(2)),
  Scenario.when(action()),
  Scenario.then(success()),
  Scenario.and(success()),
  // @ts-expect-error late stages retain latest success type
  Scenario.but(incompatible())
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
  Scenario.and(success())
)
expectTypeOf(maximumPipe).toEqualTypeOf(longFluent)
const genericFragment = <D extends AnyDescriptor>(descriptor: D) => Steps.from(descriptor)
Scenario.make("generic fragment").use(genericFragment(initial(0))).use(genericFragment(replace())).then(needsString())
const prefix = Scenario.make("prefix").given(initial(0))
steps(prefix)
feature("prefixes", [zero, prefix, fluent])
expectTypeOf(prefix).toMatchTypeOf<Scenario.Scenario<typeof initial>>()
// @ts-expect-error a fluent scenario cannot be an async return type
async function _awaitScenario() {
  // @ts-expect-error TypeScript rejects awaiting fluent then-bearing scenarios
  return await fluent
}
// @ts-expect-error TypeScript rejects bare fluent async returns
async function _returnScenario() {
  return fluent
}
