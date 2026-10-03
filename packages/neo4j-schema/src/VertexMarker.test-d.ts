import { Schema } from "effect"
import { describe, it } from "vitest"
import { AssembledGraphSchema } from "./AssembledGraphSchema.js"
import { markerLabel } from "./DeclaredGrammar.js"
import { AnnotatedGraphSchemas } from "./GraphSchemaContribution.js"
import { neo4jVertex } from "./Neo4jSchemaAnnotations.js"
import { neo4jKeyGroup, neo4jPartition, neo4jVertexStruct } from "./Neo4jSchemaVertex.js"
import { neo4jVertexMarker } from "./VertexMarker.js"

const marker = neo4jVertexMarker("SyntheticMarker", neo4jKeyGroup({ id: Schema.String }))

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

  it("a marker keys the vertex that declares it through its key group", () => {
    neo4jVertexStruct(markerLabel(marker), {
      fields: {},
      partition: neo4jPartition({ tenant_id: Schema.String }),
      key: marker.key
    })
  })

  it("a write check takes markers keyed by different key groups", () => {
    AssembledGraphSchema.empty.writeCheck([
      marker,
      neo4jVertexMarker("OtherMarker", neo4jKeyGroup({ slot: Schema.Number }))
    ])
  })

  it("a marker refuses unchecked key fields: only a key group names its key", () => {
    // @ts-expect-error -- raw fields skip the required, non-nullable check a key group carries.
    void (() => neo4jVertexMarker("Unchecked", { id: Schema.String }))
  })
})
