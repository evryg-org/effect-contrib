/**
 * @since 0.0.1
 */
import { Schema } from "@effect/schema"
import { Data, Effect, Either, flow, Option, pipe } from "effect"
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
 * @internal
 */
export interface IntegreSqlClient {
  createTemplate(
    hash: string
  ): Effect.Effect<Option.Option<DatabaseConfiguration>>

  finalizeTemplate(hash: string): Effect.Effect<void>

  getNewTestDatabase(
    hash: string
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
 * @internal
 */
export class IntegreSqlApiClient implements IntegreSqlClient {
  private readonly baseUrl: string

  constructor(config: { integrePort: number; integreHost: string }) {
    this.baseUrl = `http://${config.integreHost}:${config.integrePort}`
  }

  createTemplate(
    templateId: DatabaseTemplateId
  ): Effect.Effect<Option.Option<DatabaseConfiguration>> {
    return pipe(
      Effect.promise(() =>
        fetch(new URL("/api/v1/templates", this.baseUrl), {
          method: "POST",
          body: JSON.stringify({ hash: templateId }),
          headers: { "Content-Type": "application/json" }
        }).then((res) =>
          res
            .json() //
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
    )
  }

  finalizeTemplate(templateId: DatabaseTemplateId): Effect.Effect<void> {
    return pipe(
      Effect.promise(() =>
        fetch(new URL(`/api/v1/templates/${templateId}`, this.baseUrl), {
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
    )
  }

  getNewTestDatabase(
    templateId: DatabaseTemplateId
  ): Effect.Effect<Option.Option<DatabaseConfiguration>> {
    return pipe(
      Effect.promise(() =>
        fetch(new URL(`/api/v1/templates/${templateId}/tests`, this.baseUrl), {
          method: "GET",
          headers: { "Content-Type": "application/json" }
        }).then((res) =>
          res
            .json() //
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
