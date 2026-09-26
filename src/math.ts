export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value

export const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount

/** Smooth 0..1 falloff used for every distance-based influence. */
export const smoothstep = (t: number): number => {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

/** Signed difference that takes the short way around a circle, in degrees. */
export const shortestAngle = (from: number, to: number): number => ((((to - from) % 360) + 540) % 360) - 180

/** Splits a CSS value on top-level whitespace, keeping `rgb(1 2 3)` or `calc(a + b)` intact. */
export function splitTokens(value: string): string[] {
  const tokens: string[] = []
  let depth = 0
  let start = -1
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!
    if (char === "(") depth += 1
    else if (char === ")") depth -= 1
    const space = depth === 0 && (char === " " || char === "\n" || char === "\t" || char === ",")
    if (space) {
      if (start >= 0) tokens.push(value.slice(start, index))
      start = -1
    } else if (start < 0) {
      start = index
    }
  }
  if (start >= 0) tokens.push(value.slice(start))
  return tokens
}

/** Compact number formatting for style strings: no exponent, no `-0`, trimmed zeros. */
export function fmt(value: number, digits = 3): string {
  const fixed = value.toFixed(digits)
  let end = fixed.length
  if (fixed.includes(".")) {
    while (fixed[end - 1] === "0") end -= 1
    if (fixed[end - 1] === ".") end -= 1
  }
  const out = fixed.slice(0, end)
  return out === "-0" ? "0" : out
}

export interface Quaternion {
  w: number
  x: number
  y: number
  z: number
}

const RAD = Math.PI / 180

export function axisQuaternion(x: number, y: number, z: number, degrees: number, into?: Quaternion): Quaternion {
  const half = (degrees * RAD) / 2
  const sin = Math.sin(half)
  const length = Math.hypot(x, y, z) || 1
  const out = into ?? { w: 1, x: 0, y: 0, z: 0 }
  out.w = Math.cos(half)
  out.x = (x / length) * sin
  out.y = (y / length) * sin
  out.z = (z / length) * sin
  return out
}

/** Hamilton product a·b, matching CSS transform-list order (`a` applied outside `b`). */
export function multiply(a: Quaternion, b: Quaternion, into?: Quaternion): Quaternion {
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y
  const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x
  const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
  const out = into ?? { w: 1, x: 0, y: 0, z: 0 }
  out.w = w
  out.x = x
  out.y = y
  out.z = z
  return out
}

const qx: Quaternion = { w: 1, x: 0, y: 0, z: 0 }
const qy: Quaternion = { w: 1, x: 0, y: 0, z: 0 }
const qz: Quaternion = { w: 1, x: 0, y: 0, z: 0 }
const qa: Quaternion = { w: 1, x: 0, y: 0, z: 0 }

/**
 * Serializes `rotateX(rx) rotateY(ry) rotateZ(rz)` followed by an optional author rotation as a
 * single value for the CSS `rotate` property. Returns "" for no rotation.
 */
export function rotateValue(rx: number, ry: number, rz: number, author?: Quaternion | null): string {
  const flat = Math.abs(rx) < 1e-4 && Math.abs(ry) < 1e-4
  if (flat && !author) return Math.abs(rz) < 1e-4 ? "" : `${fmt(rz)}deg`
  axisQuaternion(1, 0, 0, rx, qx)
  axisQuaternion(0, 1, 0, ry, qy)
  axisQuaternion(0, 0, 1, rz, qz)
  multiply(qx, qy, qa)
  multiply(qa, qz, qa)
  if (author) multiply(qa, author, qa)
  let { w, x, y, z } = qa
  if (w < 0) {
    w = -w
    x = -x
    y = -y
    z = -z
  }
  const sin = Math.sqrt(Math.max(0, 1 - w * w))
  if (sin < 1e-7) return ""
  const angle = (2 * Math.acos(clamp(w, -1, 1))) / RAD
  return `${fmt(x / sin, 5)} ${fmt(y / sin, 5)} ${fmt(z / sin, 5)} ${fmt(angle)}deg`
}

/** Parses a computed `rotate` value ("45deg", "x 30deg", "1 0 0 30deg") into a quaternion. */
export function parseRotate(value: string): Quaternion | null {
  const tokens = splitTokens(value.trim())
  if (!tokens.length || tokens[0] === "none") return null
  const angleToken = tokens.find((token) => /[a-z]$/i.test(token) && !/^[xyz]$/i.test(token))
  if (!angleToken) return null
  const degrees = parseAngle(angleToken)
  let axis: [number, number, number] = [0, 0, 1]
  const rest = tokens.filter((token) => token !== angleToken)
  if (rest.length === 1) {
    const name = rest[0]!.toLowerCase()
    axis = name === "x" ? [1, 0, 0] : name === "y" ? [0, 1, 0] : [0, 0, 1]
  } else if (rest.length === 3) {
    axis = [Number.parseFloat(rest[0]!), Number.parseFloat(rest[1]!), Number.parseFloat(rest[2]!)]
  }
  return axisQuaternion(axis[0], axis[1], axis[2], degrees)
}

export function parseAngle(token: string): number {
  const value = Number.parseFloat(token)
  if (!Number.isFinite(value)) return 0
  if (token.endsWith("turn")) return value * 360
  if (token.endsWith("grad")) return value * 0.9
  if (token.endsWith("rad")) return value / RAD
  return value
}

/** Lengths arrive as computed px from typed registration; raw units are a fallback. */
export function parseLength(token: string, fontSize = 16): number {
  const value = Number.parseFloat(token)
  if (!Number.isFinite(value)) return 0
  if (token.endsWith("rem") || token.endsWith("em")) return value * fontSize
  return value
}

export function parseTime(token: string): number {
  const value = Number.parseFloat(token)
  if (!Number.isFinite(value)) return 0
  if (token.endsWith("ms")) return value
  if (token.endsWith("s")) return value * 1000
  return value
}
