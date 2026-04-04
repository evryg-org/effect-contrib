import { Command } from "@effect/cli"
import { Console, Effect } from "effect"
import { Neo4jClient } from "@/lib/effect-neo4j"
import { compileToCypherDDL } from "@/lib/effect-neo4j-schema/Neo4jSchemaDDL"
import { allSchemas } from "@/RootNeo4jGraphSchema"
import { neo4jOptions, neo4jLayer } from "./Shared"

export const applySchemaCommand = Command.make(
  "apply-schema",
  { ...neo4jOptions },
  (opts) =>
    Effect.gen(function* () {
      const ddl = compileToCypherDDL(allSchemas)
      const statements = ddl.split("\n").filter((s) => s.trim())
      yield* Console.log(`Applying ${statements.length} DDL statements...`)
      const neo4j = yield* Neo4jClient
      yield* Effect.forEach(statements, (stmt) =>
        Effect.gen(function* () {
          yield* neo4j.query(stmt)
          yield* Console.log(`  ✓ ${stmt}`)
        }), { concurrency: 1 },
      )
      yield* Console.log(`Applied ${statements.length} DDL statements`)
    }).pipe(Effect.provide(neo4jLayer(opts))),
)
