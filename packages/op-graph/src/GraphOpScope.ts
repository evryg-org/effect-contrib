import { Match } from "effect"
import { GraphOp, InsertVertex, UpsertEdge, UpsertVertex, VertexRef } from "./GraphOp.js"

/**
 * Add fields to every VERTEX identity in an op stream: `UpsertVertex`/`InsertVertex.key`
 * and both endpoint refs of an `UpsertEdge`. The edge's own key is untouched — an edge is
 * identified by its (already enriched) endpoints plus its discriminating key.
 *
 * Generic and domain-free: callers decide what the extra identity fields mean (e.g. a
 * scope salt applied at the materialization boundary, keeping stored ops scope-free so a
 * replay re-stamps them with the current scope).
 */
export const enrichVertexKeys = (extra: Record<string, string>) =>
  (op: GraphOp): GraphOp =>
    Match.valueTags(op, {
      UpsertVertex: (v) =>
        new UpsertVertex({ label: v.label, key: { ...v.key, ...extra }, properties: v.properties }),
      InsertVertex: (v) =>
        new InsertVertex({ label: v.label, key: { ...v.key, ...extra }, properties: v.properties }),
      UpsertEdge: (e) =>
        new UpsertEdge({
          label: e.label,
          from: new VertexRef({ label: e.from.label, key: { ...e.from.key, ...extra } }),
          to: new VertexRef({ label: e.to.label, key: { ...e.to.key, ...extra } }),
          key: e.key,
          properties: e.properties,
        }),
    })
