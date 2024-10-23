/**
 * @since 0.0.1
 */
import { Effect, Option, pipe } from "effect"
import glob from "fast-glob"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import type { DatabaseConfiguration, DatabaseTemplateId, IntegreSqlClient } from "./IntegreSqlClient.js"
import { IntegreSqlApiClient } from "./IntegreSqlClient.js"

/**
 * @since 0.0.1
 */
export class NoMatchingFiles implements Error {
  /**
   * @since 0.0.1
   */
  public origin: string = "@everyg/integresql"
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

    readStream.on("data", (chunk) => hash.update(chunk))
    readStream.on("end", () => resolve(hash.digest("hex")))
  })
}

/**
 * @internal
 */
export const _getConnection = (client: IntegreSqlClient) =>
<R>(config: {
  hash: DatabaseTemplateId
  initializeTemplate: (
    connection: DatabaseConfiguration
  ) => Effect.Effect<void, never, R>
}): Effect.Effect<DatabaseConfiguration, never, R> =>
  pipe(
    client.createTemplate(config.hash),
    Effect.flatMap(
      Option.match({
        onSome: (a) =>
          pipe(
            config.initializeTemplate(a),
            Effect.zipRight(client.finalizeTemplate(config.hash)),
            Effect.zipRight(client.getNewTestDatabase(config.hash)),
            Effect.flatten,
            Effect.catchTag(
              "NoSuchElementException",
              () => Effect.die(new Error("[@evryg/integresql]: Unexpected error")) // @todo: Can we help the user solve this issue?
            )
          ),
        onNone: () =>
          pipe(
            client.getNewTestDatabase(config.hash),
            Effect.flatten,
            Effect.catchTag(
              "NoSuchElementException",
              () => Effect.die(new Error("[@evryg/integresql]: Unexpected error")) // @todo: Can we help the user solve this issue?
            )
          )
      })
    )
  )

/**
 * @since 0.0.1
 */
export interface InitializeTemplate<R> {
  (connection: DatabaseConfiguration): Effect.Effect<void, never, R>
}

// @todo: hash breaks for monorepo (user CWD)
// @todo: fail if no files on hash generation
// "packages/integresql/src/**/*.ts"
/**
 * @since 0.0.1
 */
export const getConnection = <R>(config: {
  databaseFiles: [string, ...Array<string>]
  initializeTemplate: InitializeTemplate<R>
  integreSql?: {
    port: number
    host: string
  }
}): Effect.Effect<DatabaseConfiguration, never, R> =>
  pipe(
    createHash(config.databaseFiles),
    Effect.flatMap((hash) =>
      _getConnection(
        new IntegreSqlApiClient({
          integrePort: config.integreSql?.port ?? 5000,
          integreHost: config.integreSql?.host ?? "localhost"
        })
      )({ ...config, hash })
    ),
    Effect.orDie
  )
