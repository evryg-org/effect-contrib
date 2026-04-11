import { ManagedRuntime } from "effect"
import { Neo4jConfig } from "@/lib/effect-neo4j"
import { Neo4jTestContainerLive } from "@/lib/effect-testcontainers"
import type { GlobalSetupContext } from "vitest/node"

const runtime = ManagedRuntime.make(Neo4jTestContainerLive)

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
