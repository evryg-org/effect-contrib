import { Array, Number, Record, Reducer, Schema } from "effect"

export const EdgeShape = Schema.String.pipe(Schema.brand("EdgeShape"))
export type EdgeShape = typeof EdgeShape.Type

export class EdgeMaterialized extends Schema.TaggedClass<EdgeMaterialized>()("EdgeMaterialized", {
  shape: EdgeShape
}) {}

export class EdgeDropped extends Schema.TaggedClass<EdgeDropped>()("EdgeDropped", {
  shape: EdgeShape
}) {}

export const EdgeOutcome = Schema.Union([EdgeMaterialized, EdgeDropped]).pipe(Schema.toTaggedUnion("_tag"))
export type EdgeOutcome = typeof EdgeOutcome.Type

class ShapeCount extends Schema.Class<ShapeCount>("ShapeCount")({
  written: Schema.Number,
  dropped: Schema.Number
}) {}

/**
 * Per-field sum over ShapeCount's two counters, built from the native `Number.ReducerSum`.
 * NOT `Struct.makeReducer`: its combine returns a plain `{written, dropped}` object, which fails
 * `ShapeCount`'s Schema.Class validation inside `EdgeTally`'s `entries` map — a `ShapeCount`
 * instance is required, so the per-field sums are wrapped back into one here.
 */
const ShapeCountReducer: Reducer.Reducer<ShapeCount> = Reducer.make(
  (a, b) =>
    new ShapeCount({
      written: Number.ReducerSum.combine(a.written, b.written),
      dropped: Number.ReducerSum.combine(a.dropped, b.dropped)
    }),
  new ShapeCount({ written: Number.ReducerSum.initialValue, dropped: Number.ReducerSum.initialValue })
)

const classify = (outcome: EdgeOutcome): { readonly shape: string; readonly dropped: boolean } =>
  EdgeOutcome.match(outcome, {
    EdgeMaterialized: (o) => ({ shape: o.shape, dropped: false }),
    EdgeDropped: (o) => ({ shape: o.shape, dropped: true })
  })

/**
 * A count of materialized vs. dropped edges, per edge shape. `of` is the only introduction
 * form: a count can only ever arise by counting outcomes, so a negative is unrepresentable and
 * no subtraction exists anywhere in this type.
 */
export class EdgeTally extends Schema.Class<EdgeTally>("EdgeTally")({
  entries: Schema.ReadonlyMap(EdgeShape, ShapeCount)
}) {
  static readonly empty: EdgeTally = new EdgeTally({ entries: new Map() })

  /** The native Reducer for the per-shape accounting monoid — `combine` is the instance-method form. */
  static readonly Reducer: Reducer.Reducer<EdgeTally> = Reducer.make((a, b) => a.combine(b), EdgeTally.empty)

  static of(outcomes: ReadonlyArray<EdgeOutcome>): EdgeTally {
    const byShape = Array.groupBy(outcomes.map(classify), (c) => c.shape)
    const counts = Record.map(byShape, (group) =>
      new ShapeCount({
        written: Array.countBy(group, (c) => !c.dropped),
        dropped: Array.countBy(group, (c) => c.dropped)
      }))
    return new EdgeTally({
      entries: new Map(Record.toEntries(counts).map(([shape, count]) => [EdgeShape.make(shape), count]))
    })
  }

  combine(other: EdgeTally): EdgeTally {
    const shapes = Array.union(this.entries.keys(), other.entries.keys())
    return new EdgeTally({
      entries: new Map(
        shapes.map((shape) =>
          [
            shape,
            ShapeCountReducer.combine(
              this.entries.get(shape) ?? ShapeCountReducer.initialValue,
              other.entries.get(shape) ?? ShapeCountReducer.initialValue
            )
          ] as const
        )
      )
    })
  }

  opCount(): number {
    return Array.reduce(
      Array.fromIterable(this.entries.values()),
      0,
      (sum, count) => sum + count.written + count.dropped
    )
  }

  droppedCount(): number {
    return Number.sumAll(Array.fromIterable(this.entries.values()).map((count) => (count.dropped)))
  }

  droppedByShape(): ReadonlyMap<string, number> {
    return new Map(this.#droppedEntries().map(([shape, count]) => [shape, count.dropped]))
  }

  droppedShapes(): ReadonlyArray<{ readonly shape: string; readonly dropped: number; readonly total: number }> {
    return this.#droppedEntries().map(([shape, count]) => ({
      shape,
      dropped: count.dropped,
      total: count.written + count.dropped
    }))
  }

  #droppedEntries(): ReadonlyArray<readonly [string, ShapeCount]> {
    return Array.fromIterable(this.entries).filter(([, count]) => count.dropped > 0)
  }
}
