/**
 * Define setup vocabulary that contributes required named context fields.
 *
 * @since 0.0.1
 */
import { define as factory } from "./Step.js"

/**
 * Create vocabulary with inferred argument tuples and a literal operation identity.
 *
 * @since 0.0.1
 */
export const define = <Needs, Patch>() => factory<Needs, Patch, never, never, "given">("given")
