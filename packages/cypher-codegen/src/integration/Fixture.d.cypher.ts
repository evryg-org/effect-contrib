import type { Neo4jClient, Neo4jQueryError } from "@evryg/effect-neo4j"
import type { Effect } from "effect"
import type { Record as Neo4jRecord } from "neo4j-driver"

export declare const query: () => Effect.Effect<Array<Neo4jRecord>, Neo4jQueryError, Neo4jClient>
