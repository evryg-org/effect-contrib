/**
 * Service spies with call capture.
 *
 * A `probe` wraps a service in a `Layer.mock` whose recorded calls land in a
 * call-log, so a scenario can verify *indirect outputs* — which methods the
 * action invoked, with what. The recorded calls are read back through `calls`
 * (typically inside an assertion, after the action has run). Provide `layer` to
 * the run to satisfy the action's requirement on the service.
 *
 * The call-log is created eagerly; `reset` clears it. The {@link makeHarness}
 * preset resets its probes before each run, so reusing a harness across
 * scenarios is safe. When using a probe directly, reset it (or build a fresh
 * one) per scenario.
 *
 * @since 0.0.1
 */
import type { Context } from "effect"
import { Effect, Layer, Ref } from "effect"

/**
 * A service spy: the mock `layer` to provide, and `calls` to read the recorded
 * invocations. `name` is the key the {@link makeHarness} preset uses when it
 * injects observations.
 *
 * @since 0.0.1
 * @category models
 */
export interface Probe<Name extends string, Id, Call> {
  readonly name: Name
  readonly layer: Layer.Layer<Id>
  readonly calls: Effect.Effect<ReadonlyArray<Call>>
  readonly reset: Effect.Effect<void>
}

/**
 * Create a probe for a service. `build` receives a `record` function and returns
 * a partial implementation of the service; every call it records is appended to
 * the log. Unimplemented members fail loudly (via `Layer.mock`) when exercised.
 *
 * The recorded-call type is set explicitly: `probe<MyCall>()(name, Tag, build)`.
 *
 * @since 0.0.1
 * @category constructors
 */
export const probe = <Call>() =>
<Name extends string, Id, Shape extends object>(
  name: Name,
  tag: Context.Key<Id, Shape>,
  build: (record: (call: Call) => Effect.Effect<void>) => Layer.PartialEffectful<Shape>
): Probe<Name, Id, Call> => {
  const log = Effect.runSync(Ref.make<ReadonlyArray<Call>>([]))
  const record = (call: Call): Effect.Effect<void> => Ref.update(log, (previous) => [...previous, call])
  return {
    name,
    layer: Layer.mock(tag)(build(record)),
    calls: Ref.get(log),
    reset: Ref.update(log, () => [])
  }
}
