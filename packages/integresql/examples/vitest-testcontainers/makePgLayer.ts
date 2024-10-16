import { PgClient } from "@effect/sql-pg"
import { Redacted } from "effect"
import type { DatabaseConfiguration } from "@evryg/integresql"

export const makePgLayer = (databaseConfiguration: DatabaseConfiguration) =>
  PgClient.layer({
    host: "127.0.0.1",
    port: databaseConfiguration.port,
    username: databaseConfiguration.username,
    password: Redacted.make(databaseConfiguration.password),
    database: databaseConfiguration.database
  })
