/**
 * @since 0.0.1
 */
import { Effect, Option, pipe } from "effect"
import type { DatabaseConfiguration } from "./IntegreSqlClient.js"
import { makeIntegreSqlClient, unsafeMakeDatabaseTemplateId } from "./IntegreSqlClient.js"

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
  integreSQLAPIUrl: string
}): Effect.Effect<DatabaseConfiguration, E1 | E2, R1 | R2> =>
  pipe(
    config.templateId,
    Effect.map(unsafeMakeDatabaseTemplateId),
    Effect.flatMap((templateId) => {
      const client = makeIntegreSqlClient({ url: config.integreSQLAPIUrl })

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
