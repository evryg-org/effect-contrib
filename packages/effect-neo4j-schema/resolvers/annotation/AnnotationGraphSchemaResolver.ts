import { Effect, Layer } from "effect"
import type { Schema } from "effect"
import { VertexProperty, EdgeProperty, EdgeConnectivity, GraphSchema } from "../../GraphSchemaModel"
import { GraphSchemaResolver } from "../../GraphSchemaResolver"

// ── AST type mapping ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function astTypeToNeo4j(ast: any): string | undefined {
  switch (ast._tag) {
    case "StringKeyword": return "STRING NOT NULL"
    case "NumberKeyword": return "FLOAT NOT NULL"
    case "BooleanKeyword": return "BOOLEAN NOT NULL"
    case "TupleType": {
      // Schema.Array(T) becomes TupleType with rest element
      const rest = ast.rest?.[0]
      if (rest) {
        const inner = astTypeToNeo4j(rest.type)
        if (inner) return `LIST<${inner}> NOT NULL`
      }
      return "LIST<STRING NOT NULL> NOT NULL"
    }
    default: return undefined
  }
}

/** Unwrap optional Union (T | undefined) to get the inner type AST */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapOptional(ast: any): any {
  if (ast._tag === "Union" && Array.isArray(ast.types)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nonUndef = ast.types.filter((t: any) => t._tag !== "UndefinedKeyword")
    if (nonUndef.length === 1) return nonUndef[0]
  }
  return ast
}

// ── Schema compilation ──

/** Compile Effect Schema structs with neo4j annotations into a GraphSchema for query validation */
export function compileToGraphSchema(schemas: Schema.Schema.Any[]): GraphSchema {
  const vertexProperties: VertexProperty[] = []
  const edgeProperties: EdgeProperty[] = []
  const edgeConnectivity: EdgeConnectivity[] = []

  for (const schema of schemas) {
    const ast = schema.ast
    if (ast._tag !== "TypeLiteral") continue

    const annotations = ast.annotations ?? {}
    const label = annotations.neo4jLabel as string | undefined
    const edgeType = annotations.neo4jEdgeType as string | undefined

    if (!label && !edgeType) continue

    // Extract edge connectivity annotations
    if (edgeType) {
      const connectivity = annotations.neo4jEdgeConnectivity as
        ReadonlyArray<{ from: string; to: string }> | undefined
      if (connectivity) {
        for (const { from, to } of connectivity) {
          edgeConnectivity.push(new EdgeConnectivity({ edgeType, fromLabel: from, toLabel: to }))
        }
      }
    }

    for (const ps of ast.propertySignatures) {
      const name = String(ps.name)
      const isOptional = ps.isOptional === true
      const typeAst = isOptional ? unwrapOptional(ps.type) : ps.type
      const neo4jType = astTypeToNeo4j(typeAst)
      if (!neo4jType) continue

      if (label) {
        vertexProperties.push(new VertexProperty({
          labels: [label],
          propertyName: name,
          propertyTypes: [neo4jType],
          mandatory: !isOptional,
        }))
      } else if (edgeType) {
        edgeProperties.push(new EdgeProperty({
          edgeType,
          propertyName: name,
          propertyTypes: [neo4jType],
          mandatory: !isOptional,
        }))
      }
    }
  }

  return new GraphSchema({ vertexProperties, edgeProperties, edgeConnectivity })
}

// ── Layer ──

export const AnnotationGraphSchemaResolver = (
  schemas: Schema.Schema.Any[],
): Layer.Layer<GraphSchemaResolver> =>
  Layer.succeed(GraphSchemaResolver, {
    resolve: Effect.sync(() => compileToGraphSchema(schemas)),
  })
