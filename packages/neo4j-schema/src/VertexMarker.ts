/**
 * A reference to a vertex another module declares.
 *
 * @since 0.8.0
 */
import { Schema } from "effect"
import { neo4jVertex } from "./Neo4jSchemaAnnotations.js"

interface MarkerTag {
  readonly "~vertexMarker": true
}

interface NotAMarker {
  readonly "~vertexMarker"?: undefined
}

/**
 * A reference to a vertex declared elsewhere: its label and key fields, never
 * a declaration.
 *
 * @since 0.8.0
 * @category models
 */
export type VertexMarker<KeyFields extends Schema.Struct.Fields> = Schema.Struct<KeyFields> & MarkerTag

/**
 * A vertex or edge schema that is not a vertex marker.
 *
 * @since 0.8.0
 * @category models
 */
export type GraphDeclaration = Schema.Struct<Schema.Struct.Fields> & NotAMarker

/**
 * Marks the vertex `label` keyed by `key`, so another module's edges may end
 * at it without redeclaring it.
 *
 * @since 0.8.0
 * @category constructors
 */
export const neo4jVertexMarker = <const KeyFields extends Schema.Struct.Fields>(
  label: string,
  key: KeyFields
): VertexMarker<KeyFields> =>
  Object.assign(Schema.Struct(key).annotate(neo4jVertex(label)), { "~vertexMarker": true as const })
