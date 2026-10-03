/**
 * The property law suite that `GraphOpMaterializerContract.ts`'s deterministic contract
 * deliberately excludes, so a cached test importing that module can never reach a property
 * generator. Only property tests import this one.
 *
 * @since 0.0.1
 */
import { expect, layer } from "@effect/vitest"
import { Array, Effect, type Layer, Order, Record, Ref, Result, Schema, Stream } from "effect"
import { FastCheck } from "effect/testing"
import {
  edge,
  entriesKey,
  MaterializedGraph,
  ref,
  snapshotOf,
  sortedEntries,
  sortedVertices,
  vertex
} from "./_testing/GraphOpMaterializerContract.js"
import type { PropertyMap, UpsertEdge, UpsertVertex } from "./GraphOp.js"
import { type GraphOpMaterializer, materialize, type MaterializeProgress } from "./GraphOpMaterializer.js"

// ── A small draw over one "Alpha" vertex pool linked by "LINKS" edges — bounded ints/strings only,
// never a generated label or field name (those are interpolated into Cypher by the neo4j adapter).
const FixtureId = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 7 })))
const FixtureValue = Schema.String.pipe(Schema.check(Schema.isLengthBetween(1, 6)))

const FixtureDraw = Schema.Struct({
  vertices: Schema.Array(Schema.Struct({ id: FixtureId, value: FixtureValue })).pipe(
    Schema.check(Schema.isLengthBetween(1, 5))
  ),
  edgeEndpoints: Schema.Array(
    Schema.Struct({
      from: FixtureId,
      to: FixtureId,
      ordinal: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 3 })))
    })
  ).pipe(Schema.check(Schema.isLengthBetween(0, 5)))
})

const fixtureArbitrary = Schema.toArbitrary(FixtureDraw)

const distinctById = <T extends { readonly id: number }>(items: ReadonlyArray<T>): ReadonlyArray<T> =>
  Record.toEntries(Record.map(Array.groupBy(items, (item) => String(item.id)), (group) => group[group.length - 1])).map(
    ([, item]) => item
  )

/** A caller-ordered (vertices, then edges) op list — never confounds a property with D-2's drop. */
const opsFromDraw = (draw: typeof FixtureDraw.Type): ReadonlyArray<UpsertVertex | UpsertEdge> => {
  const vertices = distinctById(draw.vertices)
  const vertexIds = new Set(vertices.map((v) => v.id))
  const edges = draw.edgeEndpoints.filter((e) => vertexIds.has(e.from) && vertexIds.has(e.to))
  return [
    ...vertices.map((v) => vertex("Alpha", { id: String(v.id) }, { value: v.value })),
    ...edges.map((e) =>
      edge("LINKS", ref("Alpha", { id: String(e.from) }), ref("Alpha", { id: String(e.to) }), {
        ordinal: String(e.ordinal)
      })
    )
  ]
}

// ── A draw that produces two distinct one-field key maps whose field+value concatenation collide
// without a separator (field = combined[0:1], value = combined[1:]; and field = combined[0:-1],
// value = combined[-1:]) — the exact shape a hand-rolled `name+value` identity encoding conflates.
const CollisionDraw = Schema.Array(Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 25 })))).pipe(
  Schema.check(Schema.isLengthBetween(3, 6))
)

const collisionArbitrary = Schema.toArbitrary(CollisionDraw)

const combinedOf = (letters: ReadonlyArray<number>): string => letters.map((n) => String.fromCharCode(97 + n)).join("")

const collisionKeysOf = (combined: string): readonly [PropertyMap, PropertyMap] => [
  { [combined.slice(0, 1)]: combined.slice(1) },
  { [combined.slice(0, combined.length - 1)]: combined.slice(combined.length - 1) }
]

// A draw that fans one edge out over two nodes sharing an `id` while a second, genuinely dangling
// edge in the same apply targets a node never declared -- letting fan-out's positive tally cancel an unrelated negative one.
const ConservationDraw = Schema.Struct({
  shared: FixtureValue,
  discriminator: FixtureValue,
  target: FixtureValue,
  missing: FixtureValue
}).pipe(
  Schema.check(
    Schema.makeFilter(
      (draw) => draw.missing !== draw.target || "missing must differ from target",
      { title: "missing id distinct from target id" }
    )
  )
)

const conservationArbitrary = Schema.toArbitrary(ConservationDraw)

/**
 * @since 0.0.1
 */
export const graphOpMaterializerLaws = (
  implementationName: string,
  under: Layer.Layer<GraphOpMaterializer | MaterializedGraph>,
  samples: number
): void => {
  layer(under, { timeout: "120 seconds" })(implementationName, (it) => {
    it.effect("P2 — re-applying the same op list is idempotent", () =>
      Effect.forEach(FastCheck.sample(fixtureArbitrary, samples), (draw) =>
        Effect.gen(function*() {
          const ops = opsFromDraw(draw)
          const probe = yield* MaterializedGraph
          yield* probe.clear()
          yield* materialize(ops).pipe(Stream.runDrain)
          const once = yield* snapshotOf(probe)
          yield* materialize(ops).pipe(Stream.runDrain)
          const twice = yield* snapshotOf(probe)
          expect(twice).toEqual(once)
        })))

    it.effect("P4 — distinct (label, key) pairs are distinct vertices", () =>
      Effect.forEach(FastCheck.sample(collisionArbitrary, samples), (letters) =>
        Effect.gen(function*() {
          const combined = combinedOf(letters)
          const [key1, key2] = collisionKeysOf(combined)
          const probe = yield* MaterializedGraph
          yield* probe.clear()
          yield* materialize([vertex("Alpha", key1), vertex("Alpha", key2)]).pipe(Stream.runDrain)
          const vertices = yield* probe.vertices("Alpha")
          expect(sortedVertices(vertices)).toEqual(
            Array.sortWith(
              [
                { label: "Alpha", properties: sortedEntries(key1) },
                { label: "Alpha", properties: sortedEntries(key2) }
              ],
              (v) => `${v.label} ${entriesKey(v.properties)}`,
              Order.String
            )
          )
        })))

    it.effect("P8 — processed is non-decreasing and the final progress totals the op count", () =>
      Effect.forEach(FastCheck.sample(fixtureArbitrary, samples), (draw) =>
        Effect.gen(function*() {
          const ops = opsFromDraw(draw)
          const probe = yield* MaterializedGraph
          yield* probe.clear()
          const events = yield* materialize(ops).pipe(Stream.runCollect)
          const processedValues = events.map((e) => e.processed)
          expect(processedValues.every((p, i) => i === 0 || p >= processedValues[i - 1])).toBe(true)
          const last = events[events.length - 1]
          expect(last.processed).toBe(ops.length)
          expect(last.total).toBe(ops.length)
        })))

    it.effect("P10 — the tally conserves ops: a dangling edge is tallied dropped even when another op in the same apply fans out", () =>
      Effect.forEach(FastCheck.sample(conservationArbitrary, samples), (draw) =>
        Effect.gen(function*() {
          const probe = yield* MaterializedGraph
          yield* probe.clear()
          const lastProgress = yield* Ref.make<MaterializeProgress | undefined>(undefined)
          const result = yield* materialize([
            vertex("Alpha", { id: draw.shared }),
            vertex("Alpha", { id: draw.shared, tier: draw.discriminator }),
            vertex("Beta", { id: draw.target }),
            edge("LINKS", ref("Alpha", { id: draw.shared }), ref("Beta", { id: draw.target })),
            edge("LINKS", ref("Alpha", { id: draw.shared }), ref("Beta", { id: draw.missing }))
          ]).pipe(Stream.runForEach((p) => Ref.set(lastProgress, p)), Effect.result)
          expect(Result.isFailure(result)).toBe(true)
          const last = yield* Ref.get(lastProgress)
          expect(last?.dropped.get("Alpha-[:LINKS]->Beta")).toBe(1)
          const edges = yield* probe.edges("LINKS")
          expect(edges.length).toBe(2)
        })))
  })
}
