/**
 * The `run` interpreter: give a reified {@link Scenario} meaning by executing
 * it. `run` folds the givens into a context, performs the action, classifies
 * its `Exit` (success / typed failure / defect) and checks every assertion
 * against the chosen outcome.
 *
 * A mismatched outcome, a failed precondition or a broken assertion is reported
 * as a typed {@link ScenarioError} failure — never through a test-runner's
 * `expect` — so the very same scenario runs under `@effect/vitest`, `node:test`,
 * `bun:test` or a plain `Effect.runPromise`.
 *
 * @since 0.0.1
 */
import { Cause, Effect, Exit, Option, Schema } from "effect"
import type { Outcome, Scenario } from "./Scenario.js"
import { settle } from "./Step.js"

/**
 * The failure produced by {@link run}: the action did not match its expected
 * outcome, a precondition failed, or an assertion did not hold. `cause` carries
 * the underlying value (the unexpected payload, or the error/defect thrown).
 *
 * @since 0.0.1
 * @category errors
 */
export class ScenarioError extends Schema.TaggedErrorClass<ScenarioError>()("ScenarioError", {
  scenario: Schema.String,
  step: Schema.String,
  reason: Schema.String,
  cause: Schema.Defect()
}) {
  /**
   * @since 0.0.1
   */
  override get message(): string {
    return `${this.scenario} — ${this.step}: ${this.reason}`
  }
}

interface Classified {
  readonly outcome: Outcome
  readonly payload: unknown
}

const classify = (exit: Exit.Exit<unknown, unknown>): Classified =>
  Exit.isSuccess(exit)
    ? { outcome: "success", payload: exit.value }
    : Option.match(Cause.findErrorOption(exit.cause), {
      onSome: (error): Classified => ({ outcome: "failure", payload: error }),
      onNone: (): Classified => ({ outcome: "defect", payload: Cause.squash(exit.cause) })
    })

/**
 * Run a scenario, producing an `Effect` that succeeds when every assertion holds
 * and fails with a {@link ScenarioError} otherwise. The required services `R`
 * are exactly those accumulated by the scenario's givens, action and
 * assertions.
 *
 * @since 0.0.1
 * @category interpreters
 */
export const run = <A, E, R>(scenario: Scenario<A, E, R>): Effect.Effect<void, ScenarioError, R> =>
  Effect.gen(function*() {
    let context: any = {}
    for (const given of scenario.givens) {
      const exit = yield* Effect.exit(given.step(context))
      if (Exit.isFailure(exit)) {
        return yield* new ScenarioError({
          scenario: scenario.name,
          step: given.description,
          reason: "the precondition failed",
          cause: Cause.squash(exit.cause)
        })
      }
      context = { ...context, ...exit.value }
    }

    const actual = classify(yield* Effect.exit(scenario.when.action(context)))

    for (const then of scenario.thens) {
      if (then.outcome !== actual.outcome) {
        return yield* new ScenarioError({
          scenario: scenario.name,
          step: then.assertion.description,
          reason: `expected outcome "${then.outcome}" but the action produced "${actual.outcome}"`,
          cause: actual.payload
        })
      }
      const assertionExit = yield* Effect.exit(
        Effect.suspend(() => settle(then.assertion.assert(actual.payload)))
      )
      if (Exit.isFailure(assertionExit)) {
        return yield* new ScenarioError({
          scenario: scenario.name,
          step: then.assertion.description,
          reason: "the assertion did not hold",
          cause: Cause.squash(assertionExit.cause)
        })
      }
    }
  })
