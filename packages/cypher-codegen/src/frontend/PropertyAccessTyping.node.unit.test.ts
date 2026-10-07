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

describe("property access typing — SET", () => {
  it.each([
    "MATCH (p:Person) SET p.salary = $salary",
    "MATCH (p:Person) SET p.name = $name, p.salary = 1 RETURN p.name AS name",
    "MATCH (p:Person) SET p.born = p.salary"
  ])("rejects an undeclared property: %s", (cypher) => rejects(cypher, undeclaredOnPerson))

  it.each([
    "MATCH (p:Person) SET p.born = $born",
    "MATCH (p:Person) SET p:Director RETURN p.name AS name"
  ])("accepts declared properties: %s", accepts)
})

describe("property access typing — ON CREATE SET / ON MATCH SET", () => {
  it.each([
    "MERGE (p:Person {name: $name}) ON CREATE SET p.salary = $salary",
    "MERGE (p:Person {name: $name}) ON MATCH SET p.salary = $salary RETURN p.name AS name",
    "MERGE (p:Person {name: $name}) ON CREATE SET p.born = $born ON MATCH SET p.born = p.salary"
  ])("rejects an undeclared property: %s", (cypher) => rejects(cypher, undeclaredOnPerson))

  it("accepts declared properties", () =>
    accepts("MERGE (p:Person {name: $name}) ON CREATE SET p.born = $born ON MATCH SET p.born = p.born + 1"))
})

describe("property access typing — REMOVE", () => {
  it.each([
    "MATCH (p:Person) REMOVE p.salary",
    "MATCH (p:Person) REMOVE p.born, p.salary RETURN p.name AS name"
  ])("rejects an undeclared property: %s", (cypher) => rejects(cypher, undeclaredOnPerson))

  it.each([
    "MATCH (p:Person) REMOVE p.born",
    "MATCH (p:Person) REMOVE p:Director"
  ])("accepts declared properties: %s", accepts)
})

describe("property access typing — ORDER BY", () => {
  it.each([
    "MATCH (p:Person) RETURN p.name AS name ORDER BY p.salary",
    "MATCH (p:Person) RETURN p.name AS name ORDER BY name, p.salary DESC",
    "MATCH (p:Person) WITH p ORDER BY p.salary LIMIT 10 RETURN p.name AS name"
  ])("rejects an undeclared property: %s", (cypher) => rejects(cypher, undeclaredOnPerson))

  it.each([
    "MATCH (p:Person) RETURN p.name AS name ORDER BY p.born DESC, name",
    "MATCH (p:Person) WITH p.born AS p ORDER BY p RETURN p AS born",
    "MATCH (p:Person), (m:Movie) WITH m AS p ORDER BY p.title RETURN p.title AS title"
  ])("accepts declared properties: %s", accepts)
})

describe("property access typing — CASE", () => {
  it.each([
    "MATCH (p:Person) RETURN CASE WHEN p.salary > 0 THEN 'paid' ELSE 'unpaid' END AS band",
    "MATCH (p:Person) RETURN CASE p.salary WHEN 0 THEN 'none' ELSE 'some' END AS band",
    "MATCH (p:Person) WHERE CASE WHEN p.born > 1970 THEN p.salary ELSE 0 END > 0 RETURN p.name AS name"
  ])("rejects an undeclared property: %s", (cypher) => rejects(cypher, undeclaredOnPerson))

  it("accepts declared properties", () =>
    accepts("MATCH (p:Person) RETURN CASE p.born WHEN 1970 THEN p.name ELSE 'other' END AS band"))
})

describe("property access typing — pattern property maps", () => {
  it.each([
    "MATCH (p:Person {salary: $salary}) RETURN p.name AS name",
    "MATCH (:Person {salary: 1})-[:ACTED_IN]->(m:Movie) RETURN m.title AS title",
    "MATCH (p:Person) MATCH (p {salary: 1}) RETURN p.name AS name",
    "CREATE (p:Person {name: $name, salary: $salary})",
    "MERGE (p:Person {salary: $salary}) RETURN p.name AS name",
    "MATCH (p:Person) WHERE (p)-[:ACTED_IN]->(:Person {salary: 1}) RETURN p.name AS name"
  ])("rejects an undeclared node property: %s", (cypher) => rejects(cypher, undeclaredOnPerson))

  it.each([
    "MATCH (p:Person)-[r:ACTED_IN {salary: 1}]->(m:Movie) RETURN m.title AS title",
    "MATCH (p:Person) CREATE (p)-[:ACTED_IN {salary: 1}]->(:Movie {title: $title})"
  ])(
    "rejects an undeclared relationship property: %s",
    (cypher) => rejects(cypher, "Property 'salary' not found on edge type 'ACTED_IN'")
  )

  it.each([
    "MATCH (p:Person {name: $name})-[r:ACTED_IN {role: $role}]->(m:Movie {released: 1999}) RETURN m.title AS title",
    "MATCH (p:Person $props) RETURN p.name AS name",
    "MATCH (n {anything: 1}) RETURN n.anything AS anything",
    "CREATE (p:Person {name: $name, born: $born})"
  ])("accepts declared properties: %s", accepts)
})

describe("property access typing — comprehensions, quantifiers, reduce and FOREACH", () => {
  it.each([
    "MATCH (p:Person) WITH collect(p) AS people RETURN [x IN people WHERE x.salary > 0 | x.name] AS names",
    "MATCH (p:Person) WITH collect(p) AS people WHERE any(x IN people WHERE x.salary > 0) RETURN size(people) AS n",
    "MATCH (p:Person) WITH collect(p) AS people WHERE reduce(t = 0, x IN people | t + x.salary) > 0 RETURN 1 AS one",
    "MATCH (p:Person) WITH collect(p) AS people FOREACH (x IN people | SET x.salary = 1)"
  ])("rejects an undeclared property on an iterated element: %s", (cypher) => rejects(cypher, undeclaredOnPerson))

  it("rejects an undeclared property on a pattern comprehension element", () =>
    rejects(
      "MATCH (p:Person) WHERE size([(p)-[:ACTED_IN]->(m:Movie) WHERE m.budget > 0 | m.title]) > 0 RETURN p.name AS name",
      undeclaredOnMovie
    ))

  it.each([
    "MATCH (p:Person) WITH collect(p) AS people RETURN [x IN people WHERE x.born > 1970 | x.name] AS names",
    "MATCH (p:Person), (m:Movie) WITH p, collect(m) AS movies RETURN [p IN movies | p.title] AS titles",
    "MATCH (p:Person) WITH collect(p) AS people RETURN reduce(s = '', x IN people | s + x.name) AS names",
    "MATCH (p:Person) WHERE size([(p)-[r:ACTED_IN]->(m:Movie) WHERE m.released > 1999 | r.role]) > 0 RETURN 1 AS one",
    "MATCH (p:Person) RETURN [k IN keys(p) WHERE k <> 'name'] AS others",
    "MATCH (p:Person) WITH collect(p) AS people FOREACH (x IN people | SET x.born = 1970)"
  ])("accepts declared properties: %s", accepts)
})

describe("property access typing — EXISTS and COUNT subqueries", () => {
  it.each([
    "MATCH (p:Person) WHERE EXISTS { MATCH (p)-[:ACTED_IN]->(m:Movie) WHERE m.budget > 0 } RETURN p.name AS name",
    "MATCH (p:Person) WHERE EXISTS { (p)-[:ACTED_IN]->(m:Movie) WHERE m.budget > 0 } RETURN p.name AS name",
    "MATCH (p:Person) WHERE COUNT { MATCH (p)-[:ACTED_IN]->(m:Movie) WHERE m.budget > 0 } > 1 RETURN p.name AS name",
    "MATCH (p:Person) WHERE EXISTS { MATCH (p)-[:ACTED_IN]->(m:Movie) RETURN m.budget AS budget } RETURN p.name AS name"
  ])("rejects an undeclared property on a subquery variable: %s", (cypher) => rejects(cypher, undeclaredOnMovie))

  it.each([
    "MATCH (p:Person) WHERE EXISTS { MATCH (p)-[:ACTED_IN]->(m:Movie) WHERE m.released > p.born } RETURN p.name AS name",
    "MATCH (p:Person) WHERE COUNT { (p)-[r:ACTED_IN]->(:Movie) WHERE r.role = 'lead' } > 1 RETURN p.name AS name"
  ])("accepts declared properties: %s", accepts)
})

describe("property access typing — UNION branches", () => {
  it.each([
    "MATCH (p:Person) RETURN p.name AS name UNION MATCH (p:Person) RETURN p.salary AS name",
    "MATCH (m:Movie) RETURN m.title AS name UNION ALL MATCH (p:Person) WHERE p.salary > 0 RETURN p.name AS name"
  ])("rejects an undeclared property in a later branch: %s", (cypher) => rejects(cypher, undeclaredOnPerson))

  it("accepts a branch rebinding a variable to another label", () =>
    accepts("MATCH (x:Person) RETURN x.name AS name UNION MATCH (x:Movie) RETURN x.title AS name"))
})

describe("property access typing — SET from a map literal", () => {
  it.each([
    "MATCH (p:Person) SET p += {salary: $salary}",
    "MATCH (p:Person) SET p = {name: $name, salary: 1} RETURN p.name AS name",
    "MERGE (p:Person {name: $name}) ON CREATE SET p += {born: $born, salary: $salary}"
  ])("rejects an undeclared property: %s", (cypher) => rejects(cypher, undeclaredOnPerson))

  it.each([
    "MATCH (p:Person) SET p += {born: $born}",
    "MATCH (p:Person) SET p += $props",
    "MATCH (p:Person) SET p = {name: $name, born: 1970}"
  ])("accepts declared properties: %s", accepts)
})
