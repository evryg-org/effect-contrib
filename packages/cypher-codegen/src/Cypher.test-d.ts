import { describe, expectTypeOf, it } from "vitest"
import type { Effect } from "effect"
import type { Neo4jClient, Neo4jQueryError } from "@/lib/effect-neo4j"
import type { Record as Neo4jRecord } from "neo4j-driver"
import type { query } from "./Fixture.cypher"

describe("*.cypher ambient module", () => {
  it("query is callable and returns an Effect", () => {
    // Without generated cypher.d.ts, the return type falls back to the
    // untyped module declaration. With codegen, it returns typed Row[].
    expectTypeOf<typeof query>().toBeFunction()
    expectTypeOf<ReturnType<typeof query>>().toMatchTypeOf<
      Effect.Effect<unknown[], unknown, unknown>
    >()
  })
})
