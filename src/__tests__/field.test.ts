import { expect, it } from "vitest"
import { computeOutput, createComputeContext, defaults, type TargetConfig } from "../effects"
import {
  evaluateCircle,
  FALLOFF_CONSTANT,
  FALLOFF_LINEAR,
  FALLOFF_SHARP,
  FALLOFF_SMOOTH,
  FALLOFF_SOFT,
  fieldFalloff,
  MODE_ATTRACT,
  MODE_ORBIT,
  MODE_REPEL,
  MODE_VORTEX,
  createFieldSample,
} from "../field"

const base = (overrides: Partial<TargetConfig> = {}): TargetConfig => ({
  ...defaults,
  ...overrides,
})

const rect = { left: 0, top: 0, width: 200, height: 200 }
const center = { x: 100, y: 100, nx: 0, ny: 0 }

it("falloff stays at the boundaries", () => {
  expect(fieldFalloff(0, FALLOFF_LINEAR)).toBe(0)
  expect(fieldFalloff(1, FALLOFF_LINEAR)).toBe(1)
  expect(fieldFalloff(0, FALLOFF_SMOOTH)).toBe(0)
  expect(fieldFalloff(1, FALLOFF_SMOOTH)).toBe(1)
  expect(fieldFalloff(0, FALLOFF_SOFT)).toBe(0)
  expect(fieldFalloff(1, FALLOFF_SOFT)).toBe(1)
  expect(fieldFalloff(0.5, FALLOFF_SMOOTH)).toBeCloseTo(0.5)
  expect(fieldFalloff(0.5, FALLOFF_SHARP)).toBeCloseTo(0.0625)
})

it("repel pushes away from the source", () => {
  const sample = evaluateCircle(200, 100, 100, 100, 180, FALLOFF_SOFT, MODE_REPEL, createFieldSample())
  expect(sample.active).toBe(true)
  expect(sample.vx).toBeLessThan(0)
  expect(sample.vy).toBeCloseTo(0)
  const output = computeOutput(base({ repel: 40 }), { x: 200, y: 100, nx: 1, ny: 0 }, rect, 0, false)
  expect(output.x).toBeLessThan(0)
  expect(output.y).toBeCloseTo(0)
})

it("magnetic still pulls toward the pointer", () => {
  const output = computeOutput(
    base({ magneticRadius: 180, magneticForce: 1 }),
    { x: 200, y: 100, nx: 1, ny: 0 },
    rect,
    0,
    false,
  )
  expect(output.x).toBeGreaterThan(0)
  expect(output.y).toBeCloseTo(0)
})

it("attract matches the inward field vector", () => {
  const sample = evaluateCircle(200, 100, 100, 100, 240, FALLOFF_SOFT, MODE_ATTRACT, createFieldSample())
  expect(sample.vx).toBeGreaterThan(0)
  const output = computeOutput(base({ attract: 36 }), { x: 200, y: 100, nx: 1, ny: 0 }, rect, 0, false)
  expect(output.x).toBeGreaterThan(0)
})

it("orbit winding flips the tangent", () => {
  const cw = evaluateCircle(0, 0, 80, 0, 200, FALLOFF_CONSTANT, MODE_ORBIT, createFieldSample(), 1, 0.35, 0, 0, 1)
  const ccw = evaluateCircle(0, 0, 80, 0, 200, FALLOFF_CONSTANT, MODE_ORBIT, createFieldSample(), 1, 0.35, 0, 0, -1)
  expect(cw.vy).toBeGreaterThan(0)
  expect(ccw.vy).toBeLessThan(0)
})

it("vortex mixes inward and tangent", () => {
  const sample = evaluateCircle(0, 0, 80, 0, 200, FALLOFF_SMOOTH, MODE_VORTEX, createFieldSample(), 1, 0.35, 0, 0, 1)
  expect(sample.active).toBe(true)
  expect(sample.vx).not.toBe(0)
  expect(sample.vy).not.toBe(0)
})

it("tether stays still inside the slack", () => {
  const ctx = createComputeContext()
  ctx.restX = 100
  ctx.restY = 100
  ctx.anchorX = 140
  ctx.anchorY = 100
  ctx.pointerLive = true
  const still = computeOutput(base({ tether: 80 }), center, rect, 0, false, 0, "pointer", undefined, undefined, ctx)
  expect(still.x).toBe(0)
  ctx.anchorX = 220
  const pulled = computeOutput(base({ tether: 80 }), { x: 220, y: 100, nx: 1, ny: 0 }, rect, 0, false, 0, "pointer", undefined, undefined, ctx)
  expect(pulled.x).toBeCloseTo(40)
})

it("face rotates toward the anchor", () => {
  const ctx = createComputeContext()
  ctx.restX = 100
  ctx.restY = 100
  ctx.anchorX = 200
  ctx.anchorY = 100
  ctx.pointerLive = true
  const output = computeOutput(base({ face: 18 }), { x: 200, y: 100, nx: 1, ny: 0 }, rect, 0, false, 0, "pointer", undefined, undefined, ctx)
  expect(output.rotateZ).toBe(0)
  ctx.anchorY = 40
  const up = computeOutput(base({ face: 18 }), { x: 200, y: 40, nx: 1, ny: -1 }, rect, 0, false, 0, "pointer", undefined, undefined, ctx)
  expect(up.rotateZ).toBeLessThan(0)
})

it("face can turn the full circle", () => {
  const ctx = createComputeContext()
  ctx.anchorX = -80
  ctx.anchorY = 100
  ctx.pointerLive = true
  const glance = computeOutput(base({ face: 24 }), { x: -80, y: 100, nx: -1, ny: 0 }, rect, 0, false, 0, "pointer", undefined, undefined, ctx)
  expect(glance.rotateZ).toBe(24)
  const full = computeOutput(base({ face: 360 }), { x: -80, y: 100, nx: -1, ny: 0 }, rect, 0, false, 0, "pointer", undefined, undefined, ctx)
  expect(Math.abs(full.rotateZ)).toBeCloseTo(180)
})

it("face xy looks with yaw and pitch", () => {
  const ctx = createComputeContext()
  ctx.anchorX = 220
  ctx.anchorY = 40
  ctx.pointerLive = true
  const output = computeOutput(base({ face: 360, faceAxis: "xy" }), { x: 220, y: 40, nx: 1, ny: -1 }, rect, 0, false, 0, "pointer", undefined, undefined, ctx)
  expect(output.rotateY).toBeGreaterThan(0)
  expect(output.rotateX).toBeGreaterThan(0)
  expect(output.rotateZ).toBe(0)
})
