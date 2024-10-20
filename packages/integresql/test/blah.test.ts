import { test } from "@effect/vitest"

test(`Empty test`, async () => {
})
// import { describe, expect, it, layer } from "@effect/vitest"
// import { Effect, Context, Layer, pipe, Config } from "effect"
// import { PgClient, PgMigrator } from "@effect/sql-pg"
// import { MigratorOptions } from "@effect/sql-pg/PgMigrator"
// import { getConnection } from "../src/integresql.js"
// import { NodeContext } from "@effect/platform-node"
//
// const blah = pipe(
//   PgMigrator.run({
//     loader: PgMigrator.fromFileSystem("/migrations"),
//     schemaDirectory: "src/migrations"
//   }),
//   Effect.provide(
//     PgClient.layer({
//       url: Config.redacted("connect")
//     })
//   )
// )
//
// const getPGClient = <R>(migratorOptions: MigratorOptions<R>) =>
//   pipe(
//     Layer.unwrapEffect(
//       pipe(
//         getConnection({
//           databaseFiles: ["migrations.schemaDirectory"],
//           initializeTemplate: (connection) => {
//             return pipe(
//               PgMigrator.run(migratorOptions),
//               Effect.provide(
//                 PgClient.layer({
//                   host: Config.succeed("127.0.0.1"),
//                   port: Config.succeed(connection.port),
//                   username: Config.succeed(connection.username),
//                   password: Config.redacted(connection.password),
//                   database: Config.succeed(connection.database)
//                 })
//               ),
//               Effect.asVoid,
//               Effect.orDie
//             )
//           }
//         }),
//         Effect.map((connection) =>
//           PgClient.layer({
//             host: Config.succeed("127.0.0.1"),
//             port: Config.succeed(connection.port),
//             username: Config.succeed(connection.username),
//             password: Config.redacted(connection.password),
//             database: Config.succeed(connection.database)
//           })
//         )
//       )
//     ),
//     Layer.orDie
//   )
//
// it.effect("insert helper", () =>
//   Effect.gen(function* () {
//     const sql = yield* PgClient.PgClient
//     const [query, params] =
//       sql`INSERT INTO people ${sql.insert({ name: "Tim", age: 10 })}`.compile()
//     expect(query).toEqual(`INSERT INTO people ("name","age") VALUES ($1,$2)`)
//     expect(params).toEqual(["Tim", 10])
//   })
// )
//
// class Foo extends Context.Tag("Foo")<Foo, "foo">() {
//   static Live = Layer.succeed(Foo, "foo")
// }
//
// const TestPGClient = pipe(
//   getPGClient({
//     loader: PgMigrator.fromFileSystem("/migrations"),
//     schemaDirectory: "src/migrations"
//   }),
//   Layer.fresh,
//   Layer.provideMerge(NodeContext.layer)
// )
//
// declare const createUser: Effect.Effect<void, never, PgClient.PgClient>
//
// describe("", () => {})
//
// layer(TestPGClient)("layer", (it) => {
//   it.effect("adds context", () =>
//     Effect.gen(function* () {
//       const foo = yield* createUser
//       expect(foo).toEqual("foo")
//     })
//   )
//
//   it.layer(Bar.Live)("nested", (it) => {
//     it.effect("adds context", () =>
//       Effect.gen(function* () {
//         const foo = yield* Foo
//         const bar = yield* Bar
//         expect(foo).toEqual("foo")
//         expect(bar).toEqual("bar")
//       })
//     )
//   })
// })
