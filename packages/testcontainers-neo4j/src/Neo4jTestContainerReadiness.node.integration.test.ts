import { expect, it } from "@effect/vitest"
import { Neo4jConfig } from "@evryg/effect-neo4j"
import { Effect, Layer } from "effect"
import * as http from "node:http"
import * as net from "node:net"
import { makeNeo4jTestContainer } from "./Neo4jTestContainer.js"

const followLogsRequest = /\/containers\/[^/]+\/logs\?.*follow=(1|true)/

const upstreamSocketPath = (): string => {
  const host = process.env.DOCKER_HOST
  return host !== undefined && host.startsWith("unix://") ? host.slice("unix://".length) : "/var/run/docker.sock"
}

const startLogTruncatingProxy = (upstream: string, proxySocket: string) =>
  Effect.acquireRelease(
    Effect.callback<http.Server>((resume) => {
      const server = http.createServer((req, res) => {
        const forwarded = http.request(
          { socketPath: upstream, method: req.method, path: req.url, headers: req.headers },
          (upstreamRes) => {
            res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
            if (followLogsRequest.test(req.url ?? "")) {
              upstreamRes.once("data", (firstChunk) => {
                res.end(firstChunk)
                upstreamRes.destroy()
              })
            } else {
              upstreamRes.pipe(res)
            }
          }
        )
        req.pipe(forwarded)
        forwarded.on("error", () => res.destroy())
      })
      server.on("upgrade", (req, clientSocket, head) => {
        const upstreamSocket = net.connect(upstream)
        upstreamSocket.on("connect", () => {
          const headerLines = Object.entries(req.headers).map(([name, value]) => `${name}: ${value}`)
          upstreamSocket.write(`${req.method} ${req.url} HTTP/1.1\r\n${headerLines.join("\r\n")}\r\n\r\n`)
          upstreamSocket.write(head)
          upstreamSocket.pipe(clientSocket)
          clientSocket.pipe(upstreamSocket)
        })
        upstreamSocket.on("error", () => clientSocket.destroy())
        clientSocket.on("error", () => upstreamSocket.destroy())
      })
      server.listen(proxySocket, () => resume(Effect.succeed(server)))
    }),
    (server) => Effect.callback<void>((resume) => void server.close(() => resume(Effect.void)))
  )

it.effect(
  "starts Neo4j even when the container log-follow stream is truncated after the first line",
  () =>
    Effect.scoped(Effect.gen(function*() {
      const upstream = upstreamSocketPath()
      const proxySocket = `/tmp/effect-contrib-neo4j-proxy-${process.pid}.sock`
      yield* startLogTruncatingProxy(upstream, proxySocket)
      process.env.DOCKER_HOST = `unix://${proxySocket}`
      process.env.TESTCONTAINERS_RYUK_DISABLED = "true"
      const context = yield* Layer.build(makeNeo4jTestContainer())
      const config = yield* Effect.service(Neo4jConfig).pipe(Effect.provide(context))
      expect(config.uri).toMatch(/^bolt:\/\//)
    })),
  { timeout: 180_000 }
)
