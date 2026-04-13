/**
 * @since 0.0.1
 */
import { Data, Effect, Option } from "effect"
import type { Branded } from "effect/Brand"

/**
 * @since 0.0.1
 */
export class NoSuchTemplate extends Data.TaggedClass("NoSuchTemplate")<{
  id: DatabaseTemplateId
}> {
}

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
  // Create a new PostgreSQL template database identified as <hash>
  createTemplate(
    hash: DatabaseTemplateId
  ): Effect.Effect<Option.Option<DatabaseConfiguration>>

  // Mark the template as finalized so it can be used
  finalizeTemplate(hash: DatabaseTemplateId): Effect.Effect<void, NoSuchTemplate>

  // Get a new isolated test database from the pool for the template hash
  // Trying to get a new test database for a non finalized template will wait until template is finalized
  getNewTestDatabase(
    hash: DatabaseTemplateId
  ): Effect.Effect<Option.Option<DatabaseConfiguration>>
}
