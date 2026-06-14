import { describe, it, expect } from "@effect/vitest"
import { UpsertVertex, InsertVertex, UpsertEdge, VertexRef } from "./GraphOp.js"
import { buildSchemaIndex, validateGraphOps, type SchemaIndex } from "./GraphOpValidator.js"

describe("buildSchemaIndex", () => {
  it("indexes node properties by label", () => {
    const index = buildSchemaIndex(
      [
        { labels: ["Class"], propertyName: "fqcn" },
        { labels: ["Class"], propertyName: "name" },
        { labels: ["File"], propertyName: "path" },
      ],
      [],
    )
    expect(index.get("Class")).toEqual(new Set(["fqcn", "name"]))
    expect(index.get("File")).toEqual(new Set(["path"]))
  })

  it("indexes multi-label entries under each label", () => {
    const index = buildSchemaIndex(
      [{ labels: ["A", "B"], propertyName: "shared" }],
      [],
    )
    expect(index.get("A")!.has("shared")).toBe(true)
    expect(index.get("B")!.has("shared")).toBe(true)
  })

  it("indexes relationship properties by relType", () => {
    const index = buildSchemaIndex(
      [],
      [
        { relType: "DEPENDS_ON", propertyName: "kind" },
        { relType: "DEPENDS_ON", propertyName: "confidence" },
      ],
    )
    expect(index.get("DEPENDS_ON")).toEqual(new Set(["kind", "confidence"]))
  })
})

describe("validateGraphOps", () => {
  const index: SchemaIndex = buildSchemaIndex(
    [
      { labels: ["Class"], propertyName: "fqcn" },
      { labels: ["Class"], propertyName: "name" },
      { labels: ["Class"], propertyName: "file" },
      { labels: ["File"], propertyName: "path" },
    ],
    [
      { relType: "DEPENDS_ON", propertyName: "kind" },
    ],
  )

  it("returns no violations for valid UpsertVertex", () => {
    const ops = [new UpsertVertex({ label: "Class", key: { fqcn: "A" }, properties: { name: "A", file: "a.php" } })]
    expect(validateGraphOps(ops, index)).toEqual([])
  })

  it("returns no violations for valid InsertVertex", () => {
    const ops = [new InsertVertex({ label: "File", key: { path: "a.php" }, properties: {} })]
    expect(validateGraphOps(ops, index)).toEqual([])
  })

  it("detects undeclared property on UpsertVertex", () => {
    const ops = [new UpsertVertex({ label: "Class", key: { fqcn: "A" }, properties: { bogus: "x" } })]
    const violations = validateGraphOps(ops, index)
    expect(violations).toHaveLength(1)
    expect(violations[0].op).toBe("UpsertVertex")
    expect(violations[0].label).toBe("Class")
    expect(violations[0].property).toBe("bogus")
  })

  it("detects undeclared key property on InsertVertex", () => {
    const ops = [new InsertVertex({ label: "Class", key: { unknown_key: "x" }, properties: {} })]
    const violations = validateGraphOps(ops, index)
    expect(violations).toHaveLength(1)
    expect(violations[0].property).toBe("unknown_key")
  })

  it("detects unknown label", () => {
    const ops = [new UpsertVertex({ label: "Ghost", key: { id: "1" }, properties: {} })]
    const violations = validateGraphOps(ops, index)
    expect(violations).toHaveLength(1)
    expect(violations[0].property).toBe("*")
    expect(violations[0].message).toContain("Unknown label")
  })

  it("validates UpsertEdge label and properties", () => {
    const ops = [new UpsertEdge({
      label: "DEPENDS_ON",
      from: new VertexRef({ label: "Class", key: { fqcn: "A" } }),
      to: new VertexRef({ label: "Class", key: { fqcn: "B" } }),
      key: { kind: "calls" },
      properties: {},
    })]
    expect(validateGraphOps(ops, index)).toEqual([])
  })

  it("detects undeclared edge property", () => {
    const ops = [new UpsertEdge({
      label: "DEPENDS_ON",
      from: new VertexRef({ label: "Class", key: { fqcn: "A" } }),
      to: new VertexRef({ label: "Class", key: { fqcn: "B" } }),
      key: {},
      properties: { weight: 42 },
    })]
    const violations = validateGraphOps(ops, index)
    expect(violations).toHaveLength(1)
    expect(violations[0].label).toBe("DEPENDS_ON")
    expect(violations[0].property).toBe("weight")
  })

  it("detects unknown relationship type", () => {
    const ops = [new UpsertEdge({
      label: "GHOST_REL",
      from: new VertexRef({ label: "Class", key: { fqcn: "A" } }),
      to: new VertexRef({ label: "Class", key: { fqcn: "B" } }),
      key: {},
      properties: {},
    })]
    const violations = validateGraphOps(ops, index)
    expect(violations).toHaveLength(1)
    expect(violations[0].message).toContain("Unknown relationship type")
  })

  it("detects undeclared from/to key properties", () => {
    const ops = [new UpsertEdge({
      label: "DEPENDS_ON",
      from: new VertexRef({ label: "Class", key: { bad_key: "x" } }),
      to: new VertexRef({ label: "File", key: { path: "a.php" } }),
      key: { kind: "calls" },
      properties: {},
    })]
    const violations = validateGraphOps(ops, index)
    expect(violations).toHaveLength(1)
    expect(violations[0].label).toBe("Class")
    expect(violations[0].property).toBe("bad_key")
  })

  it("accumulates multiple violations", () => {
    const ops = [
      new UpsertVertex({ label: "Class", key: { fqcn: "A" }, properties: { bogus1: "x", bogus2: "y" } }),
      new UpsertVertex({ label: "Ghost", key: { id: "1" }, properties: {} }),
    ]
    const violations = validateGraphOps(ops, index)
    expect(violations.length).toBeGreaterThanOrEqual(3)
  })

})
