import { expect, it } from "@effect/vitest"
import { Array, Equal, HashMap, Option, Order, Result, Schema, type SchemaAST } from "effect"
import { FastCheck as fc } from "effect/testing"
import { boundedSemilatticeLaws, homomorphismLaw, identityPreservingLaw, simulationLaw } from "../test/Laws.js"
import { contributionOf, few, selected, SyntheticLabel, SyntheticOwner } from "../test/SyntheticContributions.js"
import { AssembledGraphSchema, assembleGraphSchema } from "./AssembledGraphSchema.js"
import type { GraphSchemaContribution } from "./GraphSchemaContribution.js"
import { VertexLabel } from "./GraphVocabulary.js"
import { neo4jVertex } from "./Neo4jSchemaAnnotations.js"
import { SchemaConflict } from "./SchemaConflict.js"
import { VertexAnnotations } from "./VertexAnnotations.js"

const Colour = Schema.Literals(["red", "green", "blue"])
type Colouring = Option.Option<typeof Colour.Type>

const Paint = Schema.Literals([...Colour.literals, "unpainted"])

const colouringOf = Schema.decodeUnknownOption(Colour)

const colourOf = (declaration: SchemaAST.Objects): Colouring => colouringOf(declaration.annotations?.colour)

const colouredVertex = (label: string, colouring: Colouring) =>
  Schema.Struct({ id: Schema.String }).annotate({
    ...neo4jVertex(label, { compositeKey: ["id"] }),
    ...Option.match(colouring, { onNone: () => ({}), onSome: (colour) => ({ colour }) })
  })

const ownedVertices = (owner: typeof SyntheticOwner.Type) =>
  owner === "synthetic/alpha"
    ? [
      colouredVertex("AlphaOne", Option.some("red")),
      colouredVertex("AlphaTwo", Option.none()),
      colouredVertex("AlphaThree", Option.some("green"))
    ]
    : owner === "synthetic/beta"
    ? [colouredVertex("BetaOne", Option.some("blue")), colouredVertex("BetaTwo", Option.some("red"))]
    : [colouredVertex("GammaOne", Option.none())]

const agreeingContributions: fc.Arbitrary<ReadonlyArray<GraphSchemaContribution>> = Schema.toArbitrary(
  few(SyntheticOwner)
).map((owners) => owners.map((owner) => contributionOf(owner, ownedVertices(owner))))

const agreeingSchema = agreeingContributions.map((contributions) =>
  Result.getOrThrow(assembleGraphSchema(contributions))
)

const colours = (schema: AssembledGraphSchema): VertexAnnotations<Colouring> => schema.project(colourOf)

const sameAnnotations = (a: VertexAnnotations<Colouring>, b: VertexAnnotations<Colouring>): void => {
  expect(Equal.equals(a, b)).toBe(true)
}

const annotated = (entries: ReadonlyArray<readonly [string, typeof Paint.Type]>): VertexAnnotations<Colouring> =>
  new VertexAnnotations(
    HashMap.fromIterable(entries.map(([label, paint]) => [VertexLabel.make(label), colouringOf(paint)] as const))
  )

homomorphismLaw({
  name: "project maps combine to the union of the annotations",
  arb: agreeingSchema,
  h: colours,
  opA: (a, b) => Result.getOrThrow(a.combine(b)),
  opB: (a, b) => Result.getOrThrow(a.union(b)),
  eq: sameAnnotations
})

identityPreservingLaw({
  name: "project maps the empty schema to no annotations",
  h: colours,
  idA: AssembledGraphSchema.empty,
  idB: VertexAnnotations.empty<Colouring>(),
  eq: sameAnnotations
})

const projectedColours = (contributions: ReadonlyArray<GraphSchemaContribution>) => {
  const declared: ReadonlyArray<ReadonlyArray<VertexLabel>> = contributions.map((contribution) =>
    Result.getOrThrow(assembleGraphSchema([contribution])).labels()
  )
  return { declared, colours: colours(Result.getOrThrow(assembleGraphSchema(contributions))) }
}

simulationLaw({
  name: "locality: a sub-collection's annotations are the full annotations restricted to the labels it declares",
  arbState: agreeingContributions,
  arbAction: Schema.toArbitrary(Schema.Array(Schema.Boolean)),
  stepConcrete: selected,
  abs: projectedColours,
  stepAbstract: ({ colours: full, declared }, mask) => {
    const kept = selected(declared, mask)
    return { declared: kept, colours: full.restrictedTo(Array.flatten(kept)) }
  },
  eq: (a, b) => {
    expect(a.declared).toEqual(b.declared)
    sameAnnotations(a.colours, b.colours)
  }
})

const LoneVertex = Schema.Struct({ owner: SyntheticOwner, label: SyntheticLabel, paint: Paint })

it("project annotates each declared vertex with what the reader reads off its declaration, and no other label", () => {
  fc.assert(fc.property(Schema.toArbitrary(LoneVertex), ({ label, owner, paint }) => {
    const lone = Result.getOrThrow(
      assembleGraphSchema([contributionOf(owner, [colouredVertex(label, colouringOf(paint))])])
    )
    sameAnnotations(colours(lone), annotated([[label, paint]]))
  }))
})

type United = Result.Result<VertexAnnotations<Colouring>, SchemaConflict>

const united = (a: United, b: United): United =>
  Result.flatMap(a, (left) => Result.flatMap(b, (right) => left.union(right)))

const sameOutcome = (a: United, b: United): void => {
  expect(Result.isFailure(a)).toBe(Result.isFailure(b))
  expect(Equal.equals(Result.getSuccess(a), Result.getSuccess(b))).toBe(true)
}

boundedSemilatticeLaws({
  name: "union of annotations is a bounded semilattice with no annotations, definedness included",
  arb: Schema.toArbitrary(few(Schema.Tuple([SyntheticLabel, Paint]))).map((entries): United =>
    Result.succeed(annotated(entries))
  ),
  op: united,
  id: Result.succeed(VertexAnnotations.empty<Colouring>()),
  eq: sameOutcome
})

const DisputedVertex = Schema.Struct({ label: SyntheticLabel, paints: Schema.Tuple([Paint, Paint]) })

it("two annotations of one label unite exactly when they are equal, and otherwise refuse with a conflict naming the label", () => {
  fc.assert(fc.property(Schema.toArbitrary(DisputedVertex), ({ label, paints: [mine, theirs] }) => {
    expect(annotated([[label, mine]]).union(annotated([[label, theirs]]))).toEqual(
      Equal.equals(colouringOf(mine), colouringOf(theirs))
        ? Result.succeed(annotated([[label, mine]]))
        : Result.fail(SchemaConflict.cases.ConflictingVertexAnnotations.make({ label: VertexLabel.make(label) }))
    )
  }))
})

const IdentifierLabel = Schema.String.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9_]{0,7}$/))

it("a union refusing several labels names the least of them, whatever order they hash in", () => {
  fc.assert(fc.property(Schema.toArbitrary(Schema.NonEmptyArray(IdentifierLabel)), (labels) => {
    const painted = (paint: typeof Paint.Type) => annotated(labels.map((label) => [label, paint] as const))
    expect(painted("red").union(painted("blue"))).toEqual(
      Result.fail(
        SchemaConflict.cases.ConflictingVertexAnnotations.make({
          label: VertexLabel.make(Array.min(labels, Order.String))
        })
      )
    )
  }))
})
