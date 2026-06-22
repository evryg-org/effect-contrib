/**
 * The per-domain preset harness — the "best of both worlds".
 *
 * `makeHarness` bundles, once per domain: the initial preconditions, a set of
 * {@link Probe}s, and a `dispatch` function that turns a reified command into a
 * core `When` (build it with {@link dispatcher}). It returns a domain-specialized
 * `scenario` builder where:
 *
 * - `given` takes **reducers** over the fixed precondition record;
 * - `when` takes a **bare command value** (dispatched for you);
 * - `then` / `thenFails` / `thenDies` receive the probes' recorded calls as an
 *   **injected observation object** (`{ [probeName]: calls }`);
 * - `run` **auto-provides** the probe layers.
 *
 * It is a thin composition over the core — the core term and `run` are untouched
 * — so it stays runner-agnostic and inspectable (`toGherkin` still works).
 *
 * @since 0.0.1
 */
import { Effect, Layer } from "effect"
import { run as coreRun } from "../core/Run.js"
import type { ScenarioError } from "../core/Run.js"
import { scenario as coreScenario } from "../core/Scenario.js"
import type { Scenario } from "../core/Scenario.js"
import { assertion, settle } from "../core/Step.js"
import type { When } from "../core/Step.js"
import type { Probe } from "./Probe.js"

/**
 * The recorded-call type of a probe.
 *
 * @since 0.0.1
 * @category models
 */
export type CallOf<P> = P extends Probe<any, any, infer Call> ? Call : never

/**
 * The union of services provided by a record of probes.
 *
 * @since 0.0.1
 * @category models
 */
export type ServicesOf<Probes> = {
  [K in keyof Probes]: Probes[K] extends Probe<any, infer Id, any> ? Id : never
}[keyof Probes]

/**
 * The observation object injected into a harness assertion: each probe's
 * recorded calls, keyed by probe name.
 *
 * @since 0.0.1
 * @category models
 */
export type Observations<Probes> = {
  readonly [K in keyof Probes]: ReadonlyArray<CallOf<Probes[K]>>
}

type Observe<Probes> = (observations: Observations<Probes>) => void | Effect.Effect<void>

/**
 * The Given phase of a harness scenario: reducer-style givens over the fixed
 * precondition record, then a bare command.
 *
 * @since 0.0.1
 * @category builders
 */
export interface HarnessGivenBuilder<Initial, Command, Probes> {
  given(reducer: (preconditions: Initial) => Initial): HarnessGivenBuilder<Initial, Command, Probes>
  and(reducer: (preconditions: Initial) => Initial): HarnessGivenBuilder<Initial, Command, Probes>
  when(command: Command): HarnessWhenBuilder<Probes>
}

/**
 * The When phase of a harness scenario: choose the expected outcome; the
 * assertion receives the injected {@link Observations}.
 *
 * @since 0.0.1
 * @category builders
 */
export interface HarnessWhenBuilder<Probes> {
  then(assert: Observe<Probes>): HarnessThenBuilder<Probes>
  then(description: string, assert: Observe<Probes>): HarnessThenBuilder<Probes>
  thenFails(assert: Observe<Probes>): HarnessThenBuilder<Probes>
  thenFails(description: string, assert: Observe<Probes>): HarnessThenBuilder<Probes>
  thenDies(assert: Observe<Probes>): HarnessThenBuilder<Probes>
  thenDies(description: string, assert: Observe<Probes>): HarnessThenBuilder<Probes>
}

/**
 * The Then phase of a harness scenario. It *is* a {@link Scenario} (run it with
 * the harness `run`), and `and` adds a further observation assertion.
 *
 * @since 0.0.1
 * @category builders
 */
export interface HarnessThenBuilder<Probes> extends Scenario<unknown, unknown, ServicesOf<Probes>> {
  and(assert: Observe<Probes>): HarnessThenBuilder<Probes>
  and(description: string, assert: Observe<Probes>): HarnessThenBuilder<Probes>
}

/**
 * Build a per-domain harness. `dispatch` turns a command into a core `When`
 * (compose {@link dispatcher}); the probes' services it requires are
 * auto-provided by the returned `run`.
 *
 * @since 0.0.1
 * @category constructors
 */
export const makeHarness = <
  Initial extends object,
  Probes extends Record<string, Probe<any, any, any>>,
  Command,
  A,
  E,
  R
>(config: {
  readonly initial: Initial
  readonly probes: Probes
  readonly dispatch: (command: Command) => When<Initial, A, E, R>
}): {
  readonly scenario: (
    name: string,
    options?: { readonly tags?: ReadonlyArray<string> }
  ) => HarnessGivenBuilder<Initial, Command, Probes>
  readonly run: <SR>(
    scenario: Scenario<unknown, unknown, SR>
  ) => Effect.Effect<void, ScenarioError, Exclude<SR, ServicesOf<Probes>>>
} => {
  const probeValues = Object.values(config.probes) as ReadonlyArray<Probe<any, any, any>>

  const collect = Effect.all(
    Object.fromEntries(
      Object.entries(config.probes).map(([key, value]) => [key, (value as Probe<any, any, any>).calls])
    )
  ) as Effect.Effect<Record<string, ReadonlyArray<unknown>>>

  const wrap = (description: string, observe: Observe<Probes>) =>
    assertion(description, () =>
      Effect.gen(function*() {
        const observations = yield* collect
        yield* settle(observe(observations as Observations<Probes>))
      }))

  const resolve = (a: string | Observe<Probes>, b?: Observe<Probes>): readonly [string, Observe<Probes>] =>
    typeof a === "string" ? [a, b as Observe<Probes>] : ["the observations hold", a]

  const thenBuilder = (coreThen: any): any => ({
    ...coreThen,
    and: (a: any, b?: any) => thenBuilder(coreThen.and(wrap(...resolve(a, b))))
  })

  const whenBuilder = (coreWhen: any): any => ({
    then: (a: any, b?: any) => thenBuilder(coreWhen.then(wrap(...resolve(a, b)))),
    thenFails: (a: any, b?: any) => thenBuilder(coreWhen.thenFails(wrap(...resolve(a, b)))),
    thenDies: (a: any, b?: any) => thenBuilder(coreWhen.thenDies(wrap(...resolve(a, b))))
  })

  const layer = probeValues
    .map((value) => value.layer as Layer.Layer<any>)
    .reduce((accumulator, current) => Layer.merge(accumulator, current), Layer.empty as Layer.Layer<any>)

  const scenario = (name: string, options: { readonly tags?: ReadonlyArray<string> } | undefined): any => {
    const build = (reducers: ReadonlyArray<(preconditions: Initial) => Initial>): any => {
      const add = (reducer: (preconditions: Initial) => Initial) => build([...reducers, reducer])
      return {
        given: add,
        and: add,
        when: (command: Command) => {
          const preconditions = reducers.reduce((accumulator, reducer) => reducer(accumulator), config.initial)
          const coreWhen = coreScenario(name, options)
            .given("the preconditions hold", () => Effect.succeed(preconditions))
            .when(config.dispatch(command))
          return whenBuilder(coreWhen)
        }
      }
    }
    return build([])
  }

  return {
    scenario,
    run: (scn) =>
      Effect.gen(function*() {
        for (const value of probeValues) {
          yield* value.reset
        }
        return yield* coreRun(scn).pipe(Effect.provide(layer))
      }) as never
  }
}
