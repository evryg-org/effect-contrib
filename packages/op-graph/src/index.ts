// The GraphOp graph-mutation eDSL: mutation terms as data (initial encoding),
// its declaration check, the materializer port, and the one-way adapter combinator.
// Concrete materializers (neo4j, memory) are separate adapter packages.

export {
  VertexRef,
  UpsertVertex,
  UpsertEdge,
  GraphOp,
  PropertyMap,
} from "./GraphOp.js"
export { enrichVertexKeys } from "./GraphOpScope.js"
export { enrichVertexKeysBy, enrichVertexKeysByResult } from "./Partition.js"
export type { PartitionKey, PartitionKeyFor } from "./Partition.js"
export { enrichVertexPropertiesBy } from "./Attribution.js"
export type { VertexAttribution, VertexAttributionFor } from "./Attribution.js"
export type {
  GraphOp as GraphOpType,
  PropertyMap as PropertyMapType,
} from "./GraphOp.js"

export { SetMap } from "./SetMap.js"
export type { SetMap as SetMapType } from "./SetMap.js"

export { EdgeShape, EdgeOutcome, EdgeMaterialized, EdgeDropped, EdgeTally } from "./EdgeTally.js"

export {
  GraphOpMaterializer,
  materialize,
  summarize,
  MaterializeSummary,
  MaterializeProgress,
} from "./GraphOpMaterializer.js"

export {
  EndpointPair,
  VertexDeclaration,
  EdgeDeclaration,
  DeclarationIndex,
  DeclarationViolationError,
  DuplicateDeclarationError,
  ConflictingEdgeDeclarationError,
  UndeclaredLabel,
  UndeclaredProperty,
  NullOnRequired,
  UndecodableProperty,
  UndeclaredConnectivity,
  ViolationReason,
  checkFields,
  checkGraphOp,
  checkGraphOps,
  type Declaration,
  type DeclaredFields,
} from "./DeclarationCheck.js"

export { declarationCheckedMaterializer } from "./DeclarationCheckedMaterializer.js"

export { formatElapsed, logPhase } from "./PhaseLog.js"

export { graphOpAdapter } from "./GraphOpAdapter.js"
