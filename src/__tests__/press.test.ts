import { expect, it } from "vitest"
import { decayImpulse, holdProgress, resolveRelease } from "../press"

it("hold progress reaches one at the threshold", () => {
  expect(holdProgress(0, 480)).toBe(0)
  expect(holdProgress(240, 480)).toBe(0.5)
  expect(holdProgress(480, 480)).toBe(1)
  expect(holdProgress(800, 480)).toBe(1)
  expect(holdProgress(100, 0)).toBe(0)
})

it("tap impulse decays to rest", () => {
  expect(decayImpulse(1, 0.09, 180)).toBeGreaterThan(0)
  expect(decayImpulse(1, 0.2, 180)).toBe(0)
})

it("release arbitration prefers drag then hold then tap", () => {
  expect(resolveRelease({ liveDrag: true, holdCompleted: true, elapsed: 80, move: 2 })).toBe("drag")
  expect(resolveRelease({ liveDrag: false, holdCompleted: true, elapsed: 500, move: 2 })).toBe("hold")
  expect(resolveRelease({ liveDrag: false, holdCompleted: false, elapsed: 80, move: 2 })).toBe("tap")
  expect(resolveRelease({ liveDrag: false, holdCompleted: false, elapsed: 80, move: 24 })).toBe("release")
  expect(resolveRelease({ liveDrag: false, holdCompleted: false, elapsed: 400, move: 2 })).toBe("release")
})
