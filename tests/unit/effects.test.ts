import { describe, expect, it } from "vitest"
import { defaultConfig, type Config } from "../../src/config"
import {
  bearing,
  computeGoal,
  createGoal,
  crossing,
  dragLimits,
  influence,
  normalizeInArea,
  project,
  rubberBand,
  type PointerInput,
} from "../../src/effects"

const config = (patch: Partial<Config>): Config => ({ ...defaultConfig(), ...patch })

const pointerAt = (px: number, py: number, patch: Partial<PointerInput> = {}): PointerInput => ({
  ax: 0,
  ay: 0,
  inArea: true,
  px,
  py,
  present: true,
  cx: 100,
  cy: 100,
  ...patch,
})

describe("pointer effects", () => {
  it("parallax moves away from the pointer, negative moves with it", () => {
    const goal = computeGoal(config({ parallax: [30, 20] }), pointerAt(0, 0, { ax: 1, ay: -1 }), createGoal())
    expect(goal.x).toBe(-30)
    expect(goal.y).toBe(20)
    const toward = computeGoal(config({ parallax: [-30, -30] }), pointerAt(0, 0, { ax: 1, ay: 0 }), createGoal())
    expect(toward.x).toBe(30)
  })

  it("parallax rests when the pointer leaves the area", () => {
    const goal = computeGoal(config({ parallax: [30, 30] }), pointerAt(0, 0, { ax: 1, ay: 1, inArea: false }), createGoal())
    expect(goal.x).toBe(0)
    expect(goal.y).toBe(0)
  })

  it("tilt faces the pointer: right turns rotateY positive, up turns rotateX positive", () => {
    const goal = computeGoal(config({ tilt: [10, 6] }), pointerAt(0, 0, { ax: 1, ay: -1 }), createGoal())
    expect(goal.ry).toBe(10)
    expect(goal.rx).toBe(6)
  })

  it("axis limits both input and output", () => {
    const goal = computeGoal(config({ parallax: [30, 30], axis: "x" }), pointerAt(0, 0, { ax: 1, ay: 1 }), createGoal())
    expect(goal.x).toBe(-30)
    expect(goal.y).toBe(0)
  })

  it("magnetic leans toward a nearby pointer and ignores a distant one", () => {
    const near = computeGoal(config({ magnetic: 0.5, radius: 200 }), pointerAt(140, 100), createGoal())
    expect(near.x).toBeGreaterThan(0)
    expect(near.x).toBeLessThan(20)
    expect(near.y).toBe(0)
    const far = computeGoal(config({ magnetic: 0.5, radius: 200 }), pointerAt(400, 100), createGoal())
    expect(far.x).toBe(0)
  })

  it("repel pushes away from the pointer", () => {
    const goal = computeGoal(config({ repel: 30, radius: 200 }), pointerAt(140, 100), createGoal())
    expect(goal.x).toBeLessThan(0)
    expect(goal.near).toBeGreaterThan(0)
  })

  it("follow reaches the pointer and limit caps the distance", () => {
    const free = computeGoal(config({ follow: 1 }), pointerAt(160, 180), createGoal())
    expect(free.x).toBe(60)
    expect(free.y).toBe(80)
    const capped = computeGoal(config({ follow: 1, limit: 10 }), pointerAt(160, 180), createGoal())
    expect(Math.hypot(capped.x, capped.y)).toBeCloseTo(10)
    expect(capped.x / capped.y).toBeCloseTo(60 / 80)
  })

  it("look turns toward the pointer and saturates at radius", () => {
    const goal = computeGoal(config({ look: 20, radius: 100 }), pointerAt(400, 100), createGoal())
    expect(goal.ry).toBe(20)
    expect(goal.rx).toBeCloseTo(0)
  })

  it("point aims the artwork at the pointer, measured like gradient angles", () => {
    const right = computeGoal(config({ point: 0 }), pointerAt(200, 100), createGoal())
    expect(right.rz).toBeCloseTo(90)
    const facingRight = computeGoal(config({ point: 90 }), pointerAt(200, 100), createGoal())
    expect(facingRight.rz).toBeCloseTo(0)
    expect(bearing(0, -1)).toBeCloseTo(0)
    expect(bearing(0, 1)).toBeCloseTo(180)
  })

  it("spin turns flat with horizontal position, or vertical with axis y", () => {
    const goal = computeGoal(config({ spin: 90 }), pointerAt(0, 0, { ax: 0.5, ay: -1 }), createGoal())
    expect(goal.spin).toBe(45)
    const vertical = computeGoal(config({ spin: 90, axis: "y" }), pointerAt(0, 0, { ax: 0.5, ay: -1 }), createGoal())
    expect(vertical.spin).toBe(-90)
    const outside = computeGoal(config({ spin: 90 }), pointerAt(0, 0, { ax: 1, inArea: false }), createGoal())
    expect(outside.spin).toBe(0)
  })

  it("intensity scales everything", () => {
    const goal = computeGoal(config({ parallax: [30, 30], intensity: 0.5 }), pointerAt(0, 0, { ax: 1, ay: 0 }), createGoal())
    expect(goal.x).toBe(-15)
  })

  it("nothing happens without a pointer except parallax and tilt from orientation", () => {
    const goal = computeGoal(config({ magnetic: 1, look: 10 }), pointerAt(140, 100, { present: false }), createGoal())
    expect(goal.x).toBe(0)
    expect(goal.ry).toBe(0)
  })
})

describe("helpers", () => {
  it("influence is 1 at the center and 0 at the radius", () => {
    expect(influence(0, 100)).toBe(1)
    expect(influence(100, 100)).toBe(0)
    expect(influence(50, 100)).toBeCloseTo(0.5)
    expect(influence(10, 0)).toBe(0)
  })

  it("crossing goes 0 → 1 as an element passes through the viewport", () => {
    expect(crossing(800, 200, 800)).toBe(0)
    expect(crossing(-200, 200, 800)).toBe(1)
    expect(crossing(300, 200, 800)).toBeCloseTo(0.5)
  })

  it("normalizes the pointer inside an area", () => {
    const out = normalizeInArea(150, 50, 100, 0, 100, 100, pointerAt(0, 0))
    expect(out.ax).toBe(0)
    expect(out.ay).toBe(0)
    expect(out.inArea).toBe(true)
    expect(normalizeInArea(99, 50, 100, 0, 100, 100, pointerAt(0, 0)).inArea).toBe(false)
  })

  it("drag limits keep the element inside its bounds", () => {
    const limits = dragLimits({ left: 50, top: 50, width: 20, height: 20 }, { left: 0, top: 0, width: 200, height: 100 })
    expect(limits).toEqual({ minX: -50, maxX: 130, minY: -50, maxY: 30 })
    expect(dragLimits({ left: 0, top: 0, width: 10, height: 10 }, null).maxX).toBe(Number.POSITIVE_INFINITY)
  })

  it("rubber-bands past the limits", () => {
    expect(rubberBand(50, 0, 100)).toBe(50)
    expect(rubberBand(120, 0, 100)).toBeCloseTo(107)
    expect(rubberBand(-20, 0, 100)).toBeCloseTo(-7)
  })

  it("projects a throw", () => {
    expect(project(10, 1000)).toBe(210)
  })
})
