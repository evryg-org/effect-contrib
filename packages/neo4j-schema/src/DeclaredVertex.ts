/**
 * A vertex declaration at its rank among all contributions.
 *
 * @since 0.8.0
 */
import type { DeclaredFields } from "@evryg/effect-op-graph"
import { Order, Record, Schema, SchemaAST } from "effect"
import { DeclarationRank, VertexLabel } from "./GraphVocabulary.js"

const ObjectsAst = Schema.declare((u: unknown): u is SchemaAST.Objects => SchemaAST.isAST(u) && SchemaAST.isObjects(u))

/**
 * A vertex label, the rank it is declared at, and its object declaration.
 *
 * @since 0.8.0
 * @category models
 */
export class DeclaredVertex extends Schema.Class<DeclaredVertex>("DeclaredVertex")({
  label: VertexLabel,
  rank: DeclarationRank,
  declaration: ObjectsAst
}) {
  /**
   * Declaration rank, then label.
   *
   * @since 0.8.0
   */
  static readonly order: Order.Order<DeclaredVertex> = Order.combine(
    Order.mapInput(DeclarationRank.order, (vertex: DeclaredVertex) => vertex.rank),
    Order.mapInput(Order.String, (vertex: DeclaredVertex) => vertex.label)
  )

  /**
   * The schema of each declared property, by name.
   *
   * @since 0.8.0
   */
  declaredFields(): DeclaredFields {
    return Record.fromEntries(
      this.declaration.propertySignatures.map((signature) => [String(signature.name), Schema.make(signature.type)])
    )
  }
}
