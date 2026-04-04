import { layer, expect } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { readFileSync } from "node:fs"
import { globSync } from "node:fs"
import { basename } from "node:path"
import { Neo4jClient, UnconfiguredNeo4jClient } from "@/lib/effect-neo4j"
import { CleanNeo4jGraph, Neo4jConfigFromVitest } from "@/lib/effect-vitest-testcontainers"
import { extractSchema } from "@/lib/effect-neo4j-schema/resolvers/live_db/LiveDbGraphSchemaResolver"
import { analyzeQuery } from "./QueryAnalyzer"
import { UnknownType } from "../types/CypherType"

const TestNeo4j = UnconfiguredNeo4jClient.pipe(Layer.provide(Neo4jConfigFromVitest))

// Seed Cypher: creates representative nodes and relationships with properties
// matching what the real pipeline produces, so extract-schema returns a complete schema.
const SEED_CYPHER = `
// Nodes
CREATE (c1:Class {fqcn: "App\\Controller\\FooController", name: "FooController",
  source: "codebase", namespace: "App\\Controller", kind: "class",
  language: "php"})
CREATE (c2:Class {fqcn: "App\\Service\\BarService", name: "BarService",
  source: "codebase", namespace: "App\\Service", kind: "class",
  language: "php"})
CREATE (m1:Method {id: "m1", name: "indexAction",
  source: "codebase", language: "php", isStatic: false, visibility: "public",
  params: ["id"], returnType: "void", line: 10,
  ccn: 3, length: 20, commits: 5, authors: 2, last_changed: "2025-01-01"})
CREATE (m2:Method {id: "m2", name: "process",
  source: "codebase", language: "php", isStatic: false, visibility: "public",
  params: [], returnType: "bool", line: 5,
  ccn: 8, length: 45, commits: 10, authors: 3, last_changed: "2025-02-01"})
CREATE (mod:Module {name: "billing"})
CREATE (d:Subdomain {name: "billing", subdomain_id: 1.0, color: "#38bdf8", classes: "2",
  confidence: "high", folders: "/src/Controller,/src/Service", php_files: "10"})
CREATE (ep:Entrypoint {id: "ep1", path: "/api/foo", transport: "http", type: "HttpAction",
  sourceFile: "/src/Controller/FooController.php", module: "billing", app: "default",
  discoverySource: "static", route: "/api/foo", routeName: "foo", controller: "FooController",
  action: "index", httpMethods: ["GET"], path_params: "",
  response_format: "json", commandName: "", data: '{}',
  request_body: '{"type":"object"}', response_body: '{"type":"object"}',
  response_body_source: "entity", entity_identifier_name: "id"})
CREATE (f:File {name: "FooController.php", path: "/src/Controller/FooController.php",
  commits: 5, authors: 2, last_changed: "2025-01-01", namespace: "App\\Controller",
  checksum: "abc123", size: 1024, extension: "php", firstLine: "<?php",
  lineCount: 50})
CREATE (p:Pattern {id: "p1", label: "controller-pattern", category: "controller",
  ai_leverage: "high", dead_code: false, complexity_tier: "simple",
  architecture_layer: "presentation", test_candidate: "yes",
  specificity_tier: "medium", ordinal: 1})
CREATE (rp:ReverseProxyRoute {listenPort: "443", serverName: "api.example.com",
  upstreamHost: "127.0.0.1", upstreamPort: "8080", isDefault: false})
CREATE (ic:IntegrationContract {key: "ic1", sourceApp: "frontend", targetApp: "backend",
  transport: "http", direction: "outbound", description: "API call"})
CREATE (ha:HttpApp {label: "default", documentRoot: "/var/www/html", internalPort: 8080})
CREATE (pm:PortMapping {service: "web", containerPort: 8080, hostPort: 8080})
CREATE (ts:TransactionSite {id: "ts1", site_type: "query", line: 42,
  access_layer: "repository"})
CREATE (tsc:TransactionScope {id: "tsc1", transaction_type: "read-write",
  depth: 1, has_nested_transaction: false, has_mixed_access: false,
  has_lifecycle_side_effects: false})
CREATE (cm:ContextMapRelationship {id: "cm1", relationship_type: "conformist",
  confidence: "high", weight: 5})
CREATE (sc:StructuralCohort {id: "sc1", level: "class", fingerprint: "abc", size: 3,
  title: "Controllers", description: "Controller cohort", method_summary: "CRUD",
  pattern_summary: "MVC", fan_summary: "low", kind: "structural",
  motif_description: "CRUD controller pattern", span: 2})
CREATE (cp:CodebaseProfile {id: "cp1", framework_name: "zend", framework_variant: "zf2",
  orm_name: "doctrine", orm_version: "2.x", php_file_count_total: 100,
  module_container_paths: ["/module"], portal_modules: ["admin"], api_modules: ["api"],
  metier_subprojects: ["core"]})
CREATE (prop:Property {id: "prop1", name: "version",
  visibility: "private", propertyType: "string", isStatic: false})
CREATE (fn:Function {id: "fn1", name: "helper",
  params: ["value"], returnType: "string"})
CREATE (con:Constant {id: "con1", name: "VERSION"})

// Relationships with properties
CREATE (m1)-[:CALLS {confidence: "high", reason: "static", edge_count: 1}]->(m2)
CREATE (m1)-[:BELONGS_TO {role: "class"}]->(c1)
CREATE (m2)-[:BELONGS_TO {role: "class"}]->(c2)
CREATE (c1)-[:BELONGS_TO {role: "module"}]->(mod)
CREATE (c2)-[:EXTENDS {confidence: "high", reason: "declaration", edge_count: 1}]->(c1)
CREATE (c1)-[:IMPLEMENTS {confidence: "high", reason: "declaration", edge_count: 1}]->(c2)
CREATE (c1)-[:USES {confidence: "high", reason: "declaration", edge_count: 1}]->(c2)
CREATE (c1)-[:REFERENCES {confidence: "high", reason: "type-hint", edge_count: 1}]->(c2)
CREATE (f)-[:IMPORTS {mechanism: "require", idempotency: "once", necessity: "required",
  evaluation: "static", line: 3, confidence: "high"}]->(f)
CREATE (m1)-[:MATCHES {ordinal: 1}]->(p)
CREATE (cm)-[:INVOLVES {role: "consumer"}]->(d)
CREATE (cm)-[:EVIDENCED_BY {role: "shared_class"}]->(c1)
CREATE (cm)-[:EVIDENCED_BY {role: "shared_class"}]->(m1)
CREATE (rp)-[:FORWARDS_TO]->(pm)
CREATE (pm)-[:EXPOSES]->(ha)
CREATE (m2)-[:HAS_TRANSACTION_SITE]->(ts)
CREATE (tsc)-[:ANCHORED_BY]->(ts)
CREATE (tsc)-[:INCLUDES]->(m1)
CREATE (tsc)-[:INCLUDES]->(m2)
CREATE (tsc)-[:SPANS]->(d)
CREATE (ep)-[:TRIGGERS]->(tsc)
CREATE (ic)-[:COVERS]->(ep)
CREATE (c1)-[:BELONGS_TO {role: "subdomain"}]->(d)
CREATE (c2)-[:BELONGS_TO {role: "subdomain"}]->(d)
CREATE (f)-[:BELONGS_TO {role: "subdomain"}]->(d)
CREATE (mod)-[:BELONGS_TO {role: "subdomain"}]->(d)
CREATE (c1)-[:BELONGS_TO {role: "file"}]->(f)
CREATE (c2)-[:BELONGS_TO {role: "file"}]->(f)
CREATE (fn)-[:BELONGS_TO {role: "file"}]->(f)
CREATE (con)-[:BELONGS_TO {role: "file"}]->(f)
CREATE (prop)-[:BELONGS_TO {role: "class"}]->(c2)
`

layer(TestNeo4j, { timeout: "120 seconds" })("QueryAnalyzer — schema extraction + inference (integration)", (it) => {
  it.scoped("extracts schema with all expected labels and rel types", () =>
    Effect.gen(function* () {
      yield* CleanNeo4jGraph
      const client = yield* Neo4jClient
      yield* client.query(SEED_CYPHER)

      const schema = yield* extractSchema()

      // Verify key node labels are present
      const nodeLabels = new Set(schema.vertexProperties.flatMap((p) => p.labels))
      for (const label of ["Class", "Method", "Module", "Subdomain", "Entrypoint", "File",
        "ReverseProxyRoute", "IntegrationContract", "Pattern", "HttpApp", "TransactionSite"]) {
        expect(nodeLabels, `missing label: ${label}`).toContain(label)
      }

      // Verify key rel types are present
      const relTypes = new Set(schema.edgeProperties.map((p) => p.edgeType.replace(/[:`]/g, "")))
      for (const rt of ["CALLS", "BELONGS_TO", "IMPORTS", "INVOLVES", "MATCHES"]) {
        expect(relTypes, `missing rel type: ${rt}`).toContain(rt)
      }
    }),
  )

  it.scoped("analyzeQuery produces no UnknownType for representative .cypher files", () =>
    Effect.gen(function* () {
      yield* CleanNeo4jGraph
      const client = yield* Neo4jClient
      yield* client.query(SEED_CYPHER)

      const schema = yield* extractSchema()

      // Load all .cypher files from the codebase
      const cypherFiles = globSync("src/**/*.cypher")
        .filter((f) => !f.includes("__fixtures__") && !f.includes("GraphSchema"))
        .sort()

      const failures: string[] = []
      for (const file of cypherFiles) {
        const cypher = readFileSync(file, "utf8").trim()
        try {
          const result = analyzeQuery(cypher, schema)
          const unknownCols = result.columns.filter((c) =>
            c.type._tag === "UnknownType" ||
            (c.type._tag === "NullableType" && c.type.inner._tag === "UnknownType")
          )
          if (unknownCols.length > 0) {
            failures.push(`${basename(file)}: ${unknownCols.map((c) => c.name).join(", ")}`)
          }
        } catch (e) {
          failures.push(`${basename(file)}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      // Zero tolerance — all queries must type-check against the schema
      if (failures.length > 0) {
        yield* Effect.log(`Queries with type errors (${failures.length}):\n  ${failures.join("\n  ")}`)
      }
      expect(failures).toEqual([])
    }),
  )
})
