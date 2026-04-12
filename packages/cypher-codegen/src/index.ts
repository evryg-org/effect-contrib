/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  extractParams,
  /**
   * @since 0.0.1
   */
  generateModule
} from "./backend/CypherCodegen.js"

/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  generateDeclarations,
  /**
   * @since 0.0.1
   */
  type QueryEntry
} from "./backend/CypherDeclarationGen.js"

/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  CypherTypeError
} from "./frontend/InferType.js"

/**
 * @since 0.1.1
 */
export {
  /**
   * @since 0.1.1
   */
  CypherCodegenError,
  /**
   * @since 0.1.1
   */
  DuplicateCypherFilenamesError
} from "./internal/cli/commands/Shared.js"

/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  analyzeQuery,
  /**
   * @since 0.0.1
   */
  type Neo4jType,
  /**
   * @since 0.0.1
   */
  type QueryAnalysis,
  /**
   * @since 0.0.1
   */
  type ResolvedColumn,
  /**
   * @since 0.0.1
   */
  type ResolvedParam
} from "./frontend/QueryAnalyzer.js"

/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  cypherPlugin
} from "./VitePlugin.js"

/**
 * @since 0.0.1
 */
export {
  /**
   * @since 0.0.1
   */
  type CypherType,
  /**
   * @since 0.0.1
   */
  ListType,
  /**
   * @since 0.0.1
   */
  MapType,
  /**
   * @since 0.0.1
   */
  NeverType,
  /**
   * @since 0.0.1
   */
  ScalarType,
  /**
   * @since 0.0.1
   */
  UnknownType
} from "./types/CypherType.js"
