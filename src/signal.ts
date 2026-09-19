import { clamp, Spring } from "./core"
import { getMotionPreset } from "./spec/motion-presets"

export class KSignal {
  constructor(private readonly read: () => number, private readonly stepper?: (dt: number) => void) {}

  get value(): number {
    return this.read()
  }

  map(inMin: number | [number, number], inMax: number | [number, number], outMin?: number, outMax?: number): KSignal {
    const from = Array.isArray(inMin) ? inMin : [inMin, inMax as number]
    const to = Array.isArray(inMax) && outMin === undefined ? inMax : [outMin ?? 0, outMax ?? 1]
    return new KSignal(() => {
      const span = (from[1] ?? 0) - (from[0] ?? 0) || 1
      const t = clamp((this.value - (from[0] ?? 0)) / span, 0, 1)
      return (to[0] ?? 0) + t * ((to[1] ?? 0) - (to[0] ?? 0))
    }, this.stepper)
  }

  clamp(min: number, max: number): KSignal {
    return new KSignal(() => clamp(this.value, min, max), this.stepper)
  }

  spring(preset = "soft"): KSignal {
    const spec = getMotionPreset(preset)
    const spring = new Spring(spec.stiffness, spec.damping, spec.mass, this.value)
    return new KSignal(
      () => spring.value,
      (dt) => {
        this.stepper?.(dt)
        spring.target = this.value
        spring.step(dt)
      },
    )
  }

  step(dt: number): void {
    this.stepper?.(dt)
  }
}

export function constantSignal(value: number): KSignal {
  return new KSignal(() => value)
}
