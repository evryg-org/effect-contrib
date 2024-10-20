import type { Knex } from "knex"
import knex from "knex"
import { Context, Effect, pipe, Layer } from "effect"

export class DatabaseClient extends Context.Tag("DatabaseClient")<
  DatabaseClient,
  {
    connection: Knex
    isConnected: Effect.Effect<boolean>
    migrateUp: Effect.Effect<void>
    migrateDown: Effect.Effect<void>
    close: Effect.Effect<void>
  }
>() {}

export const makeLivePostgresDatabaseClient = (config: {
  connection: {
    host: string
    port: number
    user: string
    password: string
    database: string
  }
  migrations: {
    directory: string
  }
}) =>
  pipe(
    Effect.sync(() => {
      return knex({
        client: "pg",
        connection: config.connection
      })
    }),
    Effect.map(
      (knex): Context.Tag.Service<DatabaseClient> => ({
        connection: knex,
        isConnected: pipe(
          Effect.promise(() => knex.raw("select 1+1")),
          Effect.as(true),
          Effect.catchAllCause(() => Effect.succeed(false))
        ),
        migrateUp: Effect.promise(() =>
          knex.migrate.up({ directory: config.migrations.directory })
        ),
        migrateDown: Effect.promise(() =>
          knex.migrate.down({ directory: config.migrations.directory })
        ),
        close: Effect.async((cb) => knex.destroy(() => cb(Effect.void)))
      })
    ),
    Effect.tap((client) =>
      pipe(
        client.isConnected,
        Effect.if({
          onTrue: () => Effect.void,
          onFalse: () => Effect.die("Database not connected")
        })
      )
    ),
    Effect.acquireRelease((client) => client.close),
    Layer.effect(DatabaseClient)
  )
