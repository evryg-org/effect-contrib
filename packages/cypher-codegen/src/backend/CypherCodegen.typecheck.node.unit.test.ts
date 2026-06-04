import { describe, expect, it } from "@effect/vitest"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import type { ResolvedColumn, ResolvedParam } from "../frontend/QueryAnalyzer.js"
import { type CypherType, ListType, MapType, ScalarType, UnknownType } from "../types/CypherType.js"
import { type BarrelEntry, generateBarrel, generateModule } from "./CypherCodegen.js"

// Type-checks generated query source against the repo's real compiler options.
//
// The unit tests in CypherCodegen.node.unit.test.ts only assert on the emitted
// *string*; they never compile it. The regression these guards exist for —
// generated `queries.ts` failing to type-check under Effect v4 — therefore could
// not surface as a string assertion. These tests close that gap by running the
// TypeScript checker over the generator's output and asserting zero diagnostics.

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "../../../..")
const virtualPath = path.join(here, "__codegen_typecheck__.ts")

const compilerOptions = (): ts.CompilerOptions => {
  const configFile = ts.readConfigFile(path.join(repoRoot, "tsconfig.base.json"), ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot)
  return {
    ...parsed.options,
    // Single in-memory file: drop build-mode flags and emit. tsBuildInfoFile is
    // omitted rather than set to undefined (exactOptionalPropertyTypes forbids it).
    composite: false,
    incremental: false,
    noEmit: true,
    skipLibCheck: true,
    types: []
  }
}

const typeCheck = (source: string): ReadonlyArray<string> => {
  const options = compilerOptions()
  const host = ts.createCompilerHost(options, true)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    path.resolve(fileName) === virtualPath
      ? ts.createSourceFile(fileName, source, languageVersion, true)
      : getSourceFile(fileName, languageVersion, onError, shouldCreate)

  const program = ts.createProgram([virtualPath], options, host)
  const sourceFile = program.getSourceFile(virtualPath)!
  return [...program.getSyntacticDiagnostics(sourceFile), ...program.getSemanticDiagnostics(sourceFile)]
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
}

// ── Helpers ──

const scalar = (t: string): ScalarType => new ScalarType({ scalarType: t as ScalarType["scalarType"] })

const col = (name: string, type: CypherType, nullable: boolean): ResolvedColumn => ({ name, type, nullable })

const param = (name: string, type: ResolvedParam["type"], nullable: boolean): ResolvedParam => ({
  name,
  type,
  nullable
})

// Columns covering every schema-emitting branch: scalars, Neo4jInt (Long),
// nullable, temporal (TemporalString + SchemaTransformation), list, map, and
// the Neo4jValue escape hatch.
const allColumns: ReadonlyArray<ResolvedColumn> = [
  col("fqcn", scalar("String"), false),
  col("count", scalar("Long"), false),
  col("ratio", scalar("Double"), false),
  col("active", scalar("Boolean"), true),
  col("createdAt", scalar("DateTime"), false),
  col("tags", ListType(scalar("String")), false),
  col("meta", MapType([{ name: "label", value: scalar("String") }]), false),
  col("blob", new UnknownType(), false)
]

describe("generated source type-checks under Effect v4", () => {
  it("generateModule output compiles with no type errors", () => {
    const source = generateModule(
      "MATCH (c:Class {fqcn: $fqcn}) WHERE c.count > $min RETURN c.fqcn AS fqcn",
      allColumns,
      [param("fqcn", "String", false), param("min", "Long", true)]
    )
    expect(typeCheck(source)).toEqual([])
  })

  it("generateBarrel output compiles with no type errors", () => {
    const entries: ReadonlyArray<BarrelEntry> = [
      {
        filename: "Classes.cypher",
        cypher: "MATCH (c:Class) WHERE c.label = $label RETURN c.fqcn AS fqcn, count(c) AS count",
        columns: [col("fqcn", scalar("String"), false), col("count", scalar("Long"), false)],
        params: [param("label", "String", false)]
      },
      {
        filename: "Raw.cypher",
        cypher: "MATCH (c:Class) RETURN c",
        columns: [],
        params: []
      },
      {
        filename: "Events.cypher",
        cypher: "MATCH (e:Event) RETURN e.at AS at",
        columns: [col("at", scalar("DateTime"), false)],
        params: []
      }
    ]
    expect(typeCheck(generateBarrel(entries))).toEqual([])
  })
})
