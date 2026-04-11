import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { Neo4jClient } from "./Neo4jClient.js"
import { ensureSchema, type SchemaFragment } from "./SchemaFragment.js"

describe("SchemaFragment", () => {
  it("concatenates fragments and runs all queries", async () => {
    const executed: Array<string> = []
    const mockClient = {
      query: (cypher: string) => {
        executed.push(cypher)
        return Effect.succeed([])
      },
      runBatch: () => Effect.succeed(0)
    }
    const testLayer = Layer.mock(Neo4jClient, mockClient)

    const fragment1: SchemaFragment = [
      "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Class) REQUIRE c.fqcn IS UNIQUE"
    ]
    const fragment2: SchemaFragment = [
      "CREATE CONSTRAINT IF NOT EXISTS FOR (s:Snapshot) REQUIRE s.scope IS UNIQUE",
      "CREATE INDEX IF NOT EXISTS FOR (s:Snapshot) ON (s.scope)"
    ]

    await Effect.runPromise(
      ensureSchema([fragment1, fragment2]).pipe(Effect.provide(testLayer))
    )

    expect(executed).toEqual([
      "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Class) REQUIRE c.fqcn IS UNIQUE",
      "CREATE CONSTRAINT IF NOT EXISTS FOR (s:Snapshot) REQUIRE s.scope IS UNIQUE",
      "CREATE INDEX IF NOT EXISTS FOR (s:Snapshot) ON (s.scope)"
    ])
  })

  it("is a no-op for empty fragments", async () => {
    const executed: Array<string> = []
    const mockClient = {
      query: (cypher: string) => {
        executed.push(cypher)
        return Effect.succeed([])
      },
      runBatch: () => Effect.succeed(0)
    }
    const testLayer = Layer.mock(Neo4jClient, mockClient)

    await Effect.runPromise(
      ensureSchema([]).pipe(Effect.provide(testLayer))
    )

    expect(executed).toEqual([])
  })
})
