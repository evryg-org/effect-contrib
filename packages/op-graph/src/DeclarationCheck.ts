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

/** A declared field with its decoder built once, so a write only applies it. */
type PreparedField = {
  readonly optional: boolean
  readonly issueOf: (value: unknown) => Option.Option<string>
}

type PreparedFields = { readonly [key: string]: PreparedField }

const prepareField = (field: Schema.Top): PreparedField => {
  const decode = Schema.decodeUnknownResult(Schema.make<Schema.Decoder<unknown>>(field.ast))
  return {
    optional: SchemaAST.isOptional(field.ast),
    issueOf: (value) =>
      Result.match(decode(value), {
        onFailure: (error) => Option.some(error.message),
        onSuccess: () => Option.none<string>(),
      }),
  }
}

const prepareFields = (fields: DeclaredFields): PreparedFields => Record.map(fields, prepareField)

/** A declaration with its prepared fields. Kept beside the declaration, not inside it, so the
 *  declarations' structural `Equal` never sees a function. */
class PreparedDeclaration<D extends Declaration> {
  readonly fields: PreparedFields
  constructor(readonly declaration: D) {
    this.fields = prepareFields(declaration.fields)
  }
}

const samePair = (a: EdgeDeclaration) => (b: PreparedDeclaration<EdgeDeclaration>): boolean =>
  Equal.equals(a.connectivity, b.declaration.connectivity)

/** Field schemas compare by AST, structurally: two contexts spelling the same field agree. */
const sameFields = (a: EdgeDeclaration, b: EdgeDeclaration): boolean =>
  Equal.equals(Record.map(a.fields, (field) => field.ast), Record.map(b.fields, (field) => field.ast))

const declaringPair = (
  declared: Result.Result<ReadonlyArray<PreparedDeclaration<EdgeDeclaration>>, ConflictingEdgeDeclarationError>,
  incoming: EdgeDeclaration,
): Result.Result<ReadonlyArray<PreparedDeclaration<EdgeDeclaration>>, ConflictingEdgeDeclarationError> =>
  Result.flatMap(declared, (pairs) =>
    Option.match(Array.findFirst(pairs, samePair(incoming)), {
      onNone: () => Result.succeed(Array.append(pairs, new PreparedDeclaration(incoming))),
      onSome: (existing) =>
        sameFields(existing.declaration, incoming)
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
    private readonly vertices: ReadonlyMap<string, PreparedDeclaration<VertexDeclaration>>,
    private readonly edges: ReadonlyMap<string, ReadonlyArray<PreparedDeclaration<EdgeDeclaration>>>,
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
          : Result.succeed(new DeclarationIndex(new Map([...this.vertices, [vertex.label, new PreparedDeclaration(vertex)]]), this.edges)),
      EdgeDeclaration: (edge) =>
        Result.map(
          Array.reduce(perPair(edge), Result.succeed(this.preparedEdges(edge.label)), declaringPair),
          (pairs) => new DeclarationIndex(this.vertices, new Map([...this.edges, [edge.label, pairs]])),
        ),
    })
  }

  vertex(label: string): Option.Option<VertexDeclaration> {
    return Option.map(this.preparedVertex(label), (prepared) => prepared.declaration)
  }

  /** One declaration per endpoint pair the edge type connects, empty for an undeclared type. */
  edgeDeclarations(label: string): ReadonlyArray<EdgeDeclaration> {
    return this.preparedEdges(label).map((prepared) => prepared.declaration)
  }

  preparedVertex(label: string): Option.Option<PreparedDeclaration<VertexDeclaration>> {
    return Option.fromNullishOr(this.vertices.get(label))
  }

  preparedEdges(label: string): ReadonlyArray<PreparedDeclaration<EdgeDeclaration>> {
    return this.edges.get(label) ?? []
  }

  vertexLabels(): ReadonlyArray<string> {
    return [...this.vertices.keys()]
  }

  edgeLabels(): ReadonlyArray<string> {
    return [...this.edges.keys()]
  }
}

const reasonOfEntry =
  (fields: PreparedFields) =>
  ([property, value]: readonly [string, unknown]): Option.Option<ViolationReason> =>
    Option.match(Record.get(fields, property), {
      onNone: () => Option.some<ViolationReason>(new UndeclaredProperty({ property })),
      onSome: (field) =>
        Predicate.isNull(value)
          ? field.optional
            ? Option.none<ViolationReason>()
            : Option.some<ViolationReason>(new NullOnRequired({ property }))
          : Option.map(field.issueOf(value), (issue) => new UndecodableProperty({ property, issue })),
    })

/** A write is partial by design (`SET n += props`), so every present key is checked on its own —
 *  never the whole struct, which would read an unwritten required field as missing. */
const checkPrepared = (fields: PreparedFields, values: PropertyMap): Option.Option<ViolationReason> =>
  Array.findFirst(Record.toEntries(values), reasonOfEntry(fields))

/** Prepares `fields` on every call: hold a `DeclarationIndex` to check many writes. */
export const checkFields = (fields: DeclaredFields, values: PropertyMap): Option.Option<ViolationReason> =>
  checkPrepared(prepareFields(fields), values)

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
  Option.match(index.preparedVertex(label), {
    onNone: () => Option.some(violationOf(op, label, key)(new UndeclaredLabel())),
    onSome: (declaration) =>
      Option.map(
        Option.orElse(checkPrepared(declaration.fields, key), () => checkPrepared(declaration.fields, properties)),
        violationOf(op, label, key),
      ),
  })

const checkEndpoint = (index: DeclarationIndex, ref: VertexRef): Option.Option<DeclarationViolationError> =>
  checkVertexWrite(index, "UpsertEdge", ref.label, ref.key, {})

const declarationOfPair = (
  declarations: ReadonlyArray<PreparedDeclaration<EdgeDeclaration>>,
  edge: UpsertEdge,
): Option.Option<PreparedDeclaration<EdgeDeclaration>> =>
  Array.findFirst(declarations, ({ declaration: { connectivity: [pair] } }) => pair.from === edge.from.label && pair.to === edge.to.label)

const checkEndpoints = (index: DeclarationIndex, edge: UpsertEdge): Option.Option<DeclarationViolationError> =>
  Option.orElse(checkEndpoint(index, edge.from), () => checkEndpoint(index, edge.to))

const checkEdge = (index: DeclarationIndex, edge: UpsertEdge): Option.Option<DeclarationViolationError> => {
  const violation = violationOf("UpsertEdge", edge.label, edge.key)
  const declarations = index.preparedEdges(edge.label)
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
            Option.orElse(checkPrepared(declaration.fields, edge.key), () => checkPrepared(declaration.fields, edge.properties)),
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

/** A writer's own declarations next to the key-only vertex declarations it merely references.
 *
 * A vertex upsert is checked against the own declarations alone, so a referenced label can never be
 * a write target; an edge is checked against both, so a referenced label may be an endpoint. */
export class OwnedDeclarations {
  private constructor(
    readonly written: DeclarationIndex,
    readonly endpoints: DeclarationIndex,
  ) {}

  /** Refuses with `DuplicateDeclarationError` a label declared both as own and as referenced, and
   *  any conflict `DeclarationIndex.fromDeclarations` already refuses. */
  static fromDeclarations(declarations: {
    readonly own: Iterable<Declaration>
    readonly referenced: Iterable<VertexDeclaration>
  }): Result.Result<OwnedDeclarations, DeclarationConflictError> {
    const own = Array.fromIterable(declarations.own)
    return Result.flatMap(DeclarationIndex.fromDeclarations(own), (written) =>
      Result.map(
        DeclarationIndex.fromDeclarations([...own, ...declarations.referenced]),
        (endpoints) => new OwnedDeclarations(written, endpoints),
      ))
  }
}

/** Checks a write against `owned`: a vertex upsert against the own declarations only, an edge
 *  against own plus referenced. */
export const checkOwnedGraphOp =
  (owned: OwnedDeclarations) =>
  (op: GraphOp): Result.Result<GraphOp, DeclarationViolationError> =>
    checkGraphOp(GraphOp.guards.UpsertVertex(op) ? owned.written : owned.endpoints)(op)
