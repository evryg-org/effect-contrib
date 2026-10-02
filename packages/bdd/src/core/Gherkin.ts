/**
 * Inspect, render, and project ordered scenario metadata without executing vocabulary implementations.
 *
 * @since 0.0.1
 */
import { Schema } from "effect"
import { inspect, type Keyword as AuthoredKeyword, type Outcome, type Scenario } from "./Scenario.js"

/**
 * Public metadata type exports.
 *
 * @since 0.0.1
 */
export type Keyword = AuthoredKeyword
/**
 * The authored keyword, description, and expected outcome of a reported step.
 *
 * @since 0.0.1
 */
export interface ScenarioStep {
  readonly keyword: Keyword
  readonly text: string
  readonly outcome?: Outcome
}
/**
 * Project completed scenario steps in their authored order.
 *
 * @since 0.0.1
 */
export const steps = (scenario: Scenario): ReadonlyArray<ScenarioStep> =>
  inspect(scenario).map(({ descriptor, keyword }) => ({
    keyword,
    text: descriptor.description,
    ...(descriptor.kind === "success" || descriptor.kind === "failure" ? { outcome: descriptor.kind } : {})
  }))
/**
 * Read scenario tags.
 *
 * @since 0.0.1
 */
export const tags = (scenario: Scenario): ReadonlyArray<string> => scenario.tags
/**
 * Render the standard ordered Given, When, Then, And, and But subset.
 *
 * @since 0.0.1
 */
export const toGherkin = (scenario: Scenario): string => {
  const tagLine = scenario.tags.length > 0 ? `${scenario.tags.map((tag) => `@${tag}`).join(" ")}\n` : ""
  return `${tagLine}Scenario: ${scenario.name}\n${
    steps(scenario).map((step) => `  ${step.keyword} ${step.text}`).join("\n")
  }`
}
/**
 * A schema-backed metadata projection, independent of executable implementations.
 *
 * @since 0.0.1
 */
export const ScenarioDocument = Schema.Struct({
  name: Schema.String,
  tags: Schema.Array(Schema.String),
  steps: Schema.Array(Schema.Struct({
    keyword: Schema.Literals(["Given", "When", "Then", "And", "But"]),
    text: Schema.String,
    outcome: Schema.optional(Schema.Literals(["success", "failure", "defect"]))
  }))
})
/**
 * A schema-backed metadata projection, independent of executable implementations.
 *
 * @since 0.0.1
 */
export type ScenarioDocument = typeof ScenarioDocument.Type
/**
 * Project a completed scenario to inspectable document metadata.
 *
 * @since 0.0.1
 */
export const toDocument = (scenario: Scenario): ScenarioDocument => ({
  name: scenario.name,
  tags: scenario.tags,
  steps: steps(scenario)
})
