/**
 * Typed vocabulary contracts and immutable descriptors. Definitions describe operations; executable handlers live in the Effect integration.
 *
 * @since 0.0.1
 */
/**
 * Semantic operation kinds, independent of authored keywords.
 *
 * @since 0.0.1
 */
export type Kind = "given" | "when" | "context" | "success" | "failure"
/**
 * Phantom contract key used to retain vocabulary types.
 *
 * @since 0.0.1
 */
export declare const _contract: unique symbol
/**
 * The argument, context, patch, and outcome channels of one operation.
 *
 * @since 0.0.1
 */
export interface Contract<Id extends string, K extends Kind, Args extends ReadonlyArray<unknown>, N, P, A, E> {
  readonly id: Id
  readonly kind: K
  readonly args: Readonly<Args>
  readonly needs: N
  readonly patch: P
  readonly success: A
  readonly failure: E
}
/**
 * A typed vocabulary factory producing descriptors without executable handlers.
 *
 * @since 0.0.1
 */
export interface Definition<Id extends string, K extends Kind, Args extends ReadonlyArray<unknown>, N, P, A, E> {
  (...args: Args): Descriptor<Id, K, Args, N, P, A, E>
  readonly id: Id
  readonly kind: K
  readonly [_contract]: Contract<Id, K, Args, N, P, A, E>
}
/**
 * An immutable operation invocation with typed arguments and description.
 *
 * @since 0.0.1
 */
export interface Descriptor<Id extends string, K extends Kind, Args extends ReadonlyArray<unknown>, N, P, A, E> {
  readonly id: Id
  readonly kind: K
  readonly args: Readonly<Args>
  readonly description: string
  readonly definition: Definition<Id, K, Args, N, P, A, E>
  readonly [_contract]: Contract<Id, K, Args, N, P, A, E>
}
/**
 * An erased vocabulary identity suitable for heterogeneous operation sets.
 *
 * @since 0.0.1
 */
export interface AnyDefinition {
  readonly id: string
  readonly kind: Kind
  readonly [_contract]: Contract<string, Kind, ReadonlyArray<unknown>, unknown, unknown, unknown, unknown>
}
/**
 * An erased inspectable descriptor that retains its vocabulary identity.
 *
 * @since 0.0.1
 */
export interface AnyDescriptor {
  readonly id: string
  readonly kind: Kind
  readonly args: ReadonlyArray<unknown>
  readonly description: string
  readonly definition: AnyDefinition
  readonly [_contract]: Contract<string, Kind, ReadonlyArray<unknown>, unknown, unknown, unknown, unknown>
}
/**
 * Extract the typed contract of a definition or descriptor.
 *
 * @since 0.0.1
 */
export type ContractOf<D extends AnyDefinition | AnyDescriptor> = D[typeof _contract]
/**
 * Extract the vocabulary definition of a descriptor.
 *
 * @since 0.0.1
 */
export type DefinitionOf<D extends AnyDescriptor> = D["definition"]
/**
 * Require plain named-field contributions with required top-level fields.
 *
 * @since 0.0.1
 */
type IsUnion<T, Whole = T> = T extends Whole ? [Whole] extends [T] ? false : true : never
/**
 * Reject contributions without a single required named-record shape.
 *
 * @since 0.0.1
 */
export type ValidPatch<P> = IsUnion<P> extends true ? false : P extends
  | ReadonlyArray<unknown>
  | ((...args: Array<never>) => unknown)
  | Date
  | RegExp
  | Error
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | Promise<unknown>
  | ArrayBuffer
  | ArrayBufferView ? false
: Exclude<keyof P, string> extends never ?
  P extends object ? { [K in keyof P]-?: {} extends Pick<P, K> ? K : never }[keyof P] extends never ? true : false
  : false :
false
/**
 * Create vocabulary with inferred argument tuples and a literal operation identity.
 *
 * @since 0.0.1
 */
export const define =
  <N, P, A, E, K extends Kind>(kind: K) =>
  <const Id extends string, Args extends ReadonlyArray<unknown>>(
    id: Id,
    describe: (...args: Args) => string,
    ...valid: ValidPatch<P> extends true ? [] : [invalidPatch: never]
  ): Definition<Id, K, Args, N, P, A, E> => {
    void valid
    const definition = Object.assign((...args: Args) =>
      Object.freeze({
        id,
        kind,
        args: Object.freeze([...args]),
        description: describe(...args),
        definition
      }), { id, kind })
    return Object.freeze(definition) as unknown as Definition<Id, K, Args, N, P, A, E>
  }
