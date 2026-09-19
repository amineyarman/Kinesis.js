import { expect, it } from "vitest"
import { computeOutput, defaults, type TargetConfig } from "../effects"

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
