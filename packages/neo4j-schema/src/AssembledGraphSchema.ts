/**
 * A graph schema assembled from the contributions of several modules, lawfully:
 * the order contributions arrive in and repeated contributions change nothing,
 * and contributions that disagree yield a typed `SchemaConflict`.
 *
 * @since 0.8.0
 */
import type { Declaration, DeclarationViolationError, DeclaredFields, GraphOp } from "@evryg/effect-op-graph"
import {
  checkOwnedGraphOp,
  DeclarationIndex,
  EdgeDeclaration,
  EndpointPair,
  OwnedDeclarations,
  VertexDeclaration
} from "@evryg/effect-op-graph"
import { Array, Function, HashMap, Match, Option, Order, Predicate, Record, Result, Schema, SchemaAST } from "effect"
import { DdlModel, FullTextDeclarations, VertexDdl } from "./DdlModel.js"
import { declarationOf, markerLabel } from "./DeclaredGrammar.js"
import { DeclaredVertex } from "./DeclaredVertex.js"
import { EdgeEnds, EdgeSlot } from "./EdgeSlot.js"
import type { GraphSchemaContribution } from "./GraphSchemaContribution.js"
import type { GraphSchema } from "./GraphSchemaModel.js"
import {
  ContributingModule,
  ContributingModules,
  DeclarationRank,
  DeclaredAst,
  EdgeType,
  MemberOrdinal,
  PropertyName,
  type PropertyNames,
  VertexLabel
} from "./GraphVocabulary.js"
import { GraphWriters } from "./GraphWriters.js"
import { compatibleUnion, unlessConflicting } from "./internal/AgreeingUnion.js"
import { compileToGraphSchema } from "./resolvers/annotation/AnnotationGraphSchemaResolver.js"
import { SchemaConflict } from "./SchemaConflict.js"
import { VertexAnnotations } from "./VertexAnnotations.js"
import type { VertexMarker } from "./VertexMarker.js"

const carrierAst = (ast: SchemaAST.AST): SchemaAST.AST =>
  SchemaAST.isLiteral(ast) && Predicate.isString(ast.literal) ? SchemaAST.string : ast

class EdgeFields extends Schema.Class<EdgeFields>("EdgeFields")({
  byName: Schema.HashMap(PropertyName, DeclaredAst)
}) {
  static of(declaration: SchemaAST.Objects): EdgeFields {
    return new EdgeFields({
      byName: HashMap.fromIterable(
        declaration.propertySignatures.map((signature) =>
          [PropertyName.make(String(signature.name)), signature.type] as const
        )
      )
    })
  }

  declared(): DeclaredFields {
    return this.fieldsOf(Function.identity)
  }

  carried(): DeclaredFields {
    return this.fieldsOf(carrierAst)
  }

  private fieldsOf(project: (ast: SchemaAST.AST) => SchemaAST.AST): DeclaredFields {
    return Record.fromEntries(HashMap.toEntries(HashMap.map(this.byName, (ast) => Schema.make(project(ast)))))
  }

  neo4jTypes(): ReadonlyArray<readonly [PropertyName, Option.Option<ReadonlyArray<string>>]> {
    const rows = compileToGraphSchema([Schema.Struct(this.carried()).annotate({ neo4jEdgeType: "_" })]).edgeProperties
    return HashMap.toEntries(this.byName).map(([property]) =>
      [
        property,
        Option.map(Array.findFirst(rows, (row) => row.propertyName === property), (row) => row.propertyTypes)
      ] as const
    )
  }
}

class DeclaredEdge extends Schema.Class<DeclaredEdge>("DeclaredEdge")({
  slot: EdgeSlot,
  fields: EdgeFields,
  owner: ContributingModule
}) {
  static readonly order: Order.Order<DeclaredEdge> = Order.mapInput(
    Order.String,
    (edge: DeclaredEdge) => edge.slot.key()
  )
}

class DeclaredVertices extends Schema.Class<DeclaredVertices>("DeclaredVertices")({
  byLabel: Schema.HashMap(VertexLabel, DeclaredVertex)
}) {}

class DeclaredEdges extends Schema.Class<DeclaredEdges>("DeclaredEdges")({
  bySlot: Schema.HashMap(EdgeSlot, DeclaredEdge)
}) {}

const fragmentsOf = (contribution: GraphSchemaContribution): ReadonlyArray<DeclaredVertex | DeclaredEdge> =>
  contribution.schemas.toReadonlyArray().flatMap((member, ordinal): ReadonlyArray<DeclaredVertex | DeclaredEdge> =>
    Option.match(declarationOf(member), {
      onNone: () => [],
      onSome: Match.valueTags({
        VertexDeclaration: ({ label }) => [
          new DeclaredVertex({
            label: VertexLabel.make(label),
            rank: new DeclarationRank({ owner: contribution.owner, ordinal: MemberOrdinal.make(ordinal) }),
            declaration: member.ast
          })
        ],
        EdgeDeclaration: ({ connectivity, label }) =>
          connectivity.map(({ from, to }) =>
            new DeclaredEdge({
              slot: new EdgeSlot({
                edgeType: EdgeType.make(label),
                ends: new EdgeEnds({ from: VertexLabel.make(from), to: VertexLabel.make(to) })
              }),
              fields: EdgeFields.of(member.ast),
              owner: contribution.owner
            })
          )
      })
    })
  )

const duplicateVertexLabel = (group: Array.NonEmptyReadonlyArray<DeclaredVertex>): SchemaConflict =>
  SchemaConflict.cases.DuplicateVertexLabel.make({
    label: group[0].label,
    owners: ContributingModules.of(group.map((vertex) => vertex.rank.owner))
  })

const edgeSlotDisagreement = (group: Array.NonEmptyReadonlyArray<DeclaredEdge>): SchemaConflict => {
  const { edgeType, ends } = group[0].slot
  const owners = ContributingModules.of(group.map((edge) => edge.owner))
  return owners.isShared()
    ? SchemaConflict.cases.SharedEdgeSlot.make({ edgeType, ends, owners })
    : SchemaConflict.cases.ConflictingEdgeFields.make({ edgeType, ends, owner: group[0].owner })
}

const fieldListOrder: Order.Order<PropertyNames> = Order.mapInput(
  Order.Array(Order.String),
  (names: PropertyNames) => names.toReadonlyArray()
)

const fullTextConflicts = (vertices: ReadonlyArray<DeclaredVertex>): ReadonlyArray<SchemaConflict> =>
  Array.filterMap(
    Record.values(
      Array.groupBy(
        vertices.flatMap((vertex) => FullTextDeclarations.of(vertex.declaration).toReadonlyArray()),
        (declared) => declared.index
      )
    ),
    (group) => {
      const [fields, ...others] = Array.sort(
        Array.dedupe(Array.map(group, (declared) => declared.fields)),
        fieldListOrder
      )
      return Option.match(Array.head(others), {
        onNone: () => Result.failVoid,
        onSome: (conflictingFields) =>
          Result.succeed(
            SchemaConflict.cases.ConflictingFullTextFields.make({ index: group[0].index, fields, conflictingFields })
          )
      })
    }
  )

const propertyTypeConflicts = (edges: ReadonlyArray<DeclaredEdge>): ReadonlyArray<SchemaConflict> =>
  Record.values(Array.groupBy(edges, (edge) => edge.slot.edgeType)).flatMap((slots) => {
    const typed = slots.flatMap((edge) =>
      edge.fields.neo4jTypes().map(([property, types]) => ({ edge, property, types }))
    )
    return Array.filterMap(
      Record.values(Array.groupBy(typed, ({ property }) => property)),
      (group) =>
        Array.dedupe(group.map(({ types }) => types)).length > 1
          ? Result.succeed(SchemaConflict.cases.ConflictingEdgePropertyTypes.make({
            edgeType: group[0].edge.slot.edgeType,
            property: group[0].property,
            owners: ContributingModules.of(group.map(({ edge }) => edge.owner))
          }))
          : Result.failVoid
    )
  })

const joinedField = (slots: Array.NonEmptyReadonlyArray<DeclaredEdge>, property: PropertyName): Schema.Top => {
  const declared = Array.getSomes(slots.map((slot) => HashMap.get(slot.fields.byName, property)))
  const [canonical] = declared
  const mandatory = declared.length === slots.length && Array.every(declared, (ast) => !SchemaAST.isOptional(ast))
  const carried = carrierAst(canonical)
  return mandatory || SchemaAST.isOptional(canonical) ? Schema.make(carried) : Schema.optional(Schema.make(carried))
}

const joinedEdgeSchema = (slots: Array.NonEmptyReadonlyArray<DeclaredEdge>): Schema.Top => {
  const properties = Array.sort(
    Array.dedupe(slots.flatMap((slot) => Array.fromIterable(HashMap.keys(slot.fields.byName)))),
    Order.String
  )
  const pairs = slots.map(({ slot }) => ({ from: slot.ends.from, to: slot.ends.to }))
  return Schema.Struct(Record.fromEntries(properties.map((property) => [property, joinedField(slots, property)])))
    .annotate({ neo4jEdgeType: slots[0].slot.edgeType, neo4jEdgeConnectivity: pairs })
}

/**
 * A graph schema assembled from contributions: each vertex label, and each
 * edge slot (an edge type with one endpoint pair), is declared once, by the
 * one module that writes it.
 *
 * Assembly is a bounded semilattice under `combine`, with `empty` as its
 * identity: the result depends neither on the order contributions arrive in
 * nor on how often one repeats, and two contributions that disagree yield a
 * `SchemaConflict`, which absorbs everything combined with it.
 *
 * @since 0.8.0
 * @category models
 */
export class AssembledGraphSchema extends Schema.Class<AssembledGraphSchema>("AssembledGraphSchema")({
  vertices: DeclaredVertices,
  edges: DeclaredEdges
}) {
  /**
   * The schema that declares nothing: the identity of `combine`.
   *
   * @since 0.8.0
   */
  static readonly empty: AssembledGraphSchema = new AssembledGraphSchema({
    vertices: new DeclaredVertices({ byLabel: HashMap.empty() }),
    edges: new DeclaredEdges({ bySlot: HashMap.empty() })
  })

  /**
   * Unites vertex and edge declarations into one schema, or fails with the
   * first conflict among them in a canonical order, so the reported conflict
   * does not depend on the input order.
   *
   * @since 0.8.0
   */
  static ofFragments(
    vertexFragments: ReadonlyArray<DeclaredVertex>,
    edgeFragments: ReadonlyArray<DeclaredEdge>
  ): Result.Result<AssembledGraphSchema, SchemaConflict> {
    const vertices = compatibleUnion(vertexFragments, (vertex) => vertex.label, duplicateVertexLabel)
    const edges = compatibleUnion(edgeFragments, (edge) => edge.slot.key(), edgeSlotDisagreement)
    const conflicts = [
      ...Array.getFailures([...vertices, ...edges]),
      ...fullTextConflicts(vertexFragments),
      ...propertyTypeConflicts(edgeFragments)
    ]
    return unlessConflicting(conflicts, () =>
      new AssembledGraphSchema({
        vertices: new DeclaredVertices({
          byLabel: HashMap.fromIterable(Array.getSuccesses(vertices).map((vertex) => [vertex.label, vertex] as const))
        }),
        edges: new DeclaredEdges({
          bySlot: HashMap.fromIterable(Array.getSuccesses(edges).map((edge) => [edge.slot, edge] as const))
        })
      }))
  }

  /** @internal */
  private orderedVertices(): ReadonlyArray<DeclaredVertex> {
    return Array.sort(HashMap.toValues(this.vertices.byLabel), DeclaredVertex.order)
  }

  /** @internal */
  private orderedEdges(): ReadonlyArray<DeclaredEdge> {
    return Array.sort(HashMap.toValues(this.edges.bySlot), DeclaredEdge.order)
  }

  /**
   * The least schema declaring everything both declare: associative,
   * commutative and idempotent, or a `SchemaConflict` when the two disagree on
   * a label, an edge slot or a fulltext index.
   *
   * @since 0.8.0
   */
  combine(that: AssembledGraphSchema): Result.Result<AssembledGraphSchema, SchemaConflict> {
    return AssembledGraphSchema.ofFragments(
      [...HashMap.toValues(this.vertices.byLabel), ...HashMap.toValues(that.vertices.byLabel)],
      [...HashMap.toValues(this.edges.bySlot), ...HashMap.toValues(that.edges.bySlot)]
    )
  }

  /**
   * The declared vertex labels in declaration-rank order: owner, then position
   * in its contribution, then label.
   *
   * @since 0.8.0
   */
  labels(): ReadonlyArray<VertexLabel> {
    return this.orderedVertices().map((vertex) => vertex.label)
  }

  /**
   * The DDL model of the declared vertices. A homomorphism: it maps `empty` to
   * the empty model and `combine` to `DdlModel.union`, and a sub-assembly's
   * model is this one restricted to its labels.
   *
   * @since 0.8.0
   */
  ddlModel(): DdlModel {
    return DdlModel.of(this.orderedVertices().map(VertexDdl.of))
  }

  /**
   * The canonical Cypher DDL, one statement per line, in declaration-rank
   * order, whatever order the contributions arrived in.
   *
   * @since 0.8.0
   */
  ddl(): string {
    return this.ddlModel().render()
  }

  /**
   * Annotates each declared vertex with what `read` reads off its
   * declaration. A homomorphism from `combine` to `VertexAnnotations.union`,
   * local in the same sense as `ddlModel`.
   *
   * @since 0.8.0
   */
  project<A>(read: (declaration: SchemaAST.Objects) => A): VertexAnnotations<A> {
    return new VertexAnnotations(HashMap.map(this.vertices.byLabel, (vertex) => read(vertex.declaration)))
  }

  /**
   * The one writer of each vertex label and edge slot: the module declaring
   * it. A homomorphism from `combine` to `GraphWriters.union`.
   *
   * @since 0.8.0
   */
  writers(): GraphWriters {
    return GraphWriters.of(
      HashMap.map(this.vertices.byLabel, (vertex) => vertex.rank.owner),
      HashMap.map(this.edges.bySlot, (edge) => edge.owner)
    )
  }

  /** @internal */
  private declarations(): ReadonlyArray<Declaration> {
    return [
      ...this.orderedVertices().map((vertex) =>
        new VertexDeclaration({ label: vertex.label, fields: vertex.declaredFields() })
      ),
      ...this.orderedEdges().map((edge) =>
        new EdgeDeclaration({
          label: edge.slot.edgeType,
          fields: edge.fields.declared(),
          connectivity: [new EndpointPair({ from: edge.slot.ends.from, to: edge.slot.ends.to })]
        })
      )
    ]
  }

  /**
   * Every declaration, one edge declaration per endpoint pair, as the index
   * `checkGraphOp` of `@evryg/effect-op-graph` checks writes against.
   *
   * @since 0.8.0
   */
  declarationIndex(): DeclarationIndex {
    return Result.getOrThrow(DeclarationIndex.fromDeclarations(this.declarations()))
  }

  /**
   * The write check of a module owning this schema: its vertex upserts must
   * target its own declarations, and its edges may also end at the vertices
   * `markers` reference without declaring.
   *
   * @since 0.8.0
   */
  writeCheck<const KeyFields extends ReadonlyArray<Schema.Struct.Fields>>(
    markers: { readonly [I in keyof KeyFields]: VertexMarker<KeyFields[I]> }
  ): (op: GraphOp) => Result.Result<GraphOp, DeclarationViolationError> {
    return checkOwnedGraphOp(Result.getOrThrow(OwnedDeclarations.fromDeclarations({
      own: this.declarations(),
      referenced: markers.map((marker) => new VertexDeclaration({ label: markerLabel(marker), fields: marker.fields }))
    })))
  }

  /**
   * The schemas `compileToGraphSchema` compiles: each vertex declaration in
   * rank order, then one schema per edge type joining its endpoint pairs. A
   * joined property is mandatory only where every pair requires it, and a
   * literal property widens to its carrier type.
   *
   * @since 0.8.0
   */
  schemas(): ReadonlyArray<Schema.Top> {
    return [
      ...this.orderedVertices().map((vertex) => Schema.make(vertex.declaration)),
      ...Record.values(Array.groupBy(this.orderedEdges(), (edge) => edge.slot.edgeType)).map(joinedEdgeSchema)
    ]
  }

  /**
   * The graph schema model of `schemas`, as code generators read it.
   *
   * @since 0.8.0
   */
  graphSchema(): GraphSchema {
    return compileToGraphSchema([...this.schemas()])
  }
}

/**
 * Assembles contributions into one `AssembledGraphSchema`, or the first
 * `SchemaConflict` among them in a canonical order. Neither the order
 * contributions arrive in nor a repeated contribution changes the outcome, and
 * the assembly fails exactly when two of the contributions disagree.
 *
 * @since 0.8.0
 * @category constructors
 */
export const assembleGraphSchema = (
  contributions: Iterable<GraphSchemaContribution>
): Result.Result<AssembledGraphSchema, SchemaConflict> => {
  const [edges, vertices] = Array.partition(
    Array.fromIterable(contributions).flatMap(fragmentsOf),
    (fragment) => Schema.is(DeclaredVertex)(fragment) ? Result.succeed(fragment) : Result.fail(fragment)
  )
  return AssembledGraphSchema.ofFragments(vertices, edges)
}
