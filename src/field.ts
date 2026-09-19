export const FALLOFF_LINEAR = 0
export const FALLOFF_SMOOTH = 1
export const FALLOFF_SOFT = 2
export const FALLOFF_SHARP = 3
export const FALLOFF_CONSTANT = 4

export const MODE_ATTRACT = 0
export const MODE_REPEL = 1
export const MODE_ORBIT = 2
export const MODE_VORTEX = 3
export const MODE_DIRECTIONAL = 4

export const SHAPE_CIRCLE = 0
export const SHAPE_ELEMENT = 1

const EPS = 1e-6
const TAU = Math.PI * 2

export interface FieldSample {
  i: number
  vx: number
  vy: number
  d: number
  active: boolean
}

export function createFieldSample(): FieldSample {
  return { i: 0, vx: 0, vy: 0, d: 0, active: false }
}

export function falloffId(name: string): number {
  if (name === "linear") return FALLOFF_LINEAR
  if (name === "soft") return FALLOFF_SOFT
  if (name === "sharp") return FALLOFF_SHARP
  if (name === "constant") return FALLOFF_CONSTANT
  return FALLOFF_SMOOTH
}

export function magneticFalloffId(name: string): number {
  if (name === "linear") return FALLOFF_LINEAR
  if (name === "sharp") return FALLOFF_SHARP
  if (name === "constant") return FALLOFF_CONSTANT
  if (name === "smooth") return FALLOFF_SOFT
  return falloffId(name)
}

export function fieldFalloff(t: number, id: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t
  if (id === FALLOFF_LINEAR) return x
  if (id === FALLOFF_SOFT) return 1 - (1 - x) * (1 - x)
  if (id === FALLOFF_SHARP) {
    const x2 = x * x
    return x2 * x2
  }
  if (id === FALLOFF_CONSTANT) return x > 0 ? 1 : 0
  return x * x * (3 - 2 * x)
}

export function forceModeId(name: string): number {
  if (name === "repel") return MODE_REPEL
  if (name === "orbit") return MODE_ORBIT
  if (name === "vortex") return MODE_VORTEX
  if (name === "directional") return MODE_DIRECTIONAL
  return MODE_ATTRACT
}

function writeSample(
  dx: number,
  dy: number,
  radius: number,
  radius2: number,
  falloff: number,
  mode: number,
  into: FieldSample,
  spin: number,
  pull: number,
  dirX: number,
  dirY: number,
  clockwise: number,
): FieldSample {
  const d2 = dx * dx + dy * dy
  if (radius <= 0 || d2 >= radius2) {
    into.i = 0
    into.vx = 0
    into.vy = 0
    into.d = Math.sqrt(d2)
    into.active = false
    return into
  }
  const d = Math.sqrt(d2)
  const t = 1 - d / radius
  const influence = fieldFalloff(t, falloff)
  let ux = 0
  let uy = 0
  if (d > EPS) {
    ux = dx / d
    uy = dy / d
  }
  let vx = 0
  let vy = 0
  if (mode === MODE_ATTRACT) {
    vx = -ux
    vy = -uy
  } else if (mode === MODE_REPEL) {
    vx = ux
    vy = uy
  } else if (mode === MODE_ORBIT) {
    vx = -uy * clockwise
    vy = ux * clockwise
  } else if (mode === MODE_VORTEX) {
    const rx = -ux * pull
    const ry = -uy * pull
    const tx = -uy * clockwise * spin
    const ty = ux * clockwise * spin
    const rawX = rx + tx
    const rawY = ry + ty
    const mag = Math.hypot(rawX, rawY)
    if (mag > EPS) {
      vx = rawX / mag
      vy = rawY / mag
    }
  } else {
    vx = dirX
    vy = dirY
  }
  into.i = influence
  into.vx = vx * influence
  into.vy = vy * influence
  into.d = d
  into.active = influence > 0
  return into
}

export function evaluateCircle(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  radius: number,
  falloff: number,
  mode: number,
  into: FieldSample,
  spin = 1,
  pull = 0.35,
  dirX = 0,
  dirY = 0,
  clockwise = 1,
): FieldSample {
  return writeSample(
    targetX - sourceX,
    targetY - sourceY,
    radius,
    radius * radius,
    falloff,
    mode,
    into,
    spin,
    pull,
    dirX,
    dirY,
    clockwise,
  )
}

export function evaluateElement(
  left: number,
  top: number,
  width: number,
  height: number,
  targetX: number,
  targetY: number,
  radius: number,
  falloff: number,
  mode: number,
  into: FieldSample,
  spin = 1,
  pull = 0.35,
  dirX = 0,
  dirY = 0,
  clockwise = 1,
): FieldSample {
  const right = left + width
  const bottom = top + height
  const cx = targetX < left ? left : targetX > right ? right : targetX
  const cy = targetY < top ? top : targetY > bottom ? bottom : targetY
  return writeSample(
    targetX - cx,
    targetY - cy,
    radius,
    radius * radius,
    falloff,
    mode,
    into,
    spin,
    pull,
    dirX,
    dirY,
    clockwise,
  )
}

export function evaluateField(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  radius: number,
  falloff: number,
  mode: number,
  into: FieldSample,
  shape = SHAPE_CIRCLE,
  boxLeft = 0,
  boxTop = 0,
  boxWidth = 0,
  boxHeight = 0,
  spin = 1,
  pull = 0.35,
  dirX = 0,
  dirY = 0,
  clockwise = 1,
): FieldSample {
  if (shape === SHAPE_ELEMENT && boxWidth > 0 && boxHeight > 0) {
    return evaluateElement(
      boxLeft,
      boxTop,
      boxWidth,
      boxHeight,
      targetX,
      targetY,
      radius,
      falloff,
      mode,
      into,
      spin,
      pull,
      dirX,
      dirY,
      clockwise,
    )
  }
  return evaluateCircle(
    sourceX,
    sourceY,
    targetX,
    targetY,
    radius,
    falloff,
    mode,
    into,
    spin,
    pull,
    dirX,
    dirY,
    clockwise,
  )
}

export function clampMagnitude(x: number, y: number, max: number): { x: number; y: number } {
  if (max <= 0) return { x: 0, y: 0 }
  const m2 = x * x + y * y
  const cap2 = max * max
  if (m2 <= cap2) return { x, y }
  const scale = max / Math.sqrt(m2)
  return { x: x * scale, y: y * scale }
}

export function packCell(cx: number, cy: number): number {
  return ((cx + 32768) & 65535) | (((cy + 32768) & 65535) << 16)
}

export class SpatialHash {
  size = 160
  inv = 1 / 160
  readonly buckets = new Map<number, number[]>()
  readonly queryBuf: number[] = []

  setSize(size: number): void {
    const next = size > 24 ? size : 24
    if (next === this.size) return
    this.size = next
    this.inv = 1 / next
    this.clear()
  }

  clear(): void {
    this.buckets.forEach((bucket) => {
      bucket.length = 0
    })
  }

  insert(index: number, x: number, y: number): void {
    const key = packCell(Math.floor(x * this.inv), Math.floor(y * this.inv))
    let bucket = this.buckets.get(key)
    if (!bucket) {
      bucket = []
      this.buckets.set(key, bucket)
    }
    bucket.push(index)
  }

  query(x: number, y: number, radius: number, into: number[]): number {
    into.length = 0
    if (radius <= 0) return 0
    const inv = this.inv
    const minX = Math.floor((x - radius) * inv)
    const maxX = Math.floor((x + radius) * inv)
    const minY = Math.floor((y - radius) * inv)
    const maxY = Math.floor((y + radius) * inv)
    for (let cy = minY; cy <= maxY; cy += 1) {
      for (let cx = minX; cx <= maxX; cx += 1) {
        const bucket = this.buckets.get(packCell(cx, cy))
        if (!bucket) continue
        for (let i = 0; i < bucket.length; i += 1) {
          const index = bucket[i]
          if (index !== undefined) into.push(index)
        }
      }
    }
    return into.length
  }
}

export function orbitAngle(clock: number, speed: number, clockwise: number, phaseDeg: number): number {
  return clock * speed * TAU * clockwise + (phaseDeg * Math.PI) / 180
}

export { TAU }
