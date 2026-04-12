/**
 * @since 0.0.1
 */
import type { Schema } from "effect"

// ── Field-level annotations ──

/**
 * Mark a property as UNIQUE constraint in Neo4j
 * @since 0.0.1
 * @category annotations
 */
export const neo4jUnique = { neo4jUnique: true as const }

/**
 * Mark a property for index creation in Neo4j
 * @since 0.0.1
 * @category annotations
 */
export const neo4jIndexed = { neo4jIndex: true as const }

// ── Struct-level annotations ──

/**
 * Annotate an Effect Schema struct as a Neo4j vertex (node)
 * @since 0.0.1
 * @category annotations
 */
export const neo4jVertex = (
  label: string,
  opts?: {
    compositeKey?: Array<string>
    compositeIndexes?: Array<Array<string>>
    fullTextIndex?: { name: string; fields: Array<string> }
  }
) => ({ neo4jLabel: label, ...opts })

/** Extract the neo4jLabel from a vertex schema's annotations */
function extractNeo4jLabel(vertexSchema: Schema.Schema.Any): string {
  const label = (vertexSchema.ast.annotations as Record<string, unknown>)?.neo4jLabel
  if (typeof label !== "string") {
    throw new Error("Connectivity endpoint must be annotated with neo4jVertex")
  }
  return label
}

/**
 * Annotate an Effect Schema struct as a Neo4j edge (relationship)
 * @since 0.0.1
 * @category annotations
 */
export const neo4jEdge = (
  edgeType: string,
  connectivity?: ReadonlyArray<{ from: Schema.Schema.Any; to: Schema.Schema.Any }>
) => ({
  neo4jEdgeType: edgeType,
  ...(connectivity && {
    neo4jEdgeConnectivity: connectivity.map(({ from, to }) => ({
      from: extractNeo4jLabel(from),
      to: extractNeo4jLabel(to)
    }))
  })
})
