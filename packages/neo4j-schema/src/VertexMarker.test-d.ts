import { Schema } from "effect"
import { describe, it } from "vitest"
import { AnnotatedGraphSchemas } from "./GraphSchemaContribution.js"
import { neo4jVertex } from "./Neo4jSchemaAnnotations.js"
import { neo4jVertexMarker } from "./VertexMarker.js"

const marker = neo4jVertexMarker("SyntheticMarker", { id: Schema.String })

describe("a vertex marker is a reference, never a declaration", () => {
  it("a contribution refuses a marker among its members", () => {
    // @ts-expect-error -- a leaked marker would assemble as a declaration and shadow the real one.
    void (() => new AnnotatedGraphSchemas({ members: [marker] }))
  })

  it("a contribution still takes a declared vertex", () => {
    new AnnotatedGraphSchemas({
      members: [Schema.Struct({ id: Schema.String }).annotate(neo4jVertex("Declared"))]
    })
  })
})
