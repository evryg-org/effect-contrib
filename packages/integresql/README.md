# @evryg/integresql

[![npm version](https://img.shields.io/npm/v/%40evryg/integresql)](https://www.npmjs.com/package/@evryg/integresql)
[![license](https://img.shields.io/npm/l/%40evryg/integresql)](https://github.com/evryg-org/effect-contrib/blob/main/LICENSE)
[![CI](https://github.com/evryg-org/effect-contrib/actions/workflows/check.yml/badge.svg)](https://github.com/evryg-org/effect-contrib/actions/workflows/check.yml)

Effect client for [IntegreSQL](https://github.com/allaboutapps/integresql), used to create isolated PostgreSQL databases for integration tests.

[Installation](#installation) • [Usage](#usage) • [Testcontainers](#testcontainers) • [License](#license)

## Installation

```bash
npm install --save-dev @evryg/integresql effect
```

`effect` is the only required peer dependency.

This package supports Node.js 18 and newer.

Glob matching support used by `templateIdFromFiles(...)` is built in through this package's internal `fast-glob` dependency. You do not need to install `glob` or `fast-glob` yourself.

This package is only the client. You still need a running IntegreSQL server connected to PostgreSQL. To install IntegreSQL itself, follow the official setup instructions: <https://github.com/allaboutapps/integresql#install>

## Usage

```ts
import { Effect } from "effect"
import {
  getConnection,
  templateIdFromFiles,
  type DatabaseConfiguration
} from "@evryg/integresql"

const runMigrations = (connection: DatabaseConfiguration) =>
  Effect.promise(() => migrateDatabase(connection))

const program = Effect.gen(function*() {
  const connection = yield* getConnection({
    integreSQLAPIUrl: "http://127.0.0.1:5000",
    templateId: templateIdFromFiles(["src/db/migrations/*.sql"]),
    initializeTemplate: runMigrations
  })

  yield* Effect.promise(() => runTestWithDatabase(connection))
})
```

`templateIdFromFiles(...)` hashes your migration files so template changes track schema changes.

`initializeTemplate(...)` runs once for a given template id to prepare the template database.

Each call to `getConnection(...)` returns connection details for a fresh isolated test database cloned from that template.

## Testcontainers

For a complete Vitest + Testcontainers setup, see:

- [`test/startContainers.ts`](https://github.com/evryg-org/effect-contrib/blob/main/packages/integresql/test/startContainers.ts)
- [`test/globalSetup.ts`](https://github.com/evryg-org/effect-contrib/blob/main/packages/integresql/test/globalSetup.ts)
- [`test/examples.test.ts`](https://github.com/evryg-org/effect-contrib/blob/main/packages/integresql/test/examples.test.ts)

## License

MIT. See [`./LICENSE`](./LICENSE).
