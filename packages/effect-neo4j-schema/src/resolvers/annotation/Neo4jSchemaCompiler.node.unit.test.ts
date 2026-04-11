import { describe, it, expect } from "@effect/vitest"
import { Schema } from "effect"
import { neo4jVertex, neo4jEdge, neo4jUnique, neo4jIndexed } from "../../Neo4jSchemaAnnotations.js"
import { compileToGraphSchema } from "./AnnotationGraphSchemaResolver.js"
import { compileToCypherDDL } from "../../Neo4jSchemaDDL.js"

// ── Test schemas ──

const PersonVertex = Schema.Struct({
  id: Schema.String.annotations(neo4jUnique),
  name: Schema.String,
  age: Schema.optional(Schema.Number),
  active: Schema.optional(Schema.Boolean),
  tags: Schema.Array(Schema.String),
  file: Schema.optional(Schema.String).annotations(neo4jIndexed),
}).annotations(neo4jVertex("Person"))

const ServerVertex = Schema.Struct({
  listenPort: Schema.Number,
  serverName: Schema.String,
}).annotations(neo4jVertex("Server", {
  compositeKey: ["listenPort", "serverName"],
}))

const IndexedVertex = Schema.Struct({
  id: Schema.String.annotations(neo4jUnique),
  name: Schema.String,
}).annotations(neo4jVertex("Indexed", {
  compositeIndexes: [["id", "name"]],
  fullTextIndex: { name: "indexed_search", fields: ["id", "name"] },
}))

const KnowsEdge = Schema.Struct({
  since: Schema.Number,
  weight: Schema.optional(Schema.Number),
}).annotations(neo4jEdge("KNOWS"))

const EmptyEdge = Schema.Struct({}).annotations(neo4jEdge("FOLLOWS"))

const UnannotatedSchema = Schema.Struct({ foo: Schema.String })

// ── compileToGraphSchema ──

describe("compileToGraphSchema", () => {
  describe("vertex properties", () => {
    it("compiles mandatory String field", () => {
      const schema = compileToGraphSchema([PersonVertex])
      const nameProp = schema.vertexProperties.find(
        (p) => p.labels.includes("Person") && p.propertyName === "name",
      )
      expect(nameProp).toBeDefined()
      expect(nameProp!.mandatory).toBe(true)
      expect(nameProp!.propertyTypes).toEqual(["STRING NOT NULL"])
    })

    it("compiles mandatory String field with unique annotation", () => {
      const schema = compileToGraphSchema([PersonVertex])
      const idProp = schema.vertexProperties.find(
        (p) => p.labels.includes("Person") && p.propertyName === "id",
      )
      expect(idProp).toBeDefined()
      expect(idProp!.mandatory).toBe(true)
      expect(idProp!.propertyTypes).toEqual(["STRING NOT NULL"])
    })

    it("compiles optional Number field", () => {
      const schema = compileToGraphSchema([PersonVertex])
      const ageProp = schema.vertexProperties.find(
        (p) => p.labels.includes("Person") && p.propertyName === "age",
      )
      expect(ageProp).toBeDefined()
      expect(ageProp!.mandatory).toBe(false)
      expect(ageProp!.propertyTypes).toEqual(["FLOAT NOT NULL"])
    })

    it("compiles optional Boolean field", () => {
      const schema = compileToGraphSchema([PersonVertex])
      const activeProp = schema.vertexProperties.find(
        (p) => p.labels.includes("Person") && p.propertyName === "active",
      )
      expect(activeProp).toBeDefined()
      expect(activeProp!.mandatory).toBe(false)
      expect(activeProp!.propertyTypes).toEqual(["BOOLEAN NOT NULL"])
    })

    it("compiles Array<String> field", () => {
      const schema = compileToGraphSchema([PersonVertex])
      const tagsProp = schema.vertexProperties.find(
        (p) => p.labels.includes("Person") && p.propertyName === "tags",
      )
      expect(tagsProp).toBeDefined()
      expect(tagsProp!.mandatory).toBe(true)
      expect(tagsProp!.propertyTypes).toEqual(["LIST<STRING NOT NULL> NOT NULL"])
    })

    it("includes all fields for a vertex", () => {
      const schema = compileToGraphSchema([PersonVertex])
      const personProps = schema.vertexProperties.filter((p) => p.labels.includes("Person"))
      const names = personProps.map((p) => p.propertyName).sort()
      expect(names).toEqual(["active", "age", "file", "id", "name", "tags"])
    })
  })

  describe("edge properties", () => {
    it("compiles mandatory edge property", () => {
      const schema = compileToGraphSchema([KnowsEdge])
      const sinceProp = schema.edgeProperties.find(
        (p) => p.edgeType === "KNOWS" && p.propertyName === "since",
      )
      expect(sinceProp).toBeDefined()
      expect(sinceProp!.mandatory).toBe(true)
      expect(sinceProp!.propertyTypes).toEqual(["FLOAT NOT NULL"])
    })

    it("compiles optional edge property", () => {
      const schema = compileToGraphSchema([KnowsEdge])
      const weightProp = schema.edgeProperties.find(
        (p) => p.edgeType === "KNOWS" && p.propertyName === "weight",
      )
      expect(weightProp).toBeDefined()
      expect(weightProp!.mandatory).toBe(false)
    })

    it("handles edge with no properties", () => {
      const schema = compileToGraphSchema([EmptyEdge])
      const followsProps = schema.edgeProperties.filter((p) => p.edgeType === "FOLLOWS")
      expect(followsProps).toEqual([])
    })
  })

  describe("merging and filtering", () => {
    it("merges multiple schemas", () => {
      const schema = compileToGraphSchema([PersonVertex, KnowsEdge])
      expect(schema.vertexProperties.length).toBeGreaterThan(0)
      expect(schema.edgeProperties.length).toBeGreaterThan(0)
    })

    it("ignores schemas without neo4j annotations", () => {
      const schema = compileToGraphSchema([UnannotatedSchema])
      expect(schema.vertexProperties).toEqual([])
      expect(schema.edgeProperties).toEqual([])
    })

    it("merges multiple schemas with same label", () => {
      const PartA = Schema.Struct({
        id: Schema.String,
      }).annotations(neo4jVertex("Merged"))

      const PartB = Schema.Struct({
        extra: Schema.optional(Schema.Number),
      }).annotations(neo4jVertex("Merged"))

      const schema = compileToGraphSchema([PartA, PartB])
      const mergedProps = schema.vertexProperties.filter((p) => p.labels.includes("Merged"))
      const names = mergedProps.map((p) => p.propertyName).sort()
      expect(names).toEqual(["extra", "id"])
    })
  })
})

// ── compileToCypherDDL ──

describe("compileToCypherDDL", () => {
  it("generates UNIQUE constraint for neo4jUnique field", () => {
    const ddl = compileToCypherDDL([PersonVertex])
    expect(ddl).toContain("CREATE CONSTRAINT IF NOT EXISTS FOR (n:Person) REQUIRE n.id IS UNIQUE;")
  })

  it("generates INDEX for neo4jIndexed field", () => {
    const ddl = compileToCypherDDL([PersonVertex])
    expect(ddl).toContain("CREATE INDEX IF NOT EXISTS FOR (n:Person) ON (n.file);")
  })

  it("generates composite UNIQUE constraint for compositeKey", () => {
    const ddl = compileToCypherDDL([ServerVertex])
    expect(ddl).toContain(
      "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Server) REQUIRE (n.listenPort, n.serverName) IS UNIQUE;",
    )
  })

  it("generates composite INDEX for compositeIndexes", () => {
    const ddl = compileToCypherDDL([IndexedVertex])
    expect(ddl).toContain("CREATE INDEX IF NOT EXISTS FOR (n:Indexed) ON (n.id, n.name);")
  })

  it("generates FULLTEXT INDEX for fullTextIndex", () => {
    const ddl = compileToCypherDDL([IndexedVertex])
    expect(ddl).toContain(
      "CREATE FULLTEXT INDEX indexed_search IF NOT EXISTS FOR (n:Indexed) ON EACH [n.id, n.name];",
    )
  })

  it("does not generate DDL for unannotated schemas", () => {
    const ddl = compileToCypherDDL([UnannotatedSchema])
    expect(ddl.trim()).toBe("")
  })

  it("does not generate DDL for edge schemas", () => {
    const ddl = compileToCypherDDL([KnowsEdge])
    expect(ddl.trim()).toBe("")
  })
})
