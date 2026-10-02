/**
 * Define action vocabulary with its own success, domain error, and context contribution.
 *
 * @since 0.0.1
 */
import { define as factory } from "./Step.js"

/**
 * Create vocabulary with inferred argument tuples and a literal operation identity.
 *
 * @since 0.0.1
 */
export const define = <Needs, A, E = never, Patch = {}>() => factory<Needs, Patch, A, E, "when">("when")
