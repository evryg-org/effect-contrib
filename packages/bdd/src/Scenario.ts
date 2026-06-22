/**
 * The `Scenario` term and the type-safe, phase-typed builder that constructs it.
 *
 * Authoring a scenario produces *data*, not an `Effect`: a reified `Scenario`
 * value that interpreters (`./Run.js`, `./Gherkin.js`) give meaning to. The
 * builder is a phase machine — `Given` → `When` → `Then` — so only the legal
 * next combinator is offered at each step, the context accumulates with named
 * keys, and each outcome method feeds the correct payload type to its
 * assertion.
 *
 * @since 0.0.1
 */
import type { Effect } from "effect"
import type { Assertion, Given, When } from "./Step.js"

/**
 * The three observable results of the action under test, mirroring an `Exit`:
 * a success value, a typed failure, or a defect.
 *
 * @since 0.0.1
 * @category models
 */
export type Outcome = "success" | "failure" | "defect"

/**
 * The payload an assertion receives for a given {@link Outcome}: the success
 * value `A`, the typed error `E`, or `unknown` for a defect.
 *
 * @since 0.0.1
 * @category models
 */
export type Payload<O extends Outcome, A, E> = O extends "success" ? A
  : O extends "failure" ? E
  : unknown

/**
 * Flatten an intersection into a single object type, for readable hovers and
 * accumulated-context display.
 *
 * @since 0.0.1
 * @category utilities
 */
export type Simplify<T> = { [K in keyof T]: T[K] } & {}

/**
 * An expected outcome paired with the assertion to run against its payload.
 *
 * @since 0.0.1
 * @category models
 */
export interface ThenStep<X, R> {
  readonly outcome: Outcome
  readonly assertion: Assertion<X, R>
}

/**
 * A reified Given/When/Then scenario. It is plain data: the `givens`, `when`
 * and `thens` carry both their descriptions (for rendering) and their
 * executable payloads (for running). `A` and `E` are the action's success and
 * failure; `R` is the services every step requires.
 *
 * @since 0.0.1
 * @category models
 */
export interface Scenario<A = unknown, E = unknown, R = never> {
  readonly name: string
  readonly tags: ReadonlyArray<string>
  readonly givens: ReadonlyArray<Given<any, any, R>>
  readonly when: When<any, A, E, R>
  readonly thens: ReadonlyArray<ThenStep<any, R>>
}

/**
 * The Given phase of the builder. Offers `given` / `and` (which widen the
 * context) and `when` (which transitions to the When phase). Each method also
 * accepts a `(description, step)` sugar form.
 *
 * @since 0.0.1
 * @category builders
 */
export interface GivenBuilder<Ctx, R> {
  given<Provides, R1 = never>(given: Given<Ctx, Provides, R1>): GivenBuilder<Simplify<Ctx & Provides>, R | R1>
  given<Provides, R1 = never>(
    description: string,
    step: (context: Ctx) => Effect.Effect<Provides, never, R1>
  ): GivenBuilder<Simplify<Ctx & Provides>, R | R1>
  and<Provides, R1 = never>(given: Given<Ctx, Provides, R1>): GivenBuilder<Simplify<Ctx & Provides>, R | R1>
  and<Provides, R1 = never>(
    description: string,
    step: (context: Ctx) => Effect.Effect<Provides, never, R1>
  ): GivenBuilder<Simplify<Ctx & Provides>, R | R1>
  when<A, E = never, R1 = never>(when: When<Ctx, A, E, R1>): WhenBuilder<A, E, R | R1>
  when<A, E = never, R1 = never>(
    description: string,
    action: (context: Ctx) => Effect.Effect<A, E, R1>
  ): WhenBuilder<A, E, R | R1>
}

/**
 * The When phase of the builder. Choose the expected outcome: `then` (success,
 * receives `A`), `thenFails` (typed failure, receives `E`) or `thenDies`
 * (defect, receives `unknown`). Each accepts an {@link Assertion} or a
 * `(description, assert)` sugar form.
 *
 * @since 0.0.1
 * @category builders
 */
export interface WhenBuilder<A, E, R> {
  then<R1 = never>(assertion: Assertion<A, R1>): ThenBuilder<"success", A, E, R | R1>
  then<R1 = never>(
    description: string,
    assert: (value: A) => void | Effect.Effect<void, never, R1>
  ): ThenBuilder<"success", A, E, R | R1>
  thenFails<R1 = never>(assertion: Assertion<E, R1>): ThenBuilder<"failure", A, E, R | R1>
  thenFails<R1 = never>(
    description: string,
    assert: (error: E) => void | Effect.Effect<void, never, R1>
  ): ThenBuilder<"failure", A, E, R | R1>
  thenDies<R1 = never>(assertion: Assertion<unknown, R1>): ThenBuilder<"defect", A, E, R | R1>
  thenDies<R1 = never>(
    description: string,
    assert: (defect: unknown) => void | Effect.Effect<void, never, R1>
  ): ThenBuilder<"defect", A, E, R | R1>
}

/**
 * The Then phase of the builder. It *is* a {@link Scenario}, and `and` adds a
 * further assertion against the same outcome chosen in the When phase.
 *
 * @since 0.0.1
 * @category builders
 */
export interface ThenBuilder<O extends Outcome, A, E, R> extends Scenario<A, E, R> {
  and<R1 = never>(assertion: Assertion<Payload<O, A, E>, R1>): ThenBuilder<O, A, E, R | R1>
  and<R1 = never>(
    description: string,
    assert: (subject: Payload<O, A, E>) => void | Effect.Effect<void, never, R1>
  ): ThenBuilder<O, A, E, R | R1>
}

interface State {
  readonly name: string
  readonly tags: ReadonlyArray<string>
  readonly givens: ReadonlyArray<Given<any, any, any>>
  readonly when: When<any, any, any, any> | undefined
  readonly thens: ReadonlyArray<ThenStep<any, any>>
}

// Normalize the `(value)` and `(description, thunk)` sugar forms of a step into
// a step value keyed by `step`/`action`/`assert`.
const sugar = (key: "step" | "action" | "assert") => (a: any, b?: any): any =>
  typeof a === "string" ? { description: a, [key]: b } : a

const toGiven = sugar("step")
const toWhen = sugar("action")
const toAssertion = sugar("assert")

const addThen = (state: State, outcome: Outcome) => (a: any, b?: any): any =>
  thenBuilder({ ...state, thens: [...state.thens, { assertion: toAssertion(a, b), outcome }] }, outcome)

const givenBuilder = (state: State): GivenBuilder<any, any> => {
  const addGiven = (a: any, b?: any): any => givenBuilder({ ...state, givens: [...state.givens, toGiven(a, b)] })
  return {
    given: addGiven,
    and: addGiven,
    when: (a: any, b?: any): any => whenBuilder({ ...state, when: toWhen(a, b) })
  } as GivenBuilder<any, any>
}

const whenBuilder = (state: State): WhenBuilder<any, any, any> =>
  ({
    then: addThen(state, "success"),
    thenFails: addThen(state, "failure"),
    thenDies: addThen(state, "defect")
  }) as WhenBuilder<any, any, any>

const thenBuilder = (state: State, outcome: Outcome): ThenBuilder<any, any, any, any> =>
  ({ ...state, and: addThen(state, outcome) }) as ThenBuilder<any, any, any, any>

/**
 * Start building a scenario. Returns a {@link GivenBuilder} over an empty
 * context; chain `given`/`and`, then `when`, then `then`/`thenFails`/`thenDies`
 * to obtain a {@link Scenario} value.
 *
 * @since 0.0.1
 * @category constructors
 */
export const scenario = (
  name: string,
  options?: { readonly tags?: ReadonlyArray<string> }
): GivenBuilder<{}, never> =>
  givenBuilder({
    name,
    tags: options?.tags ?? [],
    givens: [],
    when: undefined,
    thens: []
  }) as GivenBuilder<{}, never>
