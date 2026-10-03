/**
 * The GraphOp graph-mutation eDSL: mutation terms as data (initial encoding), its declaration
 * check, the materializer port, and the one-way adapter combinator. Concrete materializers
 * implement the `GraphOpMaterializer` port in their own packages.
 *
 * @since 0.0.1
 */

/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  enrichVertexPropertiesBy
} from "./Attribution.js"
/**
 * @since 0.0.1
 */
export type {
  /**
   * @since 0.0.1
   */
  VertexAttribution,
  /**
   * @since 0.0.1
   */
  VertexAttributionFor
} from "./Attribution.js"
/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  GraphOp,
  /**
   * @since 0.0.1
   */
  PropertyMap,
  /**
   * @since 0.0.1
   */
  UpsertEdge,
  /**
   * @since 0.0.1
   */
  UpsertVertex,
  /**
   * @since 0.0.1
   */
  VertexRef
} from "./GraphOp.js"
/**
 * @since 0.0.1
 */
export type {
  /**
   * @since 0.0.1
   */
  GraphOp as GraphOpType,
  /**
   * @since 0.0.1
   */
  PropertyMap as PropertyMapType
} from "./GraphOp.js"
/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  enrichVertexKeys
} from "./GraphOpScope.js"
/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  enrichVertexKeysBy,
  /**
   * @since 0.0.1
   */
  enrichVertexKeysByResult
} from "./Partition.js"
/**
 * @since 0.0.1
 */
export type {
  /**
   * @since 0.0.1
   */
  PartitionKey,
  /**
   * @since 0.0.1
   */
  PartitionKeyFor
} from "./Partition.js"

/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  SetMap
} from "./SetMap.js"
/**
 * @since 0.0.1
 */
export type {
  /**
   * @since 0.0.1
   */
  SetMap as SetMapType
} from "./SetMap.js"

/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  EdgeDropped,
  /**
   * @since 0.0.1
   */
  EdgeMaterialized,
  /**
   * @since 0.0.1
   */
  EdgeOutcome,
  /**
   * @since 0.0.1
   */
  EdgeShape,
  /**
   * @since 0.0.1
   */
  EdgeTally
} from "./EdgeTally.js"

/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  GraphOpMaterializer,
  /**
   * @since 0.0.1
   */
  materialize,
  /**
   * @since 0.0.1
   */
  MaterializeProgress,
  /**
   * @since 0.0.1
   */
  MaterializeSummary,
  /**
   * @since 0.0.1
   */
  summarize
} from "./GraphOpMaterializer.js"

/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  checkFields,
  /**
   * @since 0.0.1
   */
  checkGraphOp,
  /**
   * @since 0.0.1
   */
  checkGraphOps,
  /**
   * @since 0.0.1
   */
  checkOwnedGraphOp,
  /**
   * @since 0.0.1
   */
  ConflictingEdgeDeclarationError,
  /**
   * @since 0.0.1
   */
  type Declaration,
  /**
   * @since 0.0.1
   */
  DeclarationIndex,
  /**
   * @since 0.0.1
   */
  DeclarationViolationError,
  /**
   * @since 0.0.1
   */
  type DeclaredFields,
  /**
   * @since 0.0.1
   */
  DuplicateDeclarationError,
  /**
   * @since 0.0.1
   */
  EdgeDeclaration,
  /**
   * @since 0.0.1
   */
  EndpointPair,
  /**
   * @since 0.0.1
   */
  NullOnRequired,
  /**
   * @since 0.0.1
   */
  OwnedDeclarations,
  /**
   * @since 0.0.1
   */
  UndeclaredConnectivity,
  /**
   * @since 0.0.1
   */
  UndeclaredLabel,
  /**
   * @since 0.0.1
   */
  UndeclaredProperty,
  /**
   * @since 0.0.1
   */
  UndecodableProperty,
  /**
   * @since 0.0.1
   */
  VertexDeclaration,
  /**
   * @since 0.0.1
   */
  ViolationReason
} from "./DeclarationCheck.js"

/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  declarationCheckedMaterializer
} from "./DeclarationCheckedMaterializer.js"

/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  formatElapsed,
  /**
   * @since 0.0.1
   */
  logPhase
} from "./PhaseLog.js"

/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  graphOpAdapter
} from "./GraphOpAdapter.js"

/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  refinedMaterializer,
  /**
   * @since 0.0.1
   */
  type Refinement,
  /**
   * @since 0.0.1
   */
  refineThenMaterialize
} from "./RefinedMaterializer.js"
