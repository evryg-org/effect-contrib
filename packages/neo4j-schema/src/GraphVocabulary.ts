/**
 * The branded names a graph schema assembly speaks in: labels, edge types,
 * properties, fulltext indexes, contributing modules, and the rank that orders
 * declarations canonically.
 *
 * @since 0.8.0
 */
import { Array, Order, Schema, SchemaAST } from "effect"

/**
 * The name of a module that contributes graph declarations: the one writer of
 * what it declares.
 *
 * @since 0.8.0
 * @category models
 */
export const ContributingModule = Schema.String.pipe(Schema.brand("ContributingModule"))

/**
 * @since 0.8.0
 * @category models
 */
export type ContributingModule = typeof ContributingModule.Type

/**
 * The Neo4j label a vertex schema declares through its `neo4jLabel` annotation.
 *
 * @since 0.8.0
 * @category models
 */
export const VertexLabel = Schema.String.pipe(Schema.brand("VertexLabel"))

/**
 * @since 0.8.0
 * @category models
 */
export type VertexLabel = typeof VertexLabel.Type

/**
 * The relationship type an edge schema declares through its `neo4jEdgeType`
 * annotation.
 *
 * @since 0.8.0
 * @category models
 */
export const EdgeType = Schema.String.pipe(Schema.brand("EdgeType"))

/**
 * @since 0.8.0
 * @category models
 */
export type EdgeType = typeof EdgeType.Type

/**
 * The name of a property a vertex or edge schema declares.
 *
 * @since 0.8.0
 * @category models
 */
export const PropertyName = Schema.String.pipe(Schema.brand("PropertyName"))

/**
 * @since 0.8.0
 * @category models
 */
export type PropertyName = typeof PropertyName.Type

/**
 * The store-global name of a fulltext index.
 *
 * @since 0.8.0
 * @category models
 */
export const FullTextIndexName = Schema.String.pipe(Schema.brand("FullTextIndexName"))

/**
 * @since 0.8.0
 * @category models
 */
export type FullTextIndexName = typeof FullTextIndexName.Type

/**
 * The position of a declaration among the schemas its module contributes.
 *
 * @since 0.8.0
 * @category models
 */
export const MemberOrdinal = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand("MemberOrdinal")
)

/**
 * @since 0.8.0
 * @category models
 */
export type MemberOrdinal = typeof MemberOrdinal.Type

/**
 * Any schema AST, held as a field value.
 *
 * @since 0.8.0
 * @category models
 */
export const DeclaredAst = Schema.declare(SchemaAST.isAST)

/**
 * Where a declaration stands in the canonical order: its owner, then its
 * position in that owner's contribution.
 *
 * @since 0.8.0
 * @category models
 */
export class DeclarationRank extends Schema.Class<DeclarationRank>("DeclarationRank")({
  owner: ContributingModule,
  ordinal: MemberOrdinal
}) {
  /**
   * Owner by string order, then member ordinal.
   *
   * @since 0.8.0
   */
  static readonly order: Order.Order<DeclarationRank> = Order.combine(
    Order.mapInput(Order.String, (rank: DeclarationRank) => rank.owner),
    Order.mapInput(Order.Number, (rank: DeclarationRank) => rank.ordinal)
  )
}

/**
 * A set of contributing modules, held sorted and without repeats, as a
 * conflict names its owners.
 *
 * @since 0.8.0
 * @category models
 */
export class ContributingModules extends Schema.Class<ContributingModules>("ContributingModules")({
  members: Schema.Array(ContributingModule)
}) {
  /**
   * The owners given, deduplicated and sorted, so equal sets compare equal
   * whatever their order.
   *
   * @since 0.8.0
   */
  static of(owners: Iterable<ContributingModule>): ContributingModules {
    return new ContributingModules({ members: Array.sort(Array.dedupe(Array.fromIterable(owners)), Order.String) })
  }

  /**
   * Whether more than one module is named.
   *
   * @since 0.8.0
   */
  isShared(): boolean {
    return this.members.length > 1
  }
}

/**
 * An ordered list of property names, as a key or a fulltext index lists them.
 *
 * @since 0.8.0
 * @category models
 */
export class PropertyNames extends Schema.Class<PropertyNames>("PropertyNames")({
  members: Schema.Array(PropertyName)
}) {
  /**
   * @since 0.8.0
   */
  toReadonlyArray(): ReadonlyArray<PropertyName> {
    return this.members
  }
}
