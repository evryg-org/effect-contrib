import { describe, it, expect } from "@effect/vitest"
import { analyzeQuery, type ResolvedColumn, type ResolvedParam } from "./QueryAnalyzer"
import { GraphSchema, NodeProperty, RelProperty } from "./SchemaExtractor"

// ── Schema fixture mimicking a typical analysis graph ──

const schema = new GraphSchema({
  nodeProperties: [
    new NodeProperty({ labels: ["Class"], propertyName: "fqcn", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Class"], propertyName: "namespace", propertyTypes: ["String"], mandatory: false }),
    new NodeProperty({ labels: ["Class"], propertyName: "name", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Class"], propertyName: "file", propertyTypes: ["String"], mandatory: false }),
    new NodeProperty({ labels: ["Class"], propertyName: "source", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Class"], propertyName: "method_count", propertyTypes: ["Long"], mandatory: true }),
    new NodeProperty({ labels: ["Class"], propertyName: "domains", propertyTypes: ["StringArray"], mandatory: false }),
    new NodeProperty({ labels: ["Method"], propertyName: "id", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Method"], propertyName: "name", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Method"], propertyName: "ccn", propertyTypes: ["Long"], mandatory: false }),
    new NodeProperty({ labels: ["Method"], propertyName: "file", propertyTypes: ["String"], mandatory: false }),
    new NodeProperty({ labels: ["Module"], propertyName: "name", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Domain"], propertyName: "name", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Domain"], propertyName: "color", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Entrypoint"], propertyName: "id", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Entrypoint"], propertyName: "type", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Pattern"], propertyName: "id", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Pattern"], propertyName: "category", propertyTypes: ["String"], mandatory: true }),
  ],
  relProperties: [
    new RelProperty({ relType: "BELONGS_TO", propertyName: "role", propertyTypes: ["String"], mandatory: false }),
    new RelProperty({ relType: "HANDLED_BY", propertyName: "role", propertyTypes: ["String"], mandatory: false }),
  ],
})

// ── Helpers ──

const col = (name: string, type: string, nullable: boolean): ResolvedColumn =>
  ({ name, type, nullable }) as ResolvedColumn

const param = (name: string, type: string): ResolvedParam =>
  ({ name, type }) as ResolvedParam

// ── Tests ──

describe("analyzeQuery — RETURN projections", () => {
  it.each([
    {
      label: "direct property access on mandatory field",
      cypher: "MATCH (c:Class) RETURN c.fqcn AS fqcn",
      expectedColumns: [col("fqcn", "String", false)],
    },
    {
      label: "OPTIONAL MATCH makes properties nullable",
      cypher: `MATCH (c:Class)
               OPTIONAL MATCH (c)-[:BELONGS_TO]->(m:Module)
               RETURN m.name AS module`,
      expectedColumns: [col("module", "String", true)],
    },
    {
      label: "Long property infers as Long",
      cypher: "MATCH (c:Class) RETURN c.method_count AS methodCount",
      expectedColumns: [col("methodCount", "Long", false)],
    },
    {
      label: "non-mandatory property is nullable",
      cypher: "MATCH (c:Class) RETURN c.namespace AS namespace",
      expectedColumns: [col("namespace", "String", true)],
    },
    {
      label: "StringArray property",
      cypher: "MATCH (c:Class) RETURN c.domains AS domains",
      expectedColumns: [col("domains", "StringArray", true)],
    },
    {
      label: "DISTINCT does not change types",
      cypher: "MATCH (c:Class) RETURN DISTINCT c.fqcn AS fqcn",
      expectedColumns: [col("fqcn", "String", false)],
    },
    {
      label: "multiple return columns",
      cypher: "MATCH (d:Domain) RETURN d.name AS name, d.color AS color",
      expectedColumns: [col("name", "String", false), col("color", "String", false)],
    },
  ])("$label", ({ cypher, expectedColumns }) => {
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual(expectedColumns)
  })
})

describe("analyzeQuery — aggregate expressions", () => {
  it.each([
    {
      label: "count(*) infers as Long",
      cypher: "MATCH (c:Class) RETURN count(*) AS cnt",
      expectedColumns: [col("cnt", "Long", false)],
    },
    {
      label: "collect(string) infers as StringArray",
      cypher: "MATCH (c:Class) RETURN collect(c.name) AS names",
      expectedColumns: [col("names", "StringArray", false)],
    },
  ])("$label", ({ cypher, expectedColumns }) => {
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual(expectedColumns)
  })
})

describe("analyzeQuery — parameter extraction", () => {
  it.each([
    {
      label: "param in property constraint infers type from schema",
      cypher: "MATCH (c:Class {fqcn: $fqcn}) RETURN c.name AS name",
      expectedParams: [param("fqcn", "String")],
    },
    {
      label: "no params yields empty array",
      cypher: "MATCH (c:Class) RETURN c.fqcn AS fqcn",
      expectedParams: [],
    },
  ])("$label", ({ cypher, expectedParams }) => {
    const result = analyzeQuery(cypher, schema)
    expect(result.params).toEqual(expectedParams)
  })
})

describe("analyzeQuery — WITH rebinding", () => {
  it("tracks variables through WITH clause", () => {
    const cypher = `MATCH (c:Class)
                    WITH c
                    RETURN c.fqcn AS fqcn`
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual([col("fqcn", "String", false)])
  })
})
