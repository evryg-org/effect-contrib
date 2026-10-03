import { describe, expect, it } from "@effect/vitest"
import { EdgeDropped, EdgeMaterialized, EdgeShape, EdgeTally } from "./EdgeTally.js"

const links = () => EdgeShape.make("Alpha-[:LINKS]->Beta")
const owns = () => EdgeShape.make("Beta-[:OWNS]->Gamma")

describe("EdgeTally", () => {
  it("counts a materialized edge as one written operation and no drop", () => {
    const tally = EdgeTally.of([new EdgeMaterialized({ shape: links() })])
    expect(tally.opCount()).toBe(1)
    expect(tally.droppedCount()).toBe(0)
    expect(tally.droppedShapes()).toEqual([])
  })

  it("counts a dropped edge as one operation and one drop", () => {
    const tally = EdgeTally.of([new EdgeDropped({ shape: links() })])
    expect(tally.opCount()).toBe(1)
    expect(tally.droppedCount()).toBe(1)
    expect(tally.droppedShapes()).toEqual([{ shape: links(), dropped: 1, total: 1 }])
  })

  it("reports only the shapes that dropped an edge, each with its drops out of all its edges", () => {
    const tally = EdgeTally.of([
      new EdgeMaterialized({ shape: links() }),
      new EdgeDropped({ shape: links() }),
      new EdgeMaterialized({ shape: owns() })
    ])
    expect(tally.opCount()).toBe(3)
    expect(tally.droppedShapes()).toEqual([{ shape: links(), dropped: 1, total: 2 }])
    expect(tally.droppedByShape()).toEqual(new Map([[links(), 1]]))
  })
})
