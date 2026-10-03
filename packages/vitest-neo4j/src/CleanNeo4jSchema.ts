/** @since 0.5.0 */
import { Neo4jClient } from "@evryg/effect-neo4j"
import { Effect } from "effect"

const quoted = (name: string) => `\`${name.replaceAll("`", "``")}\``

const dropAll = Effect.gen(function*() {
  const neo4j = yield* Neo4jClient
  const constraints = yield* neo4j.query("SHOW CONSTRAINTS YIELD name RETURN name")
  yield* Effect.forEach(
    constraints,
    (record) => neo4j.query(`DROP CONSTRAINT ${quoted(String(record.get("name")))} IF EXISTS`),
    { discard: true }
  )
  const indexes = yield* neo4j.query("SHOW INDEXES YIELD name, type WHERE type <> 'LOOKUP' RETURN name")
  yield* Effect.forEach(
    indexes,
    (record) => neo4j.query(`DROP INDEX ${quoted(String(record.get("name")))} IF EXISTS`),
    { discard: true }
  )
})

/**
 * Scoped resource: drops every constraint and every non-LOOKUP index on
 * acquire and again on release, leaving the database with no schema objects.
 * Use with `it.effect`.
 *
 * @since 0.5.0
 * @category utils
 */
export const CleanNeo4jSchema = Effect.acquireRelease(dropAll, () => Effect.orDie(dropAll))
