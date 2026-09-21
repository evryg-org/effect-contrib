import { Array, Data, Match, Option, Predicate, Record, Result, Schema, SchemaAST } from "effect"
import { GraphOp, PropertyMap, type UpsertEdge, type UpsertVertex, type VertexRef } from "./GraphOp.js"

/** The field map of a declaring `Schema.Struct`, read structurally so this package keeps
 *  depending on `effect` alone. Partition fields are already merged in by the declarer. */
export type DeclaredFields = { readonly [key: string]: Schema.Top }

/** An ordered endpoint pair an edge type is declared to connect, by vertex label. */
export class EndpointPair extends Schema.Class<EndpointPair>("EndpointPair")({
  from: Schema.String,
  to: Schema.String,
}) {}

export class VertexDeclaration extends Data.TaggedClass("VertexDeclaration")<{
  readonly label: string
  readonly fields: DeclaredFields
}> {}

export class EdgeDeclaration extends Data.TaggedClass("EdgeDeclaration")<{
  readonly label: string
  readonly fields: DeclaredFields
  readonly connectivity: ReadonlyArray<EndpointPair>
}> {}

export type Declaration = VertexDeclaration | EdgeDeclaration

export class UndeclaredLabel extends Schema.TaggedClass<UndeclaredLabel>()("UndeclaredLabel", {}) {}

export class UndeclaredProperty extends Schema.TaggedClass<UndeclaredProperty>()("UndeclaredProperty", {
  property: Schema.String,
}) {}

export class NullOnRequired extends Schema.TaggedClass<NullOnRequired>()("NullOnRequired", {
  property: Schema.String,
}) {}

export class UndecodableProperty extends Schema.TaggedClass<UndecodableProperty>()("UndecodableProperty", {
  property: Schema.String,
  issue: Schema.String,
}) {}

export class UndeclaredConnectivity extends Schema.TaggedClass<UndeclaredConnectivity>()("UndeclaredConnectivity", {
  from: Schema.String,
  to: Schema.String,
}) {}

export const ViolationReason = Schema.Union([
  UndeclaredLabel,
  UndeclaredProperty,
  NullOnRequired,
  UndecodableProperty,
  UndeclaredConnectivity,
]).pipe(Schema.toTaggedUnion("_tag"))
export type ViolationReason = typeof ViolationReason.Type

const describeReason = (reason: ViolationReason): string =>
  ViolationReason.match(reason, {
    UndeclaredLabel: () => "is not declared",
    UndeclaredProperty: (r) => `carries undeclared property "${r.property}"`,
    NullOnRequired: (r) => `writes null to required property "${r.property}"`,
    UndecodableProperty: (r) => `writes an undecodable value to "${r.property}": ${r.issue}`,
    UndeclaredConnectivity: (r) => `connects the undeclared pair ${r.from} -> ${r.to}`,
  })

/** A write that does not match its declaration. An `Error`, so it fits the materializer port's
 *  `Stream<MaterializeProgress, Error>` without the port widening its failure channel. */
export class DeclarationViolationError extends Schema.TaggedErrorClass<DeclarationViolationError>()("DeclarationViolationError", {
  op: Schema.Literals(["UpsertVertex", "UpsertEdge"]),
  label: Schema.String,
  key: PropertyMap,
  reason: ViolationReason,
}) {
  override get message(): string {
    const key = Record.toEntries(this.key).map(([name, value]) => `${name}=${String(value)}`).join(", ")
    return `${this.op} ${this.label} {${key}} ${describeReason(this.reason)}`
  }
}

export class DuplicateDeclarationError extends Schema.TaggedErrorClass<DuplicateDeclarationError>()("DuplicateDeclarationError", {
  label: Schema.String,
}) {
  override get message(): string {
    return `Duplicate vertex declaration for "${this.label}"`
  }
}

const mergeEdges = (existing: EdgeDeclaration, incoming: EdgeDeclaration): EdgeDeclaration =>
  new EdgeDeclaration({
    label: existing.label,
    fields: { ...existing.fields, ...incoming.fields },
    connectivity: [...existing.connectivity, ...incoming.connectivity],
  })

/** Declared labels, in two maps so an edge type and a vertex label of the same name never collide.
 *
 * A vertex label has exactly one declaration: two are a contradiction about what that node is. An
 * edge TYPE is graph-wide and several contexts declare their own share of it, so same-type edge
 * declarations MERGE — the union of their properties over the union of their endpoint pairs. */
export class DeclarationIndex {
  constructor(
    private readonly vertices: ReadonlyMap<string, VertexDeclaration>,
    private readonly edges: ReadonlyMap<string, EdgeDeclaration>,
  ) {}

  static fromDeclarations(
    declarations: Iterable<Declaration>,
  ): Result.Result<DeclarationIndex, DuplicateDeclarationError> {
    const empty: Result.Result<DeclarationIndex, DuplicateDeclarationError> = Result.succeed(
      new DeclarationIndex(new Map(), new Map()),
    )
    return Array.reduce(Array.fromIterable(declarations), empty, (index, declaration) =>
      Result.flatMap(index, (built) => built.declaring(declaration)))
  }

  private declaring(declaration: Declaration): Result.Result<DeclarationIndex, DuplicateDeclarationError> {
    return Match.valueTags(declaration, {
      VertexDeclaration: (vertex) =>
        Option.isSome(this.vertex(vertex.label))
          ? Result.fail(new DuplicateDeclarationError({ label: vertex.label }))
          : Result.succeed(new DeclarationIndex(new Map([...this.vertices, [vertex.label, vertex]]), this.edges)),
      EdgeDeclaration: (edge) =>
        Result.succeed(
          new DeclarationIndex(
            this.vertices,
            new Map([
              ...this.edges,
              [edge.label, Option.match(this.edge(edge.label), { onNone: () => edge, onSome: (e) => mergeEdges(e, edge) })],
            ]),
          ),
        ),
    })
  }

  vertex(label: string): Option.Option<VertexDeclaration> {
    return Option.fromNullishOr(this.vertices.get(label))
  }

  edge(label: string): Option.Option<EdgeDeclaration> {
    return Option.fromNullishOr(this.edges.get(label))
  }

  vertexLabels(): ReadonlyArray<string> {
    return [...this.vertices.keys()]
  }

  edgeLabels(): ReadonlyArray<string> {
    return [...this.edges.keys()]
  }
}

const issueOfDecode = (field: Schema.Top, value: unknown): Option.Option<string> =>
  Result.match(Schema.decodeUnknownResult(Schema.make<Schema.Decoder<unknown>>(field.ast))(value), {
    onFailure: (error) => Option.some(error.message),
    onSuccess: () => Option.none<string>(),
  })

const reasonOfEntry =
  (fields: DeclaredFields) =>
  ([property, value]: readonly [string, unknown]): Option.Option<ViolationReason> =>
    Option.match(Record.get(fields, property), {
      onNone: () => Option.some<ViolationReason>(new UndeclaredProperty({ property })),
      onSome: (field) =>
        Predicate.isNull(value)
          ? SchemaAST.isOptional(field.ast)
            ? Option.none<ViolationReason>()
            : Option.some<ViolationReason>(new NullOnRequired({ property }))
          : Option.map(issueOfDecode(field, value), (issue) => new UndecodableProperty({ property, issue })),
    })

/** A write is partial by design (`SET n += props`), so every present key is checked on its own —
 *  never the whole struct, which would read an unwritten required field as missing. */
export const checkFields = (fields: DeclaredFields, values: PropertyMap): Option.Option<ViolationReason> =>
  Array.findFirst(Record.toEntries(values), reasonOfEntry(fields))

const violationOf =
  (op: "UpsertVertex" | "UpsertEdge", label: string, key: PropertyMap) =>
  (reason: ViolationReason): DeclarationViolationError =>
    new DeclarationViolationError({ op, label, key, reason })

const checkVertexWrite = (
  index: DeclarationIndex,
  op: "UpsertVertex" | "UpsertEdge",
  label: string,
  key: PropertyMap,
  properties: PropertyMap,
): Option.Option<DeclarationViolationError> =>
  Option.match(index.vertex(label), {
    onNone: () => Option.some(violationOf(op, label, key)(new UndeclaredLabel())),
    onSome: (declaration) =>
      Option.map(
        Option.orElse(checkFields(declaration.fields, key), () => checkFields(declaration.fields, properties)),
        violationOf(op, label, key),
      ),
  })

const checkEndpoint = (index: DeclarationIndex, ref: VertexRef): Option.Option<DeclarationViolationError> =>
  checkVertexWrite(index, "UpsertEdge", ref.label, ref.key, {})

const checkConnectivity = (declaration: EdgeDeclaration, edge: UpsertEdge): Option.Option<ViolationReason> =>
  declaration.connectivity.length === 0 ||
  Array.some(declaration.connectivity, (pair) => pair.from === edge.from.label && pair.to === edge.to.label)
    ? Option.none()
    : Option.some(new UndeclaredConnectivity({ from: edge.from.label, to: edge.to.label }))

const checkEdge = (index: DeclarationIndex, edge: UpsertEdge): Option.Option<DeclarationViolationError> =>
  Option.match(index.edge(edge.label), {
    onNone: () => Option.some(violationOf("UpsertEdge", edge.label, edge.key)(new UndeclaredLabel())),
    onSome: (declaration) =>
      Option.orElse(
        Option.map(
          Option.orElse(checkFields(declaration.fields, edge.key), () =>
            checkFields(declaration.fields, edge.properties)),
          violationOf("UpsertEdge", edge.label, edge.key),
        ),
        () =>
          Option.orElse(
            Option.orElse(checkEndpoint(index, edge.from), () => checkEndpoint(index, edge.to)),
            () => Option.map(checkConnectivity(declaration, edge), violationOf("UpsertEdge", edge.label, edge.key)),
          ),
      ),
  })

export const checkGraphOp =
  (index: DeclarationIndex) =>
  (op: GraphOp): Result.Result<GraphOp, DeclarationViolationError> =>
    Option.match(
      GraphOp.match(op, {
        UpsertVertex: (v: UpsertVertex) => checkVertexWrite(index, "UpsertVertex", v.label, v.key, v.properties),
        UpsertEdge: (e: UpsertEdge) => checkEdge(index, e),
      }),
      { onNone: () => Result.succeed(op), onSome: Result.fail },
    )

export const checkGraphOps =
  (index: DeclarationIndex) =>
  (ops: ReadonlyArray<GraphOp>): Result.Result<ReadonlyArray<GraphOp>, DeclarationViolationError> =>
    Result.all(ops.map(checkGraphOp(index)))
