/**
 * Interpreters that treat a {@link Scenario} as inspectable data rather than
 * something to run: list its `steps` and `tags`, render it to Gherkin text, or
 * project it to a serializable {@link ScenarioDocument} (for example, to write a
 * `.feature` file). None of these execute the scenario; they read its structure.
 *
 * @since 0.0.1
 */
import { Schema } from "effect"
import type { Outcome, Scenario } from "./Scenario.js"

/**
 * The Gherkin keyword a step renders with.
 *
 * @since 0.0.1
 * @category models
 */
export type Keyword = "Given" | "When" | "Then" | "And"

/**
 * A single rendered step: its keyword, its description, and — for `Then` steps —
 * the {@link Outcome} that was expected.
 *
 * @since 0.0.1
 * @category models
 */
export interface ScenarioStep {
  readonly keyword: Keyword
  readonly text: string
  readonly outcome?: Outcome
}

/**
 * List a scenario's steps as data, with the keyword each renders with (the
 * first given/then is `Given`/`Then`, the rest `And`).
 *
 * @since 0.0.1
 * @category accessors
 */
export const steps = (scenario: Scenario<any, any, any>): ReadonlyArray<ScenarioStep> => {
  const keyword = (index: number, first: Keyword): Keyword => (index === 0 ? first : "And")
  return [
    ...scenario.givens.map((given, index): ScenarioStep => ({
      keyword: keyword(index, "Given"),
      text: given.description
    })),
    { keyword: "When", text: scenario.when.description },
    ...scenario.thens.map((then, index): ScenarioStep => ({
      keyword: keyword(index, "Then"),
      outcome: then.outcome,
      text: then.assertion.description
    }))
  ]
}

/**
 * A scenario's tags.
 *
 * @since 0.0.1
 * @category accessors
 */
export const tags = (scenario: Scenario<any, any, any>): ReadonlyArray<string> => scenario.tags

/**
 * Render a scenario as Gherkin text.
 *
 * @since 0.0.1
 * @category interpreters
 */
export const toGherkin = (scenario: Scenario<any, any, any>): string => {
  const tagLine = scenario.tags.length > 0 ? `${scenario.tags.map((tag) => `@${tag}`).join(" ")}\n` : ""
  const body = steps(scenario).map((step) => `  ${step.keyword} ${step.text}`).join("\n")
  return `${tagLine}Scenario: ${scenario.name}\n${body}`
}

/**
 * A serializable projection of a scenario's describable skeleton — its name,
 * tags and steps — decodable and encodable for `.feature` export. The
 * executable payloads are not part of the document.
 *
 * @since 0.0.1
 * @category models
 */
export const ScenarioDocument = Schema.Struct({
  name: Schema.String,
  tags: Schema.Array(Schema.String),
  steps: Schema.Array(Schema.Struct({
    keyword: Schema.Literals(["Given", "When", "Then", "And"]),
    text: Schema.String,
    outcome: Schema.optional(Schema.Literals(["success", "failure", "defect"]))
  }))
})

/**
 * @since 0.0.1
 * @category models
 */
export type ScenarioDocument = typeof ScenarioDocument.Type

/**
 * Project a scenario to its serializable {@link ScenarioDocument}.
 *
 * @since 0.0.1
 * @category interpreters
 */
export const toDocument = (scenario: Scenario<any, any, any>): ScenarioDocument => ({
  name: scenario.name,
  tags: scenario.tags,
  steps: steps(scenario)
})
