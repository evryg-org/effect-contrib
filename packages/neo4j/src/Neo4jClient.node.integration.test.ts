import { expect, layer } from "@effect/vitest"
import { Neo4jClient, Neo4jConfig, UnconfiguredNeo4jClient } from "@evryg/effect-neo4j"
import { Chunk, Effect, Layer, Stream } from "effect"
import { inject } from "vitest"

declare module "vitest" {
  interface ProvidedContext {
    neo4j: { uri: string; password: string }
  }
}

const Neo4jConfigFromVitest = Layer.succeed(Neo4jConfig, {
  uri: inject("neo4j").uri,
  user: "neo4j",
  password: inject("neo4j").password,
  database: "neo4j"
})

const CleanNeo4jGraph = Effect.acquireRelease(
  Effect.flatMap(Neo4jClient, (neo4j) => neo4j.query("MATCH (n) DETACH DELETE n")),
  () => Effect.void
)

const TestNeo4j = UnconfiguredNeo4jClient.pipe(Layer.provide(Neo4jConfigFromVitest))

layer(TestNeo4j, { timeout: "120 seconds" })("Neo4jClient (integration)", (it) => {
  it.effect("query returns records", () =>
    Effect.gen(function*() {
      const client = yield* Neo4jClient
      const records = yield* client.query("RETURN 1 AS n")
      expect(records).toHaveLength(1)
      expect(records[0].get("n").toNumber()).toBe(1)
    }))

  it.scoped("runBatch writes and reads back", () =>
    Effect.gen(function*() {
      yield* CleanNeo4jGraph
      const client = yield* Neo4jClient
      const rows = Array.from({ length: 5 }, (_, i) => ({ name: `node-${i}` }))
      const count = yield* client.runBatch(
        "UNWIND $rows AS row CREATE (:TestNode {name: row.name})",
        rows,
        2
      )
      expect(count).toBe(5)
      const records = yield* client.query("MATCH (n:TestNode) RETURN n.name AS name ORDER BY name")
      expect(records).toHaveLength(5)
      expect(records[0].get("name")).toBe("node-0")
    }))

  it.effect("query with invalid cypher yields Neo4jQueryError", () =>
    Effect.gen(function*() {
      const client = yield* Neo4jClient
      const exit = yield* client.query("INVALID CYPHER !!!").pipe(Effect.exit)
      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        const error = exit.cause.toJSON()
        expect(JSON.stringify(error)).toContain("Neo4jQueryError")
      }
    }))

  it.scoped("queryStream emits records", () =>
    Effect.gen(function*() {
      yield* CleanNeo4jGraph
      const client = yield* Neo4jClient
      yield* client.runBatch(
        "UNWIND $rows AS row CREATE (:StreamTest {name: row.name})",
        Array.from({ length: 5 }, (_, i) => ({ name: `stream-${i}` }))
      )
      const chunk = yield* client
        .queryStream("MATCH (n:StreamTest) RETURN n.name AS name ORDER BY name")
        .pipe(Stream.runCollect)
      expect(Chunk.toArray(chunk)).toHaveLength(5)
      expect(chunk.pipe(Chunk.unsafeGet(0)).get("name")).toBe("stream-0")
    }))

  it.effect("queryStream with empty result yields empty stream", () =>
    Effect.gen(function*() {
      const client = yield* Neo4jClient
      const chunk = yield* client
        .queryStream("MATCH (n:NeverExists) RETURN n")
        .pipe(Stream.runCollect)
      expect(Chunk.toArray(chunk)).toHaveLength(0)
    }))

  it.effect("queryStream with invalid cypher yields Neo4jQueryError", () =>
    Effect.gen(function*() {
      const client = yield* Neo4jClient
      const exit = yield* client
        .queryStream("INVALID CYPHER !!!")
        .pipe(Stream.runCollect, Effect.exit)
      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        const error = exit.cause.toJSON()
        expect(JSON.stringify(error)).toContain("Neo4jQueryError")
      }
    }))
})
