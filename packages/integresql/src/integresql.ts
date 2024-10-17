import { Effect, Option, pipe, flow, Either } from "effect"
import glob from "fast-glob"
import path from "node:path"
import crypto from "node:crypto"
import fs from "node:fs"
import { Schema } from "@effect/schema"

export const createHash = (
  globPatterns: Array<string>
): Effect.Effect<string> =>
  Effect.promise(async () => {
    // If no files, die 🛑
    const files = await glob(globPatterns)
    const filePaths = files.map((file) => path.join(process.cwd(), file))

    const fileHashes = await Promise.all(filePaths.map(sha1HashFile))
    return sha1HashString(fileHashes.join(""))
  })
export function sha1HashString(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex")
}

export function sha1HashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha1")
    const readStream = fs.createReadStream(filePath)

    readStream.on("error", (err) => reject(err))

    readStream.on("data", (chunk) => hash.update(chunk))
    readStream.on("end", () => resolve(hash.digest("hex")))
  })
}
const baseApiUrl = "http://localhost:6123"

const TestDatabaseConnectionSchema = Schema.Struct({
  database: Schema.Struct({
    templateHash: Schema.String,
    config: Schema.Struct({
      host: Schema.String, // "postgres",
      port: Schema.Number, // 5432,
      username: Schema.String, // "dbuser",
      password: Schema.String, // "1234",
      database: Schema.String // "integresql_template_6390de0088c9f20fe804c4644407f5574a20102d"
    })
  })
})

type PostgresConnection = Schema.Schema.Type<
  typeof TestDatabaseConnectionSchema
>["database"]["config"]

const createTemplate = (
  hash: string
): Effect.Effect<Option.Option<PostgresConnection>> =>
  pipe(
    Effect.promise(() =>
      fetch(new URL("/api/v1/templates", baseApiUrl), {
        method: "POST",
        body: JSON.stringify({ hash }),
        headers: { "Content-Type": "application/json" }
      }).then((res) =>
        res
          .json() //
          .then((data) => ({ status: res.status, data }))
      )
    ),
    Effect.flatMap(
      Schema.decodeUnknown(
        Schema.EitherFromUnion({
          left: Schema.Struct({
            status: Schema.Literal(423),
            data: Schema.Struct({ message: Schema.String })
          }),
          right: Schema.Struct({
            status: Schema.Literal(200),
            data: TestDatabaseConnectionSchema
          })
        }).annotations({ identifier: "create-template" })
      )
    ),
    Effect.map(
      flow(
        Either.map((a) => a.data.database.config),
        Either.getOrUndefined,
        Option.fromNullable
      )
    ),
    Effect.orDie
  )

const finalizeTemplate = (hash: string): Effect.Effect<void> =>
  pipe(
    Effect.promise(() =>
      fetch(new URL(`/api/v1/templates/${hash}`, baseApiUrl), {
        method: "PUT",
        headers: { "Content-Type": "application/json" }
      })
    ),
    Effect.flatMap(
      Schema.decodeUnknown(
        Schema.Struct({
          status: Schema.Literal(204)
        }).annotations({ identifier: "finalize-template" })
      )
    ),
    Effect.orDie
  )

const getNewTestDatabase = (
  hash: string
): Effect.Effect<Option.Option<PostgresConnection>> =>
  pipe(
    Effect.promise(() =>
      fetch(new URL(`/api/v1/templates/${hash}/tests`, baseApiUrl), {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      }).then((res) =>
        res
          .json() //
          .then((data) => ({ status: res.status, data }))
      )
    ),
    Effect.flatMap(
      Schema.decodeUnknown(
        Schema.EitherFromUnion({
          left: Schema.Struct({ status: Schema.Literal(404) }),
          right: Schema.Struct({
            status: Schema.Literal(200),
            data: TestDatabaseConnectionSchema
          }).annotations({ identifier: "get-test-db" })
        })
      )
    ),
    (a) => a,
    Effect.map(
      flow(
        Either.getOrUndefined,
        Option.fromNullable,
        Option.map((a) => a.data.database.config)
      )
    ),
    Effect.orDie
  )

// @todo: What happens when someone tries to create the same template twice
// @todo: What happens when someone tries to get a DB for a NON FINALIZED template? -> Blocks until ready
// @todo: What happens when someone tries to get a DB for a NON EXISTING template? -> 404
// @todo: What happens when someone tries to finalize an already finalized template -> Idempotent, success 204
// @todo: hash breaks for monorepo (user CWD)
export const _getConnection = <R>(config: {
  hash: string
  initializeTemplate: (
    connection: PostgresConnection
  ) => Effect.Effect<void, never, R>
}): Effect.Effect<PostgresConnection, never, R> =>
  pipe(
    createTemplate(config.hash),
    Effect.flatMap(
      Option.match({
        onSome: (a) =>
          pipe(
            config.initializeTemplate(a),
            Effect.zipRight(finalizeTemplate(config.hash)),
            Effect.zipRight(getNewTestDatabase(config.hash)),
            Effect.flatten,
            Effect.catchTag(
              "NoSuchElementException",
              () =>
                Effect.die(new Error("[@evryg/integresql]: Unexpected error")) // @todo: Can we help the user solve this issue?
            )
          ),
        onNone: () =>
          pipe(
            getNewTestDatabase(config.hash),
            Effect.flatten,
            Effect.catchTag(
              "NoSuchElementException",
              () =>
                Effect.die(new Error("[@evryg/integresql]: Unexpected error")) // @todo: Can we help the user solve this issue?
            )
          )
      })
    )
  )

export interface InitializeTemplate<R> {
  (connection: PostgresConnection): Effect.Effect<void, never, R>
}

export const getConnection = <R>(config: {
  databaseFiles: string[]
  initializeTemplate: InitializeTemplate<R>
}): Effect.Effect<PostgresConnection, never, R> =>
  pipe(
    createHash(config.databaseFiles),
    Effect.flatMap((hash) => _getConnection({ ...config, hash }))
  )
