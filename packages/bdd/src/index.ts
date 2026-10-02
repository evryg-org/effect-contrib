/**
 * Implementation-free BDD vocabulary, scenario authoring, composition, and metadata projection.
 *
 * @since 0.0.1
 */
import * as ScenarioModule from "./core/Scenario.js"
import type { AnyDefinition as Operation, AnyDescriptor as StepDescriptor } from "./core/Step.js"
import * as StepsModule from "./core/Steps.js"

/**
 * Public vocabulary and authoring exports.
 *
 * @since 0.0.1
 */
export * as Given from "./core/Given.js"
/**
 * Public vocabulary and authoring exports.
 *
 * @since 0.0.1
 */
export * as Then from "./core/Then.js"
/**
 * Public vocabulary and authoring exports.
 *
 * @since 0.0.1
 */
export * as When from "./core/When.js"
/**
 * An opaque completed specification carrying its required operation definitions.
 *
 * @since 0.0.1
 */
export const Scenario = Object.freeze({
  make: ScenarioModule.make,
  given: ScenarioModule.given,
  when: ScenarioModule.when,
  then: ScenarioModule.thenStep,
  and: ScenarioModule.and,
  but: ScenarioModule.but,
  use: ScenarioModule.use,
  build: ScenarioModule.build,
  inspect: ScenarioModule.inspect
})
/**
 * An opaque completed specification carrying its required operation definitions.
 *
 * @since 0.0.1
 */
export namespace Scenario {
  /**
   * An opaque completed specification carrying its required operation definitions.
   *
   * @since 0.0.1
   */
  export type Scenario<O extends Operation = Operation> = ScenarioModule.Scenario<O>
  /**
   * An immutable fluent builder. Call build to obtain a completed scenario.
   *
   * @since 0.0.1
   */
  export type Builder<S extends ScenarioModule.State = ScenarioModule.Initial> = ScenarioModule.Builder<S>
}
/**
 * Public vocabulary and authoring exports.
 *
 * @since 0.0.1
 */
export {
  /** @since 0.0.1 */
  type AnyScenario,
  /** @since 0.0.1 */
  type Feature,
  /** @since 0.0.1 */
  feature,
  /** @since 0.0.1 */
  filterByTags,
  /** @since 0.0.1 */
  selectByTags
} from "./core/Feature.js"
/**
 * Public vocabulary and authoring exports.
 *
 * @since 0.0.1
 */
export {
  /** @since 0.0.1 */
  type Keyword,
  /** @since 0.0.1 */
  ScenarioDocument,
  /** @since 0.0.1 */
  type ScenarioStep,
  /** @since 0.0.1 */
  steps,
  /** @since 0.0.1 */
  tags,
  /** @since 0.0.1 */
  toDocument,
  /** @since 0.0.1 */
  toGherkin
} from "./core/Gherkin.js"
/**
 * Public vocabulary and authoring exports.
 *
 * @since 0.0.1
 */
export type {
  /** @since 0.0.1 */
  AnyDefinition,
  /** @since 0.0.1 */
  AnyDescriptor,
  /** @since 0.0.1 */
  ContractOf,
  /** @since 0.0.1 */
  Definition,
  /** @since 0.0.1 */
  DefinitionOf,
  /** @since 0.0.1 */
  Descriptor,
  /** @since 0.0.1 */
  Kind
} from "./core/Step.js"
/**
 * Public vocabulary and authoring exports.
 *
 * @since 0.0.1
 */
export const Steps = Object.freeze({ from: StepsModule.from, empty: StepsModule.empty, concat: StepsModule.concat })
/**
 * Reusable typed step fragments.
 *
 * @since 0.0.1
 */
export namespace Steps {
  /**
   * An opaque fragment retaining its ordered descriptor tuple.
   *
   * @since 0.0.1
   */
  export type Steps<T extends ReadonlyArray<StepDescriptor> = ReadonlyArray<StepDescriptor>> = StepsModule.Steps<T>
}
