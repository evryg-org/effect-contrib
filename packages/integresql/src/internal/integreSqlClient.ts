/**
 * @since 0.0.1
 */
import { Brand, Data, Effect, Option, pipe, Schema } from "effect"
import {
  DatabaseConfiguration,
  type DatabaseTemplateId,
  type IntegreSqlClient,
  NoSuchTemplate
} from "../IntegreSqlClient.js"

/**
 * @since 0.0.1
 */
export class IntegreSqlFailedToCreateTemplate extends Data.TaggedClass("IntegreSqlFailedToCreateTemplate")<{
  error: unknown
}> {
}

/**
 * @since 0.0.1
 */
export const unsafeMakeDatabaseTemplateId = Brand.nominal<DatabaseTemplateId>()

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
export const makeIntegreSqlClient = (config: { url: string }): IntegreSqlClient => {
  const baseUrl = config.url

  return {
    createTemplate: (
      templateId
    ) =>
      pipe(
        Effect.tryPromise(() =>
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
        Effect.catch((error) => Effect.die(new IntegreSqlFailedToCreateTemplate({ error: error.cause }))),
        Effect.flatMap(
          Schema.decodeUnknownEffect(
            Schema.Union([
              Schema.Struct({
                status: Schema.Literal(423),
                data: Schema.Struct({ message: Schema.String })
              }),
              Schema.Struct({
                status: Schema.Literal(200),
                data: DatabaseConnectionSchema
              })
            ]).annotate({ identifier: "create-template" })
          )
        ),
        Effect.map((response) =>
          response.status === 200
            ? Option.some(new DatabaseConfiguration(response.data.database.config))
            : Option.none()
        ),
        Effect.orDie
      ),

    finalizeTemplate: (templateId: DatabaseTemplateId): Effect.Effect<void, NoSuchTemplate> =>
      pipe(
        Effect.promise(() =>
          fetch(new URL(`/api/v1/templates/${templateId}`, baseUrl), {
            method: "PUT",
            headers: { "Content-Type": "application/json" }
          }).then((res) => ({ status: res.status }))
        ),
        Effect.flatMap(
          Schema.decodeUnknownEffect(
            Schema.Union([
              Schema.Struct({ status: Schema.Literal(404) }),
              Schema.Struct({ status: Schema.Literal(204) })
            ]).annotate({ identifier: "finalize-template" })
          )
        ),
        Effect.flatMap((response) =>
          response.status === 404
            ? Effect.fail(new NoSuchTemplate({ id: templateId }))
            : Effect.void
        ),
        Effect.catchTag("SchemaError", (e) => Effect.die(e))
      ),

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
          Schema.decodeUnknownEffect(
            Schema.Union([
              Schema.Struct({ status: Schema.Literal(404) }),
              Schema.Struct({
                status: Schema.Literal(200),
                data: DatabaseConnectionSchema
              })
            ]).annotate({ identifier: "get-test-db" })
          )
        ),
        Effect.map((response) =>
          response.status === 200
            ? Option.some(new DatabaseConfiguration(response.data.database.config))
            : Option.none()
        ),
        Effect.orDie
      )
  }
}
