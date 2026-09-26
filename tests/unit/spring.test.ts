import { describe, expect, it } from "vitest"
import { presets, resolveMotion, Spring } from "../../src/spring"

function run(spring: Spring, seconds: number, steps: number[]): number {
  let elapsed = 0
  let index = 0
  while (elapsed < seconds - 1e-9) {
    const dt = Math.min(steps[index % steps.length]!, seconds - elapsed)
    spring.step(dt)
    elapsed += dt
    index += 1
  }
  return spring.value
}

describe("spring", () => {
  for (const name of ["smooth", "soft", "snappy", "bouncy", "heavy"]) {
    it(`${name} lands on the same value at any frame rate`, () => {
      const at = (steps: number[]) => {
        const spring = new Spring(0, 1e-9, presets[name]!)
        spring.target = 100
        return run(spring, 0.4, steps)
      }
      const reference = at([1 / 60])
      expect(at([1 / 144])).toBeCloseTo(reference, 6)
      expect(at([1 / 30])).toBeCloseTo(reference, 6)
      expect(at([0.004, 0.021, 0.0167, 0.009])).toBeCloseTo(reference, 6)
    })
  }

  it("settles exactly and stops asking for frames", () => {
    const spring = new Spring(0, 0.01, presets.smooth!)
    spring.target = 40
    let frames = 0
    while (spring.step(1 / 60)) frames += 1
    expect(spring.value).toBe(40)
    expect(spring.velocity).toBe(0)
    expect(frames).toBeLessThan(90)
    expect(spring.step(1 / 60)).toBe(false)
  })

  it("bouncy overshoots, smooth does not", () => {
    const peak = (name: string) => {
      const spring = new Spring(0, 1e-6, presets[name]!)
      spring.target = 1
      let max = 0
      for (let i = 0; i < 120; i += 1) {
        spring.step(1 / 60)
        max = Math.max(max, spring.value)
      }
      return max
    }
    expect(peak("bouncy")).toBeGreaterThan(1.2)
    expect(peak("smooth")).toBeLessThanOrEqual(1.0001)
  })

  it("stays stable across a huge step", () => {
    const spring = new Spring(0, 0.01, presets.snappy!)
    spring.target = 50
    spring.step(10)
    expect(spring.value).toBe(50)
  })

  it("keeps velocity when the target moves mid-flight", () => {
    const spring = new Spring(0, 0.01, presets.soft!)
    spring.target = 100
    for (let i = 0; i < 10; i += 1) spring.step(1 / 60)
    const velocity = spring.velocity
    spring.target = -100
    expect(spring.velocity).toBe(velocity)
    spring.step(1 / 60)
    expect(spring.value).toBeGreaterThan(0)
  })

  it("instant jumps to the target", () => {
    const spring = new Spring(0, 0.01, null)
    spring.target = 12
    expect(spring.step(1 / 60)).toBe(false)
    expect(spring.value).toBe(12)
  })

  it("resolves presets, tuples, and objects", () => {
    expect(resolveMotion("snappy")).toBe(presets.snappy)
    expect(resolveMotion([200, 10])).toEqual({ stiffness: 200, damping: 10, mass: 1 })
    expect(resolveMotion({ stiffness: 1, damping: 2 })).toEqual({ stiffness: 1, damping: 2 })
    expect(resolveMotion("instant")).toBeNull()
    expect(resolveMotion("nonsense")).toBe(presets.smooth)
  })
})
