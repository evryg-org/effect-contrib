/**
 * @since 0.0.1
 */
import { checkGraphOps, type DeclarationIndex } from "./DeclarationCheck.js"
import { refinedMaterializer } from "./RefinedMaterializer.js"

/** The declared-write boundary: a batch that does not match its declarations fails the
 *  materialization stream, so it never reaches the store — the guard is the write path itself,
 *  not a check standing beside it.
 *
 * @since 0.0.1
 */
export const declarationCheckedMaterializer = (index: DeclarationIndex) =>
  refinedMaterializer(checkGraphOps(index), "declaration-checked")
