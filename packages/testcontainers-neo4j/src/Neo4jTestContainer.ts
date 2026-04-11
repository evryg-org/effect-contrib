import { Neo4jConfig } from "@evryg/effect-neo4j"
import { acquireContainer } from "@evryg/effect-testcontainers"
import { Neo4jContainer } from "@testcontainers/neo4j"
import { Effect, Layer } from "effect"

export interface Neo4jTestContainerOptions {
  readonly image?: string
  readonly password?: string
}

export const makeNeo4jTestContainer = (
  opts?: Neo4jTestContainerOptions
): Layer.Layer<Neo4jConfig, Error> => {
  const image = opts?.image ?? "neo4j:5"
  const password = opts?.password ?? "changeme"

  return Layer.scoped(
    Neo4jConfig,
    Effect.gen(function*() {
      const container = yield* acquireContainer(() =>
        new Neo4jContainer(image).withPassword(password).withStartupTimeout(120_000).start()
      )
      yield* Effect.log(`[testcontainers] Neo4j started at ${container.getBoltUri()}`)
      return { uri: container.getBoltUri(), user: "neo4j", password, database: "neo4j" }
    })
  )
}

export const Neo4jTestContainerLive: Layer.Layer<Neo4jConfig, Error> = makeNeo4jTestContainer()
