import { Schema } from "effect"
import { readFileSync, writeFileSync } from "node:fs"

// ── DDD Subdomain models --

export class NodeProperty extends Schema.Class<NodeProperty>("NodeProperty")({
  labels: Schema.Array(Schema.String),
  propertyName: Schema.String,
  propertyTypes: Schema.Array(Schema.String),
  mandatory: Schema.Boolean,
}) {}

export class RelProperty extends Schema.Class<RelProperty>("RelProperty")({
  relType: Schema.String,
  propertyName: Schema.String,
  propertyTypes: Schema.Array(Schema.String),
  mandatory: Schema.Boolean,
}) {}

export class GraphSchema extends Schema.Class<GraphSchema>("GraphSchema")({
  nodeProperties: Schema.Array(NodeProperty),
  relProperties: Schema.Array(RelProperty),
}) {}

// ── File-based cache ──

const encodeSchema = Schema.encodeSync(GraphSchema)
const decodeSchema = Schema.decodeSync(GraphSchema)

export const saveSchema = (path: string, schema: GraphSchema): void => {
  writeFileSync(path, JSON.stringify(encodeSchema(schema), null, 2), "utf-8")
}

export const loadSchema = (path: string): GraphSchema => {
  const content = readFileSync(path, "utf-8")
  return decodeSchema(JSON.parse(content))
}
