import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { neo4jIndexed, neo4jUnique, neo4jVertex } from "./Neo4jSchemaAnnotations.js"
import { compileToCypherDDL } from "./Neo4jSchemaDDL.js"
import { neo4jKeyGroup, neo4jPartition, neo4jProperties, neo4jVertexStruct } from "./Neo4jSchemaVertex.js"

// ── DDL parity: the primary assurance that neo4jVertexStruct is a pure
// convenience layer over neo4jVertex, never a second construction of the
// same shape. ──

describe("neo4jVertexStruct", () => {
  const assertSameDDL = (newWay: Schema.Top, oldWay: Schema.Top) =>
    expect(compileToCypherDDL([newWay])).toBe(compileToCypherDDL([oldWay]))

  const hasAnnotation = (struct: Schema.Top, key: string) =>
    Object.prototype.hasOwnProperty.call(struct.ast.annotations ?? {}, key)

  describe("DDL parity with hand-written neo4jVertex", () => {
    it("partition + own key, unique: compositeKey is [...partitionFields, ...ownKey]", () => {
      const OldWay = Schema.Struct({
        region: Schema.String,
        tenant: Schema.String,
        serverId: Schema.String
      }).annotate(neo4jVertex("Server1", { compositeKey: ["region", "tenant", "serverId"] }))

      const partition = neo4jPartition({ region: Schema.String, tenant: Schema.String })
      const NewWay = neo4jVertexStruct("Server1", {
        partition,
        fields: { serverId: Schema.String },
        ownKey: ["serverId"],
        mode: "unique"
      })

      assertSameDDL(NewWay, OldWay)
    })

    it("omitted mode defaults to unique: compositeKey is emitted, compositeIndexes is not", () => {
      const OldWay = Schema.Struct({
        region: Schema.String,
        tenant: Schema.String,
        serverId: Schema.String
      }).annotate(neo4jVertex("Server1b", { compositeKey: ["region", "tenant", "serverId"] }))

      const partition = neo4jPartition({ region: Schema.String, tenant: Schema.String })
      const NewWay = neo4jVertexStruct("Server1b", {
        partition,
        fields: { serverId: Schema.String },
        ownKey: ["serverId"]
      })

      assertSameDDL(NewWay, OldWay)

      expect(hasAnnotation(NewWay, "compositeKey")).toBe(true)
      expect(hasAnnotation(NewWay, "compositeIndexes")).toBe(false)
    })

    it("partition + a non-key properties group: those fields are present as properties, absent from the key", () => {
      const OldWay = Schema.Struct({
        region: Schema.String,
        tenant: Schema.String,
        displayName: Schema.String,
        createdAt: Schema.String
      }).annotate(neo4jVertex("Server2", { compositeKey: ["region", "tenant"] }))

      const partition = neo4jPartition({ region: Schema.String, tenant: Schema.String })
      const properties = neo4jProperties({ displayName: Schema.String, createdAt: Schema.String })
      const NewWay = neo4jVertexStruct("Server2", {
        partition,
        properties,
        fields: {},
        mode: "unique"
      })

      assertSameDDL(NewWay, OldWay)
      expect(Object.keys(NewWay.fields).sort()).toEqual(["createdAt", "displayName", "region", "tenant"])
    })

    it("partition + own key, index mode: one compositeIndexes entry, no compositeKey", () => {
      const OldWay = Schema.Struct({
        region: Schema.String,
        tenant: Schema.String,
        serverId: Schema.String
      }).annotate(neo4jVertex("Server3", { compositeIndexes: [["region", "tenant", "serverId"]] }))

      const partition = neo4jPartition({ region: Schema.String, tenant: Schema.String })
      const NewWay = neo4jVertexStruct("Server3", {
        partition,
        fields: { serverId: Schema.String },
        ownKey: ["serverId"],
        mode: "index"
      })

      assertSameDDL(NewWay, OldWay)
    })

    it("no partition, two independent composite indexes: no compositeKey at all", () => {
      const OldWay = Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        email: Schema.String
      }).annotate(neo4jVertex("Server4", {
        compositeIndexes: [["id", "name"], ["name", "email"]]
      }))

      const NewWay = neo4jVertexStruct("Server4", {
        fields: { id: Schema.String, name: Schema.String, email: Schema.String },
        compositeIndexes: [["id", "name"], ["name", "email"]]
      })

      assertSameDDL(NewWay, OldWay)
    })

    it("a key-derived index is emitted before additional independent compositeIndexes", () => {
      const OldWay = Schema.Struct({
        region: Schema.String,
        tenant: Schema.String,
        serverId: Schema.String,
        hostname: Schema.String
      }).annotate(neo4jVertex("Server6", {
        compositeIndexes: [["region", "tenant", "serverId"], ["hostname", "region"]]
      }))

      const partition = neo4jPartition({ region: Schema.String, tenant: Schema.String })
      const NewWay = neo4jVertexStruct("Server6", {
        partition,
        fields: { serverId: Schema.String, hostname: Schema.String },
        ownKey: ["serverId"],
        mode: "index",
        compositeIndexes: [["hostname", "region"]]
      })

      assertSameDDL(NewWay, OldWay)
    })
  })

  describe("key group", () => {
    it("keys by the partition, then the key group, then ownKey, with fields merged in that order", () => {
      const OldWay = Schema.Struct({
        region: Schema.String.annotate(neo4jIndexed),
        tenant: Schema.String,
        serverId: Schema.String.annotate(neo4jIndexed),
        rack: Schema.String,
        displayName: Schema.String.annotate(neo4jIndexed),
        slot: Schema.Number.annotate(neo4jIndexed)
      }).annotate(neo4jVertex("Server7", { compositeKey: ["region", "tenant", "serverId", "rack", "slot"] }))

      const NewWay = neo4jVertexStruct("Server7", {
        partition: neo4jPartition({ region: Schema.String.annotate(neo4jIndexed), tenant: Schema.String }),
        key: neo4jKeyGroup({ serverId: Schema.String.annotate(neo4jIndexed), rack: Schema.String }),
        properties: neo4jProperties({ displayName: Schema.String.annotate(neo4jIndexed) }),
        fields: { slot: Schema.Number.annotate(neo4jIndexed) },
        ownKey: ["slot"]
      })

      assertSameDDL(NewWay, OldWay)
      expect(Object.keys(NewWay.fields)).toEqual(["region", "tenant", "serverId", "rack", "displayName", "slot"])
    })

    it("index mode: the key group joins the key-derived composite index", () => {
      const OldWay = Schema.Struct({
        region: Schema.String,
        tenant: Schema.String,
        serverId: Schema.String,
        hostname: Schema.String
      }).annotate(neo4jVertex("Server8", { compositeIndexes: [["region", "tenant", "serverId"]] }))

      const NewWay = neo4jVertexStruct("Server8", {
        partition: neo4jPartition({ region: Schema.String, tenant: Schema.String }),
        key: neo4jKeyGroup({ serverId: Schema.String }),
        fields: { hostname: Schema.String },
        mode: "index"
      })

      assertSameDDL(NewWay, OldWay)
    })

    it("a key group alone keys the vertex, mode defaulting to unique", () => {
      const OldWay = Schema.Struct({ serverId: Schema.String, hostname: Schema.String })
        .annotate(neo4jVertex("Server9", { compositeKey: ["serverId"] }))

      const NewWay = neo4jVertexStruct("Server9", {
        key: neo4jKeyGroup({ serverId: Schema.String }),
        fields: { hostname: Schema.String }
      })

      assertSameDDL(NewWay, OldWay)
    })

    it("a key group's key order is its fields' declaration order", () => {
      expect(neo4jKeyGroup({ rack: Schema.String, serverId: Schema.String }).keyFields).toEqual(["rack", "serverId"])
    })
  })

  describe("empty key", () => {
    it("omits compositeKey entirely rather than emitting an empty array", () => {
      const NewWay = neo4jVertexStruct("Server5", {
        fields: { id: Schema.String },
        compositeIndexes: [["id"]]
      })

      expect(hasAnnotation(NewWay, "compositeKey")).toBe(false)

      const ddl = compileToCypherDDL([NewWay])
      expect(ddl).not.toContain("REQUIRE ()")
    })
  })

  describe("passthrough", () => {
    it("fullTextIndexes and per-field neo4jUnique/neo4jIndexed emit exactly as before", () => {
      const OldWay = Schema.Struct({
        id: Schema.String.annotate(neo4jUnique),
        name: Schema.String,
        bio: Schema.optional(Schema.String).annotate(neo4jIndexed)
      }).annotate(neo4jVertex("Author", {
        fullTextIndexes: [{ name: "author_search", fields: ["name", "bio"] }]
      }))

      const NewWay = neo4jVertexStruct("Author", {
        fields: {
          id: Schema.String.annotate(neo4jUnique),
          name: Schema.String,
          bio: Schema.optional(Schema.String).annotate(neo4jIndexed)
        },
        fullTextIndexes: [{ name: "author_search", fields: ["name", "bio"] }]
      })

      assertSameDDL(NewWay, OldWay)
    })
  })
})
