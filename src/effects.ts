import type { Config } from "./config"
import { clamp, smoothstep } from "./math"

/** Everything the pointer effects need for one target in one frame. Client coordinates. */
export interface PointerInput {
  /** Pointer position inside the target's area, -1..1 on each axis. */
  ax: number
  ay: number
  /** Whether the pointer (or device orientation) currently drives the area. */
  inArea: boolean
  /** Pointer position in the viewport. */
  px: number
  py: number
  /** Whether a pointer is present in the window at all. */
  present: boolean
  /** The target's resting center. */
  cx: number
  cy: number
}

export interface SpatialGoal {
  x: number
  y: number
  rx: number
  ry: number
  /** Planar rotation for `point`; NaN means "hold the current angle". */
  rz: number
  /** 0..1 closeness of the pointer within `radius`. */
  near: number
}

export const createGoal = (): SpatialGoal => ({ x: 0, y: 0, rx: 0, ry: 0, rz: Number.NaN, near: 0 })

const DEG = 180 / Math.PI

/** Bearing from the target to the pointer, measured like CSS gradient angles: 0deg up, 90deg right. */
export const bearing = (dx: number, dy: number): number => Math.atan2(dx, -dy) * DEG

/** Proximity influence: 1 at the center, easing to 0 at `radius`. */
export const influence = (distance: number, radius: number): number =>
  radius > 0 && distance < radius ? smoothstep(1 - distance / radius) : 0

export function computeGoal(config: Config, input: PointerInput, out: SpatialGoal): SpatialGoal {
  out.x = 0
  out.y = 0
  out.rx = 0
  out.ry = 0
  out.rz = Number.NaN
  out.near = 0
  const k = config.intensity
  const onlyX = config.axis === "x"
  const onlyY = config.axis === "y"

  if (input.inArea) {
    const ax = onlyY ? 0 : input.ax
    const ay = onlyX ? 0 : input.ay
    out.x -= ax * config.parallax[0] * k
    out.y -= ay * config.parallax[1] * k
    out.ry += ax * config.tilt[0] * k
    out.rx -= ay * config.tilt[1] * k
  }

  if (!input.present) return out
  const dx = onlyY ? 0 : input.px - input.cx
  const dy = onlyX ? 0 : input.py - input.cy
  const distance = Math.hypot(dx, dy)
  const near = influence(distance, config.radius)
  out.near = near

  let ox = 0
  let oy = 0
  if (config.magnetic && near > 0) {
    ox += dx * config.magnetic * near
    oy += dy * config.magnetic * near
  }
  if (config.repel && near > 0 && distance > 1e-6) {
    ox -= (dx / distance) * config.repel * near
    oy -= (dy / distance) * config.repel * near
  }
  if (config.follow && input.inArea) {
    ox += dx * config.follow
    oy += dy * config.follow
  }
  ox *= k
  oy *= k
  const length = Math.hypot(ox, oy)
  if (length > config.limit) {
    ox *= config.limit / length
    oy *= config.limit / length
  }
  out.x += ox
  out.y += oy

  if (config.look && config.radius > 0) {
    out.ry += config.look * clamp(dx / config.radius, -1, 1) * k
    out.rx += config.look * clamp(-dy / config.radius, -1, 1) * k
  }
  if (!Number.isNaN(config.point) && distance > 1e-6) {
    out.rz = bearing(input.px - input.cx, input.py - input.cy) - config.point
  }
  return out
}

/** Progress of an element crossing the viewport: 0 as its top enters the bottom edge, 1 as its bottom leaves the top. */
export const crossing = (top: number, height: number, viewport: number): number =>
  clamp((viewport - top) / (viewport + height || 1), 0, 1)

/** Maps the pointer into an area rect as -1..1, writing into `out` to stay allocation-free. */
export function normalizeInArea(
  px: number,
  py: number,
  left: number,
  top: number,
  width: number,
  height: number,
  out: PointerInput,
): PointerInput {
  out.inArea = px >= left && px <= left + width && py >= top && py <= top + height
  out.ax = width ? clamp(((px - left) / width) * 2 - 1, -1, 1) : 0
  out.ay = height ? clamp(((py - top) / height) * 2 - 1, -1, 1) : 0
  return out
}

/** Drag offset limits for a target resting at `rest` inside `bounds`. */
export function dragLimits(
  rest: { left: number; top: number; width: number; height: number },
  bounds: { left: number; top: number; width: number; height: number } | null,
): { minX: number; maxX: number; minY: number; maxY: number } {
  if (!bounds) {
    return {
      minX: Number.NEGATIVE_INFINITY,
      maxX: Number.POSITIVE_INFINITY,
      minY: Number.NEGATIVE_INFINITY,
      maxY: Number.POSITIVE_INFINITY,
    }
  }
  const minX = bounds.left - rest.left
  const maxX = bounds.left + bounds.width - (rest.left + rest.width)
  const minY = bounds.top - rest.top
  const maxY = bounds.top + bounds.height - (rest.top + rest.height)
  return {
    minX: Math.min(minX, maxX),
    maxX: Math.max(minX, maxX),
    minY: Math.min(minY, maxY),
    maxY: Math.max(minY, maxY),
  }
}

/** Past a limit, movement is damped so the element feels elastic instead of stopping dead. */
export function rubberBand(value: number, min: number, max: number, resistance = 0.35): number {
  if (value < min) return min - (min - value) * resistance
  if (value > max) return max + (value - max) * resistance
  return value
}

/** Where a throw with `velocity` px/s comes to rest when decelerating smoothly. */
export const project = (offset: number, velocity: number, glide = 0.2): number => offset + velocity * glide
