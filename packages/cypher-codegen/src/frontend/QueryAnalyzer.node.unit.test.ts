import { describe, it, expect } from "@effect/vitest"
import { analyzeQuery, type ResolvedColumn, type ResolvedParam } from "./QueryAnalyzer"
import { GraphSchema, VertexProperty, EdgeProperty, EdgeConnectivity } from "@/lib/effect-neo4j-schema/GraphSchemaModel"
import { ScalarType, ListType, MapType, NullableType, VertexUnionType, UnknownType, type CypherType } from "../types/CypherType"

// ── Schema fixture mimicking a typical analysis graph ──

const schema = new GraphSchema({
  vertexProperties: [
    new VertexProperty({ labels: ["Class"], propertyName: "fqcn", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Class"], propertyName: "namespace", propertyTypes: ["String"], mandatory: false }),
    new VertexProperty({ labels: ["Class"], propertyName: "name", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Class"], propertyName: "file", propertyTypes: ["String"], mandatory: false }),
    new VertexProperty({ labels: ["Class"], propertyName: "source", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Class"], propertyName: "method_count", propertyTypes: ["Long"], mandatory: true }),
    new VertexProperty({ labels: ["Class"], propertyName: "kind", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Class"], propertyName: "subdomains", propertyTypes: ["StringArray"], mandatory: false }),
    new VertexProperty({ labels: ["Class"], propertyName: "isStatic", propertyTypes: ["Boolean"], mandatory: false }),
    new VertexProperty({ labels: ["Method"], propertyName: "id", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Method"], propertyName: "name", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Method"], propertyName: "visibility", propertyTypes: ["String"], mandatory: false }),
    new VertexProperty({ labels: ["Method"], propertyName: "params", propertyTypes: ["StringArray"], mandatory: false }),
    new VertexProperty({ labels: ["Method"], propertyName: "returnType", propertyTypes: ["String"], mandatory: false }),
    new VertexProperty({ labels: ["Method"], propertyName: "ccn", propertyTypes: ["Long"], mandatory: false }),
    new VertexProperty({ labels: ["Method"], propertyName: "file", propertyTypes: ["String"], mandatory: false }),
    new VertexProperty({ labels: ["Module"], propertyName: "name", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Subdomain"], propertyName: "name", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Subdomain"], propertyName: "color", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Entrypoint"], propertyName: "id", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Entrypoint"], propertyName: "type", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Pattern"], propertyName: "id", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Pattern"], propertyName: "category", propertyTypes: ["String"], mandatory: true }),
  ],
  edgeProperties: [
    new EdgeProperty({ edgeType: "BELONGS_TO", propertyName: "role", propertyTypes: ["String"], mandatory: false }),
    new EdgeProperty({ edgeType: "HANDLED_BY", propertyName: "role", propertyTypes: ["String"], mandatory: false }),
    new EdgeProperty({ edgeType: "CALLS", propertyName: "confidence", propertyTypes: ["String"], mandatory: true }),
    new EdgeProperty({ edgeType: "CALLS", propertyName: "edge_count", propertyTypes: ["Double"], mandatory: true }),
    new EdgeProperty({ edgeType: "CALLS", propertyName: "reason", propertyTypes: ["String"], mandatory: true }),
    new EdgeProperty({ edgeType: "IMPORTS", propertyName: "mechanism", propertyTypes: ["String"], mandatory: true }),
    new EdgeProperty({ edgeType: "EXTENDS", propertyName: "confidence", propertyTypes: ["String"], mandatory: true }),
    new EdgeProperty({ edgeType: "EXTENDS", propertyName: "edge_count", propertyTypes: ["Double"], mandatory: true }),
    new EdgeProperty({ edgeType: "EXTENDS", propertyName: "reason", propertyTypes: ["String"], mandatory: true }),
    new EdgeProperty({ edgeType: "IMPLEMENTS", propertyName: "confidence", propertyTypes: ["String"], mandatory: true }),
    new EdgeProperty({ edgeType: "IMPLEMENTS", propertyName: "edge_count", propertyTypes: ["Double"], mandatory: true }),
    new EdgeProperty({ edgeType: "IMPLEMENTS", propertyName: "reason", propertyTypes: ["String"], mandatory: true }),
    new EdgeProperty({ edgeType: "USES", propertyName: "confidence", propertyTypes: ["String"], mandatory: true }),
    new EdgeProperty({ edgeType: "USES", propertyName: "edge_count", propertyTypes: ["Double"], mandatory: true }),
    new EdgeProperty({ edgeType: "USES", propertyName: "reason", propertyTypes: ["String"], mandatory: true }),
    new EdgeProperty({ edgeType: "EVIDENCED_BY", propertyName: "role", propertyTypes: ["String"], mandatory: true }),
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
      cypher: "MATCH (c:Class) RETURN c.subdomains AS subdomains",
      expectedColumns: [col("subdomains", ListType(S("String")), true)],
    },
    {
      label: "DISTINCT does not change types",
      cypher: "MATCH (c:Class) RETURN DISTINCT c.fqcn AS fqcn",
      expectedColumns: [col("fqcn", S("String"), false)],
    },
    {
      label: "multiple return columns",
      cypher: "MATCH (d:Subdomain) RETURN d.name AS name, d.color AS color",
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
    {
      label: "param in WHERE IN clause infers StringArray from property type",
      cypher: "MATCH (c:Class) WHERE c.fqcn IN $ids RETURN c.fqcn AS fqcn",
      expectedParams: [param("ids", "StringArray")],
    },
    {
      label: "param in WHERE IN with Long property infers LongArray",
      cypher: "MATCH (c:Class) WHERE c.method_count IN $counts RETURN c.fqcn AS fqcn",
      expectedParams: [param("counts", "LongArray")],
    },
    {
      label: "param in WHERE IN with multiple params",
      cypher: "MATCH (c:Class) WHERE c.fqcn IN $ids AND c.name IN $names RETURN c.fqcn AS fqcn",
      expectedParams: [param("ids", "StringArray"), param("names", "StringArray")],
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
  vertexProperties: [
    new VertexProperty({ labels: ["Class"], propertyName: "fqcn", propertyTypes: ["STRING NOT NULL"], mandatory: true }),
    new VertexProperty({ labels: ["Class"], propertyName: "name", propertyTypes: ["STRING NOT NULL"], mandatory: false }),
    new VertexProperty({ labels: ["Class"], propertyName: "source", propertyTypes: ["STRING NOT NULL"], mandatory: false }),
    new VertexProperty({ labels: ["Class"], propertyName: "namespace", propertyTypes: ["STRING NOT NULL"], mandatory: false }),
    new VertexProperty({ labels: ["Class"], propertyName: "file", propertyTypes: ["STRING NOT NULL"], mandatory: false }),
    new VertexProperty({ labels: ["Class"], propertyName: "method_count", propertyTypes: ["FLOAT NOT NULL"], mandatory: false }),
    new VertexProperty({ labels: ["Class"], propertyName: "subdomains", propertyTypes: ["LIST<STRING NOT NULL> NOT NULL"], mandatory: true }),
    new VertexProperty({ labels: ["Module"], propertyName: "name", propertyTypes: ["STRING NOT NULL"], mandatory: true }),
    new VertexProperty({ labels: ["Module"], propertyName: "subdomains", propertyTypes: ["LIST<STRING NOT NULL> NOT NULL"], mandatory: false }),
    new VertexProperty({ labels: ["Method"], propertyName: "id", propertyTypes: ["STRING NOT NULL"], mandatory: true }),
    new VertexProperty({ labels: ["Method"], propertyName: "name", propertyTypes: ["STRING NOT NULL"], mandatory: true }),
    new VertexProperty({ labels: ["Method"], propertyName: "ccn", propertyTypes: ["FLOAT NOT NULL"], mandatory: false }),
    new VertexProperty({ labels: ["Method"], propertyName: "file", propertyTypes: ["STRING NOT NULL"], mandatory: false }),
  ],
  edgeProperties: [],
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
      cypher: "MATCH (c:Class) RETURN c.subdomains AS subdomains",
      expectedColumns: [col("subdomains", ListType(S("String")), false)],
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
                    RETURN mod.name AS name, coalesce(mod.subdomains, []) AS subdomains`
    const result = analyzeQuery(cypher, realSchema)
    expect(result.columns).toEqual([
      col("name", S("String"), false),
      col("subdomains", ListType(S("String")), false),
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

describe("analyzeQuery — collect(map) from OPTIONAL MATCH nullability", () => {
  it("collect(CASE WHEN) from OPTIONAL MATCH narrows mandatory fields", () => {
    const cypher = `MATCH (c:Class)
                    OPTIONAL MATCH (c)-[:BELONGS_TO]->(m:Module)
                    WITH c, collect(CASE WHEN m IS NOT NULL THEN {name: m.name} END) AS data
                    RETURN data`
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual([
      col("data", ListType(MapType([
        { name: "name", value: S("String") },
      ])), false),
    ])
  })

  it("collect(scalar) from OPTIONAL MATCH strips nullable", () => {
    const cypher = `MATCH (c:Class)
                    OPTIONAL MATCH (c)-[:IMPLEMENTS]->(i:Class)
                    WITH c, collect(DISTINCT i.fqcn) AS ifaces
                    RETURN ifaces`
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual([
      col("ifaces", ListType(S("String")), false),
    ])
  })
})

describe("analyzeQuery — multi-WITH chain (ClassProfiles pattern)", () => {
  it("resolves types through chained WITH...MATCH...WITH", () => {
    const cypher = `
      MATCH (c:Class)
      OPTIONAL MATCH (m:Method)-[:BELONGS_TO]->(c)
      WITH c,
        collect(CASE WHEN m IS NOT NULL THEN {visibility: m.visibility, id: m.id} END) AS methodProfiles,
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

describe("analyzeQuery — relationship property access", () => {
  it.each([
    {
      label: "mandatory rel property in RETURN",
      cypher: `MATCH (a:Method)-[r:CALLS]->(b:Method)
               RETURN r.confidence AS confidence`,
      expectedColumns: [col("confidence", S("String"), false)],
    },
    {
      label: "multiple rel properties in RETURN",
      cypher: `MATCH (a:Method)-[r:CALLS]->(b:Method)
               RETURN r.confidence AS confidence, r.edge_count AS edgeCount`,
      expectedColumns: [
        col("confidence", S("String"), false),
        col("edgeCount", S("Double"), false),
      ],
    },
    {
      label: "non-mandatory rel property is nullable",
      cypher: `MATCH (c:Class)-[r:BELONGS_TO]->(m:Module)
               RETURN r.role AS role`,
      expectedColumns: [col("role", S("String"), true)],
    },
    {
      label: "rel property mixed with node properties",
      cypher: `MATCH (a:Method)-[r:CALLS]->(b:Method)
               RETURN a.id AS callerId, b.id AS calleeId, r.confidence AS confidence`,
      expectedColumns: [
        col("callerId", S("String"), false),
        col("calleeId", S("String"), false),
        col("confidence", S("String"), false),
      ],
    },
  ])("$label", ({ cypher, expectedColumns }) => {
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual(expectedColumns)
  })
})

describe("analyzeQuery — CASE expression inference", () => {
  it.each([
    {
      label: "CASE in WITH with string literals",
      cypher: `MATCH (m:Method) WHERE m.ccn IS NOT NULL
               WITH CASE WHEN m.ccn <= 5 THEN '1-5' ELSE '21+' END AS bucket
               RETURN bucket`,
      expectedColumns: [col("bucket", S("String"), false)],
    },
    {
      label: "CASE in RETURN with string literals",
      cypher: `MATCH (c:Class)
               RETURN CASE WHEN c.method_count > 10 THEN 'large' ELSE 'small' END AS size`,
      expectedColumns: [col("size", S("String"), false)],
    },
    {
      label: "multiple CASE in WITH",
      cypher: `MATCH (m:Method) WHERE m.ccn IS NOT NULL
               WITH CASE WHEN m.ccn <= 5 THEN '1-5' ELSE '21+' END AS bucket,
                    CASE WHEN m.ccn <= 5 THEN 'low' ELSE 'high' END AS tier
               RETURN bucket, tier`,
      expectedColumns: [
        col("bucket", S("String"), false),
        col("tier", S("String"), false),
      ],
    },
  ])("$label", ({ cypher, expectedColumns }) => {
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual(expectedColumns)
  })
})

// ── Analyzer gap fixes ──

describe("analyzeQuery — toLower function", () => {
  it("recognizes toLower as a string function", () => {
    const cypher = `MATCH (src:Class)-[d:EXTENDS]->(tgt:Class)
                     RETURN src.fqcn AS from, tgt.fqcn AS to, toLower(type(d)) AS kind`
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual([
      col("from", S("String"), false),
      col("to", S("String"), false),
      col("kind", S("String"), false),
    ])
  })
})

describe("analyzeQuery — CASE with integer literal THEN branches", () => {
  it("infers Long type from CASE THEN integer literal", () => {
    const cypher = `MATCH (m:Method) WHERE m.ccn IS NOT NULL
                     WITH CASE
                       WHEN m.ccn <= 5 THEN 1
                       WHEN m.ccn <= 10 THEN 2
                       ELSE 3
                     END AS sortOrder
                     RETURN sortOrder, count(*) AS count`
    const result = analyzeQuery(cypher, schema)
    expect(result.columns[0]).toEqual(col("sortOrder", S("Long"), false))
    expect(result.columns[1]).toEqual(col("count", S("Long"), false))
  })
})

describe("analyzeQuery — unlabeled node variable", () => {
  it("does not throw for unlabeled node in MATCH pattern", () => {
    const cypher = `MATCH (c:Class)-[ev:EVIDENCED_BY]->(e)
                     RETURN labels(e) AS entityType, ev.role AS role`
    const result = analyzeQuery(cypher, schema)
    expect(result.columns[0]).toEqual(col("entityType", ListType(S("String")), false))
    expect(result.columns[1]).toEqual(col("role", S("String"), false))
  })
})

describe("analyzeQuery — UNWIND with CASE null guard", () => {
  it("propagates list element type through UNWIND", () => {
    const cypher = `MATCH (c:Class)
                     WITH collect(c) AS classes
                     UNWIND CASE WHEN size(classes) > 0 THEN classes ELSE [null] END AS c
                     RETURN c.fqcn AS fqcn`
    const result = analyzeQuery(cypher, schema)
    expect(result.columns[0]).toEqual(col("fqcn", S("String"), false))
  })
})

describe("analyzeQuery — union edge type property access", () => {
  it("resolves property on union edge type EXTENDS|IMPLEMENTS|USES", () => {
    const cypher = `MATCH (a:Class)-[r:EXTENDS|IMPLEMENTS|USES]->(b:Class)
                     RETURN a.fqcn AS fromFqcn, b.fqcn AS toFqcn, r.confidence AS confidence`
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual([
      col("fromFqcn", S("String"), false),
      col("toFqcn", S("String"), false),
      col("confidence", S("String"), false),
    ])
  })
})

// ── Remaining codegen error regressions ──

describe("analyzeQuery — nullable list indexing", () => {
  it("indexes into a nullable list (subdomains[0])", () => {
    const cypher = `MATCH (c:Class)
                     WHERE c.source = "codebase"
                     RETURN coalesce(c.subdomains[0], 'Uncategorized') AS subdomain`
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual([
      col("subdomain", S("String"), false),
    ])
  })
})

describe("analyzeQuery — unlabeled node with property access (legacy UnknownType)", () => {
  it("falls back to UnknownType when no connectivity info", () => {
    const cypher = `MATCH (c:Class)-[ev:EVIDENCED_BY]->(e)
                     RETURN coalesce(e.fqcn, e.id, e.path) AS entityId,
                            ev.role AS role`
    // No connectivity in this schema → UnknownType fallback
    const result = analyzeQuery(cypher, schema)
    expect(result.columns[0].name).toBe("entityId")
    expect(result.columns[1]).toEqual(col("role", S("String"), false))
  })
})

describe("analyzeQuery — Method.commits wrong property", () => {
  it("does not have commits on Method", () => {
    const cypher = `MATCH (m:Method)
                     RETURN m.id AS id, m.ccn AS ccn`
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual([
      col("id", S("String"), false),
      col("ccn", S("Long"), true),
    ])
  })
})

describe("analyzeQuery — Entrypoint.commandName wrong property", () => {
  it("does not have commandName on Entrypoint", () => {
    const cypher = `MATCH (e:Entrypoint)
                     RETURN e.id AS id, e.type AS type`
    const result = analyzeQuery(cypher, schema)
    expect(result.columns).toEqual([
      col("id", S("String"), false),
      col("type", S("String"), false),
    ])
  })
})

// ── Edge connectivity inference ──

const connectivitySchema = new GraphSchema({
  vertexProperties: [
    new VertexProperty({ labels: ["Class"], propertyName: "fqcn", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Class"], propertyName: "name", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Method"], propertyName: "id", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Method"], propertyName: "name", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Method"], propertyName: "file", propertyTypes: ["String"], mandatory: false }),
    new VertexProperty({ labels: ["ContextMapRelationship"], propertyName: "id", propertyTypes: ["String"], mandatory: true }),
  ],
  edgeProperties: [
    new EdgeProperty({ edgeType: "EVIDENCED_BY", propertyName: "role", propertyTypes: ["String"], mandatory: true }),
  ],
  edgeConnectivity: [
    new EdgeConnectivity({ edgeType: "EVIDENCED_BY", fromLabel: "ContextMapRelationship", toLabel: "Class" }),
    new EdgeConnectivity({ edgeType: "EVIDENCED_BY", fromLabel: "ContextMapRelationship", toLabel: "Method" }),
  ],
})

describe("analyzeQuery — edge connectivity inference", () => {
  it("infers VertexUnionType for unlabeled node via EVIDENCED_BY", () => {
    const cypher = `MATCH (cm:ContextMapRelationship)-[:EVIDENCED_BY]->(e)
                     RETURN coalesce(e.fqcn, e.id) AS entityId`
    const result = analyzeQuery(cypher, connectivitySchema)
    // e.fqcn is on Class (mandatory), e.id is on Method (mandatory)
    // Both exist as NullableType because not present on ALL union members
    // coalesce strips nullable → String
    expect(result.columns[0]).toEqual(col("entityId", S("String"), false))
  })

  it("infers VertexUnionType — property on all members mandatory → non-nullable", () => {
    const cypher = `MATCH (cm:ContextMapRelationship)-[:EVIDENCED_BY]->(e)
                     RETURN e.name AS name`
    const result = analyzeQuery(cypher, connectivitySchema)
    // name is mandatory on both Class and Method → non-nullable
    expect(result.columns[0]).toEqual(col("name", S("String"), false))
  })

  it("infers VertexUnionType — property on some members → nullable", () => {
    const cypher = `MATCH (cm:ContextMapRelationship)-[:EVIDENCED_BY]->(e)
                     RETURN e.fqcn AS fqcn`
    const result = analyzeQuery(cypher, connectivitySchema)
    // fqcn is on Class (mandatory) but NOT on Method → NullableType
    expect(result.columns[0]).toEqual(col("fqcn", S("String"), true))
  })

  it("infers VertexUnionType — property on no member → CypherTypeError", () => {
    const cypher = `MATCH (cm:ContextMapRelationship)-[:EVIDENCED_BY]->(e)
                     RETURN e.nonexistent AS x`
    expect(() => analyzeQuery(cypher, connectivitySchema)).toThrow("not found on any member")
  })

  it("infers single-label connectivity as VertexType", () => {
    const singleSchema = new GraphSchema({
      vertexProperties: [
        new VertexProperty({ labels: ["Entrypoint"], propertyName: "id", propertyTypes: ["String"], mandatory: true }),
        new VertexProperty({ labels: ["Class"], propertyName: "fqcn", propertyTypes: ["String"], mandatory: true }),
      ],
      edgeProperties: [],
      edgeConnectivity: [
        new EdgeConnectivity({ edgeType: "HANDLED_BY", fromLabel: "Entrypoint", toLabel: "Class" }),
      ],
    })
    const cypher = `MATCH (e:Entrypoint)-[:HANDLED_BY]->(c)
                     RETURN c.fqcn AS fqcn`
    const result = analyzeQuery(cypher, singleSchema)
    // Single target → VertexType("Class"), fqcn mandatory → non-nullable
    expect(result.columns[0]).toEqual(col("fqcn", S("String"), false))
  })

  it("infers VertexUnionType for left-arrow pattern", () => {
    const cypher = `MATCH (e)<-[:EVIDENCED_BY]-(cm:ContextMapRelationship)
                     RETURN e.name AS name`
    const result = analyzeQuery(cypher, connectivitySchema)
    // Reversed direction: cm is source, e is target → same inference
    expect(result.columns[0]).toEqual(col("name", S("String"), false))
  })
})
