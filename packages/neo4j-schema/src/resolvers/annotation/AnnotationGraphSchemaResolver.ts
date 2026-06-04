/**
 * @since 0.0.1
 */
import { Effect, Layer } from "effect"
import type { Schema } from "effect"
import { EdgeConnectivity, EdgeProperty, GraphSchema, VertexProperty } from "../../GraphSchemaModel.js"
import { GraphSchemaResolver } from "../../GraphSchemaResolver.js"

// ── AST type mapping ──

function astTypeToNeo4j(ast: any): string | undefined {
  switch (ast._tag) {
    case "String":
      return "STRING NOT NULL"
    case "Number":
      return "FLOAT NOT NULL"
    case "Boolean":
      return "BOOLEAN NOT NULL"
    case "Arrays": {
      // Schema.Array(T) becomes an Arrays node with a rest element (an AST)
      const rest = ast.rest?.[0]
      if (rest) {
        const inner = astTypeToNeo4j(rest)
        if (inner) return `LIST<${inner}> NOT NULL`
      }
      return "LIST<STRING NOT NULL> NOT NULL"
    }
    default:
      return undefined
  }
}

/** Unwrap optional Union (T | undefined) to get the inner type AST */

function unwrapOptional(ast: any): any {
  if (ast._tag === "Union" && Array.isArray(ast.types)) {
    const nonUndef = ast.types.filter((t: any) => t._tag !== "Undefined")
    if (nonUndef.length === 1) return nonUndef[0]
  }
  return ast
}

// ── Schema compilation ──

/**
 * Compile Effect Schema structs with neo4j annotations into a GraphSchema for query validation
 * @since 0.0.1
 * @category constructors
 */
export function compileToGraphSchema(schemas: Array<Schema.Top>): GraphSchema {
  const vertexProperties: Array<VertexProperty> = []
  const edgeProperties: Array<EdgeProperty> = []
  const edgeConnectivity: Array<EdgeConnectivity> = []

  for (const schema of schemas) {
    const ast = schema.ast
    if (ast._tag !== "Objects") continue

    const annotations = ast.annotations ?? {}
    const label = annotations.neo4jLabel as string | undefined
    const edgeType = annotations.neo4jEdgeType as string | undefined

    if (!label && !edgeType) continue

    // Extract edge connectivity annotations
    if (edgeType) {
      const connectivity = annotations.neo4jEdgeConnectivity as ReadonlyArray<{ from: string; to: string }> | undefined
      if (connectivity) {
        for (const { from, to } of connectivity) {
          edgeConnectivity.push(new EdgeConnectivity({ edgeType, fromLabel: from, toLabel: to }))
        }
      }
    }

    for (const ps of ast.propertySignatures) {
      const name = String(ps.name)
      const isOptional = ps.type.context?.isOptional === true
      const typeAst = isOptional ? unwrapOptional(ps.type) : ps.type
      const neo4jType = astTypeToNeo4j(typeAst)
      if (!neo4jType) continue

      if (label) {
        vertexProperties.push(
          new VertexProperty({
            labels: [label],
            propertyName: name,
            propertyTypes: [neo4jType],
            mandatory: !isOptional
          })
        )
      } else if (edgeType) {
        edgeProperties.push(
          new EdgeProperty({
            edgeType,
            propertyName: name,
            propertyTypes: [neo4jType],
            mandatory: !isOptional
          })
        )
      }
    }
  }

  return new GraphSchema({ vertexProperties, edgeProperties, edgeConnectivity })
}

// ── Layer ──

/**
 * @since 0.0.1
 * @category resolvers
 */
export const AnnotationGraphSchemaResolver = (
  schemas: Array<Schema.Top>
): Layer.Layer<GraphSchemaResolver> =>
  Layer.succeed(GraphSchemaResolver, {
    resolve: Effect.sync(() => compileToGraphSchema(schemas))
  })
