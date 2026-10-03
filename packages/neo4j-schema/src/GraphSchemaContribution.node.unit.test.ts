import { describe, expect, it } from "@effect/vitest"
import { Result, Schema } from "effect"
import { AnnotatedGraphSchemas, GraphSchemaContribution } from "./GraphSchemaContribution.js"
import { ContributingModule } from "./GraphVocabulary.js"
import { neo4jEdge, neo4jVertex } from "./Neo4jSchemaAnnotations.js"
import { neo4jVertexMarker } from "./VertexMarker.js"

const vertex = Schema.Struct({ id: Schema.String }).annotate(neo4jVertex("SyntheticVertex"))
const edge = Schema.Struct({ weight: Schema.Number }).annotate(
  neo4jEdge("SYNTHETIC_EDGE", [{ from: vertex, to: vertex }])
)
const unannotated = Schema.Struct({ id: Schema.String })

const contributionOf = (members: ReadonlyArray<Schema.Struct<Schema.Struct.Fields>>): GraphSchemaContribution =>
  new GraphSchemaContribution({
    owner: ContributingModule.make("synthetic_context/synthetic_module"),
    schemas: new AnnotatedGraphSchemas({ members })
  })

describe("GraphSchemaContribution", () => {
  it("holds the vertex and edge schemas its owner declares", () => {
    expect(contributionOf([vertex, edge]).schemas.members).toEqual([vertex, edge])
  })

  it("rejects a schema that declares neither a vertex label nor an edge type", () => {
    expect(() => contributionOf([vertex, unannotated])).toThrow()
  })

  it("rejects a schema naming endpoint pairs but neither a vertex label nor an edge type", () => {
    const typeless = Schema.Struct({ weight: Schema.Number }).annotate({
      neo4jEdgeConnectivity: [{ from: "SyntheticVertex", to: "SyntheticVertex" }]
    })
    expect(Result.isFailure(Schema.decodeUnknownResult(AnnotatedGraphSchemas)({ members: [vertex, typeless] }))).toBe(
      true
    )
  })

  it("rejects, as a typed decoding failure, an edge schema that names no endpoint pair", () => {
    const pairless = Schema.Struct({ weight: Schema.Number }).annotate(neo4jEdge("PAIRLESS_EDGE"))
    const admitted = Schema.decodeUnknownResult(AnnotatedGraphSchemas)({ members: [vertex, pairless] })
    expect(Result.isFailure(admitted)).toBe(true)
    expect(Result.match(admitted, { onFailure: (error) => error.message, onSuccess: () => "" })).toContain(
      "names no endpoint pair"
    )
  })

  it("rejects, as a typed decoding failure, a vertex marker: a marker is a reference, never a declaration", () => {
    const marker = neo4jVertexMarker("SyntheticMarker", { id: Schema.String })
    expect(Result.isFailure(Schema.decodeUnknownResult(AnnotatedGraphSchemas)({ members: [vertex, marker] }))).toBe(
      true
    )
  })
})
