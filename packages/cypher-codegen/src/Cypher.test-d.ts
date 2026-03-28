import { describe, expectTypeOf, it } from "vitest"
import type { Effect } from "effect"
import type { Neo4jClient, Neo4jQueryError } from "@/lib/effect-neo4j"
import type { Record as Neo4jRecord } from "neo4j-driver"
import type { query } from "./Fixture.cypher"

describe("*.cypher ambient module", () => {
  it("query returns Effect<Neo4jRecord[], Neo4jQueryError, Neo4jClient>", () => {
    expectTypeOf<ReturnType<typeof query>>().toEqualTypeOf<
      Effect.Effect<Neo4jRecord[], Neo4jQueryError, Neo4jClient>
    >()
  })
})
