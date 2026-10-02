/**
 * Build ordered specifications using fluent methods or dual pipe combinators. Completed scenarios are immutable and have no callable then property.
 *
 * @since 0.0.1
 */
import type { AnyDefinition, AnyDescriptor, ContractOf, Kind } from "./Step.js"
import { entries, type Steps } from "./Steps.js"

/**
 * Flatten an object type for readable inferred context.
 *
 * @since 0.0.1
 */
export type Simplify<T> = { [K in keyof T]: T[K] } & {}
/**
 * Merge context contributions with replacement types for overwritten fields.
 *
 * @since 0.0.1
 */
export type Merge<C, P> = C extends unknown ? P extends unknown ? Simplify<Omit<C, keyof P> & P> : never : never
/**
 * The result categories used in diagnostic metadata.
 *
 * @since 0.0.1
 */
export type Outcome = "success" | "failure" | "defect"
/**
 * Authored Gherkin keywords, including non-negating But.
 *
 * @since 0.0.1
 */
export type Keyword = "Given" | "When" | "Then" | "And" | "But"
declare const _scenario: unique symbol
declare const _state: unique symbol
/**
 * An opaque completed specification carrying its required operation definitions.
 *
 * @since 0.0.1
 */
export interface Scenario<O extends AnyDefinition = AnyDefinition> {
  readonly name: string
  readonly tags: ReadonlyArray<string>
  readonly [_scenario]: O
}
/**
 * Extract the definitions required to execute a completed scenario.
 *
 * @since 0.0.1
 */
export type Ops<S extends Scenario> = S[typeof _scenario]
/**
 * The context and action channels tracked during authoring.
 *
 * @since 0.0.1
 */
export interface State {
  readonly context: unknown
  readonly success: unknown
  readonly failure: unknown
  readonly ops: AnyDefinition
  readonly last: Kind | never
  readonly action: boolean
}
/**
 * The empty context and operation state of a new builder.
 *
 * @since 0.0.1
 */
export type Initial = {
  readonly context: {}
  readonly success: never
  readonly failure: never
  readonly ops: never
  readonly last: never
  readonly action: false
}
/**
 * Apply a descriptor contract to the current authoring state.
 *
 * @since 0.0.1
 */
export type Next<S extends State, D extends AnyDescriptor> = {
  readonly context: Merge<S["context"], ContractOf<D>["patch"]>
  readonly success: D["kind"] extends "when" ? ContractOf<D>["success"] : S["success"]
  readonly failure: D["kind"] extends "when" ? ContractOf<D>["failure"] : S["failure"]
  readonly ops: S["ops"] | D["definition"]
  readonly last: D["kind"]
  readonly action: D["kind"] extends "when" ? true : S["action"]
}
type Semantic<K extends Kind> = K extends "given" | "when" ? K : "then"
/**
 * Validate required context and the latest action assertion subject.
 *
 * @since 0.0.1
 */
type CompatibleOne<S extends State, D extends AnyDescriptor> = S["context"] extends ContractOf<D>["needs"]
  ? D["kind"] extends "success" ?
    S["action"] extends true ? S["success"] extends ContractOf<D>["success"] ? unknown : never : never
  : D["kind"] extends "failure" ?
    S["action"] extends true ? S["failure"] extends ContractOf<D>["failure"] ? unknown : never : never
  : unknown :
  never
/**
 * Check every possible descriptor contract when a caller supplies a union.
 *
 * @since 0.0.1
 */
export type Compatible<S extends State, D extends AnyDescriptor> =
  [D extends unknown ? CompatibleOne<S, D> extends never ? D : never : never] extends [never] ? unknown : never
/**
 * Apply a descriptor tuple in order, rejecting incompatible or widened fragments.
 *
 * @since 0.0.1
 */
export type Fold<S extends State, T extends ReadonlyArray<AnyDescriptor>> = T extends
  readonly [infer D extends AnyDescriptor, ...infer Rest extends ReadonlyArray<AnyDescriptor>]
  ? Compatible<S, D> extends never ? never : Fold<Next<S, D>, Rest> :
  number extends T["length"] ? never
  : S
/**
 * An immutable fluent builder. Call build to obtain a completed scenario.
 *
 * @since 0.0.1
 */
export interface Builder<S extends State = Initial> {
  readonly [_state]: S
  given<D extends AnyDescriptor>(
    step: D & Compatible<S, D> & (D["kind"] extends "given" ? unknown : never)
  ): Builder<Next<S, D>>
  when<D extends AnyDescriptor>(
    step: D & Compatible<S, D> & (D["kind"] extends "when" ? unknown : never)
  ): Builder<Next<S, D>>
  then<D extends AnyDescriptor>(
    step: D & Compatible<S, D> & (D["kind"] extends "context" | "success" | "failure" ? unknown : never)
  ): Builder<Next<S, D>>
  and<D extends AnyDescriptor>(
    step: D & Compatible<S, D> & (Semantic<D["kind"]> extends Semantic<S["last"]> ? unknown : never)
  ): Builder<Next<S, D>>
  but<D extends AnyDescriptor>(
    step: D & Compatible<S, D> & (Semantic<D["kind"]> extends Semantic<S["last"]> ? unknown : never)
  ): Builder<Next<S, D>>
  use<const T extends ReadonlyArray<AnyDescriptor>>(
    fragment: Steps<T> & (Fold<S, T> extends never ? never : unknown)
  ): Builder<Fold<S, T>>
  build(): Scenario<S["ops"]>
  pipe(): Builder<S>
  pipe<A>(a: (self: Builder<S>) => A): A
  pipe<A, B>(a: (self: Builder<S>) => A, b: (self: A) => B): B
  pipe<A, B, C>(a: (self: Builder<S>) => A, b: (self: A) => B, c: (self: B) => C): C
  pipe<A, B, C, D>(a: (self: Builder<S>) => A, b: (self: A) => B, c: (self: B) => C, d: (self: C) => D): D
  pipe<A, B, C, D, E>(
    a: (self: Builder<S>) => A,
    b: (self: A) => B,
    c: (self: B) => C,
    d: (self: C) => D,
    e: (self: D) => E
  ): E
  pipe<A, B, C, D, E, F>(
    a: (self: Builder<S>) => A,
    b: (self: A) => B,
    c: (self: B) => C,
    d: (self: C) => D,
    e: (self: D) => E,
    f: (self: E) => F
  ): F
  pipe<A, B, C, D, E, F, G>(
    a: (self: Builder<S>) => A,
    b: (self: A) => B,
    c: (self: B) => C,
    d: (self: C) => D,
    e: (self: D) => E,
    f: (self: E) => F,
    g: (self: F) => G
  ): G
  pipe<A, B, C, D, E, F, G, H>(
    a: (self: Builder<S>) => A,
    b: (self: A) => B,
    c: (self: B) => C,
    d: (self: C) => D,
    e: (self: D) => E,
    f: (self: E) => F,
    g: (self: F) => G,
    h: (self: G) => H
  ): H
  pipe<A, B, C, D, E, F, G, H, I>(
    a: (self: Builder<S>) => A,
    b: (self: A) => B,
    c: (self: B) => C,
    d: (self: C) => D,
    e: (self: D) => E,
    f: (self: E) => F,
    g: (self: F) => G,
    h: (self: G) => H,
    i: (self: H) => I
  ): I
  pipe<A, B, C, D, E, F, G, H, I, J>(
    a: (self: Builder<S>) => A,
    b: (self: A) => B,
    c: (self: B) => C,
    d: (self: C) => D,
    e: (self: D) => E,
    f: (self: E) => F,
    g: (self: F) => G,
    h: (self: G) => H,
    i: (self: H) => I,
    j: (self: I) => J
  ): J
  pipe<A, B, C, D, E, F, G, H, I, J, K>(
    a: (self: Builder<S>) => A,
    b: (self: A) => B,
    c: (self: B) => C,
    d: (self: C) => D,
    e: (self: D) => E,
    f: (self: E) => F,
    g: (self: F) => G,
    h: (self: G) => H,
    i: (self: H) => I,
    j: (self: I) => J,
    k: (self: J) => K
  ): K
  pipe<A, B, C, D, E, F, G, H, I, J, K, L>(
    a: (self: Builder<S>) => A,
    b: (self: A) => B,
    c: (self: B) => C,
    d: (self: C) => D,
    e: (self: D) => E,
    f: (self: E) => F,
    g: (self: F) => G,
    h: (self: G) => H,
    i: (self: H) => I,
    j: (self: I) => J,
    k: (self: J) => K,
    l: (self: K) => L
  ): L
  pipe<A, B, C, D, E, F, G, H, I, J, K, L, M>(
    a: (self: Builder<S>) => A,
    b: (self: A) => B,
    c: (self: B) => C,
    d: (self: C) => D,
    e: (self: D) => E,
    f: (self: E) => F,
    g: (self: F) => G,
    h: (self: G) => H,
    i: (self: H) => I,
    j: (self: I) => J,
    k: (self: J) => K,
    l: (self: K) => L,
    m: (self: L) => M
  ): M
  pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N>(
    a: (self: Builder<S>) => A,
    b: (self: A) => B,
    c: (self: B) => C,
    d: (self: C) => D,
    e: (self: D) => E,
    f: (self: E) => F,
    g: (self: F) => G,
    h: (self: G) => H,
    i: (self: H) => I,
    j: (self: I) => J,
    k: (self: J) => K,
    l: (self: K) => L,
    m: (self: L) => M,
    n: (self: M) => N
  ): N
  pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O>(
    a: (self: Builder<S>) => A,
    b: (self: A) => B,
    c: (self: B) => C,
    d: (self: C) => D,
    e: (self: D) => E,
    f: (self: E) => F,
    g: (self: F) => G,
    h: (self: G) => H,
    i: (self: H) => I,
    j: (self: I) => J,
    k: (self: J) => K,
    l: (self: K) => L,
    m: (self: L) => M,
    n: (self: M) => N,
    o: (self: N) => O
  ): O
  pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>(
    a: (self: Builder<S>) => A,
    b: (self: A) => B,
    c: (self: B) => C,
    d: (self: C) => D,
    e: (self: D) => E,
    f: (self: E) => F,
    g: (self: F) => G,
    h: (self: G) => H,
    i: (self: H) => I,
    j: (self: I) => J,
    k: (self: J) => K,
    l: (self: K) => L,
    m: (self: L) => M,
    n: (self: M) => N,
    o: (self: N) => O,
    p: (self: O) => P
  ): P
  pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q>(
    a: (self: Builder<S>) => A,
    b: (self: A) => B,
    c: (self: B) => C,
    d: (self: C) => D,
    e: (self: D) => E,
    f: (self: E) => F,
    g: (self: F) => G,
    h: (self: G) => H,
    i: (self: H) => I,
    j: (self: I) => J,
    k: (self: J) => K,
    l: (self: K) => L,
    m: (self: L) => M,
    n: (self: M) => N,
    o: (self: N) => O,
    p: (self: O) => P,
    q: (self: P) => Q
  ): Q
  pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R>(
    a: (self: Builder<S>) => A,
    b: (self: A) => B,
    c: (self: B) => C,
    d: (self: C) => D,
    e: (self: D) => E,
    f: (self: E) => F,
    g: (self: F) => G,
    h: (self: G) => H,
    i: (self: H) => I,
    j: (self: I) => J,
    k: (self: J) => K,
    l: (self: K) => L,
    m: (self: L) => M,
    n: (self: M) => N,
    o: (self: N) => O,
    p: (self: O) => P,
    q: (self: P) => Q,
    r: (self: Q) => R
  ): R
  pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, T>(
    a: (self: Builder<S>) => A,
    b: (self: A) => B,
    c: (self: B) => C,
    d: (self: C) => D,
    e: (self: D) => E,
    f: (self: E) => F,
    g: (self: F) => G,
    h: (self: G) => H,
    i: (self: H) => I,
    j: (self: I) => J,
    k: (self: J) => K,
    l: (self: K) => L,
    m: (self: L) => M,
    n: (self: M) => N,
    o: (self: N) => O,
    p: (self: O) => P,
    q: (self: P) => Q,
    r: (self: Q) => R,
    s: (self: R) => T
  ): T
  pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, T, U>(
    a: (self: Builder<S>) => A,
    b: (self: A) => B,
    c: (self: B) => C,
    d: (self: C) => D,
    e: (self: D) => E,
    f: (self: E) => F,
    g: (self: F) => G,
    h: (self: G) => H,
    i: (self: H) => I,
    j: (self: I) => J,
    k: (self: J) => K,
    l: (self: K) => L,
    m: (self: L) => M,
    n: (self: M) => N,
    o: (self: N) => O,
    p: (self: O) => P,
    q: (self: P) => Q,
    r: (self: Q) => R,
    s: (self: R) => T,
    t: (self: T) => U
  ): U
}
/**
 * An inspectable authored keyword paired with its immutable descriptor.
 *
 * @since 0.0.1
 */
export interface ProgramStep {
  readonly keyword: Keyword
  readonly descriptor: AnyDescriptor
}
interface Program {
  readonly name: string
  readonly tags: ReadonlyArray<string>
  readonly steps: ReadonlyArray<ProgramStep>
}
const builders = new WeakMap<object, Program>()
const scenarios = new WeakMap<object, Program>()
/**
 * Read the ordered program of a completed scenario without executing handlers.
 *
 * @since 0.0.1
 */
export const inspect = (scenario: Scenario): ReadonlyArray<ProgramStep> => {
  const program = scenarios.get(scenario)
  if (!program) throw new TypeError("Expected a completed Scenario")
  return program.steps
}
const semantic = (kind: Kind): Keyword => kind === "given" ? "Given" : kind === "when" ? "When" : "Then"
const append = (builder: object, descriptor: AnyDescriptor, keyword: Keyword): Builder<State> => {
  const program = builders.get(builder)
  if (!program) throw new TypeError("Expected a Scenario builder")
  const last = program.steps.at(-1)
  if (
    (keyword === "And" || keyword === "But") && (!last || semantic(last.descriptor.kind) !== semantic(descriptor.kind))
  ) throw new TypeError(`${keyword} must inherit the preceding step kind`)
  if ((keyword === "Given" || keyword === "When" || keyword === "Then") && keyword !== semantic(descriptor.kind)) {
    throw new TypeError("Incompatible step kind")
  }
  return create({ ...program, steps: Object.freeze([...program.steps, Object.freeze({ keyword, descriptor })]) })
}
const create = (program: Program): Builder<State> => {
  const builder = {
    given: (d: AnyDescriptor) => append(builder, d, "Given"),
    when: (d: AnyDescriptor) => append(builder, d, "When"),
    then: (d: AnyDescriptor) => append(builder, d, "Then"),
    and: (d: AnyDescriptor) => append(builder, d, "And"),
    but: (d: AnyDescriptor) => append(builder, d, "But"),
    use: (fragment: Steps) =>
      entries(fragment).reduce((b: object, d) => append(b, d, semantic(d.kind)), builder) as Builder<State>,
    build: () => {
      const completed = Object.freeze({ name: program.name, tags: program.tags })
      scenarios.set(completed, program)
      return completed
    },
    pipe: (...fns: ReadonlyArray<(value: unknown) => unknown>) =>
      fns.reduce((value, fn) => fn(value), builder as unknown)
  }
  builders.set(builder, program)
  return Object.freeze(builder) as unknown as Builder<State>
}
/**
 * Start an empty scenario builder with optional tags.
 *
 * @since 0.0.1
 */
export const make = (name: string, options?: { readonly tags?: ReadonlyArray<string> }): Builder<Initial> =>
  create({ name, tags: Object.freeze([...(options?.tags ?? [])]), steps: Object.freeze([]) }) as unknown as Builder<
    Initial
  >
/**
 * Complete a builder as an immutable, non-thenable scenario.
 *
 * @since 0.0.1
 */
export const build = <S extends State>(builder: Builder<S>): Scenario<S["ops"]> => builder.build()
type Allowed<K extends Keyword, S extends State, D extends AnyDescriptor> =
  & Compatible<S, D>
  & (K extends "Given" ? D["kind"] extends "given" ? unknown : never
    : K extends "When" ? D["kind"] extends "when" ? unknown : never
    : K extends "Then" ? D["kind"] extends "context" | "success" | "failure" ? unknown : never
    : Semantic<D["kind"]> extends Semantic<S["last"]> ? unknown
    : never)
/**
 * The dual invocation contract for a descriptor combinator.
 *
 * @since 0.0.1
 */
export interface Add<K extends Keyword> {
  <S extends State, D extends AnyDescriptor>(
    builder: Builder<S> & NoInfer<Allowed<K, S, D>>,
    step: D
  ): Builder<Next<S, D>>
  <D extends AnyDescriptor>(
    step: D
  ): <S extends State>(builder: Builder<S> & (Allowed<K, S, D> extends never ? never : unknown)) => Builder<Next<S, D>>
}
const operation = <K extends Keyword>(keyword: K): Add<K> =>
  ((first: object, second?: AnyDescriptor) =>
    second
      ? append(first, second, keyword)
      : (builder: object) => append(builder, first as AnyDescriptor, keyword)) as Add<K>
/**
 * Append a setup descriptor, accepting either builder-first or curried invocation.
 *
 * @since 0.0.1
 */
export const given = operation("Given")
/**
 * Append an action descriptor, accepting either builder-first or curried invocation.
 *
 * @since 0.0.1
 */
export const when = operation("When")
/**
 * Append an expectation descriptor. Available publicly as Scenario.then.
 *
 * @since 0.0.1
 */
export const thenStep = operation("Then")
/**
 * Append a descriptor inheriting the preceding semantic kind.
 *
 * @since 0.0.1
 */
export const and = operation("And")
/**
 * Append a descriptor inheriting the preceding kind; assertions are not negated.
 *
 * @since 0.0.1
 */
export const but = operation("But")
/**
 * Flatten a compatible reusable fragment into the receiving builder.
 *
 * @since 0.0.1
 */
export function use<S extends State, const T extends ReadonlyArray<AnyDescriptor>>(
  builder: Builder<S> & NoInfer<Fold<S, T> extends never ? never : unknown>,
  fragment: Steps<T>
): Builder<Fold<S, T>>
/**
 * Flatten a compatible reusable fragment into the receiving builder.
 *
 * @since 0.0.1
 */
export function use<const T extends ReadonlyArray<AnyDescriptor>>(
  fragment: Steps<T>
): <S extends State>(builder: Builder<S> & (Fold<S, T> extends never ? never : unknown)) => Builder<Fold<S, T>>
/**
 * Flatten a compatible reusable fragment into the receiving builder.
 *
 * @since 0.0.1
 */
export function use(first: object, second?: Steps): unknown {
  const apply = (builder: object, fragment: Steps) =>
    entries(fragment).reduce((b: object, d) => append(b, d, semantic(d.kind)), builder)
  return second ? apply(first, second) : (builder: object) => apply(builder, first as Steps)
}
