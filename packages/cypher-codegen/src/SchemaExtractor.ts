import { Effect, Schema } from "effect"
import { Neo4jClient, type Neo4jQueryError } from "@/lib/effect-neo4j"
import { readFileSync, writeFileSync } from "node:fs"

// ── Domain models ──

export class NodeProperty extends Schema.Class<NodeProperty>("NodeProperty")({
  labels: Schema.Array(Schema.String),
  propertyName: Schema.String,
  propertyTypes: Schema.Array(Schema.String),
  mandatory: Schema.Boolean,
}) {}

export class RelProperty extends Schema.Class<RelProperty>("RelProperty")({
  relType: Schema.String,
  propertyName: Schema.String,
  propertyTypes: Schema.Array(Schema.String),
  mandatory: Schema.Boolean,
}) {}

export class GraphSchema extends Schema.Class<GraphSchema>("GraphSchema")({
  nodeProperties: Schema.Array(NodeProperty),
  relProperties: Schema.Array(RelProperty),
}) {}

// ── Extraction from Neo4j ──

const decodeNodeProperty = Schema.decodeUnknownSync(NodeProperty)
const decodeRelProperty = Schema.decodeUnknownSync(RelProperty)

export const extractSchema = (): Effect.Effect<GraphSchema, Neo4jQueryError, Neo4jClient> =>
  Effect.flatMap(Neo4jClient, (neo4j) =>
    Effect.gen(function* () {
      const nodeRecs = yield* neo4j.query(
        "CALL db.schema.nodeTypeProperties() YIELD nodeLabels, propertyName, propertyTypes, mandatory",
      )
      const relRecs = yield* neo4j.query(
        "CALL db.schema.relTypeProperties() YIELD relType, propertyName, propertyTypes, mandatory",
      )

      const nodeProperties = nodeRecs.map((rec) =>
        decodeNodeProperty({
          labels: rec.get("nodeLabels"),
          propertyName: rec.get("propertyName"),
          propertyTypes: rec.get("propertyTypes"),
          mandatory: rec.get("mandatory"),
        }),
      )

      const relProperties = relRecs.map((rec) =>
        decodeRelProperty({
          relType: rec.get("relType"),
          propertyName: rec.get("propertyName"),
          propertyTypes: rec.get("propertyTypes"),
          mandatory: rec.get("mandatory"),
        }),
      )

      return new GraphSchema({ nodeProperties, relProperties })
    }),
  )

// ── File-based cache ──

const encodeSchema = Schema.encodeSync(GraphSchema)
const decodeSchema = Schema.decodeSync(GraphSchema)

export const saveSchema = (path: string, schema: GraphSchema): void => {
  writeFileSync(path, JSON.stringify(encodeSchema(schema), null, 2), "utf-8")
}

export const loadSchema = (path: string): GraphSchema => {
  const content = readFileSync(path, "utf-8")
  return decodeSchema(JSON.parse(content))
}
