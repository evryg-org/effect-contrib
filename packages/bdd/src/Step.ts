/**
 * Self-describing combinator values for building BDD scenarios.
 *
 * A scenario is authored from `Given`, `When` and `Assertion` *values* rather
 * than from bare strings and lambdas. Each value carries its own human-readable
 * `description`, so a scenario can be rendered (to Gherkin, to a report) from
 * its structure without that text drifting from behaviour. Domain-specific
 * combinators (e.g. `aCart().empty()`) are expected to produce these values; the
 * scenario builder in `./Scenario.js` consumes them.
 *
 * @since 0.0.1
 */
import { Effect } from "effect"

/**
 * A precondition. It reads the accumulated context `Needs` and contributes
 * additional, named fields `Provides` back to it. A `Given` never fails: a
 * broken precondition is a defect, not part of the asserted outcome.
 *
 * @since 0.0.1
 * @category models
 */
export interface Given<Needs, Provides, R> {
  readonly description: string
  readonly step: (context: Needs) => Effect.Effect<Provides, never, R>
}

/**
 * The action under test. It reads the accumulated context `Needs` and produces
 * an `Effect` whose success `A` and failure `E` are what the scenario's
 * `then` / `thenFails` / `thenDies` assertions observe.
 *
 * @since 0.0.1
 * @category models
 */
export interface When<Needs, A, E, R> {
  readonly description: string
  readonly action: (context: Needs) => Effect.Effect<A, E, R>
}

/**
 * A self-describing predicate on a payload `X`. An assertion is
 * *outcome-agnostic*: whether it is checked against a success value, a typed
 * failure or a defect is decided by the builder method it is passed to, not by
 * the assertion itself. A failed assertion is signalled by throwing or by a
 * failing `Effect`.
 *
 * @since 0.0.1
 * @category models
 */
export interface Assertion<X, R> {
  readonly description: string
  readonly assert: (subject: X) => void | Effect.Effect<void, never, R>
}

/**
 * Construct a {@link Given} from a description and a context-producing step.
 *
 * @since 0.0.1
 * @category constructors
 */
export const given = <Needs, Provides, R = never>(
  description: string,
  step: (context: Needs) => Effect.Effect<Provides, never, R>
): Given<Needs, Provides, R> => ({ description, step })

/**
 * Construct a {@link When} from a description and the action under test.
 *
 * @since 0.0.1
 * @category constructors
 */
export const when = <Needs, A, E = never, R = never>(
  description: string,
  action: (context: Needs) => Effect.Effect<A, E, R>
): When<Needs, A, E, R> => ({ description, action })

/**
 * Construct an {@link Assertion} from a description and a predicate.
 *
 * @since 0.0.1
 * @category constructors
 */
export const assertion = <X, R = never>(
  description: string,
  assert: (subject: X) => void | Effect.Effect<void, never, R>
): Assertion<X, R> => ({ description, assert })

/**
 * Normalize an assertion/observation body — which returns either nothing or an
 * `Effect` — into an `Effect`. Internal: not re-exported from the package index.
 *
 * @internal
 */
export const settle = <R>(
  result: void | Effect.Effect<void, never, R>
): Effect.Effect<void, never, R> => (Effect.isEffect(result) ? result : Effect.void)
