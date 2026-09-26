import { afterFrame, frame, wake } from "./frame"
import { attachInput, input, refreshScrollMax } from "./input"
import { clamp } from "./math"
import { resolveMotion, Spring, type MotionPreset, type SpringOptions } from "./spring"

/** Bumped whenever a writable value changes, so cached reads refresh mid-frame too. */
let epoch = 0
let collecting: Set<Signal> | null = null

export interface MapOptions {
  /** Clamp the output to the target range. Default true. */
  clamp?: boolean
}

/**
 * A number that changes over time. Signals are pull-based and cached per frame: reading a
 * signal twice in one frame computes it once, and a spring inside a signal steps once per frame
 * no matter how many bindings read it.
 */
export abstract class Signal {
  private frameAt = -1
  private epochAt = -1
  private cached = 0

  get(): number {
    if (collecting) collecting.add(this)
    if (this.frameAt !== frame.id || this.epochAt !== epoch) {
      const outer = collecting
      collecting = null
      this.cached = this.compute()
      collecting = outer
      this.frameAt = frame.id
      this.epochAt = epoch
    }
    return this.cached
  }

  /** Whether anything downstream should keep rendering frames. */
  abstract active(): boolean

  protected abstract compute(): number

  /** Maps `from` onto `to` linearly (clamped by default), or through a function. */
  map(from: [number, number], to: [number, number], options?: MapOptions): Signal
  map(fn: (value: number) => number): Signal
  map(from: [number, number] | ((value: number) => number), to?: [number, number], options: MapOptions = {}): Signal {
    if (typeof from === "function") return new Derived(this, from)
    const [a, b] = from
    const [c, d] = to ?? [0, 1]
    const span = b - a || 1
    const limit = options.clamp !== false
    const low = Math.min(c, d)
    const high = Math.max(c, d)
    return new Derived(this, (value) => {
      const out = c + ((value - a) / span) * (d - c)
      return limit ? clamp(out, low, high) : out
    })
  }

  clamp(min: number, max: number): Signal {
    return new Derived(this, (value) => clamp(value, min, max))
  }

  /** Follows this signal with a spring. Accepts a preset name or spring options. */
  spring(motion: MotionPreset | SpringOptions = "smooth"): Signal {
    return new SpringSignal(this, resolveMotion(motion) ?? undefined)
  }

  /** Calls `fn` whenever the value changes, once per frame at most. */
  subscribe(fn: (value: number) => void): () => void {
    const entry = { signal: this as Signal, fn, last: Number.NaN }
    subscriptions.add(entry)
    ensureSubscriptionHook()
    wake()
    return () => subscriptions.delete(entry)
  }
}

class Derived extends Signal {
  constructor(
    private readonly source: Signal,
    private readonly fn: (value: number) => number,
  ) {
    super()
  }
  protected compute(): number {
    return this.fn(this.source.get())
  }
  active(): boolean {
    return this.source.active()
  }
}

class SpringSignal extends Signal {
  private readonly solver: Spring
  private stepped = -1
  private moving = false

  constructor(
    private readonly source: Signal,
    motion?: SpringOptions,
  ) {
    super()
    this.solver = new Spring(source.get(), 0.001, motion ?? null)
  }

  protected compute(): number {
    if (this.stepped !== frame.id) {
      this.stepped = frame.id
      this.solver.target = this.source.get()
      this.moving = this.solver.step(frame.dt)
    }
    return this.solver.value
  }

  active(): boolean {
    return this.moving || this.source.active() || this.solver.value !== this.source.get()
  }
}

class Source extends Signal {
  constructor(
    private readonly read: () => number,
    private readonly live: () => boolean,
  ) {
    super()
  }
  protected compute(): number {
    attachInput()
    return this.read()
  }
  active(): boolean {
    return this.live()
  }
}

/** A value you set yourself, for example from application state. */
export class ValueSignal extends Signal {
  private current: number
  private changedAt = Number.NEGATIVE_INFINITY

  constructor(initial = 0) {
    super()
    this.current = initial
  }

  set(value: number): void {
    if (value === this.current) return
    this.current = value
    this.changedAt = frame.id
    epoch += 1
    wake()
  }

  protected compute(): number {
    return this.current
  }

  active(): boolean {
    return frame.id <= this.changedAt + 1
  }
}

class Computed extends Signal {
  private deps: Signal[] = []
  constructor(private readonly fn: () => number) {
    super()
  }
  protected compute(): number {
    const deps = new Set<Signal>()
    const outer = collecting
    collecting = deps
    try {
      return this.fn()
    } finally {
      collecting = outer
      this.deps = [...deps]
    }
  }
  active(): boolean {
    for (const dep of this.deps) if (dep.active()) return true
    return false
  }
}

class Time extends Signal {
  protected compute(): number {
    return frame.now / 1000
  }
  active(): boolean {
    return true
  }
}

const moved = () => input.moved
const scrolled = () => input.scrolled

/** The pointer across the whole viewport. */
export const pointer = {
  /** Client x in px. */
  x: new Source(() => input.x, moved) as Signal,
  /** Client y in px. */
  y: new Source(() => input.y, moved) as Signal,
  /** -1 at the left edge of the viewport, 1 at the right. */
  nx: new Source(() => (input.viewportWidth ? (input.x / input.viewportWidth) * 2 - 1 : 0), moved) as Signal,
  /** -1 at the top of the viewport, 1 at the bottom. */
  ny: new Source(() => (input.viewportHeight ? (input.y / input.viewportHeight) * 2 - 1 : 0), moved) as Signal,
  /** Horizontal velocity in px/s, smoothed. */
  velocityX: new Source(() => input.vx, () => input.vx !== 0 || input.moved) as Signal,
  /** Vertical velocity in px/s, smoothed. */
  velocityY: new Source(() => input.vy, () => input.vy !== 0 || input.moved) as Signal,
  /** Speed in px/s, smoothed. */
  speed: new Source(() => Math.hypot(input.vx, input.vy), () => input.vx !== 0 || input.vy !== 0 || input.moved) as Signal,
  /** 1 while a pointer is over the page. */
  present: new Source(() => (input.present ? 1 : 0), moved) as Signal,
}

/** Document scroll. */
export const scroll = {
  x: new Source(() => input.scrollX, scrolled) as Signal,
  y: new Source(() => input.scrollY, scrolled) as Signal,
  /** 0 at the top of the document, 1 at the bottom. */
  progress: new Source(() => {
    refreshScrollMax()
    return clamp(input.scrollY / input.scrollMax, 0, 1)
  }, scrolled) as Signal,
  /** Scroll velocity in px/s, smoothed. */
  velocity: new Source(() => input.scrollVelocity, () => input.scrollVelocity !== 0 || input.scrolled) as Signal,
}

/** Seconds since the page loaded. Keeps frames running while something reads it. */
export const time: Signal = new Time()

/** Creates a writable signal. */
export const value = (initial = 0): ValueSignal => new ValueSignal(initial)

/** Derives a signal from others: `computed(() => a.get() * b.get())`. */
export const computed = (fn: () => number): Signal => new Computed(fn)

export const isSignal = (value: unknown): value is Signal => value instanceof Signal

/** Wraps any readable number as a signal. `live` reports whether it is still changing. */
export const source = (read: () => number, live: () => boolean): Signal => new Source(read, live)

const subscriptions = new Set<{ signal: Signal; fn: (value: number) => void; last: number }>()
let hooked = false

function ensureSubscriptionHook(): void {
  if (hooked) return
  hooked = true
  afterFrame(() => {
    let active = false
    for (const entry of subscriptions) {
      const next = entry.signal.get()
      if (next !== entry.last) {
        entry.last = next
        entry.fn(next)
      }
      if (entry.signal.active()) active = true
    }
    return active
  })
}
