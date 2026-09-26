import { defaultConfig, rotates3d, usesPointer, type Config } from "./config"
import { computeGoal, createGoal, crossing, normalizeInArea, type PointerInput } from "./effects"
import { input } from "./input"
import { clamp, fmt, lerp, parseRotate, rotateValue, shortestAngle, splitTokens, type Quaternion } from "./math"
import type { Signal } from "./signal"
import { Spring } from "./spring"

export type Styled = HTMLElement | SVGElement

export type Channel =
  | "x"
  | "y"
  | "z"
  | "rotate"
  | "rotateX"
  | "rotateY"
  | "scale"
  | "opacity"
  | "blur"
  | "progress"

export const CHANNELS: readonly Channel[] = [
  "x",
  "y",
  "z",
  "rotate",
  "rotateX",
  "rotateY",
  "scale",
  "opacity",
  "blur",
  "progress",
]

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface FrameEnv {
  now: number
  reduce: boolean
  /** The scope root in client coordinates. */
  area: Box
}

const PX = 0.01
const DEG = 0.01
const UNIT = 0.0005
const GLIDE = { stiffness: 180, damping: 26 }
const TRANSFORMS = ["translate", "rotate", "scale"]

interface Author {
  translate: string[] | null
  rotate: Quaternion | null
  scale: number[] | null
  filter: string
  color: string
  background: string
}

/** One animated element: its config, springs, state, and the styles it owns. */
let nextId = 0

export class Target {
  readonly id = ++nextId
  readonly el: Styled
  /** Config resolved from CSS: the element's own properties plus inherited context. */
  css: Config | null = null
  /** Whether CSS itself declares Kinesis properties on this element (not just inherited context). */
  cssActive = false
  /** JavaScript overrides from `kinesis()` or `set()`. */
  js: Partial<Config> = {}
  config: Config = defaultConfig()

  /** Resting layout box. Page coordinates, or client coordinates when `fixed`. */
  box: Box = { left: 0, top: 0, width: 0, height: 0 }
  fixed = false
  measured = false
  visible = true
  /** Position used by `--k-stagger`. */
  order = 0

  hovered = false
  focused = false
  pressed = false
  inView = false
  latched = false
  dragging = false
  dragX = 0
  dragY = 0
  pointerDriven = false

  readonly bindings = new Map<string, Signal>()

  private readonly sx = new Spring(0, PX)
  private readonly sy = new Spring(0, PX)
  private readonly sz = new Spring(0, PX)
  private readonly srx = new Spring(0, DEG)
  private readonly sry = new Spring(0, DEG)
  private readonly srz = new Spring(0, DEG)
  private readonly sp = new Spring(0, UNIT)
  private readonly stx = new Spring(0.5, UNIT)
  private readonly sty = new Spring(0.5, UNIT)
  private readonly dragSpringX = new Spring(0, PX, GLIDE)
  private readonly dragSpringY = new Spring(0, PX, GLIDE)
  private releasing = false

  private readonly goal = createGoal()
  private readonly pointer: PointerInput = { ax: 0, ay: 0, inArea: false, px: 0, py: 0, present: false, cx: 0, cy: 0 }
  private lastDriver = -1
  private scheduledValue = 0
  private scheduledAt = Number.NaN

  private readonly bound: Record<Channel, number> = {
    x: 0,
    y: 0,
    z: 0,
    rotate: 0,
    rotateX: 0,
    rotateY: 0,
    scale: 1,
    opacity: 1,
    blur: 0,
    progress: 0,
  }
  private readonly boundVars = new Map<string, number>()

  author: Author = { translate: null, rotate: null, scale: null, filter: "none", color: "", background: "" }
  needsSnapshot = true
  private readonly original = new Map<string, string>()
  private readonly written = new Map<string, string>()
  private changed = true
  private moving = false

  constructor(el: Styled) {
    this.el = el
  }

  /** Merges CSS and JavaScript config and retunes springs without resetting their state. */
  update(): void {
    const previous = this.config
    this.config = { ...(this.css ?? defaultConfig()), ...this.js }
    const motion = this.config.motion
    for (const spring of [this.sx, this.sy, this.sz, this.srx, this.sry, this.srz, this.sp, this.stx, this.sty]) {
      spring.configure(motion)
    }
    if (previous.when !== this.config.when || previous.once !== this.config.once) {
      this.latched = false
      this.lastDriver = -1
    }
    this.pointerDriven = usesPointer(this.config)
    this.changed = true
  }

  get rotates3d(): boolean {
    return rotates3d(this.config)
  }

  get hasConfig(): boolean {
    return this.cssActive || Object.keys(this.js).length > 0 || this.bindings.size > 0
  }

  /** Advances this target by one frame. Returns true while it still needs frames. */
  compute(dt: number, env: FrameEnv): boolean {
    const c = this.config
    const reduce = env.reduce
    const left = this.box.left - (this.fixed ? 0 : input.scrollX)
    const top = this.box.top - (this.fixed ? 0 : input.scrollY)
    const goal = this.goal

    if (this.pointerDriven) {
      const p = this.pointer
      p.px = input.x
      p.py = input.y
      p.present = input.present
      p.cx = left + this.box.width / 2
      p.cy = top + this.box.height / 2
      if (c.area === "self") normalizeInArea(input.x, input.y, left, top, this.box.width, this.box.height, p)
      else if (c.area === "viewport") normalizeInArea(input.x, input.y, 0, 0, input.viewportWidth, input.viewportHeight, p)
      else normalizeInArea(input.x, input.y, env.area.left, env.area.top, env.area.width, env.area.height, p)
      p.inArea = p.inArea && input.present
      if (input.orientation.active && !input.present) {
        p.ax = input.orientation.x
        p.ay = input.orientation.y
        p.inArea = true
      }
      computeGoal(c, p, goal)
    } else {
      goal.x = 0
      goal.y = 0
      goal.rx = 0
      goal.ry = 0
      goal.rz = Number.NaN
      goal.near = 0
    }
    if (reduce) {
      goal.x = 0
      goal.y = 0
      goal.rx = 0
      goal.ry = 0
      goal.rz = Number.NaN
    }

    this.sx.target = goal.x
    this.sy.target = goal.y
    this.sz.target = c.depth
    this.srx.target = goal.rx
    this.sry.target = goal.ry
    if (!Number.isNaN(goal.rz)) this.srz.target = this.srz.value + shortestAngle(this.srz.value, goal.rz)
    else if (Number.isNaN(c.point) || reduce) this.srz.target = 0

    this.drive(env, top, goal.near)

    if (c.track && input.present && this.box.width && this.box.height) {
      this.stx.target = (input.x - left) / this.box.width
      this.sty.target = (input.y - top) / this.box.height
    }

    this.moving = false
    this.advance(this.sx, dt)
    this.advance(this.sy, dt)
    this.advance(this.sz, dt)
    this.advance(this.srx, dt)
    this.advance(this.sry, dt)
    this.advance(this.srz, dt)
    this.advance(this.sp, dt)
    this.advance(this.stx, dt)
    this.advance(this.sty, dt)

    if (this.releasing) {
      const x = this.dragSpringX.step(dt)
      const y = this.dragSpringY.step(dt)
      this.dragX = this.dragSpringX.value
      this.dragY = this.dragSpringY.value
      this.changed = true
      if (x || y) this.moving = true
      else this.releasing = false
    }

    if (this.bindings.size) this.readBindings()
    return this.moving || this.dragging || !Number.isNaN(this.scheduledAt)
  }

  private advance(spring: Spring, dt: number): void {
    if (spring.value === spring.target && spring.velocity === 0) return
    this.changed = true
    if (spring.step(dt)) this.moving = true
  }

  private drive(env: FrameEnv, top: number, near: number): void {
    const c = this.config
    let driver = 0
    switch (c.when) {
      case "near":
        driver = near
        break
      case "hover": {
        // Hover is decided against the resting box, not hit-testing, so an element that
        // scales or tilts away from the pointer does not flicker at its edges.
        const left = this.box.left - (this.fixed ? 0 : input.scrollX)
        this.hovered =
          input.present &&
          input.type !== "touch" &&
          input.x >= left &&
          input.x <= left + this.box.width &&
          input.y >= top &&
          input.y <= top + this.box.height
        driver = this.hovered || this.focused ? 1 : 0
        break
      }
      case "press":
        driver = this.pressed ? 1 : 0
        break
      case "view":
        driver = this.inView || this.latched ? 1 : 0
        break
      case "scroll":
        driver = crossing(top, this.box.height, input.viewportHeight)
        break
      case "page":
        driver = clamp(input.scrollY / input.scrollMax, 0, 1)
        break
      default:
        driver = 0
    }
    const discrete = c.when === "hover" || c.when === "press" || c.when === "view"
    if (!discrete) {
      this.sp.target = driver
      return
    }
    if (driver !== this.lastDriver) {
      this.lastDriver = driver
      const wait = c.delay + this.order * c.stagger
      if (wait > 0 && driver !== this.sp.target) {
        this.scheduledValue = driver
        this.scheduledAt = env.now + wait
      } else {
        this.scheduledAt = Number.NaN
        this.sp.target = driver
      }
    }
    if (!Number.isNaN(this.scheduledAt) && env.now >= this.scheduledAt) {
      this.sp.target = this.scheduledValue
      this.scheduledAt = Number.NaN
    }
  }

  private readBindings(): void {
    for (const [name, signal] of this.bindings) {
      const value = signal.get()
      if (signal.active()) this.moving = true
      if (name.startsWith("--")) {
        if (this.boundVars.get(name) !== value) {
          this.boundVars.set(name, value)
          this.changed = true
        }
        continue
      }
      const channel = name as Channel
      if (channel === "progress") {
        if (this.sp.value !== value) {
          this.sp.jump(value)
          this.changed = true
        }
        continue
      }
      if (this.bound[channel] !== value) {
        this.bound[channel] = value
        this.changed = true
      }
    }
  }

  /** Jumps progress to its goal, so scroll-linked elements don't animate in from stale values. */
  settle(): void {
    this.sp.jump(this.sp.target)
    this.changed = true
  }

  /** Forces a rewrite on the next frame. */
  touch(): void {
    this.changed = true
  }

  /**
   * Frameworks sometimes replace an element's whole `style` attribute on re-render. Forget
   * any values that were wiped so the next write puts them back.
   */
  verify(): void {
    const style = this.el.style
    for (const name of [...this.written.keys()]) {
      if (style.getPropertyValue(name) === "") {
        this.written.delete(name)
        this.changed = true
      }
    }
  }

  /** Current reaction progress, 0..1 (springs may overshoot). */
  get progress(): number {
    return this.sp.value
  }

  get animating(): boolean {
    return this.moving || this.dragging
  }

  /** Writes styles if anything changed since the last write. */
  write(env: FrameEnv): void {
    if (!this.changed) return
    this.changed = false
    const c = this.config
    const reduce = env.reduce
    const b = this.bound
    const p = this.sp.value
    let x = this.sx.value + this.dragX + b.x
    let y = this.sy.value + this.dragY + b.y
    const z = this.sz.value + b.z
    const rx = this.srx.value + b.rotateX
    const ry = this.sry.value + b.rotateY
    let rz = this.srz.value + b.rotate
    let scale = b.scale
    if (!reduce) {
      if (c.x) x += lerp(c.x[0], c.x[1], p)
      if (c.y) y += lerp(c.y[0], c.y[1], p)
      if (c.rotate) rz += lerp(c.rotate[0], c.rotate[1], p)
      if (c.scale) scale *= lerp(c.scale[0], c.scale[1], p)
    }

    this.put("translate", translateValue(x, y, z, this.author.translate))
    this.put(
      "rotate",
      Math.abs(rx) < 1e-4 && Math.abs(ry) < 1e-4 && Math.abs(rz) < 1e-4 ? "" : rotateValue(rx, ry, rz, this.author.rotate),
    )
    this.put("scale", scaleValue(scale, this.author.scale))

    const boundOpacity = this.bindings.has("opacity")
    if (c.opacity || boundOpacity) {
      const range = c.opacity ? lerp(c.opacity[0], c.opacity[1], p) : 1
      this.put("opacity", fmt(clamp(range * b.opacity, 0, 1), 4))
    } else {
      this.put("opacity", "")
    }

    if (c.blur || this.bindings.has("blur")) {
      const blur = Math.max(0, (c.blur ? lerp(c.blur[0], c.blur[1], p) : 0) + b.blur)
      const base = this.author.filter && this.author.filter !== "none" ? `${this.author.filter} ` : ""
      this.put("filter", blur > 0.01 ? `${base}blur(${fmt(blur, 2)}px)` : "")
    } else {
      this.put("filter", "")
    }

    this.put("color", c.color ? mixValue(c.color[0], this.author.color, c.color[1], p) : "")
    this.put("background-color", c.background ? mixValue(c.background[0], this.author.background, c.background[1], p) : "")

    this.put("--k-progress", c.when || this.bindings.has("progress") ? fmt(p, 4) : "")
    this.put("--k-pointer-x", c.track ? fmt(this.stx.value, 4) : "")
    this.put("--k-pointer-y", c.track ? fmt(this.sty.value, 4) : "")
    this.put("touch-action", c.drag === "x" ? "pan-y" : c.drag === "y" ? "pan-x" : c.drag === "both" ? "none" : "")
    for (const [name, value] of this.boundVars) this.put(name, fmt(value, 4))
  }

  private put(name: string, value: string): void {
    const previous = this.written.get(name)
    if (previous === value) return
    const style = this.el.style
    if (value === "") {
      if (previous === undefined) return
      style.setProperty(name, this.original.get(name) ?? "")
      this.written.delete(name)
      return
    }
    if (!this.original.has(name)) this.original.set(name, style.getPropertyValue(name))
    style.setProperty(name, value)
    this.written.set(name, value)
  }

  /** Restores the author's inline styles so the next read sees them. The next write reapplies Kinesis. */
  unstyle(transformsOnly: boolean): void {
    const style = this.el.style
    for (const name of [...this.written.keys()]) {
      if (transformsOnly && !TRANSFORMS.includes(name)) continue
      style.setProperty(name, this.original.get(name) ?? "")
      this.written.delete(name)
    }
    this.changed = true
  }

  /** Captures author values Kinesis composes with. Requires `unstyle(false)` first. */
  snapshot(style: CSSStyleDeclaration): void {
    const translate = style.getPropertyValue("translate").trim()
    this.author.translate = translate && translate !== "none" ? splitTokens(translate) : null
    this.author.rotate = parseRotate(style.getPropertyValue("rotate"))
    const scale = style.getPropertyValue("scale").trim()
    this.author.scale = scale && scale !== "none" ? splitTokens(scale).map(Number.parseFloat) : null
    this.author.filter = style.filter
    this.author.color = style.color
    this.author.background = style.backgroundColor
    this.needsSnapshot = false
  }

  measure(box: Box, fixed: boolean): void {
    this.box = box
    this.fixed = fixed
    this.measured = true
    this.changed = true
  }

  bind(name: string, signal: Signal): void {
    this.bindings.set(name, signal)
    this.changed = true
  }

  unbind(name: string): void {
    if (!this.bindings.delete(name)) return
    if (name.startsWith("--")) this.boundVars.delete(name)
    else if (name !== "progress") this.bound[name as Channel] = name === "scale" || name === "opacity" ? 1 : 0
    if (name.startsWith("--")) this.put(name, "")
    this.changed = true
  }

  startDrag(): void {
    this.dragging = true
    this.releasing = false
    this.changed = true
  }

  moveDrag(x: number, y: number): void {
    this.dragX = x
    this.dragY = y
    this.changed = true
  }

  /**
   * Ends a drag: travel to `x`,`y` starting with the release velocity, or stop instantly.
   * Throws glide; `spring` uses the element's own motion (so `bouncy` bounces home).
   */
  endDrag(x: number, y: number, velocityX: number, velocityY: number, instant: boolean, spring = false): void {
    this.dragging = false
    const motion = spring && this.config.motion ? this.config.motion : GLIDE
    this.dragSpringX.configure(motion)
    this.dragSpringY.configure(motion)
    if (instant) {
      this.dragX = x
      this.dragY = y
      this.dragSpringX.jump(x)
      this.dragSpringY.jump(y)
      this.releasing = false
      this.changed = true
      return
    }
    this.dragSpringX.value = this.dragX
    this.dragSpringY.value = this.dragY
    this.dragSpringX.velocity = velocityX
    this.dragSpringY.velocity = velocityY
    this.dragSpringX.target = x
    this.dragSpringY.target = y
    this.releasing = true
    this.changed = true
  }

  emit(name: string, detail: Record<string, number>): void {
    this.el.dispatchEvent(new CustomEvent(`kinesis:${name}`, { detail, bubbles: true }))
  }

  /** Removes every style Kinesis wrote and puts back the author's inline values. */
  destroy(): void {
    const style = this.el.style
    for (const name of this.written.keys()) style.setProperty(name, this.original.get(name) ?? "")
    this.written.clear()
    this.bindings.clear()
    this.boundVars.clear()
  }
}

function translateValue(x: number, y: number, z: number, author: string[] | null): string {
  if (Math.abs(x) < 0.005 && Math.abs(y) < 0.005 && Math.abs(z) < 0.005) return ""
  if (!author) {
    return Math.abs(z) < 0.005 ? `${fmt(x, 2)}px ${fmt(y, 2)}px` : `${fmt(x, 2)}px ${fmt(y, 2)}px ${fmt(z, 2)}px`
  }
  const add = (base: string, delta: number) => (Math.abs(delta) < 0.005 ? base : `calc(${base} + ${fmt(delta, 2)}px)`)
  const parts = [add(author[0] ?? "0px", x), add(author[1] ?? "0px", y)]
  if (author[2] || Math.abs(z) >= 0.005) parts.push(add(author[2] ?? "0px", z))
  return parts.join(" ")
}

function scaleValue(scale: number, author: number[] | null): string {
  if (Math.abs(scale - 1) < 1e-4) return ""
  if (!author) return fmt(scale, 4)
  const sx = (author[0] ?? 1) * scale
  const sy = (author[1] ?? author[0] ?? 1) * scale
  return author[2] != null ? `${fmt(sx, 4)} ${fmt(sy, 4)} ${fmt(author[2], 4)}` : `${fmt(sx, 4)} ${fmt(sy, 4)}`
}

/** Colors are mixed by the browser, so every CSS color syntax works and nothing is parsed here. */
function mixValue(from: string, author: string, to: string, progress: number): string {
  const start = from || author
  const amount = clamp(progress, 0, 1)
  if (amount < 0.0005) return from ? from : ""
  if (amount > 0.9995) return to
  return `color-mix(in oklab, ${start}, ${to} ${fmt(amount * 100, 2)}%)`
}
