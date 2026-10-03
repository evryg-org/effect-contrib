/**
 * @since 0.0.1
 */
import { Effect, Function, Layer, Predicate, Result, Stream } from "effect"
import type { GraphOp } from "./GraphOp.js"
import { GraphOpMaterializer, type MaterializeProgress } from "./GraphOpMaterializer.js"
import { logPhase } from "./PhaseLog.js"

/** A batch refinement: the batch to hand on, or the first refusal. Refinements compose by Kleisli
 *  composition (`Result.flatMap`), with `Result.succeed` as the identity.
 *
 * @since 0.0.1
 */
export type Refinement<E extends Error> = (ops: ReadonlyArray<GraphOp>) => Result.Result<ReadonlyArray<GraphOp>, E>

/** Refines a batch before `materialize` sees it. A refusal fails the stream with it and nothing
 *  reaches `materialize`; `phase` logs the refinement through `logPhase` when it is slow.
 *
 * @since 0.0.1
 */
export const refineThenMaterialize =
  <E extends Error>(refine: Refinement<E>, phase?: string) =>
  (materialize: (ops: ReadonlyArray<GraphOp>) => Stream.Stream<MaterializeProgress, Error>) =>
  (ops: ReadonlyArray<GraphOp>): Stream.Stream<MaterializeProgress, Error> =>
    Stream.unwrap(
      Effect.sync(() => refine(ops)).pipe(
        Effect.flatMap(Result.match({ onFailure: Effect.fail, onSuccess: Effect.succeed })),
        Predicate.isUndefined(phase) ? Function.identity : logPhase(phase),
        Effect.map(materialize)
      )
    )

/** The refine-then-materialize Layer decorator: every batch passes `refine` before the base
 *  materializer, so a refused batch never reaches the store. Lawful: the identity refinement is
 *  the base, and refining by `f` then `g` equals one refinement by their Kleisli composition.
 *
 * @since 0.0.1
 */
export const refinedMaterializer =
  <E extends Error>(refine: Refinement<E>, phase?: string) =>
  <BaseE, R>(base: Layer.Layer<GraphOpMaterializer, BaseE, R>): Layer.Layer<GraphOpMaterializer, BaseE, R> =>
    Layer.effect(
      GraphOpMaterializer,
      Effect.map(GraphOpMaterializer, (inner) => ({
        materialize: refineThenMaterialize(refine, phase)(inner.materialize)
      }))
    ).pipe(Layer.provide(base))
