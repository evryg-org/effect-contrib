import { expect, it } from "@effect/vitest"
import { Array, Equal, Function, HashMap, Option, Predicate, Result, Schema } from "effect"
import { FastCheck as fc } from "effect/testing"
import {
  binaryIdempotenceLaw,
  boundedSemilatticeLaws,
  confluenceLaw,
  homomorphismLaw,
  identityPreservingLaw,
  invariantPreservationLaw,
  leftAnnihilationLaw,
  rightAnnihilationLaw,
  simulationLaw
} from "../test/Laws.js"
import {
  agreeingContribution,
  agreeingContributions,
  AgreeingSpec,
  anyContribution,
  anyContributions,
  contributionOf,
  ContributionSpec,
  edgeSchema,
  selected,
  SyntheticEdgeType,
  SyntheticFields,
  SyntheticLabel,
  SyntheticOwner,
  vertexSchema
} from "../test/SyntheticContributions.js"
import { AssembledGraphSchema, assembleGraphSchema } from "./AssembledGraphSchema.js"
import { DdlModel } from "./DdlModel.js"
import { markerLabel } from "./DeclaredGrammar.js"
import { DeclaredVertex } from "./DeclaredVertex.js"
import { EdgeEnds } from "./EdgeSlot.js"
import type { GraphSchemaContribution } from "./GraphSchemaContribution.js"
import { FullTextIndex } from "./GraphSchemaModel.js"
import {
  ContributingModule,
  ContributingModules,
  DeclarationRank,
  EdgeType,
  MemberOrdinal,
  VertexLabel
} from "./GraphVocabulary.js"
import { GraphWriters } from "./GraphWriters.js"
import { compileToCypherDDL } from "./Neo4jSchemaDDL.js"
import { SchemaConflict } from "./SchemaConflict.js"

const RivalSpec = Schema.Struct({ owner: SyntheticOwner, pick: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) })

const SharedSlotSpec = Schema.Struct({
  owners: Schema.Tuple([SyntheticOwner, SyntheticOwner]),
  edgeType: SyntheticEdgeType,
  pair: Schema.Tuple([SyntheticLabel, SyntheticLabel]),
  fields: Schema.Tuple([SyntheticFields, SyntheticFields])
})

const agreeingSchema = agreeingContributions.map((contributions) =>
  Result.getOrThrow(assembleGraphSchema(contributions))
)

const anyAssembly = anyContributions.map(assembleGraphSchema)

type Assembly = Result.Result<AssembledGraphSchema, SchemaConflict>

const combined = (a: Assembly, b: Assembly): Assembly =>
  Result.flatMap(a, (left) => Result.flatMap(b, (right) => left.combine(right)))

const combinedAgreeing = (a: AssembledGraphSchema, b: AssembledGraphSchema): AssembledGraphSchema =>
  Result.getOrThrow(a.combine(b))

const sameSchema = (a: AssembledGraphSchema, b: AssembledGraphSchema): void => {
  expect(Equal.equals(a, b)).toBe(true)
}

const sameOutcome = (a: Assembly, b: Assembly): void => {
  expect(Result.isFailure(a)).toBe(Result.isFailure(b))
  expect(Equal.equals(Result.getSuccess(a), Result.getSuccess(b))).toBe(true)
}

const sameAssembly = (a: ReadonlyArray<GraphSchemaContribution>, b: ReadonlyArray<GraphSchemaContribution>): void => {
  expect(Equal.equals(assembleGraphSchema(a), assembleGraphSchema(b))).toBe(true)
}

const plantedConflict = assembleGraphSchema([
  contributionOf("synthetic/alpha", [
    vertexSchema({ label: "Alpha", noted: false, coded: false, partition: "None", compositeIndexes: [], fullText: [] })
  ]),
  contributionOf("synthetic/beta", [
    vertexSchema({ label: "Alpha", noted: false, coded: false, partition: "None", compositeIndexes: [], fullText: [] })
  ])
])

boundedSemilatticeLaws({
  name: "L1-L4 combine over agreeing contributions is a bounded semilattice with the empty schema",
  arb: agreeingSchema,
  op: combinedAgreeing,
  id: AssembledGraphSchema.empty,
  eq: sameSchema
})

boundedSemilatticeLaws({
  name: "L1-L4 combine stays a bounded semilattice once conflicts are drawn, definedness included",
  arb: anyAssembly,
  op: combined,
  id: Result.succeed(AssembledGraphSchema.empty),
  eq: sameOutcome
})

binaryIdempotenceLaw({
  name: "L4 the same contributions twice assemble exactly as once",
  arb: anyContributions,
  op: (a, b) => [...a, ...b],
  eq: sameAssembly
})

leftAnnihilationLaw({
  name: "L5 a conflict absorbs whatever it is combined with",
  arb: anyAssembly,
  op: combined,
  zero: plantedConflict,
  eq: sameOutcome
})

rightAnnihilationLaw({
  name: "L5 a conflict absorbs whatever it is combined with",
  arb: anyAssembly,
  op: combined,
  zero: plantedConflict,
  eq: sameOutcome
})

confluenceLaw({
  name: "L6 the assembly, and the conflict it reports, do not depend on the order contributions arrive in",
  arbState: anyContributions,
  arbAction: Schema.toArbitrary(ContributionSpec).map(anyContribution),
  step: (contributions, contribution) => [...contributions, contribution],
  eq: sameAssembly
})

const conflicted = (contributions: ReadonlyArray<GraphSchemaContribution>): boolean =>
  Result.isFailure(assembleGraphSchema(contributions))

simulationLaw({
  name: "L6 conflict detection is complete: an assembly fails exactly when two of its contributions disagree",
  arbState: anyContributions,
  arbAction: Schema.toArbitrary(ContributionSpec).map(anyContribution),
  stepConcrete: (contributions, contribution) => [...contributions, contribution],
  abs: (contributions) => ({ seen: contributions, conflicted: conflicted(contributions) }),
  stepAbstract: ({ conflicted: already, seen }, contribution) => ({
    seen: [...seen, contribution],
    conflicted: already || conflicted([contribution]) ||
      Array.some(seen, (earlier) => conflicted([earlier, contribution]))
  }),
  eq: (a, b) => {
    expect(a.conflicted).toBe(b.conflicted)
  }
})

homomorphismLaw({
  name: "L7 ddlModel maps combine to the union of the DDL models",
  arb: agreeingSchema,
  h: (schema) => schema.ddlModel(),
  opA: combinedAgreeing,
  opB: (a, b) => a.union(b),
  eq: (a, b) => {
    expect(Equal.equals(a, b)).toBe(true)
  }
})

identityPreservingLaw({
  name: "L7 ddlModel maps the empty schema to the empty DDL model",
  h: (schema: AssembledGraphSchema) => schema.ddlModel(),
  idA: AssembledGraphSchema.empty,
  idB: DdlModel.of([]),
  eq: (a, b) => {
    expect(Equal.equals(a, b)).toBe(true)
  }
})

confluenceLaw({
  name: "L9 the canonical DDL render does not depend on the order contributions arrive in",
  arbState: agreeingContributions,
  arbAction: Schema.toArbitrary(AgreeingSpec).map(agreeingContribution),
  step: (contributions, contribution) => [...contributions, contribution],
  eq: (a, b) => {
    expect(Result.getOrThrow(assembleGraphSchema(a)).ddl()).toBe(Result.getOrThrow(assembleGraphSchema(b)).ddl())
  }
})

const declaredVertices = ({ owner, schemas }: GraphSchemaContribution): ReadonlyArray<DeclaredVertex> =>
  Array.filterMap(schemas.members, (member, ordinal) =>
    Predicate.isString(member.ast.annotations?.neo4jLabel)
      ? Result.succeed(
        new DeclaredVertex({
          label: VertexLabel.make(markerLabel(member)),
          rank: new DeclarationRank({ owner, ordinal: MemberOrdinal.make(ordinal) }),
          declaration: member.ast
        })
      )
      : Result.failVoid)

const inDeclarationRank = (contributions: ReadonlyArray<GraphSchemaContribution>): Array<Schema.Top> =>
  Array.dedupeWith(
    Array.sort(contributions.flatMap(declaredVertices), DeclaredVertex.order),
    (a: DeclaredVertex, b: DeclaredVertex) => a.label === b.label
  ).map((vertex) => Schema.make(vertex.declaration))

it("L10 refinement: the canonical render is compileToCypherDDL over the declared vertices in declaration-rank order", () => {
  fc.assert(fc.property(fc.oneof(agreeingContributions, anyContributions), (contributions) => {
    const assembled = assembleGraphSchema(contributions)
    fc.pre(Result.isSuccess(assembled))
    expect(Result.getOrThrow(assembled).ddl()).toBe(compileToCypherDDL(inDeclarationRank(contributions)))
  }))
})

const fullTextWithin = (
  indexes: ReadonlyArray<FullTextIndex>,
  labels: ReadonlyArray<VertexLabel>
): ReadonlyArray<FullTextIndex> =>
  Array.filterMap(indexes, (index) =>
    Array.match(Array.intersection(index.labels, labels), {
      onEmpty: () => Result.failVoid,
      onNonEmpty: (kept) => Result.succeed(new FullTextIndex({ name: index.name, labels: kept, fields: index.fields }))
    }))

const projected = (contributions: ReadonlyArray<GraphSchemaContribution>) => {
  const model = Result.getOrThrow(assembleGraphSchema(contributions)).ddlModel()
  const declared: ReadonlyArray<ReadonlyArray<VertexLabel>> = contributions.map((contribution) =>
    Result.getOrThrow(assembleGraphSchema([contribution])).labels()
  )
  return {
    declared,
    model,
    fullText: model.fullTextIndexes()
  }
}

simulationLaw({
  name:
    "L8 locality: a sub-collection's DDL model is the full model restricted to the labels it declares, fulltext intersected",
  arbState: agreeingContributions,
  arbAction: Schema.toArbitrary(Schema.Array(Schema.Boolean)),
  stepConcrete: selected,
  abs: projected,
  stepAbstract: ({ declared, fullText, model }, mask) => {
    const kept = selected(declared, mask)
    return {
      declared: kept,
      model: model.restrictedTo(Array.flatten(kept)),
      fullText: fullTextWithin(fullText, Array.flatten(kept))
    }
  },
  eq: (a, b) => {
    expect(a.declared).toEqual(b.declared)
    expect(Equal.equals(a.model, b.model)).toBe(true)
    expect(a.fullText).toEqual(b.fullText)
  }
})

const writtenByTheirDeclarers = (contributions: ReadonlyArray<GraphSchemaContribution>): boolean =>
  Result.match(assembleGraphSchema(contributions), {
    onFailure: Function.constTrue,
    onSuccess: (schema) => {
      const writers = schema.writers()
      return contributions.every((contribution) =>
        Equal.equals(
          writers.union(Result.getOrThrow(assembleGraphSchema([contribution])).writers()),
          Option.some(writers)
        )
      )
    }
  })

const redeclaredBy =
  ({ owner, pick }: typeof RivalSpec.Type) =>
  (contributions: ReadonlyArray<GraphSchemaContribution>): GraphSchemaContribution =>
    contributionOf(
      owner,
      Array.match(contributions.flatMap((contribution) => contribution.schemas.members), {
        onEmpty: () => [],
        onNonEmpty: (members) => [members[pick % members.length]]
      })
    )

const contributing: fc.Arbitrary<(contributions: ReadonlyArray<GraphSchemaContribution>) => GraphSchemaContribution> =
  fc.oneof(
    Schema.toArbitrary(ContributionSpec).map((spec) => Function.constant(anyContribution(spec))),
    Schema.toArbitrary(RivalSpec).map(redeclaredBy)
  )

invariantPreservationLaw({
  name:
    "single writer: a successful assembly gives each label and slot the one owner of every contribution declaring it",
  arbState: fc.oneof(anyContributions, agreeingContributions),
  arbAction: contributing,
  inv: writtenByTheirDeclarers,
  step: (contributions, contribute) => [...contributions, contribute(contributions)]
})

it("single writer: two modules declaring one edge slot are refused as sharing it, whatever their fields", () => {
  fc.assert(
    fc.property(
      Schema.toArbitrary(SharedSlotSpec),
      ({ edgeType, fields, owners: [first, second], pair: [from, to] }) => {
        fc.pre(first !== second)
        const declaring = (owner: string, declared: typeof SyntheticFields.Type) =>
          contributionOf(owner, [edgeSchema({ edgeType, pairs: [[from, to]], fields: declared })])
        expect(Result.getFailure(assembleGraphSchema([declaring(first, fields[0]), declaring(second, fields[1])])))
          .toEqual(
            Option.some(SchemaConflict.cases.SharedEdgeSlot.make({
              edgeType: EdgeType.make(edgeType),
              ends: new EdgeEnds({ from: VertexLabel.make(from), to: VertexLabel.make(to) }),
              owners: ContributingModules.of([ContributingModule.make(first), ContributingModule.make(second)])
            }))
          )
      }
    )
  )
})

const unitedWriters = (a: GraphWriters, b: GraphWriters): GraphWriters => Option.getOrThrow(a.union(b))

homomorphismLaw({
  name: "writers maps combine to the union of the owner maps",
  arb: agreeingSchema,
  h: (schema) => schema.writers(),
  opA: combinedAgreeing,
  opB: unitedWriters,
  eq: (a, b) => {
    expect(Equal.equals(a, b)).toBe(true)
  }
})

identityPreservingLaw({
  name: "writers maps the empty schema to no owners",
  h: (schema: AssembledGraphSchema) => schema.writers(),
  idA: AssembledGraphSchema.empty,
  idB: GraphWriters.of(HashMap.empty(), HashMap.empty()),
  eq: (a, b) => {
    expect(Equal.equals(a, b)).toBe(true)
  }
})
