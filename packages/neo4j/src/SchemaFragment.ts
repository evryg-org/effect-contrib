import { Effect } from "effect"
import { Neo4jClient } from "./Neo4jClient.js"

export type SchemaFragment = ReadonlyArray<string>

export const ensureSchema = (
  fragments: Array<SchemaFragment>
): Effect.Effect<void, Error, Neo4jClient> =>
  Effect.gen(function*() {
    const queries = fragments.flat()
    if (queries.length === 0) return
    const client = yield* Neo4jClient
    yield* Effect.log("[store] Creating schema constraints and indexes...")
    for (const q of queries) {
      yield* client.query(q)
    }
  })
