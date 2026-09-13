import { Array, Record, Schema } from "effect"

export const EdgeShape = Schema.String.pipe(Schema.brand("EdgeShape"))
export type EdgeShape = typeof EdgeShape.Type

export class EdgeMaterialized extends Schema.TaggedClass<EdgeMaterialized>()("EdgeMaterialized", {
  shape: EdgeShape,
}) {}

export class EdgeDropped extends Schema.TaggedClass<EdgeDropped>()("EdgeDropped", {
  shape: EdgeShape,
}) {}

export const EdgeOutcome = Schema.Union([EdgeMaterialized, EdgeDropped]).pipe(Schema.toTaggedUnion("_tag"))
export type EdgeOutcome = typeof EdgeOutcome.Type

class ShapeCount extends Schema.Class<ShapeCount>("ShapeCount")({
  written: Schema.Number,
  dropped: Schema.Number,
}) {}

const zeroShapeCount = new ShapeCount({ written: 0, dropped: 0 })

const combineShapeCount = (a: ShapeCount, b: ShapeCount): ShapeCount =>
  new ShapeCount({ written: a.written + b.written, dropped: a.dropped + b.dropped })

const classify = (outcome: EdgeOutcome): { readonly shape: string; readonly dropped: boolean } =>
  EdgeOutcome.match(outcome, {
    EdgeMaterialized: (o) => ({ shape: o.shape, dropped: false }),
    EdgeDropped: (o) => ({ shape: o.shape, dropped: true }),
  })

/**
 * A count of materialized vs. dropped edges, per edge shape. `of` is the only introduction
 * form: a count can only ever arise by counting outcomes, so a negative is unrepresentable and
 * no subtraction exists anywhere in this type.
 */
export class EdgeTally extends Schema.Class<EdgeTally>("EdgeTally")({
  entries: Schema.ReadonlyMap(EdgeShape, ShapeCount),
}) {
  static readonly empty: EdgeTally = new EdgeTally({ entries: new Map() })

  static of(outcomes: ReadonlyArray<EdgeOutcome>): EdgeTally {
    const byShape = Array.groupBy(outcomes.map(classify), (c) => c.shape)
    const counts = Record.map(byShape, (group) =>
      new ShapeCount({
        written: group.filter((c) => !c.dropped).length,
        dropped: group.filter((c) => c.dropped).length,
      }))
    return new EdgeTally({
      entries: new Map(Record.toEntries(counts).map(([shape, count]) => [EdgeShape.make(shape), count])),
    })
  }

  combine(other: EdgeTally): EdgeTally {
    const shapes = Array.union(this.entries.keys(), other.entries.keys())
    return new EdgeTally({
      entries: new Map(
        shapes.map((shape) =>
          [shape, combineShapeCount(this.entries.get(shape) ?? zeroShapeCount, other.entries.get(shape) ?? zeroShapeCount)] as const,
        ),
      ),
    })
  }

  opCount(): number {
    return Array.reduce(Array.fromIterable(this.entries.values()), 0, (sum, count) => sum + count.written + count.dropped)
  }

  droppedCount(): number {
    return Array.reduce(Array.fromIterable(this.entries.values()), 0, (sum, count) => sum + count.dropped)
  }

  droppedByShape(): ReadonlyMap<string, number> {
    return new Map(this.#droppedEntries().map(([shape, count]) => [shape, count.dropped]))
  }

  droppedShapes(): ReadonlyArray<{ readonly shape: string; readonly dropped: number; readonly total: number }> {
    return this.#droppedEntries().map(([shape, count]) => ({ shape, dropped: count.dropped, total: count.written + count.dropped }))
  }

  #droppedEntries(): ReadonlyArray<readonly [string, ShapeCount]> {
    return Array.fromIterable(this.entries).filter(([, count]) => count.dropped > 0)
  }
}
