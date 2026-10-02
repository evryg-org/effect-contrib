/** Execute an ordered specification using separately supplied Effect implementations.
 * @since 0.0.1
 */
import type { Scope } from "effect"
import { Cause, Effect, Exit } from "effect"
import type { AnyBinding, Coverage, Interpreter, Outcome, Requirements } from "../EffectInterpreter.js"
import { Observations } from "../harness/Probe.js"
import { inspect } from "./Scenario.js"
import type { Ops, Scenario } from "./Scenario.js"
import type { AnyDefinition } from "./Step.js"

/**
 * A failed scenario step with its complete underlying Effect cause.
 * @since 0.0.1
 * @category models
 */
export class ScenarioError extends Error {
  /**
   * Identifies a scenario diagnostic.
   * @since 0.0.1
   */
  readonly _tag = "ScenarioError"
  constructor(
    readonly scenario: string,
    readonly step: string,
    readonly reason: string,
    override readonly cause: Cause.Cause<unknown>
  ) {
    super(`${scenario} — ${step}: ${reason}`)
  }
}
/**
 * Required implementation services after supplying the run scope and observations.
 * @since 0.0.1
 * @category models
 */
export type RunRequirements<Ops, B extends ReadonlyArray<AnyBinding>> = Exclude<
  Requirements<Ops, B>,
  Scope.Scope | Observations
>
type Callback = (
  args: ReadonlyArray<unknown>,
  context: Record<string, unknown>,
  subject?: unknown
) => Effect.Effect<unknown, unknown, unknown>
type Action = {
  readonly execute: Callback
  readonly update?: (context: Record<string, unknown>, outcome: Outcome<unknown, unknown>) => Record<string, unknown>
}

const mergePatch = (world: Record<string, unknown>, patch: unknown): Record<string, unknown> => {
  if (
    typeof patch !== "object" || patch === null || Array.isArray(patch) ||
    (Object.getPrototypeOf(patch) !== Object.prototype && Object.getPrototypeOf(patch) !== null) ||
    Object.getOwnPropertySymbols(patch).length > 0
  ) {
    throw new TypeError("Context contributions must be plain named-field records")
  }
  return { ...world, ...patch }
}

/**
 * Execute authored steps lazily with fresh context, observations and resource scope.
 * @since 0.0.1
 * @category constructors
 */
export const run = <S extends Scenario<AnyDefinition>, const B extends ReadonlyArray<AnyBinding>>(
  scenario: S,
  interpreter: Interpreter<B> & Coverage<Ops<S>, B>
): Effect.Effect<void, ScenarioError, RunRequirements<Ops<S>, B>> =>
  Effect.suspend(() => {
    const program = Effect.gen(function*() {
      let world: Record<string, unknown> = {}
      let outcome: Outcome<unknown, unknown> | undefined
      let failureCause: Cause.Cause<unknown> | undefined
      let failureStep = ""
      let acknowledged = true
      const implementations = new Map(
        interpreter.bindings.map((binding) => [binding.definition, binding.implementation])
      )
      const diagnostic = (step: string, reason: string, cause: Cause.Cause<unknown>) =>
        Effect.fail(new ScenarioError(scenario.name, step, reason, cause))
      const capture = <A>(callback: () => Effect.Effect<A, unknown, unknown>, step: string, reason: string) =>
        Effect.gen(function*() {
          const exit = yield* Effect.exit(Effect.suspend(callback))
          if (Exit.isFailure(exit)) {
            if (exit.cause.reasons.some(Cause.isInterruptReason)) return yield* Effect.failCause(exit.cause)
            return yield* diagnostic(step, reason, exit.cause)
          }
          return exit.value
        })
      for (const { descriptor } of inspect(scenario)) {
        const { args, definition, description, kind } = descriptor
        if (!implementations.has(definition)) {
          return yield* diagnostic(description, "the operation has no implementation", Cause.die(definition.id))
        }
        const implementation = implementations.get(definition)
        if (kind === "given") {
          const patch = yield* capture(
            () => (implementation as Callback)(args, world),
            description,
            "the precondition failed"
          )
          world = yield* capture(
            () => Effect.sync(() => mergePatch(world, patch)),
            description,
            "the context contribution was invalid"
          )
        } else if (kind === "when") {
          if (!acknowledged) {
            return yield* diagnostic(failureStep, "the action failure was not acknowledged", failureCause!)
          }
          const action = implementation as Action
          const exit = yield* Effect.exit(Effect.suspend(() => action.execute(args, world)))
          if (Exit.isFailure(exit)) {
            if (exit.cause.reasons.some(Cause.isInterruptReason)) {
              return yield* Effect.failCause(exit.cause)
            }
            if (exit.cause.reasons.some(Cause.isDieReason)) {
              return yield* diagnostic(description, "the action produced a defect", exit.cause)
            }
            const errors = exit.cause.reasons.filter(Cause.isFailReason)
            if (errors.length !== 1) {
              return yield* diagnostic(description, "the action produced multiple failures", exit.cause)
            }
            outcome = { _tag: "Failure", error: errors[0]!.error }
            failureCause = exit.cause
            failureStep = description
            acknowledged = false
          } else {
            outcome = { _tag: "Success", value: exit.value }
            acknowledged = true
            failureCause = undefined
          }
          if (action.update) {
            const currentOutcome = outcome
            const patch = yield* capture(
              () => Effect.sync(() => action.update!(world, currentOutcome)),
              description,
              "the action update failed"
            )
            world = yield* capture(
              () => Effect.sync(() => mergePatch(world, patch)),
              description,
              "the context contribution was invalid"
            )
          }
        } else {
          if (kind === "success" && outcome?._tag !== "Success" || kind === "failure" && outcome?._tag !== "Failure") {
            return yield* diagnostic(
              description,
              `expected outcome "${kind}" but the action produced "${outcome?._tag ?? "none"}"`,
              failureCause ?? Cause.fail(outcome)
            )
          }
          const subject = outcome?._tag === "Success" ? outcome.value : outcome?.error
          yield* capture(
            () => (implementation as Callback)(args, world, subject),
            description,
            "the assertion did not hold"
          )
          if (kind === "failure") {
            acknowledged = true
          }
        }
      }
      if (!acknowledged) {
        return yield* diagnostic(failureStep, "the action failure was not acknowledged", failureCause!)
      }
    })
    return Effect.scoped(program).pipe(Effect.provideService(Observations, { logs: new Map() }))
  }) as Effect.Effect<void, ScenarioError, RunRequirements<Ops<S>, B>>
