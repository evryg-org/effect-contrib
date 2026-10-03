import { describe, expect, it } from "@effect/vitest"
import { Record, Schema } from "effect"
import { markerLabel } from "./DeclaredGrammar.js"
import { neo4jKeyGroup, neo4jPartition, neo4jVertexStruct } from "./Neo4jSchemaVertex.js"
import { neo4jVertexMarker } from "./VertexMarker.js"

describe("a vertex marker's key group", () => {
  it("keys the vertex declaring the marker's label by its partition's key fields, then the marker's", () => {
    const marker = neo4jVertexMarker("Alpha", neo4jKeyGroup({ id: Schema.String, slot: Schema.Number }))
    const vertex = neo4jVertexStruct(markerLabel(marker), {
      fields: {},
      partition: neo4jPartition({ tenant_id: Schema.String }),
      key: marker.key
    })
    expect(vertex.ast.annotations?.neo4jLabel).toBe("Alpha")
    expect(vertex.ast.annotations?.compositeKey).toEqual(["tenant_id", "id", "slot"])
    expect(Record.keys(vertex.fields)).toEqual(["tenant_id", "id", "slot"])
  })
})
