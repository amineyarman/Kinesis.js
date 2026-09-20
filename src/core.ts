export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function shortestDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

export function wrapHeading(deg: number): number {
  const x = ((deg % 360) + 360) % 360
  return x > 180 ? x - 360 : x
}

export function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount
}

export function lengthToPx(value: string, fontSize = 16): number {
  const trimmed = value.trim()
  if (trimmed === "" || trimmed === "none") return 0
  const match = trimmed.match(/^(-?\d*\.?\d+)([a-z%]*)$/i)
  if (!match) return Number.parseFloat(trimmed) || 0
  const amount = Number.parseFloat(match[1] ?? "0")
  const unit = (match[2] ?? "px").toLowerCase()
  if (unit === "px" || unit === "") return amount
  if (unit === "rem") return amount * fontSize
  if (unit === "em") return amount * fontSize
  return amount
}

export function angleToDeg(value: string): number {
  const trimmed = value.trim()
  if (trimmed === "" || trimmed === "none") return 0
  const match = trimmed.match(/^(-?\d*\.?\d+)([a-z]*)$/i)
  if (!match) return Number.parseFloat(trimmed) || 0
  const amount = Number.parseFloat(match[1] ?? "0")
  const unit = (match[2] ?? "deg").toLowerCase()
  if (unit === "rad") return (amount * 180) / Math.PI
  if (unit === "turn") return amount * 360
  return amount
}

export function splitValues(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

export class Spring {
  value = 0
  velocity = 0
  target = 0
  stiffness: number
  damping: number
  mass: number

  constructor(stiffness: number, damping: number, mass: number, initial = 0) {
    this.stiffness = stiffness
    this.damping = damping
    this.mass = mass
    this.value = initial
    this.target = initial
  }

  setPreset(stiffness: number, damping: number, mass: number): void {
    this.stiffness = stiffness
    this.damping = damping
    this.mass = mass
  }

  settled(): boolean {
    return Math.abs(this.value - this.target) < 0.02 && Math.abs(this.velocity) < 0.02
  }

  step(dt: number): boolean {
    if (this.settled()) {
      this.value = this.target
      this.velocity = 0
      return false
    }
    const maxDt = Math.min(dt, 1 / 30)
    const displacement = this.value - this.target
    const accel = (-this.stiffness * displacement - this.damping * this.velocity) / this.mass
    this.velocity += accel * maxDt
    this.value += this.velocity * maxDt
    if (Math.abs(this.value - this.target) < 0.02 && Math.abs(this.velocity) < 0.02) {
      this.value = this.target
      this.velocity = 0
      return false
    }
    return true
  }
}
