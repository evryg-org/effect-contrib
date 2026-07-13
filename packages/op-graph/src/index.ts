// The GraphOp graph-mutation eDSL: mutation terms as data (initial encoding),
// its validator, the materializer port, and the one-way adapter combinator.
// Concrete materializers (neo4j, memory) are separate adapter packages.

export {
  VertexRef,
  UpsertVertex,
  UpsertEdge,
  GraphOp,
  GraphOpArray,
  PropertyMap,
} from "./GraphOp.js"
export { enrichVertexKeys } from "./GraphOpScope.js"
export { enrichVertexKeysBy } from "./Partition.js"
export type { PartitionKey, PartitionKeyFor } from "./Partition.js"
export type {
  GraphOp as GraphOpType,
  GraphOpArray as GraphOpArrayType,
  PropertyMap as PropertyMapType,
} from "./GraphOp.js"

export { SetMap } from "./SetMap.js"
export type { SetMap as SetMapType } from "./SetMap.js"

export {
  GraphOpMaterializer,
  materialize,
  summarize,
  MaterializeSummary,
  MaterializeProgress,
} from "./GraphOpMaterializer.js"

export {
  buildSchemaIndex,
  validateGraphOps,
  graphOpKind,
  type SchemaIndex,
  type GraphOpViolation,
} from "./GraphOpValidator.js"

export { graphOpAdapter } from "./GraphOpAdapter.js"
