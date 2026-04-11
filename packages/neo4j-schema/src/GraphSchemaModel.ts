import { FileSystem } from "@effect/platform"
import { Effect, Schema } from "effect"

// ── DDD Subdomain models --

export class VertexProperty extends Schema.Class<VertexProperty>("VertexProperty")({
  labels: Schema.Array(Schema.String),
  propertyName: Schema.String,
  propertyTypes: Schema.Array(Schema.String),
  mandatory: Schema.Boolean
}) {}

export class EdgeProperty extends Schema.Class<EdgeProperty>("EdgeProperty")({
  edgeType: Schema.String,
  propertyName: Schema.String,
  propertyTypes: Schema.Array(Schema.String),
  mandatory: Schema.Boolean
}) {}

export class EdgeConnectivity extends Schema.Class<EdgeConnectivity>("EdgeConnectivity")({
  edgeType: Schema.String,
  fromLabel: Schema.String,
  toLabel: Schema.String
}) {}

export class GraphSchema extends Schema.Class<GraphSchema>("GraphSchema")({
  vertexProperties: Schema.Array(VertexProperty),
  edgeProperties: Schema.Array(EdgeProperty),
  edgeConnectivity: Schema.optionalWith(Schema.Array(EdgeConnectivity), { default: () => [] })
}) {}

// ── File-based cache ──

const encodeSchema = Schema.encodeSync(GraphSchema)
const decodeSchema = Schema.decodeSync(GraphSchema)

export const saveSchema = (path: string, schema: GraphSchema) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.writeFileString(path, JSON.stringify(encodeSchema(schema), null, 2)))

export const loadSchema = (path: string) =>
  Effect.flatMap(
    FileSystem.FileSystem,
    (fs) => Effect.map(fs.readFileString(path), (content) => decodeSchema(JSON.parse(content)))
  )
