/**
 * A reference to a vertex another module declares.
 *
 * @since 0.8.0
 */
import { Schema } from "effect"
import { neo4jVertex } from "./Neo4jSchemaAnnotations.js"
import type { KeyGroup } from "./Neo4jSchemaVertex.js"

interface MarkerTag {
  readonly "~vertexMarker": true
}

interface NotAMarker {
  readonly "~vertexMarker"?: undefined
}

/**
 * A reference to a vertex declared elsewhere: its label and key group, never
 * a declaration.
 *
 * @since 0.8.0
 * @category models
 */
export type VertexMarker<KeyFields extends Schema.Struct.Fields> =
  & Schema.Struct<KeyFields>
  & MarkerTag
  & { readonly key: KeyGroup<KeyFields> }

/**
 * A vertex or edge schema that is not a vertex marker.
 *
 * @since 0.8.0
 * @category models
 */
export type GraphDeclaration = Schema.Struct<Schema.Struct.Fields> & NotAMarker

/**
 * Marks the vertex `label` keyed by the key group `key`, so another module's
 * edges may end at it and a vertex declaring it is keyed by the same group,
 * without redeclaring it. `neo4jKeyGroup` checks the group's members are
 * required and non-nullable, and its brand carries that check.
 *
 * @since 0.8.0
 * @category constructors
 */
export const neo4jVertexMarker = <KeyFields extends Schema.Struct.Fields>(
  label: string,
  key: KeyGroup<KeyFields>
): VertexMarker<KeyFields> =>
  Object.assign(Schema.Struct(key.fields).annotate(neo4jVertex(label)), { "~vertexMarker": true as const, key })
