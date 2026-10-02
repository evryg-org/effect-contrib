/**
 * Define context, success, and domain-failure expectations independently of their implementations.
 *
 * @since 0.0.1
 */
import { define as factory } from "./Step.js"

/**
 * Define a context-only expectation requiring no preceding action.
 *
 * @since 0.0.1
 */
export const context = <Needs>() => factory<Needs, {}, never, never, "context">("context")
/**
 * Define an expectation for the latest action success value.
 *
 * @since 0.0.1
 */
export const success = <Needs, A>() => factory<Needs, {}, A, never, "success">("success")
/**
 * Define an expectation acknowledging the latest action domain error.
 *
 * @since 0.0.1
 */
export const failure = <Needs, E>() => factory<Needs, {}, never, E, "failure">("failure")
