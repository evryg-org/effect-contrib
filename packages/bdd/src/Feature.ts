/**
 * Group scenarios into a named {@link Feature} and select them as data. Because
 * a {@link Scenario} is a value, a suite is just an array you can filter and
 * reorder — for example, to run only the scenarios carrying a given tag.
 *
 * @since 0.0.1
 */
import type { Scenario } from "./Scenario.js"

/**
 * A scenario whose channels are not statically known — the element type of a
 * heterogeneous suite.
 *
 * @since 0.0.1
 * @category models
 */
export type AnyScenario = Scenario<any, any, any>

/**
 * A named group of related scenarios.
 *
 * @since 0.0.1
 * @category models
 */
export interface Feature {
  readonly name: string
  readonly description?: string
  readonly scenarios: ReadonlyArray<AnyScenario>
}

/**
 * Group scenarios into a {@link Feature}.
 *
 * @since 0.0.1
 * @category constructors
 */
export const feature = (
  name: string,
  scenarios: ReadonlyArray<AnyScenario>,
  options?: { readonly description?: string }
): Feature => ({
  name,
  ...(options?.description !== undefined ? { description: options.description } : {}),
  scenarios
})

/**
 * Keep the scenarios that carry at least one of the given tags, preserving
 * order.
 *
 * @since 0.0.1
 * @category combinators
 */
export const filterByTags = (
  scenarios: ReadonlyArray<AnyScenario>,
  tags: ReadonlyArray<string>
): ReadonlyArray<AnyScenario> => scenarios.filter((scenario) => scenario.tags.some((tag) => tags.includes(tag)))

/**
 * Narrow a feature to the scenarios carrying at least one of the given tags.
 *
 * @since 0.0.1
 * @category combinators
 */
export const selectByTags = (source: Feature, tags: ReadonlyArray<string>): Feature => ({
  ...source,
  scenarios: filterByTags(source.scenarios, tags)
})
