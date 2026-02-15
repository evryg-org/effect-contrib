import { PostgreSqlContainer } from "@testcontainers/postgresql"
import { GenericContainer, TestContainers, Wait } from "testcontainers"

export async function startContainers(): Promise<{
  config: {
    integreAPIUrl: string
    postgres: { port: number; host: string }
  }
  teardown: () => Promise<void>
}> {
  // The postgres container for our integration tests
  const postgres = await new PostgreSqlContainer("postgres:12.2-alpine")
    .withExposedPorts(5432)
    .start()

  // Expose the postgres host-mapped port so containers can reach it
  // via the special hostname "host.testcontainers.internal"
  await TestContainers.exposeHostPorts(postgres.getFirstMappedPort())

  // The integreSQL REST API container
  // Configured to work with our postgres container
  const integreSQL = await new GenericContainer(
    "ghcr.io/allaboutapps/integresql:v1.1.0"
  )
    .withExposedPorts(5000)
    .withEnvironment({
      PGDATABASE: postgres.getDatabase(),
      PGUSER: postgres.getUsername(),
      PGPASSWORD: postgres.getPassword(),
      PGHOST: "host.testcontainers.internal",
      PGPORT: postgres.getFirstMappedPort().toString(),
      PGSSLMODE: "disable"
    })
    .withWaitStrategy(Wait.forLogMessage("server started on"))
    .start()

  const integreAPIUrl = `http://${integreSQL.getHost()}:${integreSQL.getFirstMappedPort()}`

  return {
    config: {
      integreAPIUrl,
      postgres: {
        port: postgres.getFirstMappedPort(),
        host: postgres.getHost()
      }
    },
    teardown: async () => {
      await integreSQL.stop()
      await postgres.stop()
    }
  }
}
