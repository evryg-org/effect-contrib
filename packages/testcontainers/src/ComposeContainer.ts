/**
 * @since 0.0.1
 */
import { Context, Effect, Layer, Schema } from "effect"
import { DockerComposeEnvironment, type StartedDockerComposeEnvironment } from "testcontainers"

/**
 * @since 0.0.3
 * @category errors
 */
export class ComposeContainerError extends Schema.TaggedError<ComposeContainerError>()("ComposeContainerError", {
  cause: Schema.Defect
}) {}

/**
 * @since 0.0.1
 * @category models
 */
export type ComposeExecutableOptions = {
  executablePath: string
  options?: Array<string> | Array<string | Array<string>>
  standalone?: never
} | {
  executablePath?: string
  options?: never
  standalone: true
}

/**
 * @since 0.0.1
 * @category containers
 */
export class ComposeEnvironment extends Context.Tag("ComposeEnvironment")<
  ComposeEnvironment,
  StartedDockerComposeEnvironment
>() {}

/**
 * @since 0.0.1
 * @category models
 */
export interface ComposeOptions {
  readonly composeFilePath: string
  readonly composeFile: string
  readonly waitStrategy?: (env: DockerComposeEnvironment) => DockerComposeEnvironment
  readonly executable?: ComposeExecutableOptions
}

/**
 * @since 0.0.1
 * @category constructors
 */
export const makeComposeContainer = (
  opts: ComposeOptions
): Layer.Layer<ComposeEnvironment, ComposeContainerError> =>
  Layer.scoped(
    ComposeEnvironment,
    Effect.gen(function*() {
      let env = new DockerComposeEnvironment(opts.composeFilePath, opts.composeFile)
      if (opts.executable) env = env.withClientOptions({ executable: opts.executable })
      if (opts.waitStrategy) env = opts.waitStrategy(env)
      const started = yield* Effect.acquireRelease(
        Effect.tryPromise({ try: () => env.up(), catch: (cause) => new ComposeContainerError({ cause }) }),
        (c) => Effect.promise(() => c.down()).pipe(Effect.orDie)
      )
      yield* Effect.log("[testcontainers] Compose started")
      return started
    })
  )
