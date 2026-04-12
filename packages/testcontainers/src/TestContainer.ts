/**
 * @since 0.0.1
 */
import type { Scope } from "effect"
import { Effect, Schema } from "effect"
import type { StartedTestContainer } from "testcontainers"

/**
 * @since 0.0.3
 * @category errors
 */
export class TestContainerError extends Schema.TaggedError<TestContainerError>()("TestContainerError", {
  cause: Schema.Defect
}) {}

/**
 * @since 0.0.1
 * @category constructors
 */
export const acquireContainer = <C extends StartedTestContainer>(
  start: () => Promise<C>
): Effect.Effect<C, TestContainerError, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.tryPromise({ try: start, catch: (cause) => new TestContainerError({ cause }) }),
    (c) => Effect.promise(() => c.stop()).pipe(Effect.orDie)
  )
