import { describe, expect, it } from "@effect/vitest"
import { EdgeConnectivity, EdgeProperty, GraphSchema, VertexProperty } from "@evryg/effect-neo4j-schema"
import { analyzeQuery } from "./QueryAnalyzer.js"

const schema = new GraphSchema({
  vertexProperties: [
    new VertexProperty({ labels: ["Person"], propertyName: "name", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Person"], propertyName: "born", propertyTypes: ["Long"], mandatory: false }),
    new VertexProperty({ labels: ["Movie"], propertyName: "title", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Movie"], propertyName: "released", propertyTypes: ["Long"], mandatory: false })
  ],
  edgeProperties: [
    new EdgeProperty({ edgeType: "ACTED_IN", propertyName: "role", propertyTypes: ["String"], mandatory: false })
  ],
  edgeConnectivity: [
    new EdgeConnectivity({ edgeType: "ACTED_IN", fromLabel: "Person", toLabel: "Movie" })
  ]
})

const undeclaredOnPerson = "Property 'salary' not found on label 'Person'"
const undeclaredOnMovie = "Property 'budget' not found on label 'Movie'"

const rejects = (cypher: string, message: string) => expect(() => analyzeQuery(cypher, schema)).toThrow(message)
const accepts = (cypher: string) => expect(() => analyzeQuery(cypher, schema)).not.toThrow()

describe("property access typing — WHERE", () => {
  it.each([
    "MATCH (p:Person) WHERE p.salary = $salary RETURN p.name AS name",
    "OPTIONAL MATCH (p:Person) WHERE p.salary IS NOT NULL RETURN p.name AS name",
    "MATCH (p:Person) WITH p WHERE p.salary > 0 RETURN p.name AS name",
    "MATCH (p:Person) WHERE toUpper(p.salary) STARTS WITH 'A' RETURN p.name AS name"
  ])("rejects an undeclared property: %s", (cypher) => rejects(cypher, undeclaredOnPerson))

  it.each([
    "MATCH (p:Person) WHERE p.name = $name AND p.born > 1970 RETURN p.name AS name",
    "MATCH (p:Person) WITH p.name AS name WHERE name STARTS WITH 'A' RETURN name"
  ])("accepts declared properties: %s", accepts)
})
