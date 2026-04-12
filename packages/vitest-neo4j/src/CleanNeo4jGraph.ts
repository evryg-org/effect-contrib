/** @since 0.0.1 */
import { Neo4jClient } from "@evryg/effect-neo4j"
import { Effect } from "effect"

/**
 * Scoped resource: clears all nodes/edges on acquire. Use with `it.scoped`.
 *
 * @since 0.0.1
 * @category utils
 */
export const CleanNeo4jGraph = Effect.acquireRelease(
  Effect.flatMap(Neo4jClient, (neo4j) => neo4j.query("MATCH (n) DETACH DELETE n")),
  () => Effect.void
)
