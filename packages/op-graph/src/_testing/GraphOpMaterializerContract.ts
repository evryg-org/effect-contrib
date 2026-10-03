// Deterministic contract only — the property law suite lives in GraphOpMaterializerLaws.ts, so a
// cached test importing this file can never reach a property generator.
import { layer, expect } from "@effect/vitest"
import { Context, Effect, Layer, Record, Ref, Result, Schema, Stream } from "effect"
import { GraphOpMaterializer, materialize, summarize, type MaterializeProgress } from "../GraphOpMaterializer.js"
import { PropertyMap, UpsertEdge, UpsertVertex, VertexRef } from "../GraphOp.js"

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
export const vertex = (label: string, key: PropertyMap, properties: PropertyMap = {}): UpsertVertex =>
  new UpsertVertex({ label, key, properties })

export const ref = (label: string, key: PropertyMap): VertexRef => new VertexRef({ label, key })

export const edge = (
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

export const sortedEntries = (fields: PropertyMap): ReadonlyArray<readonly [string, unknown]> =>
  Record.toEntries(fields).toSorted(byKey(([name]) => name))

const EntriesJson = Schema.fromJsonString(Schema.Array(Schema.Tuple([Schema.String, Schema.Unknown])))
export const entriesKey = (entries: ReadonlyArray<readonly [string, unknown]>): string => Schema.encodeSync(EntriesJson)(entries)

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

export const sortedVertices = (vs: ReadonlyArray<MaterializedVertex>): ReadonlyArray<ProjectedVertex> =>
  vs.map(projectVertex).toSorted(byKey((v) => `${v.label} ${entriesKey(v.properties)}`))

export const sortedEdges = (es: ReadonlyArray<MaterializedEdge>): ReadonlyArray<ProjectedEdge> =>
  es.map(projectEdge).toSorted(byKey((e) => `${e.label} ${entriesKey(e.from)} ${entriesKey(e.to)} ${entriesKey(e.properties)}`))

export const snapshotOf = (probe: MaterializedGraph["Service"]) =>
  Effect.gen(function* () {
    const vertices = yield* probe.vertices("Alpha")
    const edges = yield* probe.edges("LINKS")
    return { vertices: sortedVertices(vertices), edges: sortedEdges(edges) }
  })

export const graphOpMaterializerContract = (
  implementationName: string,
  under: Layer.Layer<GraphOpMaterializer | MaterializedGraph>,
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
