import { Effect, Schema, Layer } from "effect"
import { Neo4jClient, type Neo4jQueryError } from "@evryg/effect-neo4j"
import { VertexProperty, EdgeProperty, EdgeConnectivity, GraphSchema } from "../../GraphSchemaModel.js"
import { GraphSchemaResolver } from "../../GraphSchemaResolver.js"

// Re-export models so existing imports work
export { VertexProperty, EdgeProperty, GraphSchema } from "../../GraphSchemaModel.js"

// ── Extraction from Neo4j ──

const decodeVertexProperty = Schema.decodeUnknownSync(VertexProperty)
const decodeEdgeProperty = Schema.decodeUnknownSync(EdgeProperty)

export const extractSchema = (): Effect.Effect<GraphSchema, Neo4jQueryError, Neo4jClient> =>
  Effect.flatMap(Neo4jClient, (neo4j) =>
    Effect.gen(function* () {
      const vertexRecs = yield* neo4j.query(
        "CALL db.schema.nodeTypeProperties() YIELD nodeLabels, propertyName, propertyTypes, mandatory",
      )
      const edgeRecs = yield* neo4j.query(
        "CALL db.schema.relTypeProperties() YIELD relType, propertyName, propertyTypes, mandatory",
      )

      const vertexProperties = vertexRecs
        .filter((rec) => rec.get("propertyName") !== null)
        .map((rec) =>
          decodeVertexProperty({
            labels: rec.get("nodeLabels"),
            propertyName: rec.get("propertyName"),
            propertyTypes: rec.get("propertyTypes"),
            mandatory: rec.get("mandatory"),
          }),
        )

      const edgeProperties = edgeRecs
        .filter((rec) => rec.get("propertyName") !== null)
        .map((rec) =>
          decodeEdgeProperty({
            edgeType: rec.get("relType"),
            propertyName: rec.get("propertyName"),
            propertyTypes: rec.get("propertyTypes"),
            mandatory: rec.get("mandatory"),
          }),
        )

      // Extract edge connectivity from graph topology
      const connectivityRecs = yield* neo4j.query(
        `MATCH (a)-[r]->(b)
         WITH type(r) AS edgeType, labels(a)[0] AS fromLabel, labels(b)[0] AS toLabel
         RETURN DISTINCT edgeType, fromLabel, toLabel`,
      )
      const edgeConnectivity = connectivityRecs.map((rec) =>
        new EdgeConnectivity({
          edgeType: rec.get("edgeType"),
          fromLabel: rec.get("fromLabel"),
          toLabel: rec.get("toLabel"),
        }),
      )

      return new GraphSchema({ vertexProperties, edgeProperties, edgeConnectivity })
    }),
  )

// ── Layer ──

export const LiveDbGraphSchemaResolver: Layer.Layer<GraphSchemaResolver, never, Neo4jClient> =
  Layer.effect(
    GraphSchemaResolver,
    Effect.map(Neo4jClient, () => ({
      resolve: extractSchema() as Effect.Effect<GraphSchema>,
    })),
  )
