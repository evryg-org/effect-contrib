const PARAM_RE = /\$([a-zA-Z_]\w*)/g

export const extractParams = (cypher: string): ReadonlyArray<string> => {
  const params = new Set<string>()
  for (const match of cypher.matchAll(PARAM_RE)) {
    params.add(match[1])
  }
  return [...params]
}

export const generateModule = (cypher: string): string => {
  const params = extractParams(cypher)
  const lines = [
    `import { Effect } from "effect";`,
    `import { Neo4jClient } from "@/lib/effect-neo4j";`,
    ``,
    `const cypher = ${JSON.stringify(cypher)};`,
    ``,
  ]

  if (params.length === 0) {
    lines.push(`export const query = () =>`)
    lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) => neo4j.query(cypher));`)
  } else {
    const destructure = `{ ${params.join(", ")} }`
    lines.push(`export const query = (${destructure}) =>`)
    lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) => neo4j.query(cypher, ${destructure}));`)
  }

  return lines.join("\n") + "\n"
}
