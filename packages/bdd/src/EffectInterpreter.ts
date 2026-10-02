/** Effect implementations are supplied independently of authored specifications.
 * @since 0.0.1
 */
import type { Effect } from "effect"
import type { AnyDefinition, ContractOf } from "./core/Step.js"

/**
 * A typed action result supplied to its context update.
 * @since 0.0.1
 * @category models
 */
export type Outcome<A, E> =
  | { readonly _tag: "Success"; readonly value: A }
  | { readonly _tag: "Failure"; readonly error: E }

type IsUnion<T, Whole = T> = T extends Whole ? [Whole] extends [T] ? false : true : never

type C<D extends AnyDefinition> = ContractOf<D>
// An empty declared patch must still produce a named-field record, not a primitive.
type Patch<D extends AnyDefinition> = keyof C<D>["patch"] extends never ? Record<string, never> : C<D>["patch"]
type Action<D extends AnyDefinition, R> =
  & {
    readonly execute: (args: C<D>["args"], context: C<D>["needs"]) => Effect.Effect<C<D>["success"], C<D>["failure"], R>
  }
  & (keyof C<D>["patch"] extends never ? {
      readonly update?: (context: C<D>["needs"], outcome: Outcome<C<D>["success"], C<D>["failure"]>) => Patch<D>
    } :
    {
      readonly update: (context: C<D>["needs"], outcome: Outcome<C<D>["success"], C<D>["failure"]>) => Patch<D>
    })
/**
 * The Effect callback contract for a vocabulary definition.
 * @since 0.0.1
 * @category models
 */
export type Implementation<D extends AnyDefinition, R = never, E = never> = C<D>["kind"] extends "given"
  ? (args: C<D>["args"], context: C<D>["needs"]) => Effect.Effect<Patch<D>, E, R>
  : C<D>["kind"] extends "when" ? Action<D, R>
  : C<D>["kind"] extends "success"
    ? (args: C<D>["args"], context: C<D>["needs"], value: C<D>["success"]) => Effect.Effect<void, E, R>
  : C<D>["kind"] extends "failure"
    ? (args: C<D>["args"], context: C<D>["needs"], error: C<D>["failure"]) => Effect.Effect<void, E, R>
  : (args: C<D>["args"], context: C<D>["needs"]) => Effect.Effect<void, E, R>

declare const BindingTypeId: unique symbol
/**
 * An implementation paired with its vocabulary definition.
 * @since 0.0.1
 * @category models
 */
export interface Binding<D, R> {
  readonly definition: D
  readonly implementation: unknown
  readonly [BindingTypeId]: { readonly definition: D; readonly services: R }
}
/**
 * An erased binding used to retain heterogeneous interpreter tuples.
 * @since 0.0.1
 * @category models
 */
export interface AnyBinding {
  readonly definition: AnyDefinition
  readonly implementation: unknown
  readonly [BindingTypeId]: { readonly definition: unknown; readonly services: unknown }
}
/**
 * A collection of implementations selected when executing a scenario.
 * @since 0.0.1
 * @category models
 */
export interface Interpreter<B extends ReadonlyArray<AnyBinding>> {
  readonly bindings: B
}
/**
 * The union of operation definitions implemented by a binding tuple.
 * @since 0.0.1
 * @category models
 */
export type Definitions<B extends ReadonlyArray<AnyBinding>> = B[number][typeof BindingTypeId]["definition"]
/**
 * Services required by bindings used in the authored scenario.
 * @since 0.0.1
 * @category models
 */
export type Requirements<Ops, B extends ReadonlyArray<AnyBinding>> = B[number] extends infer Entry
  ? Entry extends AnyBinding ? [Extract<Ops, Entry[typeof BindingTypeId]["definition"]>] extends [never] ? never
    : Entry[typeof BindingTypeId]["services"]
  : never
  : never
/**
 * Requires every operation in a scenario to have an implementation.
 * @since 0.0.1
 * @category models
 */
export type Coverage<Ops, B extends ReadonlyArray<AnyBinding>> = number extends B["length"]
  ? { readonly incompleteBindings: "Interpreter bindings must be a statically known tuple" }
  : unknown extends Definitions<B>
    ? { readonly incompleteBindings: "Interpreter definitions must retain their operation contracts" }
  : AnyDefinition extends Definitions<B>
    ? { readonly incompleteBindings: "Interpreter definitions must retain their operation contracts" }
  : [Exclude<Ops, Definitions<B>>] extends [never] ? unknown
  : { readonly missingBindings: Exclude<Ops, Definitions<B>> }

type ReturnedPatch<D extends AnyDefinition, I> = C<D>["kind"] extends "given"
  ? I extends (...args: Array<never>) => Effect.Effect<infer P, unknown, unknown> ? P : never
  : C<D>["kind"] extends "when" ? I extends { readonly update: (...args: Array<never>) => infer P } ? P : never
  : never

type PatchKeys<P> = P extends unknown ? keyof P : never

type ExactPatch<D extends AnyDefinition, I> = [ReturnedPatch<D, I>] extends [never] ? unknown :
  Exclude<PatchKeys<ReturnedPatch<D, I>>, keyof C<D>["patch"]> extends never ? unknown
  : { readonly unexpectedContextFields: Exclude<PatchKeys<ReturnedPatch<D, I>>, keyof C<D>["patch"]> }

/**
 * Bind one typed vocabulary definition to its implementation.
 * @since 0.0.1
 * @category constructors
 */
export const bind = <
  D extends AnyDefinition,
  R = never,
  E = never,
  I extends Implementation<NoInfer<D>, R, E> = Implementation<NoInfer<D>, R, E>
>(
  definition: D & (true extends IsUnion<D> ? never : unknown),
  implementation: I & Implementation<NoInfer<D>, R, E> & ExactPatch<NoInfer<D>, I>
): Binding<D, R> =>
  Object.freeze({
    definition,
    implementation: typeof implementation === "function" ? implementation : Object.freeze({ ...implementation })
  }) as unknown as Binding<D, R>

/**
 * Construct an interpreter, rejecting duplicate definitions.
 * @since 0.0.1
 * @category constructors
 */
export const make = <const B extends ReadonlyArray<AnyBinding>>(...bindings: B): Interpreter<Readonly<B>> => {
  const definitions = new Set<AnyDefinition>()
  for (const binding of bindings) {
    if (definitions.has(binding.definition)) throw new Error(`Duplicate binding: ${binding.definition.id}`)
    definitions.add(binding.definition)
  }
  return Object.freeze({ bindings: Object.freeze(bindings) })
}
