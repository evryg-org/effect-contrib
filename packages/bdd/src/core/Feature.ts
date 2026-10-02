/**
 * Group completed scenarios and filter their metadata while retaining operation requirements.
 *
 * @since 0.0.1
 */
import type { Scenario } from "./Scenario.js"

/**
 * A completed scenario accepted by metadata and grouping operations.
 *
 * @since 0.0.1
 */
export type AnyScenario = Scenario
/**
 * A named group retaining the operation requirements of each scenario.
 *
 * @since 0.0.1
 */
export interface Feature<S extends Scenario = Scenario> {
  readonly name: string
  readonly description?: string
  readonly scenarios: ReadonlyArray<S>
}
/**
 * Group completed scenarios with optional descriptive metadata.
 *
 * @since 0.0.1
 */
export const feature = <S extends Scenario>(
  name: string,
  scenarios: ReadonlyArray<S>,
  options?: { readonly description?: string }
): Feature<S> =>
  Object.freeze({
    name,
    ...(options?.description !== undefined ? { description: options.description } : {}),
    scenarios: Object.freeze([...scenarios])
  })
/**
 * Select scenarios matching any tag while retaining their operation types.
 *
 * @since 0.0.1
 */
export const filterByTags = <S extends Scenario>(
  scenarios: ReadonlyArray<S>,
  tags: ReadonlyArray<string>
): ReadonlyArray<S> => scenarios.filter((scenario) => scenario.tags.some((tag) => tags.includes(tag)))
/**
 * Filter a feature without erasing its scenario operation requirements.
 *
 * @since 0.0.1
 */
export const selectByTags = <S extends Scenario>(source: Feature<S>, tags: ReadonlyArray<string>): Feature<S> => ({
  ...source,
  scenarios: filterByTags(source.scenarios, tags)
})
