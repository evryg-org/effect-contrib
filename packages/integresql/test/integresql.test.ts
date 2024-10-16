import { describe, expect, test, vi } from "vitest"
import { pipe, Effect, Deferred, Option, Layer } from "effect"
import { _getConnection, getConnection } from "../src/integresql.js"
import crypto, { randomUUID } from "node:crypto"
import { DatabaseClient, makeLivePostgresDatabaseClient } from "../src/DatabaseClient.js"

describe(`getConnection`, () => {
	test(`No template created for hash initializes template and returns new connection`, async () => {
		const hash = makeRandomHash()
		const initializeTemplateSpy = vi.fn(() => Effect.void)

		const result = await pipe(
			_getConnection({
				hash,
				initializeTemplate: initializeTemplateSpy,
			}),
			Effect.runPromise,
		)
		expect(initializeTemplateSpy).toHaveBeenCalledTimes(1)
		expect(initializeTemplateSpy).toHaveBeenCalledWith<[typeof result]>({
			host: expect.any(String),
			port: expect.any(Number),
			username: expect.any(String),
			password: expect.any(String),
			database: expect.any(String),
		})
		expect(result).toStrictEqual<typeof result>({
			host: expect.any(String),
			port: expect.any(Number),
			username: expect.any(String),
			password: expect.any(String),
			database: expect.any(String),
		})
	})

	test(`Template already created for hash returns new connection from template`, async () => {
		const hash = makeRandomHash()
		const initializeTemplateSpy = vi.fn(() => Effect.void)

		const result = await pipe(
			_getConnection({
				hash,
				initializeTemplate: initializeTemplateSpy,
			}),
			Effect.zip(
				_getConnection({
					hash,
					initializeTemplate: initializeTemplateSpy,
				}),
			),
			Effect.runPromise,
		)

		expect(initializeTemplateSpy).toHaveBeenCalledTimes(1)
		expect(result[0].database).not.toBe(result[1].database)
	})

	test.skip(`Template not finalized but new DB required`, async () =>
		pipe(
			Effect.gen(function* () {
				const hash = makeRandomHash()

				const templateInitializationStartedDeferred =
					yield* Deferred.make<void>()
				const newTestDBRequestedDeferred = yield* Deferred.make<void>()

				const result = pipe(
					_getConnection({
						hash,
						initializeTemplate: () =>
							pipe(
								templateInitializationStartedDeferred,
								Deferred.succeed<void>(undefined),
								Effect.zipRight(Effect.never),
							),
					}),
					Effect.fork,
					Effect.tap(() =>
						_getConnection({
							hash,
							initializeTemplate: fail,
						}),
					),
				)
			}),
		))

	test.skip(`Trying to access a non finalized template`, async () => {})
	// Doesn't re-init template if already initialized
	
	
	test(`With db migration`, () =>
		pipe(
			Effect.gen(function* () {
				const result = yield* pipe(
					DatabaseClient,
					Effect.flatMap(client =>
						Effect.promise(() =>
							client
							.connection("user")
							.insert({ username: Math.random().toString() }, "*")
							.then(([created]) => created),
						),
					),
					Effect.map(Option.fromNullable),
					Effect.provide(
						Layer.unwrapEffect(
							pipe(
								getConnection({
									databaseFiles: ["knex/**/*.{js,ts}"],
									initializeTemplate: connection =>
																	 pipe(
																		 DatabaseClient,
																		 Effect.flatMap(client => client.migrateUp),
																		 Effect.provide(
																			 makeLivePostgresDatabaseClient({
																				 connection: {
																					 host: "127.0.0.1",
																					 port: connection.port,
																					 user: connection.username,
																					 password: connection.password,
																					 database: connection.database,
																				 },
																				 migrations: {
																					 directory: "knex/migrations",
																				 },
																			 }),
																		 ),
																		 Effect.scoped,
																	 ),
								}),
								Effect.map(_ =>
									makeLivePostgresDatabaseClient({
										connection: {
											host: "127.0.0.1",
											port: _.port,
											user: _.username,
											password: _.password,
											database: _.database,
										},
										migrations: {
											directory: "knex/migrations",
										},
									}),
								),
							),
						),
					),
				)
				
				expect(Option.isSome(result)).toBe(true)
			}),
			Effect.scoped,
			Effect.runPromise,
		))
	
	
})

const makeRandomHash = () =>
	crypto.createHash("sha1").update(randomUUID()).digest("hex")

const fail = () => {
	throw new Error("Should not have been called")
}
