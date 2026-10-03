// The GraphOp graph-mutation eDSL: mutation terms as data (initial encoding),
// its declaration check, the materializer port, and the one-way adapter combinator.
// Concrete materializers (neo4j, memory) are separate adapter packages.

export { enrichVertexPropertiesBy } from "./Attribution.js"
export type { VertexAttribution, VertexAttributionFor } from "./Attribution.js"
export { GraphOp, PropertyMap, UpsertEdge, UpsertVertex, VertexRef } from "./GraphOp.js"
export type { GraphOp as GraphOpType, PropertyMap as PropertyMapType } from "./GraphOp.js"
export { enrichVertexKeys } from "./GraphOpScope.js"
export { enrichVertexKeysBy, enrichVertexKeysByResult } from "./Partition.js"
export type { PartitionKey, PartitionKeyFor } from "./Partition.js"

export { SetMap } from "./SetMap.js"
export type { SetMap as SetMapType } from "./SetMap.js"

export { EdgeDropped, EdgeMaterialized, EdgeOutcome, EdgeShape, EdgeTally } from "./EdgeTally.js"

export {
  GraphOpMaterializer,
  materialize,
  MaterializeProgress,
  MaterializeSummary,
  summarize
} from "./GraphOpMaterializer.js"

export {
  checkFields,
  checkGraphOp,
  checkGraphOps,
  checkOwnedGraphOp,
  ConflictingEdgeDeclarationError,
  type Declaration,
  DeclarationIndex,
  DeclarationViolationError,
  type DeclaredFields,
  DuplicateDeclarationError,
  EdgeDeclaration,
  EndpointPair,
  NullOnRequired,
  OwnedDeclarations,
  UndeclaredConnectivity,
  UndeclaredLabel,
  UndeclaredProperty,
  UndecodableProperty,
  VertexDeclaration,
  ViolationReason
} from "./DeclarationCheck.js"

export { declarationCheckedMaterializer } from "./DeclarationCheckedMaterializer.js"

export { formatElapsed, logPhase } from "./PhaseLog.js"

export { graphOpAdapter } from "./GraphOpAdapter.js"

export { refinedMaterializer, type Refinement, refineThenMaterialize } from "./RefinedMaterializer.js"
