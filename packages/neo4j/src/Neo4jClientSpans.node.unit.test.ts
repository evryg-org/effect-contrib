import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Layer, Stream, Tracer } from "effect"
import { vi } from "vitest"
import { Neo4jClient, Neo4jConfig, UnconfiguredNeo4jClient } from "./index.js"

type Handlers = {
  readonly onNext: (record: unknown) => void
  readonly onCompleted: () => void
  readonly onError: (error: Error) => void
}

const fakeNeo4j = vi.hoisted(() => {
  const state: { failWith: Error | undefined; records: Array<unknown> } = { failWith: undefined, records: [] }
  const run = (_cypher: string, _params?: Record<string, unknown>) => {
    const settle = () =>
      state.failWith === undefined
        ? Promise.resolve({ records: state.records })
        : Promise.reject(state.failWith)
    return {
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        settle().then(onFulfilled, onRejected),
      subscribe: (handlers: Handlers) => {
        if (state.failWith !== undefined) {
          handlers.onError(state.failWith)
          return
        }
        state.records.forEach(handlers.onNext)
        handlers.onCompleted()
      }
    }
  }
  const session = {
    run,
    executeWrite: (work: (tx: { run: typeof run }) => unknown) => Promise.resolve(work({ run })),
    close: () => Promise.resolve()
  }
  const driver = { session: () => session, close: () => Promise.resolve() }
  return { state, driver }
})

vi.mock("neo4j-driver", () => ({
  default: {
    driver: () => fakeNeo4j.driver,
    auth: { basic: () => ({}) }
  }
}))

const ConfigLive = Layer.succeed(Neo4jConfig, {
  uri: "bolt://fake:7687",
  user: "user",
  password: "password",
  database: "analytics"
})

const ClientLive = UnconfiguredNeo4jClient.pipe(Layer.provide(ConfigLive))

const recordSpans = Effect.gen(function*() {
  const base = yield* Effect.service(Tracer.Tracer)
  const spans: Array<Tracer.Span> = []
  const tracer = Tracer.make({
    span(options) {
      const span = base.span.call(base, options)
      spans.push(span)
      return span
    }
  })
  return { spans, tracer }
})

const spanNamed = (spans: ReadonlyArray<Tracer.Span>, name: string) => {
  const found = spans.filter((span) => span.name === name)
  expect(found).toHaveLength(1)
  return found[0]
}

const secretParams = { secret: "hunter2-parameter-value" }

const expectNoParameterLeak = (span: Tracer.Span) => {
  for (const [key, value] of span.attributes) {
    expect(key).not.toContain("parameter")
    expect(JSON.stringify(value)).not.toContain(secretParams.secret)
  }
}

describe.sequential("Neo4jClient spans", () => {
  it.effect("query emits a client span with database semantic-convention attributes", () =>
    Effect.gen(function*() {
      const { spans, tracer } = yield* recordSpans
      const client = yield* Neo4jClient
      yield* client.query("match (n) where n.k = $secret return n", secretParams).pipe(Effect.withTracer(tracer))

      const span = spanNamed(spans, "neo4j.query")
      expect(span.kind).toBe("client")
      expect(span.attributes.get("db.system.name")).toBe("neo4j")
      expect(span.attributes.get("db.query.text")).toBe("match (n) where n.k = $secret return n")
      expect(span.attributes.get("db.operation.name")).toBe("MATCH")
      expect(span.attributes.get("db.namespace")).toBe("analytics")
      expect(span.status._tag).toBe("Ended")
      expectNoParameterLeak(span)
    }).pipe(Effect.provide(ClientLive)))

  it.effect("query marks its span failed when the query fails", () =>
    Effect.gen(function*() {
      const { spans, tracer } = yield* recordSpans
      const client = yield* Neo4jClient
      fakeNeo4j.state.failWith = new Error("boom")
      const exit = yield* client.query("RETURN 1").pipe(Effect.withTracer(tracer), Effect.exit)
      fakeNeo4j.state.failWith = undefined

      const span = spanNamed(spans, "neo4j.query")
      expect(Exit.isFailure(exit)).toBe(true)
      expect(span.status._tag === "Ended" && Exit.isFailure(span.status.exit)).toBe(true)
    }).pipe(Effect.provide(ClientLive)))

  it.effect("runBatch emits a client span carrying the batch size", () =>
    Effect.gen(function*() {
      const { spans, tracer } = yield* recordSpans
      const client = yield* Neo4jClient
      const rows = Array.from({ length: 5 }, (_, i) => ({ secret: `${secretParams.secret}-${i}` }))
      yield* client.runBatch("UNWIND $rows AS row CREATE (:Node)", rows, 2).pipe(Effect.withTracer(tracer))

      const span = spanNamed(spans, "neo4j.run_batch")
      expect(span.kind).toBe("client")
      expect(span.attributes.get("db.system.name")).toBe("neo4j")
      expect(span.attributes.get("db.query.text")).toBe("UNWIND $rows AS row CREATE (:Node)")
      expect(span.attributes.get("db.operation.name")).toBe("UNWIND")
      expect(span.attributes.get("db.namespace")).toBe("analytics")
      expect(span.attributes.get("db.operation.batch.size")).toBe(5)
      expectNoParameterLeak(span)
    }).pipe(Effect.provide(ClientLive)))

  it.effect("queryStream emits a client span that stays open while the stream is consumed", () =>
    Effect.gen(function*() {
      const { spans, tracer } = yield* recordSpans
      const client = yield* Neo4jClient
      fakeNeo4j.state.records = [{ n: 1 }, { n: 2 }]
      const statusesWhileConsuming: Array<string> = []
      yield* client.queryStream("MATCH (n) RETURN n", secretParams).pipe(
        Stream.tap(() =>
          Effect.sync(() => statusesWhileConsuming.push(spanNamed(spans, "neo4j.query_stream").status._tag))
        ),
        Stream.runCollect,
        Effect.withTracer(tracer)
      )
      fakeNeo4j.state.records = []

      const span = spanNamed(spans, "neo4j.query_stream")
      expect(span.kind).toBe("client")
      expect(span.attributes.get("db.system.name")).toBe("neo4j")
      expect(span.attributes.get("db.query.text")).toBe("MATCH (n) RETURN n")
      expect(span.attributes.get("db.operation.name")).toBe("MATCH")
      expect(span.attributes.get("db.namespace")).toBe("analytics")
      expect(statusesWhileConsuming).toStrictEqual(["Started", "Started"])
      expect(span.status._tag).toBe("Ended")
      expectNoParameterLeak(span)
    }).pipe(Effect.provide(ClientLive)))

  it.effect("queryStream marks its span failed when the query fails", () =>
    Effect.gen(function*() {
      const { spans, tracer } = yield* recordSpans
      const client = yield* Neo4jClient
      fakeNeo4j.state.failWith = new Error("boom")
      const exit = yield* client.queryStream("RETURN 1").pipe(Stream.runCollect, Effect.withTracer(tracer), Effect.exit)
      fakeNeo4j.state.failWith = undefined

      const span = spanNamed(spans, "neo4j.query_stream")
      expect(Exit.isFailure(exit)).toBe(true)
      expect(span.status._tag === "Ended" && Exit.isFailure(span.status.exit)).toBe(true)
    }).pipe(Effect.provide(ClientLive)))
})
