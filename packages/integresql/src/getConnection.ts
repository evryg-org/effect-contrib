/**
 * @since 0.0.1
 */
import { Effect, Option, pipe } from "effect"
import type { DatabaseConfiguration, DatabaseTemplateId, IntegreSqlClient } from "./IntegreSqlClient.js"
import { makeIntegreSqlClient, unsafeMakeDatabaseTemplateId } from "./IntegreSqlClient.js"

/**
 * @internal
 */
export const makeGetConnection = (client: IntegreSqlClient) =>
<E, R>(config: {
  hash: DatabaseTemplateId
  initializeTemplate: InitializeTemplate<E, R>
}): Effect.Effect<DatabaseConfiguration, E, R> =>
  pipe(
    client.createTemplate(config.hash),
    Effect.flatMap(
      Option.match({
        onSome: (a) =>
          pipe(
            config.initializeTemplate(a),
            Effect.zipRight(pipe(client.finalizeTemplate(config.hash), Effect.orDie)),
            Effect.zipRight(client.getNewTestDatabase(config.hash)),
            Effect.flatten,
            Effect.catchTag(
              "NoSuchElementException",
              () =>
                Effect.die(
                  new Error(
                    "[@evryg/integresql]: Unexpected error, could not get a new template database after successfully creating the template"
                  )
                )
            )
          ),
        onNone: () =>
          pipe(
            client.getNewTestDatabase(config.hash),
            Effect.flatten,
            Effect.catchTag(
              "NoSuchElementException",
              () =>
                Effect.die(
                  new Error(
                    "[@evryg/integresql]: Unexpected error: Could not get a new test database from an existing template"
                  )
                )
            )
          )
      })
    )
  )

// TODO: Hash method & tests
// Add mising api methods on the client and expose the client
// read docs to see what edge cases are not handled (ask claude)
// make docs for per test setup/for suite setup
// Audit peer dependencies: `vitest` and `@effect/platform-node` are not used in source code and may not need to be peer deps.
// add example using test containers
// @todo: hash breaks for monorepo (user CWD)
// @todo: fail if no files on hash generation
// "packages/integresql/src/**/*.ts"

/**
 * @since 0.0.1
 */
export interface InitializeTemplate<E, R> {
  (connection: DatabaseConfiguration): Effect.Effect<void, E, R>
}

/**
 * @since 0.0.1
 */
export const getConnection = <E1, E2, R1, R2>(config: {
  templateId: Effect.Effect<string, E1, R1>
  initializeTemplate: InitializeTemplate<E2, R2>
  connection?: { port: number; host: string }
}): Effect.Effect<DatabaseConfiguration, E1 | E2, R1 | R2> =>
  pipe(
    config.templateId,
    Effect.flatMap((templateId) =>
      makeGetConnection(
        makeIntegreSqlClient({
          integrePort: config.connection?.port || 5000,
          integreHost: config.connection?.host || "localhost"
        })
      )({ ...config, hash: unsafeMakeDatabaseTemplateId(templateId) })
    ),
    Effect.orDie
  )
