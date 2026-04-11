import { Effect } from "effect"
import { Neo4jClient } from "@/lib/effect-neo4j"

/** Scoped resource: clears all nodes/edges on acquire. Use with `it.scoped`. */
export const CleanNeo4jGraph = Effect.acquireRelease(
  Effect.flatMap(Neo4jClient, (neo4j) =>
    neo4j.query("MATCH (n) DETACH DELETE n"),
  ),
  () => Effect.void,
)
