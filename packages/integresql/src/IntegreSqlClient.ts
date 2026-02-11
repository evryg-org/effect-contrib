/**
 * @since 0.0.1
 */
import { Data, Effect, Either, flow, Option, pipe, Schema } from "effect"
import type { Branded } from "effect/Brand"

/**
 * @since 0.0.1
 */
export type DatabaseTemplateId = Branded<string, "DATABASE_TEMPLATE_ID">

/**
 * @since 0.0.1
 */
export class DatabaseConfiguration extends Data.Class<{
  host: string
  port: number
  username: string
  password: string
  database: string
}> {}

/**
 * @since 0.0.1
 */
export interface IntegreSqlClient {
  // Create a new PostgesSQL template database identified as <hash>
  createTemplate(
    hash: DatabaseTemplateId
  ): Effect.Effect<Option.Option<DatabaseConfiguration>>

  // Mark the template as finalized so it can be used
  finalizeTemplate(hash: DatabaseTemplateId): Effect.Effect<void>

  // Get a new isolated test database from the pool for the template hash
  getNewTestDatabase(
    hash: DatabaseTemplateId
  ): Effect.Effect<Option.Option<DatabaseConfiguration>>
}

const DatabaseConnectionSchema = Schema.Struct({
  database: Schema.Struct({
    templateHash: Schema.String,
    config: Schema.Struct({
      host: Schema.String,
      port: Schema.Number,
      username: Schema.String,
      password: Schema.String,
      database: Schema.String
    })
  })
})

/**
 * @since 0.0.1
 */

export const makeIntegreSqlClient = (config: { integrePort: number; integreHost: string }): IntegreSqlClient => {
  const baseUrl = `http://${config.integreHost}:${config.integrePort}`

  return {
    /**
     * @since 0.0.1
     */
    createTemplate: (
      templateId
    ) =>
      pipe(
        Effect.promise(() =>
          fetch(new URL("/api/v1/templates", baseUrl), {
            method: "POST",
            body: JSON.stringify({ hash: templateId }),
            headers: { "Content-Type": "application/json" }
          }).then((res) =>
            res
              .json()
              .then((data) => ({ status: res.status, data }))
          )
        ),
        Effect.flatMap(
          Schema.decodeUnknown(
            Schema.EitherFromUnion({
              left: Schema.Struct({
                status: Schema.Literal(423),
                data: Schema.Struct({ message: Schema.String })
              }),
              right: Schema.Struct({
                status: Schema.Literal(200),
                data: DatabaseConnectionSchema
              })
            }).annotations({ identifier: "create-template" })
          )
        ),
        Effect.map(
          flow(
            Either.map((a) => new DatabaseConfiguration(a.data.database.config)),
            Either.getOrUndefined,
            Option.fromNullable
          )
        ),
        Effect.orDie
      ),

    /**
     * @since 0.0.1
     */
    finalizeTemplate: (templateId: DatabaseTemplateId): Effect.Effect<void> =>
      pipe(
        Effect.promise(() =>
          fetch(new URL(`/api/v1/templates/${templateId}`, baseUrl), {
            method: "PUT",
            headers: { "Content-Type": "application/json" }
          })
        ),
        Effect.flatMap(
          Schema.decodeUnknown(
            Schema.Struct({
              status: Schema.Literal(204)
            }).annotations({ identifier: "finalize-template" })
          )
        ),
        Effect.orDie
      ),

    /**
     * @since 0.0.1
     */
    getNewTestDatabase: (
      templateId: DatabaseTemplateId
    ): Effect.Effect<Option.Option<DatabaseConfiguration>> =>
      pipe(
        Effect.promise(() =>
          fetch(new URL(`/api/v1/templates/${templateId}/tests`, baseUrl), {
            method: "GET",
            headers: { "Content-Type": "application/json" }
          }).then((res) =>
            res
              .json() 
              .then((data) => ({ status: res.status, data }))
          )
        ),
        Effect.flatMap(
          Schema.decodeUnknown(
            Schema.EitherFromUnion({
              left: Schema.Struct({ status: Schema.Literal(404) }),
              right: Schema.Struct({
                status: Schema.Literal(200),
                data: DatabaseConnectionSchema
              }).annotations({ identifier: "get-test-db" })
            })
          )
        ),
        Effect.map(
          flow(
            Either.getOrUndefined,
            Option.fromNullable,
            Option.map((a) => new DatabaseConfiguration(a.data.database.config))
          )
        ),
        Effect.orDie
      )
  }
}
