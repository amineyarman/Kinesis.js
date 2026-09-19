import { clamp } from "./core"

export const HOLD_DEFAULT = 480
export const TAP_WINDOW = 350
export const TAP_SLOP = 10
export const IMPULSE_MS = 180

export type GestureRelease = "tap" | "hold" | "drag" | "release"

export function holdProgress(elapsed: number, duration: number): number {
  if (duration <= 0) return 0
  return clamp(elapsed / duration, 0, 1)
}

export function decayImpulse(value: number, dt: number, ms = IMPULSE_MS): number {
  if (value <= 0 || ms <= 0) return 0
  const next = value - dt * (1000 / ms)
  return next > 0.01 ? next : 0
}

export function resolveRelease(input: {
  liveDrag: boolean
  holdCompleted: boolean
  elapsed: number
  move: number
  tapWindow?: number
  tapSlop?: number
}): GestureRelease {
  if (input.liveDrag) return "drag"
  if (input.holdCompleted) return "hold"
  const window = input.tapWindow ?? TAP_WINDOW
  const slop = input.tapSlop ?? TAP_SLOP
  if (input.elapsed <= window && input.move <= slop) return "tap"
  return "release"
}

export function parseHold(value: string): number {
  const raw = value.trim()
  if (!raw || raw === "none") return 0
  if (raw.endsWith("ms")) return Number.parseFloat(raw) || 0
  if (raw.endsWith("s")) return (Number.parseFloat(raw) || 0) * 1000
  return Number.parseFloat(raw) || 0
}
