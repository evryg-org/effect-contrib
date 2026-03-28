import type { Effect } from "effect"
import type { Neo4jClient, Neo4jQueryError } from "@/lib/effect-neo4j"
import type { Record as Neo4jRecord } from "neo4j-driver"

export declare const query: () => Effect.Effect<Neo4jRecord[], Neo4jQueryError, Neo4jClient>
