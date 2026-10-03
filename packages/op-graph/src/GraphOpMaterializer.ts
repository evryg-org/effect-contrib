import { Context, Effect, Schema, Stream } from "effect"
import type { GraphOp } from "./GraphOp.js"

export class MaterializeSummary extends Schema.Class<MaterializeSummary>("MaterializeSummary")({
  total: Schema.Number,
  details: Schema.Array(Schema.Struct({ key: Schema.String, count: Schema.Number })),
}) {}

export class MaterializeProgress extends Schema.Class<MaterializeProgress>("MaterializeProgress")({
  processed: Schema.Number,
  total: Schema.Number,
  counts: Schema.ReadonlyMap(Schema.String, Schema.Number),
  /**
   * Edges dropped because an endpoint vertex was missing (MATCH found nothing), keyed by edge
   * shape (e.g. `A-[:R]->B`), counting only shapes that actually dropped. Dropped edges never
   * reach the graph, so this tally — accumulated across the run and complete on the final
   * progress — is the only place a caller can observe the loss.
   */
  dropped: Schema.ReadonlyMap(Schema.String, Schema.Number),
}) {}

export function summarize(progress: MaterializeProgress): MaterializeSummary {
  return new MaterializeSummary({
    total: progress.total,
    details: [...progress.counts.entries()].map(([key, count]) => ({ key, count })),
  })
}

export class GraphOpMaterializer extends Context.Service<
  GraphOpMaterializer,
  {
    readonly materialize: (ops: ReadonlyArray<GraphOp>) => Stream.Stream<MaterializeProgress, Error>
  }
>()("GraphOpMaterializer") {}

export function materialize(
  ops: ReadonlyArray<GraphOp>,
): Stream.Stream<MaterializeProgress, Error, GraphOpMaterializer> {
  return Stream.unwrap(Effect.map(GraphOpMaterializer, (m) => m.materialize(ops)))
}
