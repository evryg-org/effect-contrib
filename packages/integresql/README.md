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

### Step-by-step guide
1. **Initialize your api client layer**
```ts
// DatabaseClient.ts
import { Effect, Context } from "effect"
import type { Knex } from "knex"

class DatabaseClient extends Context.Tag("DatabaseClient")<
  DatabaseClient,
  // While the example uses Knex, any database client accepting a postgres connection will work
  { readonly client: Knex }
>() {}
```

```ts
// test-utils.ts
import { getConnection } from "@evryg/integresql"
import { DatabaseClient } from "./DatabaseClient"

const LiveProductsTestDatabaseClient = Layer.unwrapEffect(
  pipe(
    getConnection({
      databaseFiles: ["migrations/**/¨.ts"],
      initializeTemplate: (connection) => Effect.promise(async () => {
        const connection = knex({
          connection: {
            host: connection,
            port: connection.port, // You might need to override this depending on your docker-compose setup 
            user: connection.username,
            password: connection.password,
            database: connection.database
          },
          migrations: {
            directory: "test/knex/migrations"
          }
        })
      })
    }),
    Effect.map((connection) => makeLiveDatabaseClient(connection))
  )
)

// options.url: The URL of the IntegreSQL instance
```

2. **(Once per test runner process) Get a hash of the migrations & fixtures**

```ts
// The hash can be generated in any way that fits your business logic, the included
// helper creates a SHA1 hash of the file content of all files matching the glob patterns.
const hash = await integreSQL.hashFiles([
  "./migrations/**/*",
  "./fixtures/**/*"
])
```

3. **(Once per test runner process) Initialize the template database**

```ts
await integreSQL.initializeTemplate(hash, async (databaseConfig) => {
  await migrateTemplateDatabase(databaseConfig)
  await seedTemplateDatabase(databaseConfig)
  await disconnectFromDatabase(databaseConfig)
})
```

4. **(Before each test) Get a isolated test database**

```ts
const databaseConfig = await integreSQL.getTestDatabase(hash)
```

### Helpers

- `integreSQL.databaseConfigToConnectionUrl(databaseConfig)`
  - Converts the database configuration object into a
    [connection URL](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING)

### API requests

You can directly send requests to the IntegreSQL instance via the included API client, or optionally
instantiate a new [`IntegreSQLApiClient`](./src/apiClient.ts) yourself.

```ts
await integreSQL.api.reuseTestDatabase(hash, id)

const api = new IntegreSQLApiClient({ url: "http://localhost:5000" })
await api.reuseTestDatabase(hash, id)
```

@todo: running on custom ports
@todo: using the client by itself

## Contributors

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://www.david-reess.de"><img src="https://avatars3.githubusercontent.com/u/4615516?v=4" width="75px;" alt=""/><br /><sub><b>David Reeß</b></sub></a><br /><a href="https://github.com/devoxa/integresql-client/commits?author=queicherius" title="Code">💻</a> <a href="https://github.com/devoxa/integresql-client/commits?author=queicherius" title="Documentation">📖</a> <a href="https://github.com/devoxa/integresql-client/commits?author=queicherius" title="Tests">⚠️</a></td>
  </tr>
</table>

<!-- markdownlint-enable -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors)
specification. Contributions of any kind welcome!

## License

MIT
