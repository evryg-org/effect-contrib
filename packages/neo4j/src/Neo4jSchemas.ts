/**
 * @since 0.0.1
 */
import { Schema, SchemaTransformation } from "effect"
import { isInt } from "neo4j-driver"

/**
 * Schema transform that decodes a Neo4j Integer (or plain JS number) to a JS number.
 * Use for columns typed as Long in the Cypher query analyzer.
 *
 * @since 0.0.1
 * @category schemas
 */
export const Neo4jInt: Schema.Codec<number, unknown> = Schema.Unknown.pipe(
  Schema.decodeTo(
    Schema.Number,
    SchemaTransformation.transform({
      decode: (v) => (typeof v === "number" ? v : isInt(v) ? (v as { toNumber(): number }).toNumber() : Number(v)),
      encode: (n) => n
    })
  )
)

/**
 * Recursively coerces Neo4j driver types (Integer objects) to plain JS primitives.
 * Use for columns typed as Unknown in the Cypher query analyzer.
 * @internal
 */
function coerce(v: unknown): unknown {
  if (v === null || v === undefined) return v
  if (isInt(v)) return (v as { toNumber(): number }).toNumber()
  if (Array.isArray(v)) return v.map(coerce)
  if (typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v).map(([k, val]) => [k, coerce(val)])
    )
  }
  return v
}

/**
 * @since 0.0.1
 * @category schemas
 */
export const Neo4jValue: Schema.Codec<unknown, unknown> = Schema.Unknown.pipe(
  Schema.decodeTo(
    Schema.Unknown,
    SchemaTransformation.transform({ decode: coerce, encode: (v) => v })
  )
)
