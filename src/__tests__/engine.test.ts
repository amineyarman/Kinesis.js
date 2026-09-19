import { expect, it } from "vitest"
import { constrainDrag } from "../drag"
import { computeEdge } from "../edge"
import { computeOutput, createComputeContext, defaults, solveChain, type TargetConfig } from "../effects"

const base = (overrides: Partial<TargetConfig> = {}): TargetConfig => ({
  ...defaults,
  ...overrides,
})

const rect = { left: 0, top: 0, width: 200, height: 200 }

it("parallax follows the pointer", () => {
  const output = computeOutput(
    base({ parallaxX: 40, parallaxY: 20 }),
    { x: 200, y: 100, nx: 1, ny: 0 },
    rect,
    0,
    false,
  )
  expect(output.x).toBe(-40)
  expect(output.y).toBe(0)
})

it("tilt follows the pointer", () => {
  const output = computeOutput(
    base({ tiltX: 10, tiltY: 8 }),
    { x: 100, y: 100, nx: 1, ny: -1 },
    rect,
    0,
    false,
  )
  expect(output.rotateY).toBe(8)
  expect(output.rotateX).toBe(10)
})

it("path follows view progress", () => {
  const output = computeOutput(
    base({ path: "M 0 0 H 100" }),
    { x: 0, y: 0, nx: 0, ny: 0 },
    rect,
    0.25,
    false,
    0,
    "view",
  )
  expect(output.path).toBe(25)
})

it("path follows scroll progress", () => {
  const output = computeOutput(
    base({ path: "M 0 0 H 100" }),
    { x: 0, y: 0, nx: 0, ny: 0 },
    rect,
    0.5,
    false,
    0,
    "scroll",
  )
  expect(output.path).toBe(50)
})

it("chain keeps neighbor spacing", () => {
  const outX = [0, 0, 0]
  const outY = [0, 0, 0]
  solveChain(
    [100, 140, 180],
    [100, 100, 100],
    [Number.NaN, Number.NaN, Number.NaN],
    [Number.NaN, Number.NaN, Number.NaN],
    40,
    100,
    20,
    1,
    outX,
    outY,
  )
  expect(outX[0]).toBe(40)
  expect(outY[0]).toBe(100)
  expect(Math.hypot(outX[1]! - outX[0]!, outY[1]! - outY[0]!)).toBeCloseTo(20)
  expect(Math.hypot(outX[2]! - outX[1]!, outY[2]! - outY[1]!)).toBeCloseTo(20)
})

it("edge pushes inward from the nearest side", () => {
  const sample = computeEdge(10, 80, 0, 0, 200, 160, 40)
  expect(sample.left).toBe(10)
  expect(sample.nearest).toBe(10)
  expect(sample.nx).toBe(1)
  expect(sample.ny).toBe(0)
  expect(sample.progress).toBeCloseTo(0.75)
})

it("path follows the pointer", () => {
  const output = computeOutput(
    base({ path: "M 0 0 H 100" }),
    { x: 200, y: 100, nx: 1, ny: 0 },
    rect,
    0,
    false,
    0,
    "pointer",
  )
  expect(output.path).toBe(100)
})

it("drag offset is applied", () => {
  const ctx = createComputeContext()
  ctx.dragX = 40
  ctx.dragY = -12
  const output = computeOutput(
    base({ drag: "both" }),
    { x: 0, y: 0, nx: 0, ny: 0 },
    rect,
    0,
    false,
    0,
    "pointer",
    undefined,
    undefined,
    ctx,
  )
  expect(output.x).toBe(40)
  expect(output.y).toBe(-12)
})

it("drag stays functional under reduced motion", () => {
  const ctx = createComputeContext()
  ctx.dragX = 24
  const output = computeOutput(
    base({ drag: "both", parallaxX: 40 }),
    { x: 200, y: 100, nx: 1, ny: 0 },
    rect,
    0,
    true,
    0,
    "pointer",
    undefined,
    undefined,
    ctx,
  )
  expect(output.x).toBe(24)
  expect(output.y).toBe(0)
})

it("drag bounds keep the box inside", () => {
  const next = constrainDrag(200, 80, { left: 0, top: 0, width: 40, height: 40 }, { left: 0, top: 0, width: 100, height: 100 }, 0, "both")
  expect(next.x).toBe(60)
  expect(next.y).toBe(60)
})

it("drag snap rounds to the grid", () => {
  const next = constrainDrag(18, 10, rect, null, 16, "x")
  expect(next.x).toBe(16)
  expect(next.y).toBe(0)
})

it("reduced motion is still", () => {
  const output = computeOutput(
    base({ parallaxX: 40, tiltY: 8 }),
    { x: 200, y: 100, nx: 1, ny: 1 },
    rect,
    0,
    true,
  )
  expect(output.x).toBe(0)
  expect(output.rotateY).toBe(0)
})
