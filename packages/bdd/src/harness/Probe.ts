/** Observations belong to one scenario execution, including each retry.
 * @since 0.0.1
 */
import { Context, Effect, Layer } from "effect"

/**
 * The execution-scoped service containing probe observation logs.
 * @since 0.0.1
 * @category models
 */
export class Observations extends Context.Service<Observations, {
  readonly logs: Map<symbol, ReadonlyArray<unknown>>
}>()("@evryg/effect-bdd/Observations") {}

/**
 * A service mock and access to its execution-scoped observations.
 * @since 0.0.1
 * @category models
 */
export interface Probe<Name extends string, Id, Call> {
  readonly name: Name
  readonly layer: Layer.Layer<Id, never, Observations>
  readonly calls: Effect.Effect<ReadonlyArray<Call>, never, Observations>
  readonly reset: Effect.Effect<void, never, Observations>
}

/**
 * Create a reusable probe; its log is allocated by each scenario run.
 * @since 0.0.1
 * @category constructors
 */
export const probe = <Call>() =>
<Name extends string, Id, Shape extends object>(
  name: Name,
  tag: Context.Key<Id, Shape>,
  build: (record: (call: Call) => Effect.Effect<void>) => Layer.PartialEffectful<Shape>
): Probe<Name, Id, Call> => {
  const key = Symbol(name)
  return Object.freeze({
    name,
    layer: Layer.unwrap(Effect.map(Observations, ({ logs }) =>
      Layer.mock(tag)(build((call) =>
        Effect.sync(() => {
          logs.set(key, [...(logs.get(key) ?? []), call])
        })
      )))),
    calls: Effect.map(Observations, ({ logs }) => (logs.get(key) ?? []) as ReadonlyArray<Call>),
    reset: Effect.flatMap(Observations, ({ logs }) =>
      Effect.sync(() => {
        logs.delete(key)
      }))
  })
}
