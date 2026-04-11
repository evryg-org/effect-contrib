import { layer, expect } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Neo4jClient, Neo4jClientLive, Neo4jQueryError } from "@/lib/effect-neo4j"
import { Neo4jTestContainerLive } from "@/lib/effect-testcontainers"

const TestNeo4j = Neo4jClientLive.pipe(Layer.provide(Neo4jTestContainerLive))

layer(TestNeo4j, { timeout: "120 seconds" })("Neo4jClient (integration)", (it) => {
  it.effect("query returns records", () =>
    Effect.gen(function* () {
      const client = yield* Neo4jClient
      const records = yield* client.query("RETURN 1 AS n")
      expect(records).toHaveLength(1)
      expect(records[0].get("n").toNumber()).toBe(1)
    }),
  )

  it.effect("runBatch writes and reads back", () =>
    Effect.gen(function* () {
      const client = yield* Neo4jClient
      const rows = Array.from({ length: 5 }, (_, i) => ({ name: `node-${i}` }))
      const count = yield* client.runBatch(
        "UNWIND $rows AS row CREATE (:TestNode {name: row.name})",
        rows,
        2,
      )
      expect(count).toBe(5)
      const records = yield* client.query("MATCH (n:TestNode) RETURN n.name AS name ORDER BY name")
      expect(records).toHaveLength(5)
      expect(records[0].get("name")).toBe("node-0")
    }),
  )

  it.effect("query with invalid cypher yields Neo4jQueryError", () =>
    Effect.gen(function* () {
      const client = yield* Neo4jClient
      const exit = yield* client.query("INVALID CYPHER !!!").pipe(Effect.exit)
      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        const error = exit.cause.toJSON()
        expect(JSON.stringify(error)).toContain("Neo4jQueryError")
      }
    }),
  )
})
