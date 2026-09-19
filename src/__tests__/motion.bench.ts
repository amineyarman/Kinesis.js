import { bench, describe } from "vitest"
import { constrainDrag } from "../drag"
import { computeOutput, createComputeContext, defaults } from "../effects"
import { SpatialHash } from "../field"

const config = {
  ...defaults,
  parallaxX: 40,
  parallaxY: 20,
  tiltX: 8,
  tiltY: 10,
  magneticRadius: 160,
  magneticForce: 0.4,
}
const rect = { left: 0, top: 0, width: 200, height: 200 }
const pointer = { x: 140, y: 90, nx: 0.4, ny: -0.1 }
const ctx = createComputeContext()

describe("compositor", () => {
  bench("pointer target x1", () => {
    computeOutput(config, pointer, rect, 0, false, 0, "pointer", undefined, undefined, ctx)
  })
  bench("pointer target x10", () => {
    for (let index = 0; index < 10; index += 1) {
      computeOutput(config, pointer, rect, 0, false, 0, "pointer", undefined, undefined, ctx)
    }
  })
  bench("pointer target x100", () => {
    for (let index = 0; index < 100; index += 1) {
      computeOutput(config, pointer, rect, 0, false, 0, "pointer", undefined, undefined, ctx)
    }
  })
  bench("drag constraint", () => {
    constrainDrag(48, 36, rect, { left: 0, top: 0, width: 400, height: 300 }, 16, "both")
  })
  bench("spatial hash 500", () => {
    const hash = new SpatialHash()
    hash.setSize(160)
    for (let index = 0; index < 500; index += 1) hash.insert(index, (index % 40) * 20, Math.floor(index / 40) * 20)
    const hits: number[] = []
    hash.query(200, 120, 160, hits)
  })
})
