/**
 * The Cypher DDL of declared vertices, as a model keyed by label that renders
 * canonically.
 *
 * @since 0.8.0
 */
import { Array, HashMap, HashSet, Option, Order, Record, Schema, type SchemaAST } from "effect"
import type { DeclaredVertex } from "./DeclaredVertex.js"
import { FullTextIndex } from "./GraphSchemaModel.js"
import { DeclarationRank, FullTextIndexName, PropertyName, PropertyNames, VertexLabel } from "./GraphVocabulary.js"

const CypherStatement = Schema.String.pipe(Schema.brand("CypherStatement"))
type CypherStatement = typeof CypherStatement.Type

class CypherStatements extends Schema.Class<CypherStatements>("CypherStatements")({
  members: Schema.Array(CypherStatement)
}) {}

class FullTextDeclaration extends Schema.Class<FullTextDeclaration>("FullTextDeclaration")({
  index: FullTextIndexName,
  fields: PropertyNames
}) {}

const FullTextAnnotations = Schema.Struct({
  fullTextIndexes: Schema.optional(
    Schema.Array(Schema.Struct({ name: FullTextIndexName, fields: Schema.Array(PropertyName) }))
  )
})

/**
 * The distinct fulltext indexes a vertex declares, in declaration order.
 *
 * @since 0.8.0
 * @category models
 */
export class FullTextDeclarations extends Schema.Class<FullTextDeclarations>("FullTextDeclarations")({
  members: Schema.Array(FullTextDeclaration)
}) {
  /**
   * @since 0.8.0
   */
  toReadonlyArray(): ReadonlyArray<FullTextDeclaration> {
    return this.members
  }

  /**
   * The fulltext indexes the `fullTextIndexes` annotation of `declaration`
   * names, each once.
   *
   * @since 0.8.0
   */
  static of(declaration: SchemaAST.Objects): FullTextDeclarations {
    const { fullTextIndexes } = Option.getOrElse(
      Schema.decodeUnknownOption(FullTextAnnotations)(declaration.annotations ?? {}),
      () => ({ fullTextIndexes: undefined })
    )
    return new FullTextDeclarations({
      members: Array.dedupe(
        (fullTextIndexes ?? []).map(({ fields, name }) =>
          new FullTextDeclaration({ index: name, fields: new PropertyNames({ members: fields }) })
        )
      )
    })
  }
}

const KeyAnnotations = Schema.Struct({
  compositeKey: Schema.optional(Schema.Array(PropertyName)),
  compositeIndexes: Schema.optional(Schema.Array(Schema.Array(PropertyName)))
})

const PropertyAnnotations = Schema.Array(Schema.Struct({
  neo4jUnique: Schema.optional(Schema.Boolean),
  neo4jIndex: Schema.optional(Schema.Boolean)
}))

const statement = (text: string): CypherStatement => CypherStatement.make(text)

const propertyList = (properties: ReadonlyArray<PropertyName>): string =>
  properties.map((property) => `n.${property}`).join(", ")

const propertyStatements = (label: VertexLabel, declaration: SchemaAST.Objects): ReadonlyArray<CypherStatement> => {
  const annotations = Option.getOrElse(
    Schema.decodeUnknownOption(PropertyAnnotations)(
      declaration.propertySignatures.map((signature) => signature.type.annotations ?? {})
    ),
    () => []
  )
  return Array.zip(declaration.propertySignatures, annotations).flatMap(([signature, marks]) => [
    ...((marks.neo4jUnique ?? false)
      ? [statement(`CREATE CONSTRAINT IF NOT EXISTS FOR (n:${label}) REQUIRE n.${String(signature.name)} IS UNIQUE;`)]
      : []),
    ...((marks.neo4jIndex ?? false)
      ? [statement(`CREATE INDEX IF NOT EXISTS FOR (n:${label}) ON (n.${String(signature.name)});`)]
      : [])
  ])
}

/**
 * The DDL one declared vertex contributes: its constraint and index
 * statements, and the fulltext indexes it declares.
 *
 * @since 0.8.0
 * @category models
 */
export class VertexDdl extends Schema.Class<VertexDdl>("VertexDdl")({
  label: VertexLabel,
  rank: DeclarationRank,
  statements: CypherStatements,
  fullText: FullTextDeclarations
}) {
  /**
   * Declaration rank, then label.
   *
   * @since 0.8.0
   */
  static readonly order: Order.Order<VertexDdl> = Order.combine(
    Order.mapInput(DeclarationRank.order, (vertex: VertexDdl) => vertex.rank),
    Order.mapInput(Order.String, (vertex: VertexDdl) => vertex.label)
  )

  /**
   * The DDL of `vertex`: per-property unique constraints and indexes in
   * property order, then its composite key, then its composite indexes.
   *
   * @since 0.8.0
   */
  static of(vertex: DeclaredVertex): VertexDdl {
    const { compositeIndexes, compositeKey } = Option.getOrElse(
      Schema.decodeUnknownOption(KeyAnnotations)(vertex.declaration.annotations ?? {}),
      () => ({ compositeKey: undefined, compositeIndexes: undefined })
    )
    const keyStatements = Option.match(Option.fromUndefinedOr(compositeKey), {
      onNone: () => [],
      onSome: (
        key
      ) => [
        statement(`CREATE CONSTRAINT IF NOT EXISTS FOR (n:${vertex.label}) REQUIRE (${propertyList(key)}) IS UNIQUE;`)
      ]
    })
    const indexStatements = (compositeIndexes ?? []).map((index) =>
      statement(`CREATE INDEX IF NOT EXISTS FOR (n:${vertex.label}) ON (${propertyList(index)});`)
    )
    return new VertexDdl({
      label: vertex.label,
      rank: vertex.rank,
      statements: new CypherStatements({
        members: [...propertyStatements(vertex.label, vertex.declaration), ...keyStatements, ...indexStatements]
      }),
      fullText: FullTextDeclarations.of(vertex.declaration)
    })
  }
}

const fullTextStatement = (index: FullTextIndex): CypherStatement =>
  statement(
    `CREATE FULLTEXT INDEX ${index.name} IF NOT EXISTS FOR (n:${index.labels.join("|")}) ON EACH [${
      index.fields.map((field) => `n.${field}`).join(", ")
    }];`
  )

/**
 * The DDL of a set of declared vertices, one `VertexDdl` per label. Models
 * unite by label, and render in declaration-rank order whatever order they
 * were built in.
 *
 * @since 0.8.0
 * @category models
 */
export class DdlModel extends Schema.Class<DdlModel>("DdlModel")({
  vertices: Schema.HashMap(VertexLabel, VertexDdl)
}) {
  /**
   * The model of `vertices`, keyed by label.
   *
   * @since 0.8.0
   */
  static of(vertices: Iterable<VertexDdl>): DdlModel {
    return new DdlModel({
      vertices: HashMap.fromIterable(Array.fromIterable(vertices).map((vertex) => [vertex.label, vertex] as const))
    })
  }

  /**
   * The vertices of both models.
   *
   * @since 0.8.0
   */
  union(that: DdlModel): DdlModel {
    return new DdlModel({ vertices: HashMap.union(this.vertices, that.vertices) })
  }

  /**
   * The vertices of `labels` alone.
   *
   * @since 0.8.0
   */
  restrictedTo(labels: Iterable<VertexLabel>): DdlModel {
    const kept = HashSet.fromIterable(labels)
    return new DdlModel({ vertices: HashMap.filter(this.vertices, (_, label) => HashSet.has(kept, label)) })
  }

  /** @internal */
  private ordered(): ReadonlyArray<VertexDdl> {
    return Array.sort(HashMap.toValues(this.vertices), VertexDdl.order)
  }

  /**
   * One fulltext index per name, sorted by name, over the labels declaring it
   * in declaration-rank order.
   *
   * @since 0.8.0
   */
  fullTextIndexes(): ReadonlyArray<FullTextIndex> {
    const declared = this.ordered().flatMap((vertex) =>
      vertex.fullText.members.map((declaration) => ({ label: vertex.label, declaration }))
    )
    return Array.sort(
      Record.values(Array.groupBy(declared, ({ declaration }) => declaration.index)).map((group) =>
        new FullTextIndex({
          name: group[0].declaration.index,
          labels: Array.dedupe(group.map(({ label }) => label)),
          fields: group[0].declaration.fields.toReadonlyArray()
        })
      ),
      Order.mapInput(Order.String, (index: FullTextIndex) => index.name)
    )
  }

  /**
   * Every statement in declaration-rank order: each vertex's own statements,
   * then the fulltext indexes it is the first label of.
   *
   * @since 0.8.0
   */
  statements(): ReadonlyArray<CypherStatement> {
    const indexes = HashMap.fromIterable(this.fullTextIndexes().map((index) => [index.name, index] as const))
    const ledBy = (label: VertexLabel) => (declaration: FullTextDeclaration): Option.Option<CypherStatement> =>
      Option.flatMap(
        HashMap.get(indexes, declaration.index),
        (index) =>
          Option.map(
            Option.filter(Array.head(index.labels), (leader) => leader === label),
            () => fullTextStatement(index)
          )
      )
    return this.ordered()
      .flatMap((
        vertex
      ) => [...vertex.statements.members, ...Array.getSomes(vertex.fullText.members.map(ledBy(vertex.label)))])
  }

  /**
   * The statements, one per line.
   *
   * @since 0.8.0
   */
  render(): string {
    return this.statements().join("\n")
  }
}
