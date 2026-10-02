/**
 * Compose reusable descriptor tuples. Fragments preserve ordering and are validated against the receiving scenario context.
 *
 * @since 0.0.1
 */
import type { AnyDescriptor } from "./Step.js"

const programs = new WeakMap<object, ReadonlyArray<AnyDescriptor>>()
declare const _steps: unique symbol
/**
 * An opaque reusable fragment retaining its descriptor tuple.
 *
 * @since 0.0.1
 */
export interface Steps<T extends ReadonlyArray<AnyDescriptor> = ReadonlyArray<AnyDescriptor>> {
  readonly [_steps]: T
}
/**
 * Create an immutable fragment from an ordered descriptor tuple.
 *
 * @since 0.0.1
 */
export const from = <const T extends ReadonlyArray<AnyDescriptor>>(...descriptors: T): Steps<T> => {
  const fragment = Object.freeze({})
  programs.set(fragment, Object.freeze([...descriptors]))
  return fragment as Steps<T>
}
/**
 * The empty fragment, an identity for compatible fragment composition.
 *
 * @since 0.0.1
 */
export const empty: Steps<readonly []> = from()
/**
 * Inspect the immutable descriptor sequence of a fragment.
 *
 * @since 0.0.1
 */
export const entries = (fragment: Steps): ReadonlyArray<AnyDescriptor> => {
  const program = programs.get(fragment)
  if (!program) throw new TypeError("Expected a Steps fragment")
  return program
}
/**
 * Concatenate descriptor tuples in execution order, in dual form.
 *
 * @since 0.0.1
 */
export function concat<A extends ReadonlyArray<AnyDescriptor>, B extends ReadonlyArray<AnyDescriptor>>(
  left: Steps<A>,
  right: Steps<B>
): Steps<readonly [...A, ...B]>
/**
 * Concatenate descriptor tuples in execution order, in dual form.
 *
 * @since 0.0.1
 */
export function concat<B extends ReadonlyArray<AnyDescriptor>>(
  right: Steps<B>
): <A extends ReadonlyArray<AnyDescriptor>>(left: Steps<A>) => Steps<readonly [...A, ...B]>
/**
 * Concatenate descriptor tuples in execution order, in dual form.
 *
 * @since 0.0.1
 */
export function concat(left: Steps, right?: Steps): Steps | ((left: Steps) => Steps) {
  if (!right) return (first) => from(...entries(first), ...entries(left))
  return from(...entries(left), ...entries(right))
}
