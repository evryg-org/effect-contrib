import { ensureSchema, Neo4jConfig, UnconfiguredNeo4jClient } from "@evryg/effect-neo4j"
import { Neo4jTestContainerLive } from "@evryg/effect-testcontainers-neo4j"
import { Layer, ManagedRuntime } from "effect"
import { globSync, readFileSync } from "node:fs"
import type { GlobalSetupContext } from "vitest/node"

function loadSchemaFiles(): Array<string> {
  return globSync("src/**/schema/*GraphSchema.cypher").sort().flatMap((file) =>
    readFileSync(file, "utf8").split(";").map((s) => s.replace(/\/\/.*$/gm, "").trim()).filter((s) => s.length > 0)
  )
}

const SchemaSetupLive = Layer.effectDiscard(
  ensureSchema([loadSchemaFiles()])
)

const TestNeo4jLive = SchemaSetupLive.pipe(
  Layer.provideMerge(UnconfiguredNeo4jClient),
  Layer.provideMerge(Neo4jTestContainerLive)
)

const runtime = ManagedRuntime.make(TestNeo4jLive)

export async function setup({ provide }: GlobalSetupContext) {
  const config = await runtime.runPromise(Neo4jConfig)
  provide("neo4j", { uri: config.uri, password: config.password })
}

export async function teardown() {
  await runtime.dispose()
}

declare module "vitest" {
  export interface ProvidedContext {
    neo4j: { uri: string; password: string }
  }
}
