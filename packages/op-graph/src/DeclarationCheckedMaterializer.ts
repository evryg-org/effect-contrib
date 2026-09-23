import { Effect, Layer, Result, Stream } from "effect"
import type { GraphOp } from "./GraphOp.js"
import { GraphOpMaterializer } from "./GraphOpMaterializer.js"
import { checkGraphOps, type DeclarationIndex } from "./DeclarationCheck.js"
import { logPhase } from "./PhaseLog.js"

/** The declared-write boundary: a batch that does not match its declarations fails the
 *  materialization stream, so it never reaches the store — the guard is the write path itself,
 *  not a check standing beside it. */
export const declarationCheckedMaterializer =
  (index: DeclarationIndex) =>
  <E, R>(base: Layer.Layer<GraphOpMaterializer, E, R>): Layer.Layer<GraphOpMaterializer, E, R> =>
    Layer.effect(
      GraphOpMaterializer,
      Effect.map(GraphOpMaterializer, (inner) => ({
        materialize: (ops: ReadonlyArray<GraphOp>) =>
          Stream.unwrap(
            Effect.sync(() => checkGraphOps(index)(ops)).pipe(
              Effect.flatMap(Result.match({ onFailure: Effect.fail, onSuccess: Effect.succeed })),
              logPhase("declaration-checked"),
              Effect.map(inner.materialize),
            ),
          ),
      })),
    ).pipe(Layer.provide(base))
