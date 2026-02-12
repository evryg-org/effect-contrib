/**
 * @since 0.0.1
 */
import { Effect, Option, pipe } from "effect"
import glob from "fast-glob"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import type { DatabaseConfiguration, DatabaseTemplateId, IntegreSqlClient } from "./IntegreSqlClient.js"
import { makeIntegreSqlClient } from "./IntegreSqlClient.js"

/**
 * @since 0.0.1
 */
export class NoMatchingFiles implements Error {
  /**
   * @since 0.0.1
   */
  public origin: string = "@evryg/integresql"
  /**
   * @since 0.0.1
   */
  public name: string = "No matching files"
  /**
   * @since 0.0.1
   */
  public message: string = "No files matching the provided glob pattern"
  constructor(public computedPaths: Array<string>) {}
}

/**
 * @since 0.0.1
 */
export const createHash = (
  globPatterns: [string, ...Array<string>]
): Effect.Effect<DatabaseTemplateId, NoMatchingFiles> =>
  pipe(
    Effect.promise(() => glob(globPatterns)),
    Effect.filterOrFail(
      (files) => files.length > 0,
      () =>
        new NoMatchingFiles(
          globPatterns.map((file) => path.join(process.cwd(), file))
        )
    ),
    Effect.flatMap((files) =>
      Effect.promise(async () => {
        const filePaths = files.map((file) => path.join(process.cwd(), file))
        const fileHashes = await Promise.all(filePaths.map(sha1HashFile))
        return sha1HashString(fileHashes.join("")) as DatabaseTemplateId
      })
    )
  )
/**
 * @internal
 */
function sha1HashString(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex")
}
/**
 * @internal
 */
function sha1HashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha1")
    const readStream = fs.createReadStream(filePath)

    readStream.on("error", (err) => reject(err))

    // TODO: fix casting
    readStream.on("data", (chunk) => hash.update(chunk as string))
    readStream.on("end", () => resolve(hash.digest("hex")))
  })
}

/**
 * @internal
 */
export const _getConnection = (client: IntegreSqlClient) =>
<E, R>(config: {
  hash: DatabaseTemplateId
  initializeTemplate: InitializeTemplate<E, R>
}): Effect.Effect<DatabaseConfiguration, E, R> =>
  pipe(
    client.createTemplate(config.hash),
    Effect.flatMap(
      Option.match({
        onSome: (a) =>
          pipe(
            config.initializeTemplate(a),
            Effect.zipRight(pipe(client.finalizeTemplate(config.hash), Effect.orDie)),
            Effect.zipRight(client.getNewTestDatabase(config.hash)),
            Effect.flatten,
            Effect.catchTag(
              "NoSuchElementException",
              () =>
                Effect.die(
                  new Error(
                    "[@evryg/integresql]: Unexpected error, could not get a new template database after successfully creating the template"
                  )
                )
            )
          ),
        onNone: () =>
          pipe(
            client.getNewTestDatabase(config.hash),
            Effect.flatten,
            Effect.catchTag(
              "NoSuchElementException",
              () =>
                Effect.die(
                  new Error(
                    "[@evryg/integresql]: Unexpected error: Could not get a new test database from an existing template"
                  )
                )
            )
          )
      })
    )
  )

// TODO:
// TODO: Hash method & tests
// Add mising api methods on the client and expose the client
// read docs to see what edge cases are not handled (ask claude)
// make docs for per test setup/for suite setup
// Audit peer dependencies: `vitest` and `@effect/platform-node` are not used in source code and may not need to be peer deps.
// add example using test containers
// @todo: hash breaks for monorepo (user CWD)
// @todo: fail if no files on hash generation
// "packages/integresql/src/**/*.ts"

/**
 * @since 0.0.1
 */
export interface InitializeTemplate<E, R> {
  (connection: DatabaseConfiguration): Effect.Effect<void, E, R>
}

/**
 * @since 0.0.1
 */
export const getConnection = <E, R>(config: {
  databaseFiles: [string, ...Array<string>]
  initializeTemplate: InitializeTemplate<E, R>
  connection?: { port: number; host: string }
}): Effect.Effect<DatabaseConfiguration, E, R> =>
  pipe(
    createHash(config.databaseFiles),
    Effect.flatMap((hash) =>
      _getConnection(
        makeIntegreSqlClient({
          integrePort: config.connection?.port || 5000,
          integreHost: config.connection?.host || "localhost"
        })
      )({ ...config, hash })
    ),
    Effect.orDie
  )
