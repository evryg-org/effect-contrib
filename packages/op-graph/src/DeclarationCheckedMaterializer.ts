import { Effect, Layer, Result, Stream } from "effect"
import type { GraphOp } from "./GraphOp.js"
import { GraphOpMaterializer } from "./GraphOpMaterializer.js"
import { checkGraphOps, type DeclarationIndex } from "./DeclarationCheck.js"

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
          Result.match(checkGraphOps(index)(ops), {
            onFailure: (violation) => Stream.fail(violation),
            onSuccess: (checked) => inner.materialize(checked),
          }),
      })),
    ).pipe(Layer.provide(base))
