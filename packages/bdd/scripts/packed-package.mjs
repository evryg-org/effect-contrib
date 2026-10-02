import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import console from "node:console"
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"
import { fileURLToPath, URL } from "node:url"

const cwd = fileURLToPath(new URL("..", import.meta.url))
const consumer = mkdtempSync(join(tmpdir(), "effect-bdd-packed-"))
const command = (name, args, options = {}) => {
  const result = spawnSync(name, args, { cwd, encoding: "utf8", ...options })
  if (result.status !== 0) throw new Error(`${name} failed: ${result.stdout}\n${result.stderr}`)
  return result.stdout
}
const [{ filename }] = JSON.parse(command("npm", ["pack", "./dist", "--json", "--pack-destination", consumer]))
command("tar", ["-xzf", join(consumer, filename), "-C", consumer])
const manifest = JSON.parse(readFileSync(join(consumer, "package/package.json"), "utf8"))
assert.deepEqual(Object.keys(manifest.exports).sort(), [".", "./effect", "./effect-vitest", "./vitest"].sort())
mkdirSync(join(consumer, "node_modules/@evryg"), { recursive: true })
symlinkSync(join(consumer, "package"), join(consumer, "node_modules/@evryg/effect-bdd"))
symlinkSync(join(cwd, "node_modules/effect"), join(consumer, "node_modules/effect"))
writeFileSync(join(consumer, "package.json"), JSON.stringify({ type: "module" }))
const entries = [
  "@evryg/effect-bdd",
  "@evryg/effect-bdd/effect",
  "@evryg/effect-bdd/vitest",
  "@evryg/effect-bdd/effect-vitest"
]
for (const entry of entries) {
  command(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(entry)})`], { cwd: consumer })
  command(process.execPath, ["-e", `require(${JSON.stringify(entry)})`], { cwd: consumer })
}
// Compile exactly the same public consumer contract used by source checks.
writeFileSync(join(consumer, "public-api.test.ts"), readFileSync(join(cwd, "compat/public-api.test.ts")))
writeFileSync(join(consumer, "tsconfig.json"), readFileSync(join(cwd, "compat/tsconfig.json")))
for (
  const [label, compiler, expected] of [
    ["TypeScript 5.9.3", process.env.TS59_TSC, /^Version 5\.9\.3$/],
    ["TypeScript 7 stable", process.env.TS7_TSC, /^Version 7\.\d+\.\d+$/]
  ]
) {
  if (!compiler) throw new Error(`Set TS59_TSC and TS7_TSC to unpatched compiler executables (${label} missing)`)
  const version = command(compiler, ["--version"], { cwd: consumer }).trim()
  assert.match(version, expected)
  command(compiler, ["--project", "tsconfig.json"], { cwd: consumer })
  console.log(`Packed public contract: ${label} passed`)
}
console.log(`Packed ESM, CJS, and declaration exports passed (${filename})`)
