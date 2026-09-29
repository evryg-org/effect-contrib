import { Array, Data, Equal, Match, Option, Predicate, Record, Result, Schema, SchemaAST } from "effect"
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

/** An edge type's fields over the endpoint pairs it names: at least one, since an edge declared
 *  over no pair would either connect nothing or claim every pair. */
export class EdgeDeclaration extends Data.TaggedClass("EdgeDeclaration")<{
  readonly label: string
  readonly fields: DeclaredFields
  readonly connectivity: Array.NonEmptyReadonlyArray<EndpointPair>
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

/** One declaration per endpoint pair it names. */
const perPair = (edge: EdgeDeclaration): ReadonlyArray<EdgeDeclaration> =>
  edge.connectivity.map((pair) => new EdgeDeclaration({ label: edge.label, fields: edge.fields, connectivity: [pair] }))

/** Two declarations of one edge type on one endpoint pair that disagree on its fields: which one a
 *  write should be checked against is a contradiction, never a merge. */
export class ConflictingEdgeDeclarationError extends Schema.TaggedErrorClass<ConflictingEdgeDeclarationError>()(
  "ConflictingEdgeDeclarationError",
  {
    label: Schema.String,
    pair: EndpointPair,
  },
) {
  override get message(): string {
    return `Conflicting field declarations for edge "${this.label}" on ${this.pair.from} -> ${this.pair.to}: declare each pair's fields once`
  }
}

type DeclarationConflictError = DuplicateDeclarationError | ConflictingEdgeDeclarationError

const samePair = (a: EdgeDeclaration) => (b: EdgeDeclaration): boolean => Equal.equals(a.connectivity, b.connectivity)

/** Field schemas compare by AST, structurally: two contexts spelling the same field agree. */
const sameFields = (a: EdgeDeclaration, b: EdgeDeclaration): boolean =>
  Equal.equals(Record.map(a.fields, (field) => field.ast), Record.map(b.fields, (field) => field.ast))

const declaringPair = (
  declared: Result.Result<ReadonlyArray<EdgeDeclaration>, ConflictingEdgeDeclarationError>,
  incoming: EdgeDeclaration,
): Result.Result<ReadonlyArray<EdgeDeclaration>, ConflictingEdgeDeclarationError> =>
  Result.flatMap(declared, (pairs) =>
    Option.match(Array.findFirst(pairs, samePair(incoming)), {
      onNone: () => Result.succeed(Array.append(pairs, incoming)),
      onSome: (existing) =>
        sameFields(existing, incoming)
          ? Result.succeed(pairs)
          : Result.fail(new ConflictingEdgeDeclarationError({ label: incoming.label, pair: incoming.connectivity[0] })),
    }))

/** Declared labels, in two maps so an edge type and a vertex label of the same name never collide.
 *
 * A vertex label has exactly one declaration: two are a contradiction about what that node is. An
 * edge TYPE is graph-wide and several contexts declare their own share of it, so the index keeps
 * one declaration per endpoint pair: the fields a write may carry are those of ITS pair. */
export class DeclarationIndex {
  private constructor(
    private readonly vertices: ReadonlyMap<string, VertexDeclaration>,
    private readonly edges: ReadonlyMap<string, ReadonlyArray<EdgeDeclaration>>,
  ) {}

  static fromDeclarations(
    declarations: Iterable<Declaration>,
  ): Result.Result<DeclarationIndex, DeclarationConflictError> {
    const empty: Result.Result<DeclarationIndex, DeclarationConflictError> = Result.succeed(
      new DeclarationIndex(new Map(), new Map()),
    )
    return Array.reduce(Array.fromIterable(declarations), empty, (index, declaration) =>
      Result.flatMap(index, (built) => built.declaring(declaration)))
  }

  private declaring(declaration: Declaration): Result.Result<DeclarationIndex, DeclarationConflictError> {
    return Match.valueTags(declaration, {
      VertexDeclaration: (vertex) =>
        Option.isSome(this.vertex(vertex.label))
          ? Result.fail(new DuplicateDeclarationError({ label: vertex.label }))
          : Result.succeed(new DeclarationIndex(new Map([...this.vertices, [vertex.label, vertex]]), this.edges)),
      EdgeDeclaration: (edge) =>
        Result.map(
          Array.reduce(perPair(edge), Result.succeed(this.edgeDeclarations(edge.label)), declaringPair),
          (pairs) => new DeclarationIndex(this.vertices, new Map([...this.edges, [edge.label, pairs]])),
        ),
    })
  }

  vertex(label: string): Option.Option<VertexDeclaration> {
    return Option.fromNullishOr(this.vertices.get(label))
  }

  /** One declaration per endpoint pair the edge type connects, empty for an undeclared type. */
  edgeDeclarations(label: string): ReadonlyArray<EdgeDeclaration> {
    return this.edges.get(label) ?? []
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

const declarationOfPair = (
  declarations: ReadonlyArray<EdgeDeclaration>,
  edge: UpsertEdge,
): Option.Option<EdgeDeclaration> =>
  Array.findFirst(declarations, (declaration) =>
    Array.some(declaration.connectivity, (pair) => pair.from === edge.from.label && pair.to === edge.to.label))

const checkEndpoints = (index: DeclarationIndex, edge: UpsertEdge): Option.Option<DeclarationViolationError> =>
  Option.orElse(checkEndpoint(index, edge.from), () => checkEndpoint(index, edge.to))

const checkEdge = (index: DeclarationIndex, edge: UpsertEdge): Option.Option<DeclarationViolationError> => {
  const violation = violationOf("UpsertEdge", edge.label, edge.key)
  const declarations = index.edgeDeclarations(edge.label)
  return Array.isReadonlyArrayEmpty(declarations)
    ? Option.some(violation(new UndeclaredLabel()))
    : Option.match(declarationOfPair(declarations, edge), {
      onNone: () =>
        Option.orElse(
          checkEndpoints(index, edge),
          () => Option.some(violation(new UndeclaredConnectivity({ from: edge.from.label, to: edge.to.label }))),
        ),
      onSome: (declaration) =>
        Option.orElse(
          Option.map(
            Option.orElse(checkFields(declaration.fields, edge.key), () => checkFields(declaration.fields, edge.properties)),
            violation,
          ),
          () => checkEndpoints(index, edge),
        ),
    })
}

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
