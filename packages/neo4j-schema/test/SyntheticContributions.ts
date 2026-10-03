import { Array, Function, Option, Record, Schema } from "effect"
import type { FastCheck as fc } from "effect/testing"
import { AnnotatedGraphSchemas, GraphSchemaContribution } from "../src/GraphSchemaContribution.js"
import { ContributingModule } from "../src/GraphVocabulary.js"
import { neo4jEdge, neo4jIndexed, neo4jUnique, neo4jVertex } from "../src/Neo4jSchemaAnnotations.js"

export const SyntheticOwner = Schema.Literals(["synthetic/alpha", "synthetic/beta", "synthetic/gamma"])
export const SyntheticLabel = Schema.Literals(["Alpha", "Beta", "Gamma"])
export const SyntheticEdgeType = Schema.Literals(["LINKS", "OWNS"])
const SyntheticProperty = Schema.Literals(["weight", "note"])
const SyntheticVertexProperty = Schema.Literals(["id", "name", "code"])
const SyntheticKind = Schema.Literals(["text", "count"])
const SyntheticIndex = Schema.Literals(["synthetic_search", "synthetic_path"])
const SyntheticSlot = Schema.Literals([0, 1, 2])
const SyntheticPartition = Schema.Literals(["Tenant", "Revision", "Batch", "None"])
type SyntheticPartition = typeof SyntheticPartition.Type

export const few = <S extends Schema.Top>(item: S) => Schema.Array(item).check(Schema.isMaxLength(3))

const keyField = Schema.String.annotate(neo4jIndexed)

const keyedBy = {
  Tenant: { fields: { tenant_id: keyField }, keyFields: ["tenant_id"] },
  Revision: { fields: { tenant_id: keyField, revision_id: keyField }, keyFields: ["tenant_id", "revision_id"] },
  Batch: { fields: { batch_id: keyField }, keyFields: ["batch_id"] },
  None: { fields: {}, keyFields: [] }
} as const

const VertexSpec = Schema.Struct({
  label: SyntheticLabel,
  noted: Schema.Boolean,
  coded: Schema.Boolean,
  partition: SyntheticPartition,
  compositeIndexes: few(few(SyntheticVertexProperty)),
  fullText: few(Schema.Struct({ index: SyntheticIndex, fields: few(SyntheticProperty) }))
})

export const SyntheticFields = few(Schema.Tuple([SyntheticProperty, SyntheticKind]))

const EdgeSpec = Schema.Struct({
  edgeType: SyntheticEdgeType,
  pairs: Schema.NonEmptyArray(Schema.Tuple([SyntheticLabel, SyntheticLabel])).check(Schema.isMaxLength(3)),
  fields: SyntheticFields
})

export const ContributionSpec = Schema.Struct({
  owner: SyntheticOwner,
  vertices: few(VertexSpec),
  edges: few(EdgeSpec)
})

const OwnedLabel = Schema.Struct({ owner: SyntheticOwner, slot: SyntheticSlot })

export const AgreeingSpec = Schema.Struct({
  owner: SyntheticOwner,
  edges: few(Schema.Struct({ edgeType: SyntheticEdgeType, from: SyntheticSlot, to: OwnedLabel }))
})

interface VertexShape {
  readonly label: string
  readonly noted: boolean
  readonly coded: boolean
  readonly partition: SyntheticPartition
  readonly compositeIndexes: ReadonlyArray<ReadonlyArray<string>>
  readonly fullText: ReadonlyArray<{ readonly index: string; readonly fields: ReadonlyArray<string> }>
}

interface EdgeShape {
  readonly edgeType: string
  readonly pairs: ReadonlyArray<readonly [string, string]>
  readonly fields: ReadonlyArray<readonly [string, typeof SyntheticKind.Type]>
}

const endpoint = (label: string) => Schema.Struct({}).annotate(neo4jVertex(label))

export const vertexSchema = (spec: VertexShape) =>
  Schema.Struct({
    ...keyedBy[spec.partition].fields,
    id: Schema.String.annotate(neo4jIndexed),
    name: Schema.String,
    ...(spec.noted ? { note: Schema.optional(Schema.String) } : {}),
    ...(spec.coded ? { code: Schema.String.annotate(neo4jUnique) } : {})
  }).annotate(neo4jVertex(spec.label, {
    compositeKey: [...keyedBy[spec.partition].keyFields, "id"],
    compositeIndexes: spec.compositeIndexes.map((fields) => [...fields]),
    fullTextIndexes: spec.fullText.map(({ fields, index }) => ({ name: index, fields: [...fields] }))
  }))

const fieldOfKind = (kind: typeof SyntheticKind.Type): Schema.Top =>
  kind === "text" ? Schema.optional(Schema.String) : Schema.Number

export const edgeSchema = (spec: EdgeShape) =>
  Schema.Struct(Record.fromEntries(spec.fields.map(([property, kind]) => [property, fieldOfKind(kind)])))
    .annotate(neo4jEdge(spec.edgeType, spec.pairs.map(([from, to]) => ({ from: endpoint(from), to: endpoint(to) }))))

export const contributionOf = (
  owner: string,
  members: ReadonlyArray<Schema.Struct<Schema.Struct.Fields>>
): GraphSchemaContribution =>
  new GraphSchemaContribution({
    owner: ContributingModule.make(owner),
    schemas: new AnnotatedGraphSchemas({ members })
  })

export const anyContribution = (spec: typeof ContributionSpec.Type): GraphSchemaContribution =>
  contributionOf(spec.owner, [...spec.vertices.map(vertexSchema), ...spec.edges.map(edgeSchema)])

const ownedLabel = ({ owner, slot }: typeof OwnedLabel.Type): string =>
  `${owner === "synthetic/alpha" ? "Alpha" : owner === "synthetic/beta" ? "Beta" : "Gamma"}${
    ["One", "Two", "Three"][slot]
  }`

const ownedPartition = ({ owner, slot }: typeof OwnedLabel.Type): SyntheticPartition =>
  owner === "synthetic/alpha"
    ? (["Revision", "Batch", "None"] as const)[slot]
    : owner === "synthetic/beta"
    ? (["Tenant", "Revision", "None"] as const)[slot]
    : (["Batch", "None", "None"] as const)[slot]

const agreeingVertex = (label: typeof OwnedLabel.Type) =>
  vertexSchema({
    label: ownedLabel(label),
    noted: label.slot === 1,
    coded: label.slot === 0,
    partition: ownedPartition(label),
    compositeIndexes: label.slot === 2 ? [["name", "id"]] : [],
    fullText: [
      ...(label.slot < 2 ? [{ index: "synthetic_search", fields: ["name"] }] : []),
      ...(label.slot === 1 ? [{ index: "synthetic_path", fields: ["id", "name"] }] : [])
    ]
  })

const ownedSlots = (owner: typeof SyntheticOwner.Type): ReadonlyArray<typeof SyntheticSlot.Type> =>
  owner === "synthetic/alpha" ? [0, 1, 2] : owner === "synthetic/beta" ? [0, 1] : [0]

export const agreeingContribution = (spec: typeof AgreeingSpec.Type): GraphSchemaContribution =>
  contributionOf(spec.owner, [
    ...ownedSlots(spec.owner).map((slot) => agreeingVertex({ owner: spec.owner, slot })),
    ...spec.edges.map(({ edgeType, from, to }) =>
      edgeSchema({
        edgeType,
        pairs: [[ownedLabel({ owner: spec.owner, slot: from }), ownedLabel(to)]],
        fields: edgeType === "LINKS" ? [["weight", "count"]] : [["note", "text"]]
      })
    )
  ])

export const agreeingContributions: fc.Arbitrary<ReadonlyArray<GraphSchemaContribution>> = Schema.toArbitrary(
  few(AgreeingSpec)
).map((specs) => specs.map(agreeingContribution))

export const anyContributions: fc.Arbitrary<ReadonlyArray<GraphSchemaContribution>> = Schema.toArbitrary(
  few(ContributionSpec)
).map((specs) => specs.map(anyContribution))

export const selected = <A>(items: ReadonlyArray<A>, mask: ReadonlyArray<boolean>): ReadonlyArray<A> =>
  Array.filter(items, (_, at) => Option.getOrElse(Array.get(mask, at), Function.constFalse))
