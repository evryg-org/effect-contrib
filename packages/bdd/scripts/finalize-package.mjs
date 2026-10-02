import { readFileSync, writeFileSync } from "node:fs"

// pack-v2 derives an unrestricted export map from filenames. Public entry points
// are deliberately fixed by this package, including the packed condition map.
const source = JSON.parse(readFileSync("package.json", "utf8"))
const packed = JSON.parse(readFileSync("dist/package.json", "utf8"))
packed.exports = Object.fromEntries(
  Object.entries(source.exports).map(([entry, path]) => {
    const stem = path.slice("./src/".length, -".ts".length)
    return [entry, {
      types: `./dist/dts/${stem}.d.ts`,
      import: `./dist/esm/${stem}.js`,
      default: `./dist/cjs/${stem}.js`
    }]
  })
)
packed.typesVersions = {
  "*": Object.fromEntries(
    Object.entries(packed.exports)
      .filter(([entry]) => entry !== ".")
      .map(([entry, conditions]) => [entry.slice(2), [conditions.types]])
  )
}
writeFileSync("dist/package.json", `${JSON.stringify(packed, null, 2)}\n`)
