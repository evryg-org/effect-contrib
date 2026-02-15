/**
 * @since 0.0.1
 */
import { Effect, Option, pipe } from "effect"
import type { DatabaseConfiguration } from "./IntegreSqlClient.js"
import { makeIntegreSqlClient, unsafeMakeDatabaseTemplateId } from "./IntegreSqlClient.js"

// shi readme
// fix ci
// check todos
// fuck it
// (coderabbit?)
// Add missing api methods on the client and expose the client
// read docs to see what edge cases are not handled (ask claude)
// make docs for per test setup/for suite setup
// Audit peer dependencies: `vitest` and `@effect/platform-node` are not used in source code and may not need to be peer deps.
// add example using test containers

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
    Effect.map(unsafeMakeDatabaseTemplateId),
    Effect.flatMap((templateId) => {
      const client = makeIntegreSqlClient({
        integrePort: config.connection?.port ?? 5000,
        integreHost: config.connection?.host ?? "localhost"
      })

      return pipe(
        client.createTemplate(templateId),
        Effect.flatMap(
          Option.match({
            onSome: (a) =>
              pipe(
                config.initializeTemplate(a),
                Effect.zipRight(pipe(client.finalizeTemplate(templateId), Effect.orDie)),
                Effect.zipRight(client.getNewTestDatabase(templateId)),
                Effect.flatten,
                Effect.catchTag(
                  "NoSuchElementException",
                  () =>
                    Effect.die(
                      new Error(
                        "[@evryg/integresql]: Unexpected error, could not get a new test database after successfully creating the template"
                      )
                    )
                )
              ),
            onNone: () =>
              pipe(
                client.getNewTestDatabase(templateId),
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
    })
  )
