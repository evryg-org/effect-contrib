<!-- Title -->
<h1 align="center">
  integresql-client
</h1>

<!-- Description -->
<h4 align="center">
  <a href="https://github.com/allaboutapps/integresql">IntegreSQL</a> Effect-ts wrapper for managing isolated PostgreSQL databases in integration tests.
</h4>

<!-- Badges -->
<p align="center">
  <a href="https://www.npmjs.com/package/@devoxa/integresql-client">
    <img
      src="https://img.shields.io/npm/v/@devoxa/integresql-client?style=flat-square"
      alt="Package Version"
    />
  </a>

  <a href="https://github.com/devoxa/integresql-client/actions?query=branch%3Amaster+workflow%3A%22Continuous+Integration%22">
    <img
      src="https://img.shields.io/github/actions/workflow/status/devoxa/integresql-client/push.yml?branch=master&style=flat-square"
      alt="Build Status"
    />
  </a>

  <a href="https://codecov.io/github/devoxa/integresql-client">
    <img
      src="https://img.shields.io/codecov/c/github/devoxa/integresql-client/master?style=flat-square"
      alt="Code Coverage"
    />
  </a>
</p>

<!-- Quicklinks -->
<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#contributors">Contributors</a> •
  <a href="#license">License</a>
</p>

<br>

## Installation

```bash
npm i -D @evryg/integresql
```

**To install IntegreSQL, please follow their
[installation instructions](https://github.com/allaboutapps/integresql#usage).**

## Usage

```ts
// test-utils.ts
import { getConnection } from "@everyg/integresql"

//           [1]
//           This is the effect you will use across your tests
//           to get a new database to connect-to on each test
//           V
export const getTestDatabaseConnection = getConnection({
  //              [2]
  //              Basically, The files integreSQL should watch for changes
  //              V
  databaseFiles: ["migrations/**/¨.ts"],
  //                   [3]
  //                   Connect once to the database and apply the changes (migrations/fixtures/...)
  //                   that will define your postgres template
  //                   V
  initializeTemplate: (connection) =>
    Effect.promise(() =>
      // We are using knex but you can obviously connect to whatever DB client
      // V
      knex({
        connection: {
          host: connection.host, // You might need to override this depending on your docker-compose setup
          port: connection.port, // You might need to override this depending on your docker-compose setup
          user: connection.username,
          password: connection.password,
          database: connection.database
        }
      })
        // [4]
        // Run the migrations/fixtures, ... Whatever every new generated test database should have
        // V
        .migrate.up({ directory: "folder/folder/migrations" })
    )
})

// ThingRepository.spec.ts
import { getTestDatabaseConnection } from "../test-utils.ts"

test("My test", () =>
  pipe(
    Effect.gen(function* () {
      const result = yield* pipe(
        // [5]
        // Run an effect that needs the database
        // V
        createThingInDatabase,
        Effect.provide(
          Layer.unwrapEffect(
            pipe(
              // [6]
              // Get a connection to a new test database
              // V
              getTestDatabaseConnection,
              Effect.map((connection) =>
                // [7]
                // Pass it to your DB client/Repository/whatever needs it
                // V
                makeLiveDatabaseThingRepository(
                  knex({
                    connection: {
                      host: connection.host, // You might need to override this depending on your docker-compose setup
                      port: connection.port, // You might need to override this depending on your docker-compose setup
                      user: connection.username,
                      password: connection.password,
                      database: connection.database
                    }
                  })
                )
              )
            )
          )
        )
      )

      expect(result).toStrictEqual(whatever)
    }),
    Effect.runPromise
  ))
```

## TODO

todo: fix todos 
read docs to see what edge cases are not handled (ask claude)
make docs
- Audit peer dependencies: `vitest` and `@effect/platform-node` are not used in source code and may not need to be peer deps.

## License

MIT
