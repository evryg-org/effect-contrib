import { Effect, Schema } from "effect"
import { Neo4jClient, type Neo4jQueryError } from "@/lib/effect-neo4j"
import { NodeProperty, RelProperty, GraphSchema } from "./GraphSchemaModel"

// Re-export models and file ops so existing imports work
export { NodeProperty, RelProperty, GraphSchema, loadSchema, saveSchema } from "./GraphSchemaModel"

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

      const nodeProperties = nodeRecs
        .filter((rec) => rec.get("propertyName") !== null)
        .map((rec) =>
          decodeNodeProperty({
            labels: rec.get("nodeLabels"),
            propertyName: rec.get("propertyName"),
            propertyTypes: rec.get("propertyTypes"),
            mandatory: rec.get("mandatory"),
          }),
        )

      const relProperties = relRecs
        .filter((rec) => rec.get("propertyName") !== null)
        .map((rec) =>
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
