export interface SpringOptions {
  stiffness: number
  damping: number
  mass?: number
}

/** `null` means instant: the value jumps to its target. */
export type Motion = SpringOptions | null

export const presets: Record<string, Motion> = {
  instant: null,
  smooth: { stiffness: 170, damping: 26 },
  soft: { stiffness: 80, damping: 17 },
  snappy: { stiffness: 420, damping: 40 },
  bouncy: { stiffness: 300, damping: 13 },
  heavy: { stiffness: 70, damping: 20, mass: 1.8 },
}

export type MotionPreset = "instant" | "smooth" | "soft" | "snappy" | "bouncy" | "heavy"

export function resolveMotion(value: MotionPreset | SpringOptions | [number, number, number?] | string | undefined): Motion {
  if (value == null) return presets.smooth!
  if (Array.isArray(value)) return { stiffness: value[0], damping: value[1], mass: value[2] ?? 1 }
  if (typeof value === "object") return value
  if (value in presets) return presets[value]!
  return presets.smooth!
}

/**
 * A damped harmonic oscillator advanced with its exact solution, so the path is identical at
 * any frame rate and any step size is stable.
 */
export class Spring {
  value: number
  velocity = 0
  target: number
  /** Distance and speed below which the spring snaps to rest. */
  precision: number
  private omega = 0
  private zeta = 0
  private instant = false

  constructor(value = 0, precision = 0.01, motion: Motion = presets.smooth!) {
    this.value = value
    this.target = value
    this.precision = precision
    this.configure(motion)
  }

  configure(motion: Motion): void {
    if (!motion) {
      this.instant = true
      return
    }
    const mass = motion.mass ?? 1
    this.instant = false
    this.omega = Math.sqrt(Math.max(motion.stiffness, 1e-6) / mass)
    this.zeta = motion.damping / (2 * Math.sqrt(Math.max(motion.stiffness, 1e-6) * mass))
  }

  get settled(): boolean {
    return this.value === this.target && this.velocity === 0
  }

  jump(value: number): void {
    this.value = value
    this.target = value
    this.velocity = 0
  }

  /** Advances by `dt` seconds. Returns true while the spring is still moving. */
  step(dt: number): boolean {
    const displacement = this.value - this.target
    if (this.instant || dt <= 0) {
      if (this.instant) this.jump(this.target)
      return false
    }
    if (displacement === 0 && this.velocity === 0) return false
    const { omega, zeta } = this
    const v0 = this.velocity
    let x: number
    let v: number
    if (zeta < 1 - 1e-4) {
      const decay = zeta * omega
      const damped = omega * Math.sqrt(1 - zeta * zeta)
      const a = displacement
      const b = (v0 + decay * displacement) / damped
      const envelope = Math.exp(-decay * dt)
      const cos = Math.cos(damped * dt)
      const sin = Math.sin(damped * dt)
      x = envelope * (a * cos + b * sin)
      v = envelope * ((b * damped - a * decay) * cos - (a * damped + b * decay) * sin)
    } else if (zeta <= 1 + 1e-4) {
      const b = v0 + omega * displacement
      const envelope = Math.exp(-omega * dt)
      x = (displacement + b * dt) * envelope
      v = (v0 - omega * b * dt) * envelope
    } else {
      const root = Math.sqrt(zeta * zeta - 1)
      const r1 = -omega * (zeta - root)
      const r2 = -omega * (zeta + root)
      const c2 = (v0 - r1 * displacement) / (r2 - r1)
      const c1 = displacement - c2
      const e1 = Math.exp(r1 * dt)
      const e2 = Math.exp(r2 * dt)
      x = c1 * e1 + c2 * e2
      v = c1 * r1 * e1 + c2 * r2 * e2
    }
    if (Math.abs(x) < this.precision && Math.abs(v) < this.precision * 10) {
      this.jump(this.target)
      return false
    }
    this.value = this.target + x
    this.velocity = v
    return true
  }
}
