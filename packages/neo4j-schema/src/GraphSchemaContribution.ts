/**
 * What one module contributes to an assembled graph schema.
 *
 * @since 0.8.0
 */
import { Option, Predicate, Schema, SchemaAST } from "effect"
import { endpointPairsOf } from "./DeclaredGrammar.js"
import { ContributingModule } from "./GraphVocabulary.js"
import type { GraphDeclaration } from "./VertexMarker.js"

const declaresVertexOrEdge = (value: unknown): value is GraphDeclaration =>
  Schema.isSchema(value)
  && !Predicate.hasProperty(value, "~vertexMarker")
  && SchemaAST.isObjects(value.ast)
  && (Predicate.isString(value.ast.annotations?.neo4jLabel) || Predicate.isString(value.ast.annotations?.neo4jEdgeType))

const namesAnEndpointPairUnlessAVertex = Schema.makeFilter((member: Schema.Struct<Schema.Struct.Fields>) =>
  Predicate.isString(member.ast.annotations?.neo4jLabel)
  || Option.isSome(endpointPairsOf(member))
  || "an edge schema that names no endpoint pair is refused: declare at least one { from, to } pair"
)

/**
 * The vertex and edge schemas a module declares. Each member carries a
 * `neo4jLabel` or a `neo4jEdgeType` annotation, an edge names at least one
 * endpoint pair, and a vertex marker is refused: a marker references a vertex
 * another module declares.
 *
 * @since 0.8.0
 * @category models
 */
export class AnnotatedGraphSchemas extends Schema.Class<AnnotatedGraphSchemas>("AnnotatedGraphSchemas")({
  members: Schema.Array(Schema.declare(declaresVertexOrEdge).check(namesAnEndpointPairUnlessAVertex))
}) {
  /**
   * @since 0.8.0
   */
  toReadonlyArray(): AnnotatedGraphSchemas["members"] {
    return this.members
  }
}

/**
 * What one module contributes to the assembled graph schema: its name and its
 * declarations.
 *
 * @since 0.8.0
 * @category models
 */
export class GraphSchemaContribution extends Schema.Class<GraphSchemaContribution>("GraphSchemaContribution")({
  owner: ContributingModule,
  schemas: AnnotatedGraphSchemas
}) {}
