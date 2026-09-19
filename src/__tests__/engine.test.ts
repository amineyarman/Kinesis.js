import { expect, it } from "vitest"
import { computeOutput, type TargetConfig } from "../effects"

const base = (overrides: Partial<TargetConfig> = {}): TargetConfig => ({
  enabled: true,
  source: "auto",
  space: "local",
  motion: "smooth",
  intensity: 1,
  perspective: 1000,
  reducedMotion: "respect",
  parallaxX: 0,
  parallaxY: 0,
  tiltX: 0,
  tiltY: 0,
  tiltOrigin: "center",
  axis: "both",
  rotate: 0,
  depth: 0,
  depthStep: 12,
  magneticRadius: 0,
  magneticForce: 1,
  magneticFalloff: "smooth",
  magneticAxis: "both",
  repel: 0,
  repelRadius: 180,
  attract: 0,
  attractRadius: 240,
  follow: "none",
  followOffsetX: 0,
  followOffsetY: 0,
  trail: 0,
  scrollX: 0,
  scrollY: 0,
  scrollRotate: 0,
  path: "",
  pathStrength: 1,
  audioBand: "none",
  audioBin: -1,
  audioScaleMin: 1,
  audioScaleMax: 1.2,
  springStiffness: 180,
  springDamping: 22,
  springMass: 1,
  smoothing: 0,
  ...overrides,
})

const rect = {
  left: 0,
  top: 0,
  width: 200,
  height: 200,
  right: 200,
  bottom: 200,
  x: 0,
  y: 0,
  toJSON() {
    return this
  },
} as DOMRect

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
