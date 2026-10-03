import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { FullTextIndex } from "../../GraphSchemaModel.js"
import { neo4jEdge, neo4jIndexed, neo4jUnique, neo4jVertex } from "../../Neo4jSchemaAnnotations.js"
import { compileToCypherDDL } from "../../Neo4jSchemaDDL.js"
import { compileToGraphSchema } from "./AnnotationGraphSchemaResolver.js"

// ── Test schemas ──

const PersonVertex = Schema.Struct({
  id: Schema.String.annotate(neo4jUnique),
  name: Schema.String,
  age: Schema.optional(Schema.Number),
  active: Schema.optional(Schema.Boolean),
  tags: Schema.Array(Schema.String),
  file: Schema.optional(Schema.String).annotate(neo4jIndexed)
}).annotate(neo4jVertex("Person"))

const IndexedVertex = Schema.Struct({
  id: Schema.String.annotate(neo4jUnique),
  name: Schema.String
}).annotate(neo4jVertex("Indexed", {
  compositeIndexes: [["id", "name"]],
  fullTextIndexes: [{ name: "indexed_search", fields: ["id", "name"] }]
}))

const KnowsEdge = Schema.Struct({
  since: Schema.Number,
  weight: Schema.optional(Schema.Number)
}).annotate(neo4jEdge("KNOWS"))

const EmptyEdge = Schema.Struct({}).annotate(neo4jEdge("FOLLOWS"))

const UnannotatedSchema = Schema.Struct({ foo: Schema.String })

// ── compileToGraphSchema ──

describe("compileToGraphSchema", () => {
  describe("vertex properties", () => {
    it("compiles mandatory String field", () => {
      const schema = compileToGraphSchema([PersonVertex])
      const nameProp = schema.vertexProperties.find(
        (p) => p.labels.includes("Person") && p.propertyName === "name"
      )
      expect(nameProp).toBeDefined()
      expect(nameProp!.mandatory).toBe(true)
      expect(nameProp!.propertyTypes).toEqual(["STRING NOT NULL"])
    })

    it("compiles mandatory String field with unique annotation", () => {
      const schema = compileToGraphSchema([PersonVertex])
      const idProp = schema.vertexProperties.find(
        (p) => p.labels.includes("Person") && p.propertyName === "id"
      )
      expect(idProp).toBeDefined()
      expect(idProp!.mandatory).toBe(true)
      expect(idProp!.propertyTypes).toEqual(["STRING NOT NULL"])
    })

    it("compiles optional Number field", () => {
      const schema = compileToGraphSchema([PersonVertex])
      const ageProp = schema.vertexProperties.find(
        (p) => p.labels.includes("Person") && p.propertyName === "age"
      )
      expect(ageProp).toBeDefined()
      expect(ageProp!.mandatory).toBe(false)
      expect(ageProp!.propertyTypes).toEqual(["FLOAT NOT NULL"])
    })

    it("compiles optional Boolean field", () => {
      const schema = compileToGraphSchema([PersonVertex])
      const activeProp = schema.vertexProperties.find(
        (p) => p.labels.includes("Person") && p.propertyName === "active"
      )
      expect(activeProp).toBeDefined()
      expect(activeProp!.mandatory).toBe(false)
      expect(activeProp!.propertyTypes).toEqual(["BOOLEAN NOT NULL"])
    })

    it("compiles Array<String> field", () => {
      const schema = compileToGraphSchema([PersonVertex])
      const tagsProp = schema.vertexProperties.find(
        (p) => p.labels.includes("Person") && p.propertyName === "tags"
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
        (p) => p.edgeType === "KNOWS" && p.propertyName === "since"
      )
      expect(sinceProp).toBeDefined()
      expect(sinceProp!.mandatory).toBe(true)
      expect(sinceProp!.propertyTypes).toEqual(["FLOAT NOT NULL"])
    })

    it("compiles optional edge property", () => {
      const schema = compileToGraphSchema([KnowsEdge])
      const weightProp = schema.edgeProperties.find(
        (p) => p.edgeType === "KNOWS" && p.propertyName === "weight"
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
        id: Schema.String
      }).annotate(neo4jVertex("Merged"))

      const PartB = Schema.Struct({
        extra: Schema.optional(Schema.Number)
      }).annotate(neo4jVertex("Merged"))

      const schema = compileToGraphSchema([PartA, PartB])
      const mergedProps = schema.vertexProperties.filter((p) => p.labels.includes("Merged"))
      const names = mergedProps.map((p) => p.propertyName).sort()
      expect(names).toEqual(["extra", "id"])
    })
  })

  describe("fullTextIndexes", () => {
    it("emits a FullTextIndex for a single label", () => {
      const schema = compileToGraphSchema([IndexedVertex])
      expect(schema.fullTextIndexes).toEqual([
        new FullTextIndex({ name: "indexed_search", labels: ["Indexed"], fields: ["id", "name"] })
      ])
    })

    it("merges same-named entries across labels", () => {
      const BookVertex = Schema.Struct({
        title: Schema.String,
        summary: Schema.optional(Schema.String)
      }).annotate(neo4jVertex("Book", {
        fullTextIndexes: [{ name: "content_search", fields: ["title", "summary"] }]
      }))

      const AuthorVertex = Schema.Struct({
        title: Schema.String,
        summary: Schema.optional(Schema.String)
      }).annotate(neo4jVertex("Author", {
        fullTextIndexes: [{ name: "content_search", fields: ["title", "summary"] }]
      }))

      const schema = compileToGraphSchema([BookVertex, AuthorVertex])
      expect(schema.fullTextIndexes).toEqual([
        new FullTextIndex({ name: "content_search", labels: ["Book", "Author"], fields: ["title", "summary"] })
      ])
    })

    it("throws when same-named entries declare different field lists", () => {
      const BookVertex = Schema.Struct({
        title: Schema.String
      }).annotate(neo4jVertex("Book", {
        fullTextIndexes: [{ name: "content_search", fields: ["title"] }]
      }))

      const AuthorVertex = Schema.Struct({
        name: Schema.String
      }).annotate(neo4jVertex("Author", {
        fullTextIndexes: [{ name: "content_search", fields: ["name"] }]
      }))

      expect(() => compileToGraphSchema([BookVertex, AuthorVertex])).toThrow(/content_search/)
    })
  })
})

// ── compileToCypherDDL ──

describe("compileToCypherDDL", () => {
  it("does not generate DDL for unannotated schemas", () => {
    const ddl = compileToCypherDDL([UnannotatedSchema])
    expect(ddl.trim()).toBe("")
  })

  it("does not generate DDL for edge schemas", () => {
    const ddl = compileToCypherDDL([KnowsEdge])
    expect(ddl.trim()).toBe("")
  })

  it("throws when same-named fullTextIndexes entries declare different field lists", () => {
    const BookVertex = Schema.Struct({
      title: Schema.String,
      summary: Schema.optional(Schema.String)
    }).annotate(neo4jVertex("Book", {
      fullTextIndexes: [{ name: "content_search", fields: ["title", "summary"] }]
    }))

    const AuthorVertex = Schema.Struct({
      name: Schema.String
    }).annotate(neo4jVertex("Author", {
      fullTextIndexes: [{ name: "content_search", fields: ["name"] }]
    }))

    expect(() => compileToCypherDDL([BookVertex, AuthorVertex])).toThrow(/content_search/)
    expect(() => compileToCypherDDL([BookVertex, AuthorVertex])).toThrow(/Author/)
  })
})
