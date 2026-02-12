import { PostgreSqlContainer } from "@testcontainers/postgresql"
import { GenericContainer, Network, Wait } from "testcontainers"

export async function startContainers(): Promise<{
  config: {
    integreSQL: { port: number; host: string }
    postgres: { port: number; host: string }
  }
  teardown: () => Promise<void>
}> {
  const network = await new Network().start()
  const postgres = await new PostgreSqlContainer("postgres:12.2-alpine")
    .withNetwork(network)
    .start()
  const integreSQL = await new GenericContainer(
    "ghcr.io/allaboutapps/integresql:v1.1.0"
  )
    .withExposedPorts(5000)
    .withNetwork(network)
    .withEnvironment({
      PGDATABASE: postgres.getDatabase(),
      PGUSER: postgres.getUsername(),
      PGPASSWORD: postgres.getPassword(),
      PGHOST: postgres.getIpAddress(network.getName()),
      PGPORT: "5432", // Use the container port, we are reaching through container network
      PGSSLMODE: "disable"
    })
    .withNetwork(network)
    .withWaitStrategy(Wait.forLogMessage("server started on"))
    .start()

  return {
    config: {
      integreSQL: {
        port: integreSQL.getFirstMappedPort(),
        host: integreSQL.getHost()
      },
      postgres: {
        port: postgres.getFirstMappedPort(),
        host: postgres.getHost()
      }
    },
    teardown: async () => {
      await integreSQL.stop()
      await postgres.stop()
      await network.stop()
    }
  }
}
