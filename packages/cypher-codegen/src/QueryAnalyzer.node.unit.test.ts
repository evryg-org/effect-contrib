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
      label: "non-mandatory property from MATCH is non-nullable (app enforces writes)",
      cypher: "MATCH (c:Class) RETURN c.namespace AS namespace",
      expectedColumns: [col("namespace", "String", false)],
    },
    {
      label: "StringArray property from MATCH is non-nullable",
      cypher: "MATCH (c:Class) RETURN c.domains AS domains",
      expectedColumns: [col("domains", "StringArray", false)],
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

// ── Real Neo4j type strings (e.g. "STRING NOT NULL", "FLOAT NOT NULL") ──

// Real Neo4j Community Edition schema: no existence constraints (mandatory always false
// except for UNIQUE key properties), but type strings contain NOT NULL.
// The analyzer should treat "NOT NULL" in the type string as non-nullable.
const realSchema = new GraphSchema({
  nodeProperties: [
    new NodeProperty({ labels: ["Class"], propertyName: "fqcn", propertyTypes: ["STRING NOT NULL"], mandatory: true }),
    new NodeProperty({ labels: ["Class"], propertyName: "name", propertyTypes: ["STRING NOT NULL"], mandatory: false }),
    new NodeProperty({ labels: ["Class"], propertyName: "source", propertyTypes: ["STRING NOT NULL"], mandatory: false }),
    new NodeProperty({ labels: ["Class"], propertyName: "namespace", propertyTypes: ["STRING NOT NULL"], mandatory: false }),
    new NodeProperty({ labels: ["Class"], propertyName: "file", propertyTypes: ["STRING NOT NULL"], mandatory: false }),
    new NodeProperty({ labels: ["Class"], propertyName: "method_count", propertyTypes: ["FLOAT NOT NULL"], mandatory: false }),
    new NodeProperty({ labels: ["Class"], propertyName: "domains", propertyTypes: ["LIST<STRING NOT NULL> NOT NULL"], mandatory: true }),
    new NodeProperty({ labels: ["Module"], propertyName: "name", propertyTypes: ["STRING NOT NULL"], mandatory: true }),
    new NodeProperty({ labels: ["Module"], propertyName: "domains", propertyTypes: ["LIST<STRING NOT NULL> NOT NULL"], mandatory: false }),
    new NodeProperty({ labels: ["Method"], propertyName: "id", propertyTypes: ["STRING NOT NULL"], mandatory: true }),
    new NodeProperty({ labels: ["Method"], propertyName: "name", propertyTypes: ["STRING NOT NULL"], mandatory: true }),
    new NodeProperty({ labels: ["Method"], propertyName: "ccn", propertyTypes: ["FLOAT NOT NULL"], mandatory: false }),
    new NodeProperty({ labels: ["Method"], propertyName: "file", propertyTypes: ["STRING NOT NULL"], mandatory: false }),
  ],
  relProperties: [],
})

describe("analyzeQuery — real Neo4j type strings", () => {
  it.each([
    {
      label: "STRING NOT NULL normalizes to String",
      cypher: "MATCH (c:Class) RETURN c.fqcn AS fqcn",
      expectedColumns: [col("fqcn", "String", false)],
    },
    {
      label: "FLOAT NOT NULL normalizes to Double (non-nullable from MATCH)",
      cypher: "MATCH (c:Class) RETURN c.method_count AS cnt",
      expectedColumns: [col("cnt", "Double", false)],
    },
    {
      label: "LIST<STRING NOT NULL> NOT NULL normalizes to StringArray",
      cypher: "MATCH (c:Class) RETURN c.domains AS domains",
      expectedColumns: [col("domains", "StringArray", false)],
    },
    {
      label: "non-mandatory property from MATCH is non-nullable (app owns write side)",
      cypher: "MATCH (c:Class) RETURN c.name AS name",
      expectedColumns: [col("name", "String", false)],
    },
  ])("$label", ({ cypher, expectedColumns }) => {
    const result = analyzeQuery(cypher, realSchema)
    expect(result.columns).toEqual(expectedColumns)
  })
})

describe("analyzeQuery — coalesce wrapping", () => {
  it("coalesce(var.prop, []) preserves the property type", () => {
    const cypher = `MATCH (mod:Module)
                    RETURN mod.name AS name, coalesce(mod.domains, []) AS domains`
    const result = analyzeQuery(cypher, realSchema)
    expect(result.columns).toEqual([
      col("name", "String", false),
      col("domains", "StringArray", false),
    ])
  })

  it("coalesce(var.prop, defaultVal) makes result non-nullable", () => {
    const cypher = `MATCH (c:Class)
                    RETURN coalesce(c.namespace, 'unknown') AS namespace`
    const result = analyzeQuery(cypher, realSchema)
    expect(result.columns).toEqual([col("namespace", "String", false)])
  })
})

describe("analyzeQuery — type(r) expression", () => {
  it("type(r) infers as String", () => {
    const cypher = `MATCH (a:Class)-[r:EXTENDS]->(b:Class)
                    RETURN type(r) AS edgeKind`
    const result = analyzeQuery(cypher, realSchema)
    expect(result.columns).toEqual([col("edgeKind", "String", false)])
  })
})

describe("analyzeQuery — unresolvable complex expressions", () => {
  it("collect({...}) map projection infers as Unknown", () => {
    const cypher = `MATCH (m:Method)-[:MATCHES]->(p:Pattern)
                    RETURN m.id AS id, collect({pattern_id: p.id, ordinal: 1}) AS matches`
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual([
      col("id", "String", false),
      col("matches", "Unknown", false),
    ])
  })

  it("collect without resolvable arg infers as Unknown, not String", () => {
    const cypher = `MATCH (c:Class)
                    RETURN collect(CASE WHEN c.name ENDS WITH 'Controller' THEN c.name END) AS controllers`
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual([col("controllers", "Unknown", false)])
  })
})
