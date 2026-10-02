import { spawnSync } from "node:child_process"
import console from "node:console"
import process from "node:process"
import { fileURLToPath, URL } from "node:url"

const cwd = fileURLToPath(new URL("..", import.meta.url))
const compilers = [
  ["TypeScript 5.9.3", process.env.TS59_TSC, /^Version 5\.9\.3$/],
  ["TypeScript 7 stable", process.env.TS7_TSC, /^Version 7\.\d+\.\d+$/]
]

for (const [label, compiler, expected] of compilers) {
  if (!compiler) {
    throw new Error(
      `Set ${label.startsWith("TypeScript 5") ? "TS59_TSC" : "TS7_TSC"} to the unpatched compiler executable`
    )
  }
  const version = spawnSync(compiler, ["--version"], { cwd, encoding: "utf8" })
  if (version.status !== 0 || !expected.test(version.stdout.trim())) {
    throw new Error(`${label}: unexpected compiler version ${version.stdout || version.stderr}`)
  }
  console.log(`${label}: ${version.stdout.trim()}`)
  const check = spawnSync(compiler, ["--project", "compat/tsconfig.json"], { cwd, stdio: "inherit" })
  if (check.status !== 0) process.exit(check.status ?? 1)
}
