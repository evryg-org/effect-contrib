import { Array, Record, Result } from "effect"
import { GraphOp } from "./GraphOp.js"

/** label → set of allowed property names (both key fields and properties) */
export type SchemaIndex = ReadonlyMap<string, ReadonlySet<string>>

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
  const nodeRecord = Record.map(nodeGroups, (group) => new Set(group.map((p) => p.propertyName)) as ReadonlySet<string>)

  // Group relEntries by relType.
  const relGroups = Array.groupBy(relEntries, (e) => e.relType)
  const relRecord = Record.map(relGroups, (group) => new Set(group.map((e) => e.propertyName)) as ReadonlySet<string>)

  // Merge both records into one and convert to Map to satisfy SchemaIndex = ReadonlyMap.
  const merged = { ...nodeRecord, ...relRecord }
  return new Map(Record.toEntries(merged)) as SchemaIndex
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
    const allowed = index.get(label)
    if (!allowed) {
      return [{ op: opKind, label, property: "*", message: `Unknown label "${label}"` }]
    }
    const keyViolations = Array.filterMap(Record.keys(key), (prop) =>
      !allowed.has(prop)
        ? Result.succeed({ op: opKind, label, property: prop, message: `Undeclared key property "${prop}" on label "${label}"` })
        : Result.failVoid)
    const propViolations = Array.filterMap(Record.keys(properties), (prop) =>
      !allowed.has(prop)
        ? Result.succeed({ op: opKind, label, property: prop, message: `Undeclared property "${prop}" on label "${label}"` })
        : Result.failVoid)
    return [...keyViolations, ...propViolations]
  }

  return ops.flatMap((op) =>
    GraphOp.match(op, {
      UpsertVertex: (v) => checkVertexProps("UpsertVertex", v.label, v.key, v.properties),
      UpsertEdge: (e) => {
        // Edge properties
        const edgeAllowed = index.get(e.label)
        const edgeViolations: ReadonlyArray<GraphOpViolation> = edgeAllowed
          ? [
              ...Array.filterMap(Record.keys(e.key), (prop) =>
                !edgeAllowed.has(prop)
                  ? Result.succeed({ op: "UpsertEdge", label: e.label, property: prop, message: `Undeclared key property "${prop}" on relationship "${e.label}"` })
                  : Result.failVoid),
              ...Array.filterMap(Record.keys(e.properties), (prop) =>
                !edgeAllowed.has(prop)
                  ? Result.succeed({ op: "UpsertEdge", label: e.label, property: prop, message: `Undeclared property "${prop}" on relationship "${e.label}"` })
                  : Result.failVoid),
            ]
          : [{ op: "UpsertEdge", label: e.label, property: "*", message: `Unknown relationship type "${e.label}"` }]

        // from-vertex key fields
        const fromAllowed = index.get(e.from.label)
        const fromViolations: ReadonlyArray<GraphOpViolation> = fromAllowed
          ? Array.filterMap(Record.keys(e.from.key), (prop) =>
              !fromAllowed.has(prop)
                ? Result.succeed({ op: "UpsertEdge", label: e.from.label, property: prop, message: `Undeclared key property "${prop}" on from-label "${e.from.label}"` })
                : Result.failVoid)
          : [{ op: "UpsertEdge", label: e.from.label, property: "*", message: `Unknown from-label "${e.from.label}"` }]

        // to-vertex key fields
        const toAllowed = index.get(e.to.label)
        const toViolations: ReadonlyArray<GraphOpViolation> = toAllowed
          ? Array.filterMap(Record.keys(e.to.key), (prop) =>
              !toAllowed.has(prop)
                ? Result.succeed({ op: "UpsertEdge", label: e.to.label, property: prop, message: `Undeclared key property "${prop}" on to-label "${e.to.label}"` })
                : Result.failVoid)
          : [{ op: "UpsertEdge", label: e.to.label, property: "*", message: `Unknown to-label "${e.to.label}"` }]

        return [...edgeViolations, ...fromViolations, ...toViolations]
      },
    }),
  )
}
