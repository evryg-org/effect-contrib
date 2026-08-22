import { layer, expect } from "@effect/vitest"
import { Array, Context, Effect, Layer, Record, Ref, Result, Schema, Stream } from "effect"
import { FastCheck } from "effect/testing"
import { GraphOpMaterializer, materialize, summarize, type MaterializeProgress } from "./GraphOpMaterializer.js"
import { PropertyMap, UpsertEdge, UpsertVertex, VertexRef } from "./GraphOp.js"

/** One materialized vertex, read back through the probe rather than the port (`materialize` returns
 * only op counts, never a graph). */
export class MaterializedVertex extends Schema.Class<MaterializedVertex>("MaterializedVertex")({
  label: Schema.String,
  properties: PropertyMap,
}) {}

/** One materialized edge, both endpoints' full stored properties — never a per-field lookup, so a
 * probe can't quietly hide the very divergence the contract exists to catch. */
export class MaterializedEdge extends Schema.Class<MaterializedEdge>("MaterializedEdge")({
  label: Schema.String,
  from: PropertyMap,
  to: PropertyMap,
  properties: PropertyMap,
}) {}

/** The read-back capability the contract needs and the port deliberately does not have. */
export class MaterializedGraph extends Context.Service<MaterializedGraph, {
  readonly clear: () => Effect.Effect<void>
  readonly vertices: (label: string) => Effect.Effect<ReadonlyArray<MaterializedVertex>>
  readonly edges: (label: string) => Effect.Effect<ReadonlyArray<MaterializedEdge>>
}>()("MaterializedGraph") {}

// ── Fixture builders — neutral vocabulary only ("Alpha", "Beta", "LINKS", key field "id"),
// string-valued properties only. Every op goes through these constructors; no `_tag` literal.
const vertex = (label: string, key: PropertyMap, properties: PropertyMap = {}): UpsertVertex =>
  new UpsertVertex({ label, key, properties })

const ref = (label: string, key: PropertyMap): VertexRef => new VertexRef({ label, key })

const edge = (
  label: string,
  from: VertexRef,
  to: VertexRef,
  key: PropertyMap = {},
  properties: PropertyMap = {},
): UpsertEdge => new UpsertEdge({ label, from, to, key, properties })

// ── Assertion projection — both sides project to sorted plain records before comparing.
const byKey = <T>(keyOf: (t: T) => string) => (a: T, b: T): number => {
  const ka = keyOf(a)
  const kb = keyOf(b)
  return ka < kb ? -1 : ka > kb ? 1 : 0
}

const sortedEntries = (fields: PropertyMap): ReadonlyArray<readonly [string, unknown]> =>
  Record.toEntries(fields).toSorted(byKey(([name]) => name))

const EntriesJson = Schema.fromJsonString(Schema.Array(Schema.Tuple([Schema.String, Schema.Unknown])))
const entriesKey = (entries: ReadonlyArray<readonly [string, unknown]>): string => Schema.encodeSync(EntriesJson)(entries)

interface ProjectedVertex {
  readonly label: string
  readonly properties: ReadonlyArray<readonly [string, unknown]>
}

interface ProjectedEdge {
  readonly label: string
  readonly from: ReadonlyArray<readonly [string, unknown]>
  readonly to: ReadonlyArray<readonly [string, unknown]>
  readonly properties: ReadonlyArray<readonly [string, unknown]>
}

const projectVertex = (v: MaterializedVertex): ProjectedVertex => ({ label: v.label, properties: sortedEntries(v.properties) })

const projectEdge = (e: MaterializedEdge): ProjectedEdge => ({
  label: e.label,
  from: sortedEntries(e.from),
  to: sortedEntries(e.to),
  properties: sortedEntries(e.properties),
})

const sortedVertices = (vs: ReadonlyArray<MaterializedVertex>): ReadonlyArray<ProjectedVertex> =>
  vs.map(projectVertex).toSorted(byKey((v) => `${v.label} ${entriesKey(v.properties)}`))

const sortedEdges = (es: ReadonlyArray<MaterializedEdge>): ReadonlyArray<ProjectedEdge> =>
  es.map(projectEdge).toSorted(byKey((e) => `${e.label} ${entriesKey(e.from)} ${entriesKey(e.to)} ${entriesKey(e.properties)}`))

const snapshotOf = (probe: MaterializedGraph["Service"]) =>
  Effect.gen(function* () {
    const vertices = yield* probe.vertices("Alpha")
    const edges = yield* probe.edges("LINKS")
    return { vertices: sortedVertices(vertices), edges: sortedEdges(edges) }
  })

// ── A small draw over one "Alpha" vertex pool linked by "LINKS" edges — bounded ints/strings only,
// never a generated label or field name (those are interpolated into Cypher by the neo4j adapter).
const FixtureId = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 7 })))
const FixtureValue = Schema.String.pipe(Schema.check(Schema.isLengthBetween(1, 6)))

const FixtureDraw = Schema.Struct({
  vertices: Schema.Array(Schema.Struct({ id: FixtureId, value: FixtureValue })).pipe(Schema.check(Schema.isLengthBetween(1, 5))),
  edgeEndpoints: Schema.Array(
    Schema.Struct({ from: FixtureId, to: FixtureId, ordinal: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 3 }))) }),
  ).pipe(Schema.check(Schema.isLengthBetween(0, 5))),
})

const fixtureArbitrary = Schema.toArbitrary(FixtureDraw)

const distinctById = <T extends { readonly id: number }>(items: ReadonlyArray<T>): ReadonlyArray<T> =>
  Record.toEntries(Record.map(Array.groupBy(items, (item) => String(item.id)), (group) => group[group.length - 1])).map(([, item]) => item)

/** A caller-ordered (vertices, then edges) op list — never confounds a property with D-2's drop. */
const opsFromDraw = (draw: typeof FixtureDraw.Type): ReadonlyArray<UpsertVertex | UpsertEdge> => {
  const vertices = distinctById(draw.vertices)
  const vertexIds = new Set(vertices.map((v) => v.id))
  const edges = draw.edgeEndpoints.filter((e) => vertexIds.has(e.from) && vertexIds.has(e.to))
  return [
    ...vertices.map((v) => vertex("Alpha", { id: String(v.id) }, { value: v.value })),
    ...edges.map((e) => edge("LINKS", ref("Alpha", { id: String(e.from) }), ref("Alpha", { id: String(e.to) }), { ordinal: String(e.ordinal) })),
  ]
}

// ── A draw that produces two distinct one-field key maps whose field+value concatenation collide
// without a separator (field = combined[0:1], value = combined[1:]; and field = combined[0:-1],
// value = combined[-1:]) — the exact shape a hand-rolled `name+value` identity encoding conflates.
const CollisionDraw = Schema.Array(Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 25 })))).pipe(
  Schema.check(Schema.isLengthBetween(3, 6)),
)

const collisionArbitrary = Schema.toArbitrary(CollisionDraw)

const combinedOf = (letters: ReadonlyArray<number>): string => letters.map((n) => String.fromCharCode(97 + n)).join("")

const collisionKeysOf = (combined: string): readonly [PropertyMap, PropertyMap] => [
  { [combined.slice(0, 1)]: combined.slice(1) },
  { [combined.slice(0, combined.length - 1)]: combined.slice(combined.length - 1) },
]

/**
 * The nine properties every `GraphOpMaterializer` implementation must satisfy, run identically
 * against `under` — memory passes a dependency-free layer, neo4j passes one already provided a
 * Neo4j client. `samples` bounds the property-based cases (smaller across a container boundary).
 */
export const graphOpMaterializerContract = (
  implementationName: string,
  under: Layer.Layer<GraphOpMaterializer | MaterializedGraph>,
  samples: number,
): void => {
  layer(under, { timeout: "120 seconds" })(implementationName, (it) => {
    it.effect("P1 — vertices MERGE by (label, key); properties accumulate", () =>
      Effect.gen(function* () {
        const probe = yield* MaterializedGraph
        yield* probe.clear()
        yield* materialize([
          vertex("Alpha", { id: "1" }, { name: "first" }),
          vertex("Alpha", { id: "1" }, { role: "primary" }),
        ]).pipe(Stream.runDrain)
        const vertices = yield* probe.vertices("Alpha")
        expect(sortedVertices(vertices)).toEqual([
          { label: "Alpha", properties: sortedEntries({ id: "1", name: "first", role: "primary" }) },
        ])
      }))

    it.effect("P2 — re-applying the same op list is idempotent", () =>
      Effect.forEach(FastCheck.sample(fixtureArbitrary, samples), (draw) =>
        Effect.gen(function* () {
          const ops = opsFromDraw(draw)
          const probe = yield* MaterializedGraph
          yield* probe.clear()
          yield* materialize(ops).pipe(Stream.runDrain)
          const once = yield* snapshotOf(probe)
          yield* materialize(ops).pipe(Stream.runDrain)
          const twice = yield* snapshotOf(probe)
          expect(twice).toEqual(once)
        }),
      ))

    it.effect("P3 — edges MERGE by (endpoints, key); a different key is a distinct edge", () =>
      Effect.gen(function* () {
        const probe = yield* MaterializedGraph
        yield* probe.clear()
        yield* materialize([
          vertex("Alpha", { id: "1" }),
          vertex("Beta", { id: "2" }),
          edge("LINKS", ref("Alpha", { id: "1" }), ref("Beta", { id: "2" }), { kind: "a" }, { weight: "1" }),
          edge("LINKS", ref("Alpha", { id: "1" }), ref("Beta", { id: "2" }), { kind: "a" }, { weight: "2" }),
          edge("LINKS", ref("Alpha", { id: "1" }), ref("Beta", { id: "2" }), { kind: "b" }, {}),
        ]).pipe(Stream.runDrain)
        const edges = yield* probe.edges("LINKS")
        expect(sortedEdges(edges)).toEqual(
          [
            {
              label: "LINKS",
              from: sortedEntries({ id: "1" }),
              to: sortedEntries({ id: "2" }),
              properties: sortedEntries({ kind: "a", weight: "2" }),
            },
            {
              label: "LINKS",
              from: sortedEntries({ id: "1" }),
              to: sortedEntries({ id: "2" }),
              properties: sortedEntries({ kind: "b" }),
            },
          ].toSorted(byKey((e) => `${e.label} ${entriesKey(e.from)} ${entriesKey(e.to)} ${entriesKey(e.properties)}`)),
        )
      }))

    it.effect("P4 — distinct (label, key) pairs are distinct vertices", () =>
      Effect.forEach(FastCheck.sample(collisionArbitrary, samples), (letters) =>
        Effect.gen(function* () {
          const combined = combinedOf(letters)
          const [key1, key2] = collisionKeysOf(combined)
          const probe = yield* MaterializedGraph
          yield* probe.clear()
          yield* materialize([vertex("Alpha", key1), vertex("Alpha", key2)]).pipe(Stream.runDrain)
          const vertices = yield* probe.vertices("Alpha")
          expect(sortedVertices(vertices)).toEqual(
            [
              { label: "Alpha", properties: sortedEntries(key1) },
              { label: "Alpha", properties: sortedEntries(key2) },
            ].toSorted(byKey((v) => `${v.label} ${entriesKey(v.properties)}`)),
          )
        }),
      ))

    it.effect("P5 — a caller-ordered vertices-then-edges list materializes every edge", () =>
      Effect.gen(function* () {
        const probe = yield* MaterializedGraph
        yield* probe.clear()
        const events = yield* materialize([
          vertex("Alpha", { id: "1" }),
          vertex("Beta", { id: "2" }),
          edge("LINKS", ref("Alpha", { id: "1" }), ref("Beta", { id: "2" })),
        ]).pipe(Stream.runCollect)
        const last = events[events.length - 1]
        expect(last.dropped.size).toBe(0)
        const edges = yield* probe.edges("LINKS")
        expect(edges.length).toBe(1)
      }))

    it.effect("P6 — an edge before its endpoint vertex in the same list is dropped (arrival order is honoured)", () =>
      Effect.gen(function* () {
        const probe = yield* MaterializedGraph
        yield* probe.clear()
        const result = yield* materialize([
          edge("LINKS", ref("Alpha", { id: "1" }), ref("Beta", { id: "2" })),
          vertex("Alpha", { id: "1" }),
          vertex("Beta", { id: "2" }),
        ]).pipe(Stream.runDrain, Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        const edges = yield* probe.edges("LINKS")
        expect(edges.length).toBe(0)
      }))

    it.effect("P7 — a dropped edge fails the stream but the prior progress carries the tally, and a surviving edge in the same apply is still written", () =>
      Effect.gen(function* () {
        const probe = yield* MaterializedGraph
        yield* probe.clear()
        const lastProgress = yield* Ref.make<MaterializeProgress | undefined>(undefined)
        const result = yield* materialize([
          vertex("Alpha", { id: "1" }),
          vertex("Beta", { id: "2" }),
          edge("LINKS", ref("Alpha", { id: "1" }), ref("Beta", { id: "2" })),
          edge("LINKS", ref("Alpha", { id: "1" }), ref("Beta", { id: "missing" })),
        ]).pipe(Stream.runForEach((p) => Ref.set(lastProgress, p)), Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        const last = yield* Ref.get(lastProgress)
        expect(last?.dropped.get("Alpha-[:LINKS]->Beta")).toBe(1)
        const edges = yield* probe.edges("LINKS")
        expect(edges.length).toBe(1)
      }))

    it.effect("P8 — counts is keyed by vertex label and edge shape, and summarize(last).details agrees", () =>
      Effect.gen(function* () {
        const probe = yield* MaterializedGraph
        yield* probe.clear()
        const events = yield* materialize([
          vertex("Alpha", { id: "1" }),
          vertex("Alpha", { id: "2" }),
          vertex("Beta", { id: "3" }),
          edge("LINKS", ref("Alpha", { id: "1" }), ref("Beta", { id: "3" })),
        ]).pipe(Stream.runCollect)
        const last = events[events.length - 1]
        expect(last.counts.get("Alpha")).toBe(2)
        expect(last.counts.get("Beta")).toBe(1)
        expect(last.counts.get("Alpha-[:LINKS]->Beta")).toBe(1)
        expect(summarize(last).details).toEqual(
          expect.arrayContaining([
            { key: "Alpha", count: 2 },
            { key: "Beta", count: 1 },
            { key: "Alpha-[:LINKS]->Beta", count: 1 },
          ]),
        )
      }))

    it.effect("P8 — processed is non-decreasing and the final progress totals the op count", () =>
      Effect.forEach(FastCheck.sample(fixtureArbitrary, samples), (draw) =>
        Effect.gen(function* () {
          const ops = opsFromDraw(draw)
          const probe = yield* MaterializedGraph
          yield* probe.clear()
          const events = yield* materialize(ops).pipe(Stream.runCollect)
          const processedValues = events.map((e) => e.processed)
          expect(processedValues.every((p, i) => i === 0 || p >= processedValues[i - 1])).toBe(true)
          const last = events[events.length - 1]
          expect(last.processed).toBe(ops.length)
          expect(last.total).toBe(ops.length)
        }),
      ))

    it.effect("P9 — an empty op list emits exactly one zero progress and never fails", () =>
      Effect.gen(function* () {
        const probe = yield* MaterializedGraph
        yield* probe.clear()
        const events = yield* materialize([]).pipe(Stream.runCollect)
        expect(events.length).toBe(1)
        expect(events[0].processed).toBe(0)
        expect(events[0].total).toBe(0)
        expect(events[0].counts.size).toBe(0)
        expect(events[0].dropped.size).toBe(0)
      }))
  })
}
