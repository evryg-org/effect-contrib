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
    InsertVertex: () => "InsertVertex",
    UpsertEdge: () => "UpsertEdge",
  })
}

/** Build a SchemaIndex from raw node/rel property entries */
export function buildSchemaIndex(
  nodeEntries: ReadonlyArray<{ labels: ReadonlyArray<string>; propertyName: string }>,
  relEntries: ReadonlyArray<{ relType: string; propertyName: string }>,
): SchemaIndex {
  const index = new Map<string, Set<string>>()
  for (const entry of nodeEntries) {
    for (const label of entry.labels) {
      let props = index.get(label)
      if (!props) {
        props = new Set()
        index.set(label, props)
      }
      props.add(entry.propertyName)
    }
  }
  for (const entry of relEntries) {
    let props = index.get(entry.relType)
    if (!props) {
      props = new Set()
      index.set(entry.relType, props)
    }
    props.add(entry.propertyName)
  }
  return index
}

/** Validate all GraphOps against the schema index. Returns accumulated violations. */
export function validateGraphOps(
  ops: ReadonlyArray<GraphOp>,
  index: SchemaIndex,
): ReadonlyArray<GraphOpViolation> {
  const violations: GraphOpViolation[] = []

  function checkVertexProps(
    opKind: string,
    label: string,
    key: Record<string, unknown>,
    properties: Record<string, unknown>,
  ): void {
    const allowed = index.get(label)
    if (!allowed) {
      violations.push({ op: opKind, label, property: "*", message: `Unknown label "${label}"` })
      return
    }
    for (const prop of Object.keys(key)) {
      if (!allowed.has(prop)) {
        violations.push({ op: opKind, label, property: prop, message: `Undeclared key property "${prop}" on label "${label}"` })
      }
    }
    for (const prop of Object.keys(properties)) {
      if (!allowed.has(prop)) {
        violations.push({ op: opKind, label, property: prop, message: `Undeclared property "${prop}" on label "${label}"` })
      }
    }
  }

  for (const op of ops) {
    GraphOp.match(op, {
      UpsertVertex: (v) => checkVertexProps("UpsertVertex", v.label, v.key, v.properties),
      InsertVertex: (v) => checkVertexProps("InsertVertex", v.label, v.key, v.properties),
      UpsertEdge: (e) => {
        // Validate edge properties
        const edgeAllowed = index.get(e.label)
        if (!edgeAllowed) {
          violations.push({ op: "UpsertEdge", label: e.label, property: "*", message: `Unknown relationship type "${e.label}"` })
        } else {
          for (const prop of Object.keys(e.key)) {
            if (!edgeAllowed.has(prop)) {
              violations.push({ op: "UpsertEdge", label: e.label, property: prop, message: `Undeclared key property "${prop}" on relationship "${e.label}"` })
            }
          }
          for (const prop of Object.keys(e.properties)) {
            if (!edgeAllowed.has(prop)) {
              violations.push({ op: "UpsertEdge", label: e.label, property: prop, message: `Undeclared property "${prop}" on relationship "${e.label}"` })
            }
          }
        }
        // Validate from/to vertex key fields
        const fromAllowed = index.get(e.from.label)
        if (!fromAllowed) {
          violations.push({ op: "UpsertEdge", label: e.from.label, property: "*", message: `Unknown from-label "${e.from.label}"` })
        } else {
          for (const prop of Object.keys(e.from.key)) {
            if (!fromAllowed.has(prop)) {
              violations.push({ op: "UpsertEdge", label: e.from.label, property: prop, message: `Undeclared key property "${prop}" on from-label "${e.from.label}"` })
            }
          }
        }
        const toAllowed = index.get(e.to.label)
        if (!toAllowed) {
          violations.push({ op: "UpsertEdge", label: e.to.label, property: "*", message: `Unknown to-label "${e.to.label}"` })
        } else {
          for (const prop of Object.keys(e.to.key)) {
            if (!toAllowed.has(prop)) {
              violations.push({ op: "UpsertEdge", label: e.to.label, property: prop, message: `Undeclared key property "${prop}" on to-label "${e.to.label}"` })
            }
          }
        }
      },
    })
  }

  return violations
}
