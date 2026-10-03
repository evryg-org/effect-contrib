---
"@evryg/effect-neo4j-schema": minor
---

Key a vertex by a reusable group of its own key fields, and export the option types of `neo4jVertexStruct`.

`neo4jKeyGroup(fields)` declares an ordered group of a vertex's own key fields once, so every schema that keys the vertex by them shares one declaration. Like `neo4jPartition`, it rejects optional and nullable members at the type level, and the key order is the fields' declaration order. `neo4jVertexStruct` takes it as a new optional `key` option. The group's fields are merged right after the partition's, and the composite key is `[...partition fields, ...key group fields, ...ownKey]`. A `key` group alone also keys the vertex, and `mode` still defaults to `"unique"`. `KeyGroup` is branded, so only `neo4jKeyGroup` builds one and its members are always checked. That check travels with the value: a constructor generic over a vertex's fields can key the vertex by a group it receives, where it could not prove an `ownKey` over its type parameters.

`VertexStructOptions<OwnFields, PartitionFields, PropertiesFields, KeyFields>` is now the exported name of the options. It replaces re-deriving them as `Parameters<typeof neo4jVertexStruct<...>>[1]`. `KeyEligibleFieldName<Fields>` is the exported element type of `ownKey`: the required, non-nullable field names of `Fields`. The new `KeyFields` type parameter defaults to `{}`, so calls with one to three explicit type arguments are unchanged.

`partition`, `key` and `properties` must now declare disjoint fields, and an own field may shadow none of them. Before, a `properties` field could silently replace a partition field of the same name in the merged struct, while the key still named it. That collision is now rejected at the type level, like an own field shadowing a group. The check is carried by the type of `fields`, so a constructor that forwards `fields` unchanged forwards it too. Every other type-level guarantee in `Neo4jSchemaVertex.test-d.ts` still holds, and vertices built without `key` emit the same DDL as before.
