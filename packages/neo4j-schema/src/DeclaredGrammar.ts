/**
 * Reads the graph declaration a vertex or edge schema makes off its
 * annotations.
 *
 * @since 0.8.0
 */
import type { Declaration, DeclaredFields } from "@evryg/effect-op-graph"
import { EdgeDeclaration, EndpointPair, VertexDeclaration } from "@evryg/effect-op-graph"
import type { Array } from "effect"
import { Option, Predicate, Schema } from "effect"

/**
 * The vertex label a schema or marker declares through its `neo4jLabel`
 * annotation.
 *
 * @since 0.8.0
 * @category getters
 */
export const markerLabel = (marker: Schema.Top): string => String(marker.ast.annotations?.neo4jLabel)

const decodeEndpointPairs = Schema.decodeUnknownOption(Schema.NonEmptyArray(EndpointPair))

/**
 * The endpoint pairs an edge schema names in its `neo4jEdgeConnectivity`
 * annotation, or none when it names no pair.
 *
 * @since 0.8.0
 * @category getters
 */
export const endpointPairsOf = (schema: Schema.Top): Option.Option<Array.NonEmptyReadonlyArray<EndpointPair>> =>
  decodeEndpointPairs(schema.ast.annotations?.neo4jEdgeConnectivity)

/**
 * The declaration a vertex or edge schema makes, or none for a schema that
 * declares neither, or an edge that names no endpoint pair.
 *
 * @since 0.8.0
 * @category getters
 */
export const declarationOf = (
  schema: Schema.Top & Pick<Schema.Struct<DeclaredFields>, "fields">
): Option.Option<Declaration> => {
  const annotations = schema.ast.annotations ?? {}
  if (Predicate.isString(annotations.neo4jLabel)) {
    return Option.some(new VertexDeclaration({ label: annotations.neo4jLabel, fields: schema.fields }))
  }
  if (Predicate.isString(annotations.neo4jEdgeType)) {
    const label = annotations.neo4jEdgeType
    return Option.map(
      endpointPairsOf(schema),
      (connectivity) => new EdgeDeclaration({ label, fields: schema.fields, connectivity })
    )
  }
  return Option.none()
}
