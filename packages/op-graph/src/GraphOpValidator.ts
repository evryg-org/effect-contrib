import { Array, Function, HashMap, HashSet, Option, Record, Result, Schema } from "effect"
import { GraphOp } from "./GraphOp.js"

/** label → set of allowed property names (both key fields and properties) */
export class SchemaIndex extends Schema.Class<SchemaIndex>("SchemaIndex")({
  entries: Schema.HashMap(Schema.String, Schema.HashSet(Schema.String)),
}) {
  hasLabel(label: string): boolean {
    return HashMap.has(this.entries, label)
  }

  allows(label: string, property: string): boolean {
    return HashMap.get(this.entries, label).pipe(
      Option.map((properties) => HashSet.has(properties, property)),
      Option.getOrElse(Function.constFalse),
    )
  }

  propertiesOf(label: string): ReadonlySet<string> {
    return new Set(HashMap.get(this.entries, label).pipe(Option.getOrElse(() => HashSet.empty<string>())))
  }
}

export interface GraphOpViolation {
  readonly op: string
  readonly label: string
  readonly property: string
  readonly message: string
}

/** Returns the op-kind string for a GraphOp without reading the discriminant directly. */
export function graphOpKind(op: GraphOp): string {
  return GraphOp.match(op, {
    UpsertVertex: () => "UpsertVertex",
    UpsertEdge: () => "UpsertEdge",
  })
}

/** Build a SchemaIndex from raw node/rel property entries */
export function buildSchemaIndex(
  nodeEntries: ReadonlyArray<{ labels: ReadonlyArray<string>; propertyName: string }>,
  relEntries: ReadonlyArray<{ relType: string; propertyName: string }>,
): SchemaIndex {
  // Expand nodeEntries into (label, propertyName) pairs, then group by label.
  const nodePairs = nodeEntries.flatMap((entry) =>
    entry.labels.map((label) => ({ label, propertyName: entry.propertyName })),
  )
  const nodeGroups = Array.groupBy(nodePairs, (p) => p.label)
  const nodeRecord = Record.map(nodeGroups, (group) => HashSet.fromIterable(group.map((p) => p.propertyName)))

  // Group relEntries by relType.
  const relGroups = Array.groupBy(relEntries, (e) => e.relType)
  const relRecord = Record.map(relGroups, (group) => HashSet.fromIterable(group.map((e) => e.propertyName)))

  // Merge both records into one and lift into the SchemaIndex's HashMap.
  const merged = { ...nodeRecord, ...relRecord }
  return new SchemaIndex({ entries: HashMap.fromIterable(Record.toEntries(merged)) })
}

/** Validate all GraphOps against the schema index. Returns accumulated violations. */
export function validateGraphOps(
  ops: ReadonlyArray<GraphOp>,
  index: SchemaIndex,
): ReadonlyArray<GraphOpViolation> {
  function checkVertexProps(
    opKind: string,
    label: string,
    key: Record<string, unknown>,
    properties: Record<string, unknown>,
  ): ReadonlyArray<GraphOpViolation> {
    if (!index.hasLabel(label)) {
      return [{ op: opKind, label, property: "*", message: `Unknown label "${label}"` }]
    }
    const keyViolations = Array.filterMap(Record.keys(key), (prop) =>
      !index.allows(label, prop)
        ? Result.succeed({ op: opKind, label, property: prop, message: `Undeclared key property "${prop}" on label "${label}"` })
        : Result.failVoid)
    const propViolations = Array.filterMap(Record.keys(properties), (prop) =>
      !index.allows(label, prop)
        ? Result.succeed({ op: opKind, label, property: prop, message: `Undeclared property "${prop}" on label "${label}"` })
        : Result.failVoid)
    return [...keyViolations, ...propViolations]
  }

  return ops.flatMap((op) =>
    GraphOp.match(op, {
      UpsertVertex: (v) => checkVertexProps("UpsertVertex", v.label, v.key, v.properties),
      UpsertEdge: (e) => {
        // Edge properties
        const edgeViolations: ReadonlyArray<GraphOpViolation> = index.hasLabel(e.label)
          ? [
              ...Array.filterMap(Record.keys(e.key), (prop) =>
                !index.allows(e.label, prop)
                  ? Result.succeed({ op: "UpsertEdge", label: e.label, property: prop, message: `Undeclared key property "${prop}" on relationship "${e.label}"` })
                  : Result.failVoid),
              ...Array.filterMap(Record.keys(e.properties), (prop) =>
                !index.allows(e.label, prop)
                  ? Result.succeed({ op: "UpsertEdge", label: e.label, property: prop, message: `Undeclared property "${prop}" on relationship "${e.label}"` })
                  : Result.failVoid),
            ]
          : [{ op: "UpsertEdge", label: e.label, property: "*", message: `Unknown relationship type "${e.label}"` }]

        // from-vertex key fields
        const fromViolations: ReadonlyArray<GraphOpViolation> = index.hasLabel(e.from.label)
          ? Array.filterMap(Record.keys(e.from.key), (prop) =>
              !index.allows(e.from.label, prop)
                ? Result.succeed({ op: "UpsertEdge", label: e.from.label, property: prop, message: `Undeclared key property "${prop}" on from-label "${e.from.label}"` })
                : Result.failVoid)
          : [{ op: "UpsertEdge", label: e.from.label, property: "*", message: `Unknown from-label "${e.from.label}"` }]

        // to-vertex key fields
        const toViolations: ReadonlyArray<GraphOpViolation> = index.hasLabel(e.to.label)
          ? Array.filterMap(Record.keys(e.to.key), (prop) =>
              !index.allows(e.to.label, prop)
                ? Result.succeed({ op: "UpsertEdge", label: e.to.label, property: prop, message: `Undeclared key property "${prop}" on to-label "${e.to.label}"` })
                : Result.failVoid)
          : [{ op: "UpsertEdge", label: e.to.label, property: "*", message: `Unknown to-label "${e.to.label}"` }]

        return [...edgeViolations, ...fromViolations, ...toViolations]
      },
    }),
  )
}
