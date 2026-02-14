import { Effect, pipe } from "effect"
import glob from "fast-glob"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import type { DatabaseTemplateId } from "./IntegreSqlClient.js"

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
export const templateIdFromFiles = (
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
