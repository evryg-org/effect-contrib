import { Schema } from "effect"
import { describe, expectTypeOf, it } from "vitest"
import type { KeyEligibleFieldName, Partition, VertexStructOptions } from "./Neo4jSchemaVertex.js"
import { neo4jPartition, neo4jProperties, neo4jVertexStruct } from "./Neo4jSchemaVertex.js"

const partition = neo4jPartition({ region: Schema.String, tenant: Schema.String })
const properties = neo4jProperties({ nickname: Schema.String })

// ── happy path: illegal-states guards must not over-constrain valid usage ──

describe("neo4jVertexStruct — valid usage still typechecks", () => {
  it("partition + own key, unique", () => {
    expectTypeOf(
      neo4jVertexStruct("Server", {
        partition,
        fields: { serverId: Schema.String },
        ownKey: ["serverId"],
        mode: "unique"
      })
    ).not.toBeNever()
  })

  it("partition + own key, mode omitted defaults to unique", () => {
    expectTypeOf(
      neo4jVertexStruct("Server", {
        partition,
        fields: { serverId: Schema.String },
        ownKey: ["serverId"]
      })
    ).not.toBeNever()
  })

  it("no partition, no own key, only independent composite indexes", () => {
    expectTypeOf(
      neo4jVertexStruct("Server", {
        fields: { id: Schema.String, name: Schema.String },
        compositeIndexes: [["id", "name"]]
      })
    ).not.toBeNever()
  })

  it("optional and nullable fields are fine everywhere outside the key", () => {
    expectTypeOf(
      neo4jVertexStruct("Server", {
        partition,
        fields: {
          serverId: Schema.String,
          bio: Schema.optional(Schema.String),
          notes: Schema.NullOr(Schema.String)
        },
        ownKey: ["serverId"],
        compositeIndexes: [["bio", "notes"]],
        fullTextIndexes: [{ name: "server_search", fields: ["bio"] }]
      })
    ).not.toBeNever()
  })
})

// ── illegal states must be unrepresentable ──

describe("neo4jVertexStruct — illegal states are unrepresentable", () => {
  it("row 1: a key names a property that does not exist", () => {
    // @ts-expect-error "nonexistent" is not a key of the vertex's own fields
    neo4jVertexStruct("X1", { partition, fields: { id: Schema.String }, ownKey: ["nonexistent"], mode: "unique" })
  })

  it("row 2: a key names a non-identifying (Properties) field", () => {
    // @ts-expect-error "nickname" belongs to `properties`, not the vertex's own fields
    neo4jVertexStruct("X2", { properties, fields: { id: Schema.String }, ownKey: ["nickname"], mode: "unique" })
  })

  it("row 3: a group's field names cannot be hand-typed at the call site", () => {
    // @ts-expect-error `partitionFields` isn't a real option; the key is read off `partition` itself
    neo4jVertexStruct("X3", { partition, partitionFields: ["region", "tenant"], fields: { id: Schema.String } })
  })

  it("row 4: two partitions on one vertex", () => {
    const partitionB = neo4jPartition({ zone: Schema.String })
    // @ts-expect-error `partition` accepts a single Partition, not an array of them
    neo4jVertexStruct("X4", { partition: [partition, partitionB], fields: { id: Schema.String } })
  })

  it("row 5: a vertex's own field shadows a group's field", () => {
    // @ts-expect-error "region" is already declared by `partition`
    neo4jVertexStruct("X5", { partition, fields: { region: Schema.String, id: Schema.String } })
  })

  it("row 6a: a unique key with neither a partition nor an own key", () => {
    // @ts-expect-error `mode: "unique"` requires a partition and/or a non-empty ownKey
    neo4jVertexStruct("X6a", { fields: { id: Schema.String }, mode: "unique" })
  })

  it("row 6b: a unique key with an empty own key and no partition", () => {
    // @ts-expect-error an empty ownKey isn't a non-empty tuple, and there is no partition either
    neo4jVertexStruct("X6b", { fields: { id: Schema.String }, ownKey: [], mode: "unique" })
  })

  it("row 6c: an omitted mode still defaults to unique, so an empty own key is illegal there too", () => {
    // @ts-expect-error mode defaults to "unique"; an empty ownKey and no partition names nothing to be unique on
    neo4jVertexStruct("X6c", { fields: { id: Schema.String }, ownKey: [] })
  })

  it("row 7: an index names a property that does not exist", () => {
    // @ts-expect-error "nonexistent" is not a field of this vertex
    neo4jVertexStruct("X7", { fields: { id: Schema.String }, compositeIndexes: [["nonexistent"]] })
  })

  it("row 8: a Properties group passed where a partition belongs", () => {
    // @ts-expect-error `properties` has no `keyFields`, so it cannot satisfy `Partition`
    neo4jVertexStruct("X8", { partition: properties, fields: { id: Schema.String } })
  })

  it("row 9a: an optional field in a partition", () => {
    // @ts-expect-error "when" is optional; a key member must be required and non-nullable
    neo4jPartition({ region: Schema.String, when: Schema.optional(Schema.String) })
  })

  it("row 9b: a nullable field in a partition", () => {
    // @ts-expect-error "region" admits null; a key member must be required and non-nullable
    neo4jPartition({ region: Schema.NullOr(Schema.String) })
  })

  it("row 9c: an optional-key field in a partition", () => {
    // @ts-expect-error "region" has an optional key; a key member must be required and non-nullable
    neo4jPartition({ region: Schema.optionalKey(Schema.String) })
  })

  it("row 10a: an optional own field named in ownKey", () => {
    // @ts-expect-error "id" is optional, so it is not nameable in a key
    neo4jVertexStruct("X10a", { fields: { id: Schema.optional(Schema.String) }, ownKey: ["id"] })
  })

  it("row 10b: a nullable own field named in ownKey", () => {
    // @ts-expect-error "id" admits null, so it is not nameable in a key
    neo4jVertexStruct("X10b", { fields: { id: Schema.NullOr(Schema.String) }, ownKey: ["id"] })
  })
})

// ── generic constructors name the options and the own key instead of re-deriving them ──

const mixedFields = {
  serverId: Schema.String,
  bio: Schema.optional(Schema.String),
  alias: Schema.optionalKey(Schema.String),
  notes: Schema.NullOr(Schema.String)
}

const keyedServer = <
  const OwnFields extends Schema.Struct.Fields,
  const PartitionFields extends Schema.Struct.Fields
>(
  label: string,
  partition: Partition<PartitionFields>,
  fields: VertexStructOptions<OwnFields, PartitionFields>["fields"],
  ownKey: readonly [KeyEligibleFieldName<OwnFields>, ...ReadonlyArray<KeyEligibleFieldName<OwnFields>>]
) => neo4jVertexStruct<OwnFields, PartitionFields>(label, { partition, fields, ownKey })

describe("VertexStructOptions and KeyEligibleFieldName", () => {
  it("VertexStructOptions is exactly the options neo4jVertexStruct takes", () => {
    expectTypeOf<VertexStructOptions<typeof mixedFields, { region: typeof Schema.String }>>()
      .toEqualTypeOf<Parameters<typeof neo4jVertexStruct<typeof mixedFields, { region: typeof Schema.String }>>[1]>()
  })

  it("KeyEligibleFieldName names only the required, non-nullable fields", () => {
    expectTypeOf<KeyEligibleFieldName<typeof mixedFields>>().toEqualTypeOf<"serverId">()
  })

  it("a generic constructor forwards its own key without re-deriving the option types", () => {
    expectTypeOf(keyedServer("Server", partition, mixedFields, ["serverId"])).not.toBeNever()
  })

  it("a generic constructor keeps the own key restricted to key-eligible fields", () => {
    expectTypeOf<Parameters<typeof keyedServer<typeof mixedFields, {}>>[3][number]>().toEqualTypeOf<"serverId">()
  })
})
