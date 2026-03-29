import { describe, it, expect } from "@effect/vitest"
import { analyzeQuery, type ResolvedColumn, type ResolvedParam } from "./QueryAnalyzer"
import { GraphSchema, NodeProperty, RelProperty } from "./SchemaExtractor"
import { ScalarType, ListType, MapType, NullableType, UnknownType, type CypherType } from "./CypherType"

// ── Schema fixture mimicking a typical analysis graph ──

const schema = new GraphSchema({
  nodeProperties: [
    new NodeProperty({ labels: ["Class"], propertyName: "fqcn", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Class"], propertyName: "namespace", propertyTypes: ["String"], mandatory: false }),
    new NodeProperty({ labels: ["Class"], propertyName: "name", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Class"], propertyName: "file", propertyTypes: ["String"], mandatory: false }),
    new NodeProperty({ labels: ["Class"], propertyName: "source", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Class"], propertyName: "method_count", propertyTypes: ["Long"], mandatory: true }),
    new NodeProperty({ labels: ["Class"], propertyName: "kind", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Class"], propertyName: "domains", propertyTypes: ["StringArray"], mandatory: false }),
    new NodeProperty({ labels: ["Class"], propertyName: "isStatic", propertyTypes: ["Boolean"], mandatory: false }),
    new NodeProperty({ labels: ["Method"], propertyName: "id", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Method"], propertyName: "name", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Method"], propertyName: "visibility", propertyTypes: ["String"], mandatory: false }),
    new NodeProperty({ labels: ["Method"], propertyName: "params", propertyTypes: ["StringArray"], mandatory: false }),
    new NodeProperty({ labels: ["Method"], propertyName: "returnType", propertyTypes: ["String"], mandatory: false }),
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

const S = (t: "String" | "Long" | "Double" | "Boolean") => new ScalarType({ scalarType: t })

const col = (name: string, type: CypherType, nullable: boolean): ResolvedColumn =>
  ({ name, type, nullable })

const param = (name: string, type: string): ResolvedParam =>
  ({ name, type }) as ResolvedParam

// ── Tests ──

describe("analyzeQuery — RETURN projections", () => {
  it.each([
    {
      label: "direct property access on mandatory field",
      cypher: "MATCH (c:Class) RETURN c.fqcn AS fqcn",
      expectedColumns: [col("fqcn", S("String"), false)],
    },
    {
      label: "OPTIONAL MATCH makes properties nullable",
      cypher: `MATCH (c:Class)
               OPTIONAL MATCH (c)-[:BELONGS_TO]->(m:Module)
               RETURN m.name AS module`,
      expectedColumns: [col("module", S("String"), true)],
    },
    {
      label: "Long property infers as Long",
      cypher: "MATCH (c:Class) RETURN c.method_count AS methodCount",
      expectedColumns: [col("methodCount", S("Long"), false)],
    },
    {
      label: "non-mandatory property from MATCH is nullable",
      cypher: "MATCH (c:Class) RETURN c.namespace AS namespace",
      expectedColumns: [col("namespace", S("String"), true)],
    },
    {
      label: "non-mandatory StringArray property from MATCH is nullable",
      cypher: "MATCH (c:Class) RETURN c.domains AS domains",
      expectedColumns: [col("domains", ListType(S("String")), true)],
    },
    {
      label: "DISTINCT does not change types",
      cypher: "MATCH (c:Class) RETURN DISTINCT c.fqcn AS fqcn",
      expectedColumns: [col("fqcn", S("String"), false)],
    },
    {
      label: "multiple return columns",
      cypher: "MATCH (d:Domain) RETURN d.name AS name, d.color AS color",
      expectedColumns: [col("name", S("String"), false), col("color", S("String"), false)],
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
      expectedColumns: [col("cnt", S("Long"), false)],
    },
    {
      label: "collect(string) infers as List(String)",
      cypher: "MATCH (c:Class) RETURN collect(c.name) AS names",
      expectedColumns: [col("names", ListType(S("String")), false)],
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
    expect(result.columns).toEqual([col("fqcn", S("String"), false)])
  })

  it.each([
    {
      label: "sum() propagates Long through WITH",
      cypher: `MATCH (c:Class)
               WITH c, sum(c.method_count) AS total
               RETURN total`,
      expectedColumns: [col("total", S("Long"), false)],
    },
    {
      label: "count() propagates Long through WITH",
      cypher: `MATCH (c:Class)
               WITH count(c) AS cnt
               RETURN cnt`,
      expectedColumns: [col("cnt", S("Long"), false)],
    },
    {
      label: "collect(string prop) propagates List(String) through WITH",
      cypher: `MATCH (c:Class)
               WITH collect(c.fqcn) AS names
               RETURN names`,
      expectedColumns: [col("names", ListType(S("String")), false)],
    },
    {
      label: "collect({map}) infers List(Map) through WITH",
      cypher: `MATCH (c:Class)
               WITH collect({name: c.fqcn, count: c.method_count}) AS data
               RETURN data`,
      expectedColumns: [col("data", ListType(MapType([
        { name: "name", value: S("String") },
        { name: "count", value: S("Long") },
      ])), false)],
    },
    {
      label: "coalesce(prop, default) propagates property type through WITH",
      cypher: `MATCH (c:Class)
               WITH coalesce(c.method_count, 0) AS cnt
               RETURN cnt`,
      expectedColumns: [col("cnt", S("Long"), false)],
    },
  ])("$label", ({ cypher, expectedColumns }) => {
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual(expectedColumns)
  })
})

// ── Real Neo4j type strings (e.g. "STRING NOT NULL", "FLOAT NOT NULL") ──

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
      expectedColumns: [col("fqcn", S("String"), false)],
    },
    {
      label: "FLOAT NOT NULL normalizes to Double (non-mandatory in realSchema)",
      cypher: "MATCH (c:Class) RETURN c.method_count AS cnt",
      expectedColumns: [col("cnt", S("Double"), true)],
    },
    {
      label: "LIST<STRING NOT NULL> NOT NULL normalizes to List(String)",
      cypher: "MATCH (c:Class) RETURN c.domains AS domains",
      expectedColumns: [col("domains", ListType(S("String")), false)],
    },
    {
      label: "non-mandatory property from MATCH is nullable",
      cypher: "MATCH (c:Class) RETURN c.name AS name",
      expectedColumns: [col("name", S("String"), true)],
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
      col("name", S("String"), false),
      col("domains", ListType(S("String")), false),
    ])
  })

  it("coalesce(var.prop, defaultVal) makes result non-nullable", () => {
    const cypher = `MATCH (c:Class)
                    RETURN coalesce(c.namespace, 'unknown') AS namespace`
    const result = analyzeQuery(cypher, realSchema)
    expect(result.columns).toEqual([col("namespace", S("String"), false)])
  })
})

describe("analyzeQuery — type(r) expression", () => {
  it("type(r) infers as String", () => {
    const cypher = `MATCH (a:Class)-[r:EXTENDS]->(b:Class)
                    RETURN type(r) AS edgeKind`
    const result = analyzeQuery(cypher, realSchema)
    expect(result.columns).toEqual([col("edgeKind", S("String"), false)])
  })
})

describe("analyzeQuery — collect with map literals", () => {
  it("collect({...}) infers as List(Map(...))", () => {
    const cypher = `MATCH (m:Method)-[:MATCHES]->(p:Pattern)
                    RETURN m.id AS id, collect({pattern_id: p.id}) AS matches`
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual([
      col("id", S("String"), false),
      col("matches", ListType(MapType([
        { name: "pattern_id", value: S("String") },
      ])), false),
    ])
  })

  it("collect(CASE WHEN ... THEN string END) infers as List(String)", () => {
    const cypher = `MATCH (c:Class)
                    RETURN collect(CASE WHEN c.name ENDS WITH 'Controller' THEN c.name END) AS controllers`
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual([col("controllers", ListType(S("String")), false)])
  })
})

describe("analyzeQuery — multi-WITH chain (ClassProfiles pattern)", () => {
  it("resolves types through chained WITH...MATCH...WITH", () => {
    const cypher = `
      MATCH (c:Class)
      OPTIONAL MATCH (m:Method)-[:BELONGS_TO]->(c)
      WITH c,
        collect({visibility: m.visibility, id: m.id}) AS methodProfiles,
        sum(m.ccn) AS totalComplexity
      OPTIONAL MATCH (c)-[:BELONGS_TO]->(mod:Module)
      WITH c, methodProfiles, totalComplexity, mod.name AS moduleName
      RETURN c.fqcn AS fqcn, methodProfiles, totalComplexity, moduleName`
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual([
      col("fqcn", S("String"), false),
      col("methodProfiles", ListType(MapType([
        { name: "visibility", value: NullableType(S("String")) },
        { name: "id", value: S("String") },
      ])), false),
      col("totalComplexity", S("Long"), false),
      col("moduleName", S("String"), true),
    ])
  })
})
