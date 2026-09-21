import { expect, it } from "vitest"
import { constrainDrag } from "../drag"
import { computeEdge } from "../edge"
import { shortestDelta } from "../core"
import { applyGroupConfig, chainHeading, computeOutput, createComputeContext, defaults, orientChain, originPoint, parseGroupConfig, retainGroupConfig, shouldReduceMotion, solveChain, solveChainReach, type GroupConfig, type TargetConfig } from "../effects"

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

it("shortestDelta unwraps past a turn", () => {
  expect(shortestDelta(170, -170)).toBeCloseTo(20)
  expect(shortestDelta(750, 0)).toBeCloseTo(-30)
})

it("originPoint pins top center", () => {
  const point = originPoint({ left: 0, top: 0, width: 200, height: 160 }, "top center")
  expect(point.x).toBe(100)
  expect(point.y).toBe(0)
})

it("chain length alone still makes a host", () => {
  const style = {
    getPropertyValue: (name: string) => (name === "--k-chain" ? "22px" : ""),
  } as CSSStyleDeclaration
  expect(parseGroupConfig(style).kind).toBe("chain")
})

it("chain length does not make a group when group is none", () => {
  const style = {
    getPropertyValue: (name: string) => {
      if (name === "--k-group") return "none"
      if (name === "--k-chain") return "40px"
      return ""
    },
  } as CSSStyleDeclaration
  expect(parseGroupConfig(style).kind).toBe("")
})

it("chain survives a css retune", () => {
  const group: GroupConfig = {
    kind: "chain",
    order: "sequence",
    wave: 0,
    waveAxis: "y",
    waveSpread: 0.18,
    waveRadius: 160,
    ripple: 0,
    rippleRadius: 180,
    rippleFalloff: 0,
    lensScale: 1.25,
    lensRadius: 120,
    bend: 0,
    bendRadius: 160,
    orbit: 0,
    orbitSpeed: 0.25,
    orbitDirection: 1,
    orbitMode: "time",
    orbitPhase: 0,
    chain: 22,
    chainMode: "follow",
    chainLimit: 0,
    chainOrient: "auto",
  }
  const live = { ...defaults }
  applyGroupConfig(live, group, 2, 8)
  expect(live.chain).toBe(22)
  const next = { ...defaults }
  retainGroupConfig(next, live)
  expect(next.chain).toBe(22)
  expect(next.group).toBe("chain")
  expect(next.chainOrient).toBe("auto")
})

it("chain bones aim at the next joint", () => {
  expect(chainHeading(100, 100, 140, 100)).toBeCloseTo(0)
  expect(chainHeading(100, 100, 100, 60)).toBeCloseTo(-90)
  const out = [0, 0, 0]
  orientChain([100, 140, 180], [100, 100, 100], out)
  expect(out[0]).toBeCloseTo(0)
  expect(out[1]).toBeCloseTo(0)
  expect(out[2]).toBeCloseTo(0)
})

it("reach plants the root and sends the tip to the target", () => {
  const outX = [0, 0, 0, 0]
  const outY = [0, 0, 0, 0]
  solveChainReach(
    [100, 140, 180, 220],
    [100, 100, 100, 100],
    [Number.NaN, Number.NaN, Number.NaN, Number.NaN],
    [Number.NaN, Number.NaN, Number.NaN, Number.NaN],
    100,
    20,
    40,
    2,
    0,
    outX,
    outY,
  )
  expect(outX[0]).toBe(100)
  expect(outY[0]).toBe(100)
  expect(outX[3]).toBeCloseTo(100)
  expect(outY[3]).toBeCloseTo(20)
  expect(Math.hypot(outX[1]! - outX[0]!, outY[1]! - outY[0]!)).toBeCloseTo(40)
  expect(Math.hypot(outX[2]! - outX[1]!, outY[2]! - outY[1]!)).toBeCloseTo(40)
  expect(Math.hypot(outX[3]! - outX[2]!, outY[3]! - outY[2]!)).toBeCloseTo(40)
})

it("reach stretches toward an out-of-range target", () => {
  const outX = [0, 0, 0]
  const outY = [0, 0, 0]
  solveChainReach(
    [100, 140, 180],
    [100, 100, 100],
    [Number.NaN, Number.NaN, Number.NaN],
    [Number.NaN, Number.NaN, Number.NaN],
    100,
    -400,
    40,
    2,
    0,
    outX,
    outY,
  )
  expect(outX[0]).toBe(100)
  expect(outY[0]).toBe(100)
  expect(outX[2]).toBeCloseTo(100)
  expect(outY[2]).toBeCloseTo(20)
})

it("reach swings a short arm onto a nearby target", () => {
  const outX = [0, 0, 0, 0]
  const outY = [0, 0, 0, 0]
  solveChainReach(
    [100, 100, 100, 100],
    [100, 60, 20, -20],
    [100, 100, 100, 100],
    [100, 60, 20, -20],
    180,
    100,
    40,
    2,
    64,
    outX,
    outY,
  )
  expect(outX[0]).toBe(100)
  expect(outY[0]).toBe(100)
  expect(Math.hypot(outX[3]! - 180, outY[3]! - 100)).toBeLessThan(2)
  expect(Math.hypot(outX[1]! - outX[0]!, outY[1]! - outY[0]!)).toBeCloseTo(40)
})

it("reach honors a shorter last bone", () => {
  const outX = [0, 0, 0]
  const outY = [0, 0, 0]
  solveChainReach(
    [100, 140, 180],
    [100, 100, 100],
    [Number.NaN, Number.NaN, Number.NaN],
    [Number.NaN, Number.NaN, Number.NaN],
    100,
    50,
    [40, 16],
    2,
    0,
    outX,
    outY,
  )
  expect(outX[0]).toBe(100)
  expect(outY[0]).toBe(100)
  expect(Math.hypot(outX[2]! - 100, outY[2]! - 50)).toBeLessThan(0.5)
  expect(Math.hypot(outX[2]! - outX[1]!, outY[2]! - outY[1]!)).toBeCloseTo(16)
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

it("tether stays still inside slack", () => {
  const ctx = createComputeContext()
  ctx.restX = 0
  ctx.restY = 0
  ctx.anchorX = 60
  ctx.anchorY = 0
  const output = computeOutput(
    base({ tether: 80, tetherSlack: 20 }),
    { x: 60, y: 0, nx: 0, ny: 0 },
    rect,
    0,
    false,
    0,
    "pointer",
    undefined,
    undefined,
    ctx,
  )
  expect(output.x).toBe(0)
  expect(output.y).toBe(0)
})

it("tether pulls once slack is spent", () => {
  const ctx = createComputeContext()
  ctx.restX = 0
  ctx.restY = 0
  ctx.anchorX = 200
  ctx.anchorY = 0
  const output = computeOutput(
    base({ tether: 80, tetherSlack: 20 }),
    { x: 200, y: 0, nx: 0, ny: 0 },
    rect,
    0,
    false,
    0,
    "pointer",
    undefined,
    undefined,
    ctx,
  )
  expect(output.x).toBe(120)
  expect(output.y).toBe(0)
})

it("orbit sits on the radius", () => {
  const ctx = createComputeContext()
  ctx.restX = 0
  ctx.restY = 0
  ctx.anchorX = 0
  ctx.anchorY = 0
  ctx.clock = 0
  const output = computeOutput(
    base({ orbit: 80, orbitMode: "time" }),
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
  expect(Math.hypot(output.x, output.y)).toBeCloseTo(80)
})

it("reduced-motion policy is respect reduce none ignore", () => {
  expect(shouldReduceMotion(base({ reducedMotion: "ignore" }), true)).toBe(false)
  expect(shouldReduceMotion(base({ reducedMotion: "respect" }), false)).toBe(false)
  expect(shouldReduceMotion(base({ reducedMotion: "respect" }), true)).toBe(true)
  expect(shouldReduceMotion(base({ reducedMotion: "reduce" }), false)).toBe(true)
  expect(shouldReduceMotion(base({ reducedMotion: "none" }), false)).toBe(true)
})
