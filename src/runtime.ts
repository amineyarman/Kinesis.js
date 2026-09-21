import {
  applyGroupConfig,
  CHAIN_HQ,
  CHAIN_MAX,
  computeOutput,
  createComputeContext,
  isMotionTarget,
  isTimeDriven,
  parseGroupConfig,
  parseTargetConfig,
  retainGroupConfig,
  restOutput,
  shouldReduceMotion,
  orientChain,
  solveChain,
  solveChainReach,
  TargetRuntime,
  type ComputeContext,
  type GroupConfig,
  type MotionOutput,
  type PointerState,
  type TargetConfig,
} from "./effects"
import { SHAPE_CIRCLE, SHAPE_ELEMENT, SpatialHash } from "./field"
import { KSignal } from "./signal"
import { KinesisAudio, type AudioSourceInput } from "./audio"
import { KinesisVideo, type VideoSourceInput } from "./video"
import { registerCssProperties } from "./register"
import { constrainDrag, resolveDragAxis } from "./drag"
import { HOLD_DEFAULT, resolveRelease } from "./press"
import { clamp, Spring } from "./core"
import { getMotionPreset } from "./spec/motion-presets"

export interface MotionHandle {
  element: HTMLElement
  get(name: string): string
  set(values: Record<string, string | number | number[]>): this
  to(values: Record<string, string | number | number[]>, options?: { motion?: string }): Promise<this>
  reset(names?: string | string[]): this
  bind(bindings: Partial<Record<keyof MotionOutput, KSignal>> & Record<string, KSignal>): this
  parallax(value: { x?: number; y?: number }): this
  tilt(value: { x?: number; y?: number }): this
  magnetic(value: { radius?: number; force?: number }): this
  audio(value: { source: KinesisAudio; band?: string; scale?: number[]; motion?: string }): this
  orbit(value: { radius?: number; speed?: number; direction?: string; mode?: string; phase?: number }): this
  wake(value: { duration?: number; force?: number; radius?: number }): this
  edge(value: { radius?: number; force?: number; box?: string }): this
  path(value: { d?: string; strength?: number; orient?: string }): this
  tether(value: { to?: string; length?: number; slack?: number; axis?: string }): this
  face(value: { to?: string; max?: number; axis?: string; invert?: boolean; origin?: string }): this
  vortex(value: { strength?: number; radius?: number; spin?: number; pull?: number }): this
  wind(value: { amount?: number; radius?: number }): this
  drag(value?: { axis?: string; bounds?: string; snap?: number; inertia?: number; threshold?: number }): this
  press(): PressSignals
  hold(value?: { duration?: number }): HoldSignals
  tap(): TapSignals
  pause(): this
  resume(): this
  refresh(): this
  destroy(): void
}

export interface GroupHandle {
  wave(value?: { amount?: number; spread?: number; axis?: string }): this
  ripple(value?: { amount?: number; radius?: number; topology?: string }): this
  lens(value?: { scale?: number; radius?: number }): this
  bend(value?: { amount?: number; radius?: number }): this
  orbit(value?: { radius?: number; speed?: number }): this
  chain(value?: { length?: number; mode?: string; limit?: number; orient?: string }): this
}

export type FieldForce = "attract" | "repel" | "orbit" | "vortex" | "directional"
export type FieldShape = "circle" | "element"
export type FalloffName = "linear" | "smooth" | "soft" | "sharp" | "constant"

export interface FieldOptions {
  source?: string
  force: FieldForce
  shape?: FieldShape
  radius?: number
  strength?: number
  falloff?: FalloffName
  direction?: "clockwise" | "counter-clockwise"
}

export interface PathOptions {
  path: string
  progress?: KSignal
  orient?: boolean | string
}

export interface FieldHandle {
  apply(targets: string | HTMLElement, response?: { max?: number }): MotionHandle
  pause(): this
  resume(): this
  destroy(): void
}

export interface PointerSignals {
  x: KSignal
  y: KSignal
  nx: KSignal
  ny: KSignal
  client: { x: KSignal; y: KSignal }
  local: { x: KSignal; y: KSignal }
  normalized: { x: KSignal; y: KSignal }
  velocity: { x: KSignal; y: KSignal }
  speed: KSignal
  angle: KSignal
  pressed: KSignal
}

export interface ScrollSignals {
  x: KSignal
  y: KSignal
  progress: KSignal
  velocity: KSignal
  direction: KSignal
}

export interface OrientationSignals {
  beta: KSignal
  gamma: KSignal
  nx: KSignal
  ny: KSignal
  normalized: { x: KSignal; y: KSignal }
  requestPermission(): Promise<boolean>
}

export interface ViewSignals {
  progress: KSignal
  visible: KSignal
}

export interface PressSignals {
  active: KSignal
  x: KSignal
  y: KSignal
  velocity: { x: KSignal; y: KSignal }
}

export interface HoldSignals {
  active: KSignal
  duration: KSignal
  progress: KSignal
  completed: KSignal
}

export interface TapSignals {
  impulse: KSignal
  x: KSignal
  y: KSignal
}

export interface ProximitySignals {
  distance: KSignal
  progress: KSignal
  angle: KSignal
  vector: { x: KSignal; y: KSignal }
  inside: KSignal
}

export interface KinesisScope {
  root: HTMLElement
  pointer: PointerSignals
  orientation: OrientationSignals
  scroll: ScrollSignals
  motion(selector: string | HTMLElement): MotionHandle
  audio(source?: AudioSourceInput): KinesisAudio
  video(source?: VideoSourceInput): KinesisVideo
  proximity(selector: string | HTMLElement): ProximitySignals
  inView(selector: string | HTMLElement): ViewSignals
  press(selector: string | HTMLElement): PressSignals
  hold(selector: string | HTMLElement, options?: { duration?: number }): HoldSignals
  tap(selector: string | HTMLElement): TapSignals
  group(selector?: string | HTMLElement): GroupHandle
  field(options: FieldOptions): FieldHandle
  path(selector: string | HTMLElement, options: PathOptions): MotionHandle
  pause(): void
  resume(): void
  refresh(): void
  destroy(): void
}

export interface KinesisApp {
  scopes: KinesisScope[]
  refresh(): void
  destroy(): void
}

export interface CreateKinesisOptions {
  signal?: AbortSignal
}

const PROPERTY_MAP: Record<string, string> = {
  tilt: "--k-tilt",
  parallax: "--k-parallax",
  motion: "--k-motion",
  intensity: "--k-intensity",
  source: "--k-source",
  axis: "--k-axis",
  rotate: "--k-rotate",
  depth: "--k-depth",
  magneticRadius: "--k-magnetic-radius",
  magneticForce: "--k-magnetic-force",
  audioBand: "--k-audio-band",
  audioBin: "--k-audio-bin",
  audioScale: "--k-audio-scale",
  scrollRotate: "--k-scroll-rotate",
  path: "--k-path",
  chain: "--k-chain",
  wake: "--k-wake",
  wakeForce: "--k-wake-force",
  wakeRadius: "--k-wake-radius",
  edge: "--k-edge",
  edgeForce: "--k-edge-force",
  edgeBox: "--k-edge-box",
  pathStrength: "--k-path-strength",
  pathOrient: "--k-path-orient",
  springStiffness: "--k-spring-stiffness",
  springDamping: "--k-spring-damping",
  springMass: "--k-spring-mass",
  smoothing: "--k-smoothing",
  anchor: "--k-anchor",
  orbit: "--k-orbit",
  orbitSpeed: "--k-orbit-speed",
  orbitDirection: "--k-orbit-direction",
  orbitMode: "--k-orbit-mode",
  orbitPhase: "--k-orbit-phase",
  vortex: "--k-vortex",
  vortexRadius: "--k-vortex-radius",
  vortexSpin: "--k-vortex-spin",
  vortexPull: "--k-vortex-pull",
  wind: "--k-wind",
  windRadius: "--k-wind-radius",
  tether: "--k-tether",
  tetherSlack: "--k-tether-slack",
  face: "--k-face",
  drag: "--k-drag",
  dragBounds: "--k-drag-bounds",
  dragSnap: "--k-drag-snap",
  dragInertia: "--k-drag-inertia",
  dragThreshold: "--k-drag-threshold",
  colorFrom: "--k-color-from",
  colorTo: "--k-color-to",
  backgroundFrom: "--k-background-from",
  backgroundTo: "--k-background-to",
  press: "--k-press",
  hold: "--k-hold",
  wave: "--k-wave",
  ripple: "--k-ripple",
  lensScale: "--k-lens-scale",
  lensRadius: "--k-lens-radius",
  bend: "--k-bend",
}

function formatCssValue(name: string, value: string | number | number[]): string {
  if (Array.isArray(value)) {
    if (name.includes("tilt")) return value.map((item) => `${item}deg`).join(" ")
    if (name.includes("audio-scale")) return value.map(String).join(" ")
    return value.map((item) => `${item}px`).join(" ")
  }
  if (typeof value === "number") {
    if (name === "--k-wake" || name === "--k-hold") return `${value}ms`
    if (name === "--k-press") return String(value)
    if (/tilt|rotate|face|bend|phase|chain-limit/.test(name)) return `${value}deg`
    if (
      name !== "--k-wake-force" &&
      name !== "--k-edge-force" &&
      name !== "--k-edge-box" &&
      name !== "--k-drag-threshold" &&
      (/force|intensity|depth|audio|spring|smoothing|vortex|spin|pull|speed|spread|scale|threshold|limit|invert|trail|strength|inertia/.test(name) ||
        name === "--k-motion" ||
        name === "--k-source")
    ) {
      return String(value)
    }
    return `${value}px`
  }
  return value
}

function createHandle(element: HTMLElement, runtime: ScopeRuntime): MotionHandle {
  return {
    element,
    get(name: string) {
      const property = PROPERTY_MAP[name] ?? name
      return getComputedStyle(element).getPropertyValue(property).trim()
    },
    set(values) {
      Object.entries(values).forEach(([key, value]) => {
        const property = PROPERTY_MAP[key] ?? key
        element.style.setProperty(property, formatCssValue(property, value))
      })
      runtime.refresh()
      runtime.resume()
      return this
    },
    async to(values, options) {
      if (options?.motion) element.style.setProperty("--k-motion", options.motion)
      this.set(values)
      return this
    },
    reset(names) {
      const keys = names ? (Array.isArray(names) ? names : [names]) : Object.keys(PROPERTY_MAP)
      keys.forEach((key) => {
        const property = PROPERTY_MAP[key] ?? key
        element.style.removeProperty(property)
      })
      runtime.refresh()
      runtime.resume()
      return this
    },
    bind(bindings) {
      const target = runtime.ensureTarget(element)
      Object.entries(bindings).forEach(([key, signal]) => {
        if (!signal) return
        if (key.startsWith("--")) target.varBindings[key] = signal
        else target.bindings[key as keyof MotionOutput] = signal
      })
      target.syncDrive()
      runtime.resume()
      return this
    },
    parallax(value) {
      return this.set({ parallax: [value.x ?? 0, value.y ?? 0] })
    },
    tilt(value) {
      return this.set({ tilt: [value.x ?? 0, value.y ?? 0] })
    },
    magnetic(value) {
      return this.set({
        magneticRadius: value.radius ?? 100,
        magneticForce: value.force ?? 1,
      })
    },
    audio(value) {
      runtime.useAudio(element, value.source)
      return this.set({
        audioBand: value.band ?? "bass",
        audioScale: value.scale ?? [1, 1.2],
        ...(value.motion ? { motion: value.motion } : {}),
      })
    },
    orbit(value) {
      return this.set({
        orbit: value.radius ?? 80,
        orbitSpeed: value.speed ?? 0.25,
        ...(value.direction ? { orbitDirection: value.direction } : {}),
        ...(value.mode ? { orbitMode: value.mode } : {}),
        ...(value.phase != null ? { orbitPhase: value.phase } : {}),
      })
    },
    path(value) {
      return this.set({
        path: value.d ?? "",
        ...(value.strength != null ? { pathStrength: value.strength } : {}),
        ...(value.orient ? { pathOrient: value.orient } : {}),
      })
    },
    wake(value) {
      return this.set({
        wake: value.duration ?? 180,
        wakeForce: value.force ?? 28,
        wakeRadius: value.radius ?? 90,
      })
    },
    edge(value) {
      return this.set({
        edge: value.radius ?? 48,
        edgeForce: value.force ?? 24,
        ...(value.box ? { edgeBox: value.box } : {}),
      })
    },
    tether(value) {
      return this.set({
        tether: value.length ?? 80,
        ...(value.to ? { anchor: value.to } : {}),
        ...(value.slack != null ? { tetherSlack: value.slack } : {}),
        ...(value.axis ? { "--k-tether-axis": value.axis } : {}),
      })
    },
    face(value) {
      return this.set({
        face: value.max ?? 14,
        ...(value.to ? { anchor: value.to } : {}),
        ...(value.axis ? { "--k-face-axis": value.axis } : {}),
        ...(value.invert ? { "--k-face-invert": 1 } : {}),
        ...(value.origin ? { "--k-origin": value.origin } : {}),
      })
    },
    vortex(value) {
      return this.set({
        vortex: value.strength ?? 0.7,
        vortexRadius: value.radius ?? 200,
        ...(value.spin != null ? { vortexSpin: value.spin } : {}),
        ...(value.pull != null ? { vortexPull: value.pull } : {}),
      })
    },
    wind(value) {
      return this.set({
        wind: value.amount ?? 36,
        windRadius: value.radius ?? 200,
      })
    },
    drag(value = {}) {
      return this.set({
        drag: value.axis ?? "both",
        ...(value.bounds ? { dragBounds: value.bounds } : {}),
        ...(value.snap != null ? { dragSnap: value.snap } : {}),
        ...(value.inertia != null ? { dragInertia: value.inertia } : {}),
        ...(value.threshold != null ? { dragThreshold: value.threshold } : {}),
      })
    },
    press() {
      return runtime.press(element)
    },
    hold(value = {}) {
      return runtime.hold(element, value)
    },
    tap() {
      return runtime.tap(element)
    },
    pause() {
      runtime.ensureTarget(element).paused = true
      return this
    },
    resume() {
      runtime.ensureTarget(element).paused = false
      runtime.resume()
      return this
    },
    refresh() {
      runtime.refresh()
      runtime.resume()
      return this
    },
    destroy() {
      runtime.dropTarget(element)
    },
  }
}

const kernel = {
  members: new Set<ScopeRuntime>(),
  awake: new Set<ScopeRuntime>(),
  byRoot: new WeakMap<Element, ScopeRuntime>(),
  hooked: false,
  ticking: false,
  hidden: typeof document !== "undefined" ? document.hidden : false,
  frame: 0,
  scrollRaf: 0,
  io: undefined as IntersectionObserver | undefined,
  add(scope: ScopeRuntime) {
    this.members.add(scope)
    this.byRoot.set(scope.root, scope)
    this.io?.observe(scope.root)
    if (this.hooked) return
    this.hooked = true
    this.hidden = document.hidden
    window.addEventListener("scroll", this.scroll, { passive: true })
    window.addEventListener("resize", this.resize, { passive: true })
    window.addEventListener("pointerdown", this.press, { passive: true })
    window.addEventListener("pointerup", this.press, { passive: true })
    window.addEventListener("pointercancel", this.press, { passive: true })
    window.addEventListener("deviceorientation", this.orient)
    document.addEventListener("visibilitychange", this.visibility)
    if (typeof IntersectionObserver !== "undefined") {
      this.io = new IntersectionObserver(this.intersect, { rootMargin: "40% 0px", threshold: 0 })
      this.io.observe(scope.root)
    }
  },
  remove(scope: ScopeRuntime) {
    this.members.delete(scope)
    this.awake.delete(scope)
    this.byRoot.delete(scope.root)
    this.io?.unobserve(scope.root)
    if (this.members.size || !this.hooked) return
    this.hooked = false
    if (this.scrollRaf) {
      window.cancelAnimationFrame(this.scrollRaf)
      this.scrollRaf = 0
    }
    if (this.frame) {
      window.cancelAnimationFrame(this.frame)
      this.frame = 0
    }
    this.io?.disconnect()
    this.io = undefined
    window.removeEventListener("scroll", this.scroll)
    window.removeEventListener("resize", this.resize)
    window.removeEventListener("pointerdown", this.press)
    window.removeEventListener("pointerup", this.press)
    window.removeEventListener("pointercancel", this.press)
    window.removeEventListener("deviceorientation", this.orient)
    document.removeEventListener("visibilitychange", this.visibility)
  },
  visibility() {
    kernel.hidden = document.hidden
    if (kernel.hidden) {
      if (kernel.frame) {
        window.cancelAnimationFrame(kernel.frame)
        kernel.frame = 0
      }
      kernel.ticking = false
      return
    }
    kernel.members.forEach((scope) => {
      scope.rewindClock()
      kernel.wake(scope)
    })
  },
  wake(scope: ScopeRuntime) {
    if (this.hidden || !scope.canWake()) return
    if (!this.awake.has(scope)) {
      scope.rewindClock()
      this.awake.add(scope)
    }
    if (this.frame || this.ticking) return
    this.frame = window.requestAnimationFrame(this.tick)
  },
  sleep(scope: ScopeRuntime) {
    this.awake.delete(scope)
    if (this.awake.size || !this.frame) return
    window.cancelAnimationFrame(this.frame)
    this.frame = 0
  },
  tick(time: number) {
    kernel.ticking = true
    const living = Array.from(kernel.awake)
    for (let index = 0; index < living.length; index += 1) living[index]?.prepareFrame(time)
    let live = false
    for (let index = 0; index < living.length; index += 1) {
      const scope = living[index]
      if (!scope) continue
      if (scope.commitFrame()) live = true
      else kernel.awake.delete(scope)
    }
    kernel.ticking = false
    kernel.frame = live ? window.requestAnimationFrame(kernel.tick) : 0
  },
  intersect(entries: IntersectionObserverEntry[]) {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      if (!entry) continue
      kernel.byRoot.get(entry.target)?.setVisible(entry.isIntersecting)
    }
  },
  scroll() {
    if (kernel.scrollRaf) return
    kernel.scrollRaf = window.requestAnimationFrame(kernel.flushScroll)
  },
  flushScroll() {
    kernel.scrollRaf = 0
    const now = performance.now()
    const x = window.scrollX || 0
    const y = window.scrollY || 0
    kernel.members.forEach((scope) => scope.handleWindowScroll(now, x, y))
  },
  resize() {
    kernel.members.forEach((scope) => scope.handleWindowResize())
  },
  press(event: Event) {
    kernel.members.forEach((scope) => scope.handleWindowPress(event as PointerEvent))
  },
  orient(event: Event) {
    kernel.members.forEach((scope) => scope.handleWindowOrient(event as DeviceOrientationEvent))
  },
}

class ScopeRuntime implements KinesisScope {
  root: HTMLElement
  pointer: PointerSignals
  orientation: OrientationSignals
  scroll: ScrollSignals
  private targets = new Map<HTMLElement, TargetRuntime>()
  private pointerState = { x: 0, y: 0, nx: 0, ny: 0, localX: 0, localY: 0, pressed: 0 }
  private orientationState = { beta: 0, gamma: 0, nx: 0, ny: 0, granted: false }
  private scrollState = { x: 0, y: 0, progress: 0, velocity: 0, direction: 0 }
  private lastScrollY = 0
  private lastScrollTime = 0
  private coarse = false
  private velocity = { x: 0, y: 0 }
  private lastPointer = { x: 0, y: 0, time: 0 }
  private pointerLog: Array<{ t: number; x: number; y: number }> = []
  private logStart = 0
  private chains: TargetRuntime[][] = []
  private chainRestX: number[] = []
  private chainRestY: number[] = []
  private chainPrevX: number[] = []
  private chainPrevY: number[] = []
  private chainOutX: number[] = []
  private chainOutY: number[] = []
  private chainOutR: number[] = []
  private chainSep: number[] = []
  private wakeDriven = false
  private maxWake = 0
  private pointerInside = false
  private windowPointer = false
  private rootRect: { left: number; top: number; width: number; height: number } | undefined
  private scopeConfig: TargetConfig | undefined
  private measuredScrollX = 0
  private measuredScrollY = 0
  private lastViewProgress = -1
  private perspectiveCss = ""
  private sceneRx = new Spring(180, 22, 1)
  private sceneRy = new Spring(180, 22, 1)
  private lastSceneTransform = ""
  private pendingScene = ""
  private sceneEl: HTMLElement | undefined
  private sceneMotion = ""
  private scrollDriven = false
  private orientDriven = false
  private depthScene = false
  private threeD = false
  private layoutScroll = false
  private pointerScratch: PointerState = { x: 0, y: 0, nx: 0, ny: 0 }
  private delayedScratch: PointerState = { x: 0, y: 0, nx: 0, ny: 0 }
  private lastTime = 0
  private pendingLive = false
  private visible = true
  private snapOnShow = false
  private paused = false
  private destroyed = false
  private dirty = true
  private layoutDirty = true
  private systemReduce = false
  private media: MediaQueryList | undefined
  private unbind: Array<() => void> = []
  private audios: KinesisAudio[] = []
  private videos: KinesisVideo[] = []
  private audioFor = new WeakMap<HTMLElement, KinesisAudio>()
  private list: TargetRuntime[] = []
  private named = new Map<string, { el: HTMLElement; box: { left: number; top: number; width: number; height: number } }>()
  private parents = new Map<HTMLElement, { left: number; top: number; width: number; height: number }>()
  private parentEls = new Set<HTMLElement>()
  private hash = new SpatialHash()
  private hashHits: number[] = []
  private hashDirty = true
  private queryGen = 0
  private maxFieldRadius = 0
  private timeDriven = false
  private fieldCount = 0
  private dragDriven = false
  private clock = 0
  private frameCtx: ComputeContext = createComputeContext()
  private drag = {
    target: null as TargetRuntime | null,
    pointerId: -1,
    armed: false,
    live: false,
    startX: 0,
    startY: 0,
    grabX: 0,
    grabY: 0,
  }
  private gesture = {
    target: null as TargetRuntime | null,
    pointerId: -1,
    kind: "" as "" | "pointer" | "key",
    startX: 0,
    startY: 0,
    startTime: 0,
    holdMs: 0,
  }
  private ownedRoot = { perspective: "", transformStyle: "", transform: "" }
  private sceneOwned: { node: HTMLElement; transform: string; transformStyle: string } | undefined
  private depthMarks: Array<{ node: HTMLElement | SVGElement; transformStyle: string }> = []
  private depthMarked = new Set<Element>()
  private resizeObserver: ResizeObserver | undefined
  private watched = new Set<Element>()
  private everConnected = false

  constructor(root: HTMLElement) {
    this.root = root
    this.ownedRoot = {
      perspective: root.style.perspective,
      transformStyle: root.style.transformStyle,
      transform: root.style.transform,
    }
    const nx = new KSignal(() => this.pointerState.nx)
    const ny = new KSignal(() => this.pointerState.ny)
    const clientX = new KSignal(() => this.pointerState.x)
    const clientY = new KSignal(() => this.pointerState.y)
    this.pointer = {
      x: clientX,
      y: clientY,
      nx,
      ny,
      client: { x: clientX, y: clientY },
      local: {
        x: new KSignal(() => this.pointerState.localX),
        y: new KSignal(() => this.pointerState.localY),
      },
      normalized: { x: nx, y: ny },
      velocity: {
        x: new KSignal(() => this.velocity.x),
        y: new KSignal(() => this.velocity.y),
      },
      speed: new KSignal(() => Math.hypot(this.velocity.x, this.velocity.y)),
      angle: new KSignal(() => Math.atan2(this.velocity.y, this.velocity.x)),
      pressed: new KSignal(() => this.pointerState.pressed),
    }
    const ox = new KSignal(() => this.orientationState.nx)
    const oy = new KSignal(() => this.orientationState.ny)
    this.orientation = {
      beta: new KSignal(() => this.orientationState.beta),
      gamma: new KSignal(() => this.orientationState.gamma),
      nx: ox,
      ny: oy,
      normalized: { x: ox, y: oy },
      requestPermission: () => this.requestOrientation(),
    }
    this.scroll = {
      x: new KSignal(() => this.scrollState.x),
      y: new KSignal(() => this.scrollState.y),
      progress: new KSignal(() => this.scrollState.progress),
      velocity: new KSignal(() => this.scrollState.velocity),
      direction: new KSignal(() => this.scrollState.direction),
    }
    this.coarse = window.matchMedia("(pointer: coarse)").matches
    this.media = window.matchMedia("(prefers-reduced-motion: reduce)")
    this.systemReduce = this.media.matches
    const onMedia = () => {
      this.systemReduce = Boolean(this.media?.matches)
      this.kick()
    }
    this.media.addEventListener("change", onMedia)
    this.unbind.push(() => this.media?.removeEventListener("change", onMedia))

    const onPointer = (event: PointerEvent) => {
      const now = performance.now()
      if (this.lastPointer.time) {
        const dt = Math.max((now - this.lastPointer.time) / 1000, 0.001)
        this.velocity.x = (event.clientX - this.lastPointer.x) / dt
        this.velocity.y = (event.clientY - this.lastPointer.y) / dt
      }
      this.lastPointer = { x: event.clientX, y: event.clientY, time: now }
      this.pointerState.x = event.clientX
      this.pointerState.y = event.clientY
      this.pointerLog.push({ t: now, x: event.clientX, y: event.clientY })
      while (this.logStart < this.pointerLog.length && now - (this.pointerLog[this.logStart]?.t ?? now) > 2000) {
        this.logStart += 1
      }
      if (this.logStart > 64) {
        this.pointerLog.splice(0, this.logStart)
        this.logStart = 0
      }
      const rect = this.rootRect ?? this.copyBox(this.root.getBoundingClientRect())
      this.pointerState.localX = event.clientX - rect.left
      this.pointerState.localY = event.clientY - rect.top
      const localX = rect.width ? (this.pointerState.localX / rect.width) * 2 - 1 : 0
      const localY = rect.height ? (this.pointerState.localY / rect.height) * 2 - 1 : 0
      const viewX = window.innerWidth ? (event.clientX / window.innerWidth) * 2 - 1 : 0
      const viewY = window.innerHeight ? (event.clientY / window.innerHeight) * 2 - 1 : 0
      const space = this.space()
      this.pointerState.nx = space === "viewport" ? viewX : localX
      this.pointerState.ny = space === "viewport" ? viewY : localY
      this.advanceDrag(event)
      this.kick()
    }
    this.windowPointer = this.root.dataset.kinesisPointer === "window"
    this.pointerInside = this.windowPointer
    const pointerTarget = this.windowPointer ? window : this.root
    pointerTarget.addEventListener("pointermove", onPointer as EventListener, { passive: true })
    this.unbind.push(() => pointerTarget.removeEventListener("pointermove", onPointer as EventListener))
    if (!this.windowPointer) {
      const onEnter = () => {
        this.pointerInside = true
      }
      const onLeave = () => {
        if (this.drag.live) return
        this.pointerInside = false
        this.pointerState.nx = 0
        this.pointerState.ny = 0
        this.velocity.x = 0
        this.velocity.y = 0
        this.kick()
      }
      this.root.addEventListener("pointerenter", onEnter)
      this.root.addEventListener("pointerleave", onLeave)
      this.unbind.push(() => {
        this.root.removeEventListener("pointerenter", onEnter)
        this.root.removeEventListener("pointerleave", onLeave)
      })
    }

    const onPointerDown = (event: PointerEvent) => {
      this.beginPress(event)
      this.beginDrag(event)
    }
    const onPointerUp = (event: PointerEvent) => {
      const live = this.drag.live
      this.endDrag(event)
      this.endPress(event, live)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      this.beginKeyPress(event)
      this.nudgeDrag(event)
    }
    const onKeyUp = (event: KeyboardEvent) => this.endKeyPress(event)
    this.root.addEventListener("pointerdown", onPointerDown)
    this.root.addEventListener("pointerup", onPointerUp)
    this.root.addEventListener("pointercancel", onPointerUp)
    this.root.addEventListener("lostpointercapture", onPointerUp)
    this.root.addEventListener("keydown", onKeyDown)
    this.root.addEventListener("keyup", onKeyUp)
    this.unbind.push(() => {
      this.root.removeEventListener("pointerdown", onPointerDown)
      this.root.removeEventListener("pointerup", onPointerUp)
      this.root.removeEventListener("pointercancel", onPointerUp)
      this.root.removeEventListener("lostpointercapture", onPointerUp)
      this.root.removeEventListener("keydown", onKeyDown)
      this.root.removeEventListener("keyup", onKeyUp)
    })

    kernel.add(this)
    this.unbind.push(() => kernel.remove(this))
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        this.layoutDirty = true
        this.kick()
      })
      this.watchBox(this.root)
      this.unbind.push(() => {
        this.resizeObserver?.disconnect()
        this.watched.clear()
      })
    }

    const retune = (event: Event) => {
      if (event instanceof PointerEvent || event instanceof FocusEvent) {
        this.retuneNode(event.relatedTarget)
      }
      this.retuneNode(event.target)
    }
    this.root.addEventListener("pointerover", retune, { passive: true })
    this.root.addEventListener("focusin", retune)
    this.root.addEventListener("focusout", retune)
    this.unbind.push(() => {
      this.root.removeEventListener("pointerover", retune)
      this.root.removeEventListener("focusin", retune)
      this.root.removeEventListener("focusout", retune)
    })

    const observer = new MutationObserver(() => {
      if (!this.root.isConnected) {
        this.destroy()
        return
      }
      this.invalidate()
    })
    observer.observe(this.root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "data-kinesis", "data-k-scene", "data-k-group", "hidden"],
    })
    this.unbind.push(() => observer.disconnect())

    this.captureScroll()
    this.refresh()
    this.kick()
  }

  handleWindowScroll(now: number, x: number, y: number): void {
    this.captureScroll(now, x, y)
    this.layoutScroll = true
    if (this.scrollDriven) this.kick()
  }

  canWake(): boolean {
    if (this.destroyed || this.paused || !this.visible || kernel.hidden) return false
    if (this.root.isConnected) {
      this.everConnected = true
      return true
    }
    if (this.everConnected) this.destroy()
    return false
  }

  rewindClock(): void {
    this.lastTime = 0
  }

  setVisible(next: boolean): void {
    if (this.visible === next) return
    this.visible = next
    if (next) {
      this.layoutDirty = true
      this.snapOnShow = this.scrollDriven
      this.kick()
      return
    }
    kernel.sleep(this)
  }

  handleWindowResize(): void {
    this.layoutDirty = true
    this.invalidate()
  }

  handleWindowPress(event: PointerEvent): void {
    this.pointerState.pressed = event.type === "pointerdown" ? 1 : 0
    if (this.pointerInside || this.windowPointer) this.kick()
  }

  private findGestureTarget(from: EventTarget | null, dragOnly = false): TargetRuntime | undefined {
    let node: Node | null = from instanceof Node ? from : null
    while (node && node !== this.root) {
      if (node instanceof HTMLElement) {
        if (node.hasAttribute("data-kinesis") && node !== this.root) return undefined
        const target = this.targets.get(node)
        if (!target) {
          node = node.parentNode
          continue
        }
        if (dragOnly) {
          if (target.config.drag) return target
        } else if (target.config.drag || target.config.press || target.config.hold) {
          return target
        }
      }
      node = node.parentNode
    }
    return undefined
  }

  private findDragTarget(event: PointerEvent): TargetRuntime | undefined {
    return this.findGestureTarget(event.target, true)
  }

  private dragBox(target: TargetRuntime): { left: number; top: number; width: number; height: number } | null {
    const kind = target.config.dragBounds
    if (kind === "viewport") {
      return { left: 0, top: 0, width: window.innerWidth || 0, height: window.innerHeight || 0 }
    }
    if (kind === "scene") return this.rootRect ?? null
    if (kind === "parent") {
      const parent = target.element.parentElement
      if (!(parent instanceof HTMLElement)) return null
      return this.parents.get(parent) ?? this.targets.get(parent)?.rect ?? null
    }
    return null
  }

  private placeDrag(target: TargetRuntime, x: number, y: number, snap: number): { x: number; y: number } {
    const axis = resolveDragAxis(target.config.drag, target.config.axis)
    const rest = target.rect ?? { left: 0, top: 0, width: 0, height: 0 }
    return constrainDrag(x, y, rest, this.dragBox(target), snap, axis)
  }

  private localPoint(target: TargetRuntime, x: number, y: number): { x: number; y: number } {
    const rect = target.rect
    return {
      x: rect ? x - rect.left : x,
      y: rect ? y - rect.top : y,
    }
  }

  private beginPress(event: PointerEvent): void {
    if (this.destroyed || this.paused || event.button) return
    const target = this.findGestureTarget(event.target)
    if (!target) return
    if (!target.rect) this.measure(target)
    const point = this.localPoint(target, event.clientX, event.clientY)
    this.gesture.target = target
    this.gesture.pointerId = event.pointerId
    this.gesture.kind = "pointer"
    this.gesture.startX = event.clientX
    this.gesture.startY = event.clientY
    this.gesture.startTime = performance.now()
    this.gesture.holdMs = target.config.hold
    target.press = 1
    target.pressX = point.x
    target.pressY = point.y
    target.holdStart = this.gesture.startTime
    target.holdElapsed = 0
    target.holdProgress = 0
    target.holdCompleted = 0
    target.holdActive = target.config.hold > 0 ? 1 : 0
    this.kick()
  }

  private endPress(event: PointerEvent, liveDrag: boolean): void {
    if (this.gesture.kind !== "pointer" || event.pointerId !== this.gesture.pointerId) return
    const target = this.gesture.target
    const elapsed = performance.now() - this.gesture.startTime
    const move = Math.hypot(event.clientX - this.gesture.startX, event.clientY - this.gesture.startY)
    const completed = target?.holdCompleted === 1
    this.gesture.target = null
    this.gesture.pointerId = -1
    this.gesture.kind = ""
    if (!target) return
    target.press = 0
    target.holdActive = 0
    const kind = resolveRelease({ liveDrag, holdCompleted: completed, elapsed, move })
    if (kind === "tap") {
      const point = this.localPoint(target, event.clientX, event.clientY)
      target.tapImpulse = 1
      target.tapX = point.x
      target.tapY = point.y
    }
    this.kick()
  }

  private beginKeyPress(event: KeyboardEvent): void {
    if (this.destroyed || this.paused || event.repeat) return
    if (event.key !== " " && event.key !== "Enter") return
    const active = document.activeElement
    if (!(active instanceof HTMLElement) || /^(input|textarea|select)$/i.test(active.tagName)) return
    const target = this.findGestureTarget(active)
    if (!target) return
    if (event.key === " ") event.preventDefault()
    if (!target.rect) this.measure(target)
    this.gesture.target = target
    this.gesture.pointerId = -2
    this.gesture.kind = "key"
    this.gesture.startX = 0
    this.gesture.startY = 0
    this.gesture.startTime = performance.now()
    this.gesture.holdMs = target.config.hold
    target.press = 1
    target.pressX = target.rect ? target.rect.width / 2 : 0
    target.pressY = target.rect ? target.rect.height / 2 : 0
    target.holdStart = this.gesture.startTime
    target.holdElapsed = 0
    target.holdProgress = 0
    target.holdCompleted = 0
    target.holdActive = target.config.hold > 0 ? 1 : 0
    this.kick()
  }

  private endKeyPress(event: KeyboardEvent): void {
    if (event.key !== " " && event.key !== "Enter") return
    if (this.gesture.kind !== "key") return
    const target = this.gesture.target
    const elapsed = performance.now() - this.gesture.startTime
    const completed = target?.holdCompleted === 1
    this.gesture.target = null
    this.gesture.pointerId = -1
    this.gesture.kind = ""
    if (!target) return
    target.press = 0
    target.holdActive = 0
    const kind = resolveRelease({ liveDrag: false, holdCompleted: completed, elapsed, move: 0 })
    if (kind === "tap") {
      target.tapImpulse = 1
      target.tapX = target.rect ? target.rect.width / 2 : 0
      target.tapY = target.rect ? target.rect.height / 2 : 0
    }
    this.kick()
  }

  private stepGestures(dt: number, now: number): boolean {
    let active = false
    const current = this.gesture.target
    const holding = Boolean(current && current.press)
    this.targets.forEach((target) => {
      if (
        target.stepTemporal(
          dt,
          now,
          holding && target === current,
          this.gesture.holdMs,
          this.drag.live && this.drag.target === target,
        )
      ) {
        active = true
      }
    })
    return active
  }

  private beginDrag(event: PointerEvent): void {
    if (this.destroyed || this.paused || event.button) return
    const target = this.findDragTarget(event)
    if (!target) return
    if (!target.rect) this.measure(target)
    if (!target.rect) return
    const restX = target.rect.left + target.rect.width / 2
    const restY = target.rect.top + target.rect.height / 2
    this.drag.target = target
    this.drag.pointerId = event.pointerId
    this.drag.armed = true
    this.drag.live = false
    this.drag.startX = event.clientX
    this.drag.startY = event.clientY
    this.drag.grabX = event.clientX - (restX + target.dragX)
    this.drag.grabY = event.clientY - (restY + target.dragY)
  }

  private advanceDrag(event: PointerEvent): void {
    if ((!this.drag.armed && !this.drag.live) || event.pointerId !== this.drag.pointerId) return
    const target = this.drag.target
    if (!target?.rect) return
    const axis = resolveDragAxis(target.config.drag, target.config.axis)
    const dx = event.clientX - this.drag.startX
    const dy = event.clientY - this.drag.startY
    if (!this.drag.live) {
      const along = axis === "x" ? Math.abs(dx) : axis === "y" ? Math.abs(dy) : Math.hypot(dx, dy)
      const across = axis === "x" ? Math.abs(dy) : axis === "y" ? Math.abs(dx) : 0
      if (across > target.config.dragThreshold && across > along) {
        this.drag.armed = false
        this.drag.target = null
        return
      }
      if (along < target.config.dragThreshold) return
      this.drag.live = true
      target.dragLive = true
      target.holdActive = 0
      target.holdProgress = 0
      target.holdElapsed = 0
      target.holdCompleted = 0
      try {
        target.element.setPointerCapture(event.pointerId)
      } catch {
        undefined
      }
    }
    const restX = target.rect.left + target.rect.width / 2
    const restY = target.rect.top + target.rect.height / 2
    const next = this.placeDrag(
      target,
      event.clientX - this.drag.grabX - restX,
      event.clientY - this.drag.grabY - restY,
      0,
    )
    target.dragX = next.x
    target.dragY = next.y
    target.pin(next.x, next.y)
  }

  private endDrag(event: PointerEvent): void {
    if (event.pointerId !== this.drag.pointerId) return
    const target = this.drag.target
    const live = this.drag.live
    this.drag.armed = false
    this.drag.live = false
    this.drag.target = null
    this.drag.pointerId = -1
    if (!target) return
    target.dragLive = false
    try {
      if (target.element.hasPointerCapture(event.pointerId)) target.element.releasePointerCapture(event.pointerId)
    } catch {
      undefined
    }
    if (!live) return
    const reduce = shouldReduceMotion(target.config, this.systemReduce)
    const inertia = reduce ? 0 : target.config.dragInertia
    const axis = resolveDragAxis(target.config.drag, target.config.axis)
    const vx = axis === "y" ? 0 : this.velocity.x
    const vy = axis === "x" ? 0 : this.velocity.y
    const projected = this.placeDrag(
      target,
      target.dragX + vx * 0.18 * Math.max(inertia, 0),
      target.dragY + vy * 0.18 * Math.max(inertia, 0),
      target.config.dragSnap,
    )
    target.dragX = projected.x
    target.dragY = projected.y
    if (inertia <= 0) target.pin(projected.x, projected.y)
    else target.toss(projected.x, projected.y, vx, vy)
    this.kick()
  }

  private nudgeDrag(event: KeyboardEvent): void {
    const el = document.activeElement
    if (!(el instanceof HTMLElement)) return
    const target = this.targets.get(el)
    if (!target?.config.drag) return
    const step = target.config.dragSnap || 16
    let dx = 0
    let dy = 0
    if (event.key === "ArrowLeft") dx = -step
    else if (event.key === "ArrowRight") dx = step
    else if (event.key === "ArrowUp") dy = -step
    else if (event.key === "ArrowDown") dy = step
    else return
    event.preventDefault()
    const next = this.placeDrag(target, target.dragX + dx, target.dragY + dy, target.config.dragSnap)
    target.dragX = next.x
    target.dragY = next.y
    target.pin(next.x, next.y)
    this.kick()
  }

  handleWindowOrient(event: DeviceOrientationEvent): void {
    if (event.beta == null && event.gamma == null) return
    this.orientationState.beta = event.beta ?? 0
    this.orientationState.gamma = event.gamma ?? 0
    this.orientationState.nx = clamp((event.gamma ?? 0) / 45, -1, 1)
    this.orientationState.ny = clamp((event.beta ?? 0) / 45, -1, 1)
    if (!(DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: unknown }).requestPermission) {
      this.orientationState.granted = true
    }
    if (this.orientDriven) this.kick()
  }

  private space(): string {
    return this.scopeConfig?.space || "local"
  }

  private copyBox(rect: DOMRect): { left: number; top: number; width: number; height: number } {
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  }

  private scrollProgress(element: HTMLElement): number {
    return this.viewProgress(element)
  }

  private pageProgress(): number {
    return this.scrollState.progress
  }

  private viewProgress(element: HTMLElement): number {
    const rect =
      element === this.root
        ? this.rootRect ?? this.copyBox(element.getBoundingClientRect())
        : this.targets.get(element)?.rect ?? this.copyBox(element.getBoundingClientRect())
    const view = window.innerHeight || 1
    return Math.min(1, Math.max(0, 1 - rect.top / (view + rect.height)))
  }

  private viewVisible(element: HTMLElement): number {
    const rect =
      element === this.root
        ? this.rootRect ?? this.copyBox(element.getBoundingClientRect())
        : this.targets.get(element)?.rect ?? this.copyBox(element.getBoundingClientRect())
    const view = window.innerHeight || 0
    return rect.top < view && rect.top + rect.height > 0 ? 1 : 0
  }

  private progressFor(config: TargetConfig, element: HTMLElement): number {
    const source = this.resolveSource(config)
    if (source === "video") return this.videoProgress()
    if (source === "scroll") return this.pageProgress()
    return this.viewProgress(element)
  }

  private nudgeBox(rect: { left: number; top: number }, dx: number, dy: number): void {
    rect.left -= dx
    rect.top -= dy
  }

  private syncScrollLayout(): void {
    const x = window.scrollX || 0
    const y = window.scrollY || 0
    const dx = x - this.measuredScrollX
    const dy = y - this.measuredScrollY
    if (dx || dy) {
      if (this.rootRect) this.nudgeBox(this.rootRect, dx, dy)
    this.targets.forEach((target) => {
      if (target.rect) this.nudgeBox(target.rect, dx, dy)
    })
    this.named.forEach((entry) => this.nudgeBox(entry.box, dx, dy))
    this.parents.forEach((box) => this.nudgeBox(box, dx, dy))
      this.hashDirty = true
    }
    this.measuredScrollX = x
    this.measuredScrollY = y
  }

  private rememberSources(): void {
    let scroll = false
    let orient = false
    let depth = false
    let tilt = false
    let time = false
    let wake = false
    let drag = false
    let maxWake = 0
    let fields = 0
    let radius = 0
    this.list.length = 0
    this.parentEls.clear()
    const consider = (config?: TargetConfig, target?: TargetRuntime) => {
      if (!config) return
      if (
        config.source === "scroll" ||
        config.source === "view" ||
        config.scrollX !== 0 ||
        config.scrollY !== 0 ||
        config.scrollRotate !== 0 ||
        (config.path && (config.source === "scroll" || config.source === "view"))
      ) {
        scroll = true
      }
      if (config.wake > 0) {
        wake = true
        if (config.wake > maxWake) maxWake = config.wake
      }
      if (config.source === "orientation") orient = true
      if (config.depth) depth = true
      if (config.tiltX || config.tiltY || config.depth) tilt = true
      if (isTimeDriven(config)) time = true
      if (target?.proximityRadius) {
        fields += 1
        if (target.proximityRadius > radius) radius = target.proximityRadius
      }
      if ((config.anchor === "parent" || config.edgeBox === "container" || config.dragBounds === "parent") && target) {
        const parent = target.element.parentElement
        if (parent instanceof HTMLElement) this.parentEls.add(parent)
      }
      if (config.drag) drag = true
    }
    consider(this.scopeConfig)
    this.targets.forEach((target) => {
      this.list.push(target)
      consider(target.config, target)
    })
    this.scrollDriven = scroll
    this.orientDriven = orient
    this.depthScene = depth
    this.threeD = !!this.sceneEl || depth || tilt
    this.timeDriven = time
    this.wakeDriven = wake
    this.dragDriven = drag
    this.maxWake = maxWake
    this.fieldCount = fields
    this.maxFieldRadius = radius
    this.hashDirty = true
    this.syncWatched()
  }

  private readScopeConfig(): TargetConfig {
    const style = getComputedStyle(this.root)
    this.scopeConfig = parseTargetConfig(style)
    const raw = style.getPropertyValue("--k-perspective").trim()
    this.perspectiveCss = raw === "none" ? "" : raw || "1000px"
    return this.scopeConfig
  }

  private captureScroll(now = performance.now(), x = window.scrollX || 0, y = window.scrollY || 0): void {
    if (this.lastScrollTime) {
      const dt = Math.max((now - this.lastScrollTime) / 1000, 0.001)
      this.scrollState.velocity = (y - this.lastScrollY) / dt
    }
    this.lastScrollY = y
    this.lastScrollTime = now
    const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1)
    this.scrollState.x = x
    this.scrollState.y = y
    this.scrollState.progress = clamp(y / max, 0, 1)
    this.scrollState.direction = Math.sign(this.scrollState.velocity)
  }

  private invalidate(): void {
    this.dirty = true
    this.layoutDirty = true
    this.kick()
  }

  refresh(): void {
    this.dirty = true
    this.scan()
    this.applyScopeFrame()
    this.dirty = false
    this.kick()
  }

  private sceneNode(): HTMLElement {
    return this.sceneEl ?? this.root
  }

  private applyScopeFrame(): void {
    this.restoreDepthMarks()
    if (this.sceneOwned && this.sceneOwned.node !== this.sceneNode()) this.restoreScene()
    this.captureScene()
    this.root.style.transformStyle = "flat"
    this.root.style.perspective = this.threeD && this.perspectiveCss ? this.perspectiveCss : ""
    if (this.threeD) {
      const scene = this.sceneNode()
      if (scene !== this.root) this.open3dChain(scene)
      for (const target of this.targets.values()) {
        if (target.config.depth) this.open3dChain(target.element)
      }
    }
    this.measureAll()
    this.layoutDirty = false
    this.layoutScroll = false
  }

  private open3dChain(from: Element): void {
    let node: Element | null = from
    while (node && node !== this.root) {
      if (node instanceof HTMLElement || node instanceof SVGElement) {
        if (!this.depthMarked.has(node)) {
          this.depthMarked.add(node)
          this.depthMarks.push({ node, transformStyle: node.style.transformStyle })
        }
        node.style.setProperty("transform-style", "preserve-3d")
      }
      node = node.parentElement
    }
  }

  private captureScene(): void {
    const scene = this.sceneNode()
    if (scene === this.root || this.sceneOwned?.node === scene) return
    this.sceneOwned = {
      node: scene,
      transform: scene.style.transform,
      transformStyle: scene.style.transformStyle,
    }
  }

  private restoreScene(): void {
    if (!this.sceneOwned) return
    const { node, transform, transformStyle } = this.sceneOwned
    node.style.transform = transform
    node.style.transformStyle = transformStyle
    this.sceneOwned = undefined
    this.lastSceneTransform = ""
  }

  private restoreDepthMarks(): void {
    this.depthMarks.forEach((entry) => {
      entry.node.style.transformStyle = entry.transformStyle
    })
    this.depthMarks = []
    this.depthMarked.clear()
  }

  private watchBox(node: Element): void {
    if (this.watched.has(node)) return
    this.resizeObserver?.observe(node)
    this.watched.add(node)
  }

  private unwatchBox(node: Element): void {
    if (node === this.root) return
    this.resizeObserver?.unobserve(node)
    this.watched.delete(node)
  }

  private syncWatched(): void {
    if (!this.resizeObserver) return
    const keep = new Set<Element>([this.root])
    this.targets.forEach((_, node) => keep.add(node))
    this.parentEls.forEach((node) => keep.add(node))
    this.named.forEach((entry) => keep.add(entry.el))
    this.watched.forEach((node) => {
      if (!keep.has(node)) this.unwatchBox(node)
    })
    keep.forEach((node) => this.watchBox(node))
  }

  private retuneNode(node: EventTarget | null): void {
    if (!(node instanceof HTMLElement) || node === this.root || !this.owns(node)) return
    const target = this.targets.get(node)
    if (!target) return
    const config = parseTargetConfig(getComputedStyle(node))
    retainGroupConfig(config, target.config)
    target.refresh(config)
    if (document.activeElement === node) target.focused = 1
    else if (target.focused && document.activeElement !== node) target.focused = 0
    if (!this.coarse) target.hovered = node.matches(":hover") ? 1 : 0
    else target.hovered = 0
  }

  private hasDepthScene(): boolean {
    return this.depthScene
  }

  private measureAll(): void {
    const restores: Array<{ node: HTMLElement; transform: string }> = []
    const stash = (node: HTMLElement) => {
      const transform = node.style.transform
      if (transform && transform !== "none") {
        node.style.transform = "none"
        restores.push({ node, transform })
      }
    }
    stash(this.root)
    this.targets.forEach((target) => stash(target.element))
    this.rootRect = this.copyBox(this.root.getBoundingClientRect())
    this.targets.forEach((target) => {
      target.rect = this.copyBox(target.element.getBoundingClientRect())
    })
    this.named.forEach((entry) => {
      const existing = this.targets.get(entry.el)
      entry.box = existing?.rect ? { ...existing.rect } : this.copyBox(entry.el.getBoundingClientRect())
    })
    this.parents.clear()
    this.parentEls.forEach((node) => {
      const existing = this.targets.get(node)
      this.parents.set(node, existing?.rect ? { ...existing.rect } : this.copyBox(node.getBoundingClientRect()))
    })
    for (let index = 0; index < restores.length; index += 1) {
      const item = restores[index]
      if (item) item.node.style.transform = item.transform
    }
    this.measuredScrollX = window.scrollX || 0
    this.measuredScrollY = window.scrollY || 0
    this.hashDirty = true
  }

  private simulateScene(dt: number, reduce: boolean, snap = false): boolean {
    const scene = this.sceneNode()
    if (!this.hasDepthScene() && scene === this.root) {
      this.pendingScene = ""
      return false
    }
    const config = this.scopeConfig ?? this.readScopeConfig()
    const tiltX = config.tiltX || 18
    const tiltY = config.tiltY || 18
    const motion = config.motion || "soft"
    if (motion !== this.sceneMotion) {
      const preset = getMotionPreset(motion)
      this.sceneRx.setPreset(preset.stiffness, preset.damping, preset.mass)
      this.sceneRy.setPreset(preset.stiffness, preset.damping, preset.mass)
      this.sceneMotion = motion
    }
    const pointer = this.inputFor(config, this.root)
    if (!this.pointerInside && this.resolveSource(config) === "pointer") {
      pointer.nx = 0
      pointer.ny = 0
    }
    let nx = pointer.nx
    let ny = pointer.ny
    if (config.axis === "x") ny = 0
    if (config.axis === "y") nx = 0
    this.sceneRx.target = reduce ? 0 : -ny * tiltX * config.intensity
    this.sceneRy.target = reduce ? 0 : nx * tiltY * config.intensity
    let active = false
    if (config.motion === "instant" || reduce || snap) {
      this.sceneRx.value = this.sceneRx.target
      this.sceneRy.value = this.sceneRy.target
      this.sceneRx.velocity = 0
      this.sceneRy.velocity = 0
    } else {
      if (this.sceneRx.step(dt)) active = true
      if (this.sceneRy.step(dt)) active = true
    }
    this.pendingScene = `rotateX(${this.sceneRx.value.toFixed(3)}deg) rotateY(${this.sceneRy.value.toFixed(3)}deg)`
    return active
  }

  private commitScene(): void {
    if (!this.pendingScene || this.pendingScene === this.lastSceneTransform) return
    this.sceneNode().style.transform = this.pendingScene
    this.lastSceneTransform = this.pendingScene
  }

  private owns(node: Element): boolean {
    return node.closest("[data-kinesis]") === this.root
  }

  private measure(target: TargetRuntime): void {
    const previous = target.element.style.transform
    if (previous && previous !== "none") target.element.style.transform = "none"
    target.rect = this.copyBox(target.element.getBoundingClientRect())
    if (previous && previous !== "none") target.element.style.transform = previous
  }

  private scan(): void {
    this.readScopeConfig()
    this.sceneEl = this.root.querySelector<HTMLElement>("[data-k-scene]") ?? undefined
    const nodes = [this.root, ...Array.from(this.root.querySelectorAll<HTMLElement>("*"))].filter((node) => this.owns(node))
    const seen = new Set<HTMLElement>()
    const groups: Array<{ node: HTMLElement; group: GroupConfig }> = []
    this.named.clear()
    nodes.forEach((node) => {
      const style = getComputedStyle(node)
      const name = style.getPropertyValue("--k-anchor-name").trim()
      if (name && name !== "none") {
        if (!this.named.has(name)) this.named.set(name, { el: node, box: { left: 0, top: 0, width: 0, height: 0 } })
      }
      const group = parseGroupConfig(style)
      if (group.kind) groups.push({ node, group })
      if (node === this.root) return
      const config = parseTargetConfig(style)
      const existing = this.targets.get(node)
      if (existing) {
        existing.refresh(config)
        if (isMotionTarget(config) || existing.keepsAlive()) seen.add(node)
        return
      }
      if (!isMotionTarget(config)) return
      seen.add(node)
      this.targets.set(node, new TargetRuntime(node, config))
    })
    this.chains = []
    groups.forEach((entry) => {
      const raw = Array.from(entry.node.children).filter((node): node is HTMLElement => node instanceof HTMLElement && this.owns(node))
      const kids = entry.group.kind === "chain" ? raw.slice(0, CHAIN_MAX) : raw
      const chainMembers = entry.group.kind === "chain" ? [] as TargetRuntime[] : null
      if (chainMembers) this.chains.push(chainMembers)
      kids.forEach((kid, index) => {
        let target = this.targets.get(kid)
        if (!target) {
          const config = parseTargetConfig(getComputedStyle(kid))
          applyGroupConfig(config, entry.group, index, kids.length)
          if (!isMotionTarget(config)) return
          target = new TargetRuntime(kid, config)
          this.targets.set(kid, target)
        } else {
          applyGroupConfig(target.config, entry.group, index, kids.length)
          target.refresh(target.config)
        }
        seen.add(kid)
        if (chainMembers && target) chainMembers.push(target)
      })
    })
    Array.from(this.targets.keys()).forEach((node) => {
      if (!seen.has(node)) {
        this.targets.get(node)?.destroy()
        this.targets.delete(node)
      }
    })
    this.rememberSources()
  }

  prepareFrame(time: number): void {
    this.pendingLive = false
    this.pendingScene = ""
    if (!this.canWake()) return
    const dt = this.lastTime ? Math.min(0.05, (time - this.lastTime) / 1000) : 1 / 60
    this.lastTime = time
    const snap = this.snapOnShow
    this.snapOnShow = false
    if (this.dirty) {
      this.scan()
      this.applyScopeFrame()
      this.dirty = false
    }
    let active = false
    this.audios.forEach((item) => {
      if (item.sample()) active = true
    })
    this.videos.forEach((item) => {
      if (item.sample()) active = true
    })
    if (this.layoutDirty || !this.rootRect) {
      this.measureAll()
      this.layoutDirty = false
      this.layoutScroll = false
    } else if (this.layoutScroll) {
      this.syncScrollLayout()
      this.layoutScroll = false
    }
    const scopeConfig = this.scopeConfig ?? this.readScopeConfig()
    const reduceScene = shouldReduceMotion(scopeConfig, this.systemReduce)
    if (this.simulateScene(dt, reduceScene, snap)) active = true
    this.clock += dt
    if (this.stepGestures(dt, time)) active = true
    const ctx = this.frameCtx
    ctx.clock = this.clock
    ctx.dt = dt
    ctx.velX = this.velocity.x
    ctx.velY = this.velocity.y
    ctx.speed = Math.hypot(this.velocity.x, this.velocity.y)
    ctx.windGain = Math.min(ctx.speed / 1200, 1)
    if (ctx.speed > 1e-6) {
      ctx.windNx = this.velocity.x / ctx.speed
      ctx.windNy = this.velocity.y / ctx.speed
    } else {
      ctx.windNx = 0
      ctx.windNy = 0
    }
    if (this.rootRect) {
      ctx.sceneX = this.rootRect.left + this.rootRect.width / 2
      ctx.sceneY = this.rootRect.top + this.rootRect.height / 2
    }
    ctx.pointerLive = this.pointerInside || this.windowPointer
    ctx.wakeNow = performance.now()
    ctx.wakeLog = this.wakeDriven ? this.pointerLog : null
    ctx.wakeStart = this.logStart
    if (this.chains.length) this.solveChains(ctx)
    const useHash = this.fieldCount > 0 && this.list.length >= 150
    if (useHash && this.hashDirty) this.rebuildHash()
    if (useHash) {
      this.queryGen += 1
      const hits = this.hash.query(this.pointerState.x, this.pointerState.y, this.maxFieldRadius, this.hashHits)
      for (let index = 0; index < hits; index += 1) {
        const target = this.list[this.hashHits[index] ?? -1]
        if (target) target.hitGen = this.queryGen
      }
    }
    const rootProgress = this.scrollDriven ? this.pageProgress() : 0
    const count = this.list.length
    for (let index = 0; index < count; index += 1) {
      const target = this.list[index]
      if (!target || target.paused) continue
      if (!target.rect) this.measure(target)
      const config = target.config
      const reduce = shouldReduceMotion(config, this.systemReduce)
      const source = this.resolveSource(config)
      const pointer = this.inputFor(config, target.element)
      if (!this.pointerInside && source === "pointer" && target.rect && !target.usesAnchor) {
        pointer.nx = 0
        pointer.ny = 0
        pointer.x = target.rect.left + target.rect.width / 2
        pointer.y = target.rect.top + target.rect.height / 2
      }
      const hashed = useHash && target.proximityOnly && target.hitGen !== this.queryGen
      const culled = hashed || target.outsideProximity(pointer)
      if (culled && !target.busy) continue
      if (culled) {
        if (target.simulate(restOutput(target.scratch), dt, reduce, snap)) active = true
        continue
      }
      this.fillAnchor(target, pointer, ctx)
      ctx.dragX = target.dragX
      ctx.dragY = target.dragY
      ctx.orbitAngle = target.orbitAngle
      ctx.orbitVel = target.orbitVel
      const delayed = config.trail > 0 ? this.pointerAt(config.trail * 100) : undefined
      let audioLevel = 0
      if (target.usesAudio) {
        const audio = this.audioFor.get(target.element) ?? this.audios[this.audios.length - 1]
        audioLevel = audio
          ? config.audioBin >= 0
            ? audio.binLevel(config.audioBin)
            : config.audioBand !== "none"
              ? audio.level(config.audioBand)
              : 0
          : 0
      }
      const output = computeOutput(
        config,
        pointer,
        target.rect ?? { left: 0, top: 0, width: 0, height: 0 },
        this.progressFor(config, target.element),
        reduce,
        audioLevel,
        source,
        delayed,
        target.scratch,
        ctx,
      )
      target.orbitAngle = ctx.orbitAngle
      target.orbitVel = ctx.orbitVel
      if (target.simulate(output, dt, reduce, snap)) active = true
    }
    if ((this.timeDriven && !reduceScene) || this.drag.live) active = true
    if (this.wakeDriven && this.lastPointer.time && ctx.wakeNow - this.lastPointer.time < this.maxWake) active = true
    if (this.scrollDriven) {
      if (Math.abs(rootProgress - this.lastViewProgress) > 0.0008) active = true
      this.lastViewProgress = rootProgress
      if (Math.abs(this.scrollState.velocity) > 0.4) active = true
    }
    this.layoutDirty = false
    this.velocity.x *= 0.86
    this.velocity.y *= 0.86
    this.scrollState.velocity *= 0.86
    if (Math.hypot(this.velocity.x, this.velocity.y) > 0.4) active = true
    this.pendingLive = active
  }

  commitFrame(): boolean {
    if (!this.canWake()) return false
    this.commitScene()
    this.targets.forEach((target) => target.commit())
    return this.pendingLive
  }

  private kick(): void {
    kernel.wake(this)
  }

  dropTarget(element: HTMLElement): void {
    this.unwatchBox(element)
    this.targets.get(element)?.destroy()
    this.targets.delete(element)
    this.rememberSources()
    this.kick()
  }

  ensureTarget(element: HTMLElement): TargetRuntime {
    const existing = this.targets.get(element)
    if (existing) return existing
    const config = parseTargetConfig(getComputedStyle(element))
    const target = new TargetRuntime(element, config)
    this.targets.set(element, target)
    this.watchBox(element)
    this.rememberSources()
    return target
  }

  useAudio(element: HTMLElement, source: KinesisAudio): void {
    this.audioFor.set(element, source)
    if (!this.audios.includes(source)) this.audios.push(source)
    this.kick()
  }

  audio(source?: AudioSourceInput): KinesisAudio {
    const instance = new KinesisAudio(source, () => this.kick())
    this.audios.push(instance)
    this.kick()
    return instance
  }

  video(source?: VideoSourceInput): KinesisVideo {
    const instance = new KinesisVideo(source, () => this.kick())
    this.videos.push(instance)
    this.kick()
    return instance
  }

  private videoProgress(): number {
    const video = this.videos[this.videos.length - 1]
    return video?.progressValue ?? 0
  }

  private resolveSource(config: TargetConfig): string {
    if (config.source === "auto") return this.coarse && this.orientationState.granted ? "orientation" : "pointer"
    return config.source
  }

  private pointerAt(age: number): PointerState {
    const delayed = this.delayedScratch
    delayed.x = this.pointerState.x
    delayed.y = this.pointerState.y
    delayed.nx = this.pointerState.nx
    delayed.ny = this.pointerState.ny
    if (age <= 0 || this.logStart >= this.pointerLog.length) return delayed
    const t = performance.now() - age
    for (let index = this.pointerLog.length - 1; index >= this.logStart; index -= 1) {
      const sample = this.pointerLog[index]
      if (sample && sample.t <= t) {
        delayed.x = sample.x
        delayed.y = sample.y
        return delayed
      }
    }
    const first = this.pointerLog[this.logStart]
    if (first) {
      delayed.x = first.x
      delayed.y = first.y
    }
    return delayed
  }

  private inputFor(config: TargetConfig, element: HTMLElement): PointerState {
    const pointer = this.pointerScratch
    pointer.x = this.pointerState.x
    pointer.y = this.pointerState.y
    const source = this.resolveSource(config)
    if (source === "orientation") {
      pointer.nx = this.orientationState.nx
      pointer.ny = this.orientationState.ny
      return pointer
    }
    if (source === "scroll") {
      pointer.nx = 0
      pointer.ny = this.pageProgress() * 2 - 1
      return pointer
    }
    if (source === "view") {
      pointer.nx = 0
      pointer.ny = this.viewProgress(element) * 2 - 1
      return pointer
    }
    if (source === "video") {
      pointer.nx = 0
      pointer.ny = this.videoProgress() * 2 - 1
      return pointer
    }
    if (config.space === "viewport") {
      pointer.nx = window.innerWidth ? (this.pointerState.x / window.innerWidth) * 2 - 1 : 0
      pointer.ny = window.innerHeight ? (this.pointerState.y / window.innerHeight) * 2 - 1 : 0
    } else {
      pointer.nx = this.pointerState.nx
      pointer.ny = this.pointerState.ny
    }
    return pointer
  }

  private async requestOrientation(): Promise<boolean> {
    const ctor = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<string>
    }
    if (typeof ctor.requestPermission === "function") {
      this.orientationState.granted = (await ctor.requestPermission()) === "granted"
    } else {
      this.orientationState.granted = true
    }
    this.kick()
    return this.orientationState.granted
  }

  private locate(selector: string | HTMLElement): HTMLElement {
    const element = typeof selector === "string" ? this.root.querySelector<HTMLElement>(selector) : selector
    if (!element) throw new Error(`Kinesis target not found: ${String(selector)}`)
    return element
  }

  proximity(selector: string | HTMLElement): ProximitySignals {
    const element = this.locate(selector)
    const center = () => {
      const rect = element.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, radius: Math.max(rect.width, rect.height) / 2 + 80 }
    }
    return {
      distance: new KSignal(() => {
        const point = center()
        return Math.hypot(this.pointerState.x - point.x, this.pointerState.y - point.y)
      }),
      progress: new KSignal(() => {
        const point = center()
        const distance = Math.hypot(this.pointerState.x - point.x, this.pointerState.y - point.y)
        return clamp(1 - distance / point.radius, 0, 1)
      }),
      angle: new KSignal(() => {
        const point = center()
        return Math.atan2(this.pointerState.y - point.y, this.pointerState.x - point.x)
      }),
      vector: {
        x: new KSignal(() => this.pointerState.x - center().x),
        y: new KSignal(() => this.pointerState.y - center().y),
      },
      inside: new KSignal(() => {
        const point = center()
        return Math.hypot(this.pointerState.x - point.x, this.pointerState.y - point.y) < point.radius ? 1 : 0
      }),
    }
  }

  inView(selector: string | HTMLElement): ViewSignals {
    const element = this.locate(selector)
    return {
      progress: new KSignal(() => this.viewProgress(element)),
      visible: new KSignal(() => this.viewVisible(element)),
    }
  }

  press(selector: string | HTMLElement): PressSignals {
    const target = this.ensurePress(selector)
    return {
      active: new KSignal(() => target.press),
      x: new KSignal(() => target.pressX),
      y: new KSignal(() => target.pressY),
      velocity: {
        x: new KSignal(() => this.velocity.x),
        y: new KSignal(() => this.velocity.y),
      },
    }
  }

  hold(selector: string | HTMLElement, options: { duration?: number } = {}): HoldSignals {
    const target = this.ensurePress(selector)
    if (options.duration != null) {
      target.element.style.setProperty("--k-hold", `${options.duration}ms`)
      target.config.hold = options.duration
      target.config.press = true
    } else if (!target.config.hold) {
      target.element.style.setProperty("--k-hold", `${HOLD_DEFAULT}ms`)
      target.config.hold = HOLD_DEFAULT
      target.config.press = true
    }
    this.rememberSources()
    return {
      active: new KSignal(() => target.holdActive),
      duration: new KSignal(() => target.holdElapsed),
      progress: new KSignal(() => target.holdProgress),
      completed: new KSignal(() => target.holdCompleted),
    }
  }

  tap(selector: string | HTMLElement): TapSignals {
    const target = this.ensurePress(selector)
    return {
      impulse: new KSignal(() => target.tapImpulse),
      x: new KSignal(() => target.tapX),
      y: new KSignal(() => target.tapY),
    }
  }

  private ensurePress(selector: string | HTMLElement): TargetRuntime {
    const element = this.locate(selector)
    const target = this.ensureTarget(element)
    if (!target.config.press && !target.config.hold) {
      target.element.style.setProperty("--k-press", "1")
      target.config.press = true
    }
    this.rememberSources()
    return target
  }

  motion(selector: string | HTMLElement): MotionHandle {
    return createHandle(this.locate(selector), this)
  }

  path(selector: string | HTMLElement, options: PathOptions): MotionHandle {
    const handle = this.motion(selector)
    const orient = options.orient === false ? "none" : typeof options.orient === "string" ? options.orient : "auto"
    handle.set({
      path: options.path,
      pathOrient: orient,
    })
    if (options.progress) {
      handle.bind({ path: options.progress.map([0, 1], [0, 100]) })
    }
    return handle
  }

  group(selector?: string | HTMLElement): GroupHandle {
    const element = selector ? this.locate(selector) : this.root
    const apply = (kind: string, values: Record<string, string | number>) => {
      element.style.setProperty("--k-group", kind)
      Object.entries(values).forEach(([key, value]) => {
        element.style.setProperty(key, formatCssValue(key, value))
      })
      this.refresh()
      this.resume()
      return handle
    }
    const handle: GroupHandle = {
      wave: (value = {}) =>
        apply("wave", {
          "--k-wave": value.amount ?? 24,
          "--k-wave-spread": value.spread ?? 0.18,
          ...(value.axis ? { "--k-wave-axis": value.axis } : {}),
        }),
      ripple: (value = {}) =>
        apply("ripple", {
          "--k-ripple": value.amount ?? 20,
          "--k-ripple-radius": value.radius ?? 180,
          ...(value.topology ? { "--k-group-order": value.topology } : {}),
        }),
      lens: (value = {}) =>
        apply("lens", {
          "--k-lens-scale": value.scale ?? 1.25,
          "--k-lens-radius": value.radius ?? 120,
        }),
      bend: (value = {}) =>
        apply("bend", {
          "--k-bend": value.amount ?? 18,
          "--k-bend-radius": value.radius ?? 160,
        }),
      orbit: (value = {}) =>
        apply("orbit", {
          "--k-orbit": value.radius ?? 80,
          "--k-orbit-speed": value.speed ?? 0.25,
        }),
      chain: (value = {}) =>
        apply("chain", {
          "--k-chain": value.length ?? 20,
          ...(value.mode ? { "--k-chain-mode": value.mode } : {}),
          ...(value.limit != null ? { "--k-chain-limit": value.limit } : {}),
          ...(value.orient ? { "--k-chain-orient": value.orient } : {}),
        }),
    }
    return handle
  }

  field(options: FieldOptions): FieldHandle {
    let applied: MotionHandle | undefined
    const handle: FieldHandle = {
      apply: (targets, response) => {
        const amount = response?.max ?? options.strength ?? 32
        const radius = options.radius ?? 200
        const values: Record<string, string | number> = {}
        if (options.source) values.anchor = options.source
        if (options.force === "repel") {
          values["--k-repel"] = amount
          values["--k-repel-radius"] = radius
        } else if (options.force === "attract") {
          values["--k-attract"] = amount
          values["--k-attract-radius"] = radius
        } else if (options.force === "vortex") {
          values.vortex = options.strength ?? 0.7
          values.vortexRadius = radius
        } else if (options.force === "orbit") {
          values.orbit = radius
        } else {
          values.wind = amount
          values.windRadius = radius
        }
        if (options.direction) values.orbitDirection = options.direction
        applied = createHandle(this.locate(targets), this).set(values)
        return applied
      },
      pause() {
        applied?.pause()
        return handle
      },
      resume() {
        applied?.resume()
        return handle
      },
      destroy() {
        applied?.destroy()
      },
    }
    return handle
  }

  private rebuildHash(): void {
    this.hash.setSize(this.maxFieldRadius || 160)
    this.hash.clear()
    const count = this.list.length
    for (let index = 0; index < count; index += 1) {
      const target = this.list[index]
      if (!target?.rect || !target.proximityOnly) continue
      this.hash.insert(index, target.rect.left + target.rect.width / 2, target.rect.top + target.rect.height / 2)
    }
    this.hashDirty = false
  }

  private solveChains(ctx: ComputeContext): void {
    const live = ctx.pointerLive
    const pointer = this.pointerScratch
    pointer.x = this.pointerState.x
    pointer.y = this.pointerState.y
    pointer.nx = this.pointerState.nx
    pointer.ny = this.pointerState.ny
    for (let group = 0; group < this.chains.length; group += 1) {
      const members = this.chains[group]
      if (!members?.length) continue
      const count = members.length
      const head = members[0]!
      if (!head.rect) this.measure(head)
      const rest0x = head.rect ? head.rect.left + head.rect.width / 2 : this.pointerState.x
      const rest0y = head.rect ? head.rect.top + head.rect.height / 2 : this.pointerState.y
      this.chainRestX.length = count
      this.chainRestY.length = count
      this.chainPrevX.length = count
      this.chainPrevY.length = count
      this.chainOutX.length = count
      this.chainOutY.length = count
      this.chainOutR.length = count
      this.chainSep.length = Math.max(0, count - 1)
      for (let index = 0; index < count; index += 1) {
        const member = members[index]!
        if (!member.rect) this.measure(member)
        const box = member.rect
        this.chainRestX[index] = box ? box.left + box.width / 2 : rest0x
        this.chainRestY[index] = box ? box.top + box.height / 2 : rest0y
        this.chainPrevX[index] = member.chainX
        this.chainPrevY[index] = member.chainY
        if (index < count - 1) this.chainSep[index] = member.config.chain || 20
      }
      if (!live) {
        if (head.config.chainOrient === "auto") {
          orientChain(this.chainRestX, this.chainRestY, this.chainOutR)
        }
        for (let index = 0; index < count; index += 1) {
          const member = members[index]!
          member.chainX = Number.NaN
          member.chainY = Number.NaN
          member.chainR = head.config.chainOrient === "auto" ? this.chainOutR[index]! : Number.NaN
        }
        continue
      }
      this.fillAnchor(head, pointer, ctx)
      const ax = ctx.anchorX
      const ay = ctx.anchorY
      const sep = this.chainSep
      const passes = count <= CHAIN_HQ ? 2 : 1
      if (head.config.chainMode === "reach") {
        const tip = members[count - 1]!
        if (!tip.rect) this.measure(tip)
        this.fillAnchor(tip, pointer, ctx)
        solveChainReach(
          this.chainRestX,
          this.chainRestY,
          this.chainPrevX,
          this.chainPrevY,
          ctx.anchorX,
          ctx.anchorY,
          sep,
          passes,
          head.config.chainLimit,
          this.chainOutX,
          this.chainOutY,
        )
      } else {
        solveChain(
          this.chainRestX,
          this.chainRestY,
          this.chainPrevX,
          this.chainPrevY,
          ax,
          ay,
          sep,
          passes,
          this.chainOutX,
          this.chainOutY,
        )
      }
      if (head.config.chainOrient === "auto") {
        orientChain(this.chainOutX, this.chainOutY, this.chainOutR)
      }
      for (let index = 0; index < count; index += 1) {
        const member = members[index]!
        member.chainX = this.chainOutX[index]!
        member.chainY = this.chainOutY[index]!
        member.chainR = head.config.chainOrient === "auto" ? this.chainOutR[index]! : Number.NaN
      }
    }
  }

  private fillEdgeBox(target: TargetRuntime, ctx: ComputeContext): void {
    const box = target.config.edgeBox
    if (box === "viewport") {
      ctx.boxLeft = 0
      ctx.boxTop = 0
      ctx.boxW = window.innerWidth || 0
      ctx.boxH = window.innerHeight || 0
      return
    }
    if (box === "container") {
      const parent = target.element.parentElement
      const frame = parent instanceof HTMLElement ? this.parents.get(parent) ?? this.targets.get(parent)?.rect : undefined
      if (frame) {
        ctx.boxLeft = frame.left
        ctx.boxTop = frame.top
        ctx.boxW = frame.width
        ctx.boxH = frame.height
        return
      }
    }
    const scene = this.rootRect
    ctx.boxLeft = scene?.left ?? 0
    ctx.boxTop = scene?.top ?? 0
    ctx.boxW = scene?.width ?? 0
    ctx.boxH = scene?.height ?? 0
  }

  private fillAnchor(target: TargetRuntime, pointer: PointerState, ctx: ComputeContext): void {
    const rect = target.rect
    ctx.restX = rect ? rect.left + rect.width / 2 : pointer.x
    ctx.restY = rect ? rect.top + rect.height / 2 : pointer.y
    ctx.hasChain = target.config.chain !== 0 && Number.isFinite(target.chainX)
    ctx.chainX = target.chainX
    ctx.chainY = target.chainY
    ctx.hasChainR = target.config.chainOrient === "auto" && Number.isFinite(target.chainR)
    ctx.chainR = target.chainR
    ctx.groupIndex = target.config.groupIndex
    ctx.groupCount = target.config.groupCount
    this.fillEdgeBox(target, ctx)
    ctx.shape = SHAPE_CIRCLE
    ctx.anchorW = 0
    ctx.anchorH = 0
    const parent = target.element.parentElement
    if (parent instanceof HTMLElement) {
      const box = this.parents.get(parent) ?? this.targets.get(parent)?.rect
      if (box) {
        ctx.parentX = box.left + box.width / 2
        ctx.parentY = box.top + box.height / 2
      } else {
        ctx.parentX = ctx.sceneX
        ctx.parentY = ctx.sceneY
      }
    }
    const name = target.config.anchor
    if (!name || name === "pointer") {
      ctx.anchorX = pointer.x
      ctx.anchorY = pointer.y
      return
    }
    if (name === "scene") {
      ctx.anchorX = ctx.sceneX
      ctx.anchorY = ctx.sceneY
      if (this.rootRect) {
        ctx.shape = SHAPE_ELEMENT
        ctx.anchorLeft = this.rootRect.left
        ctx.anchorTop = this.rootRect.top
        ctx.anchorW = this.rootRect.width
        ctx.anchorH = this.rootRect.height
      }
      return
    }
    if (name === "self") {
      ctx.anchorX = ctx.restX
      ctx.anchorY = ctx.restY
      return
    }
    if (name === "parent") {
      ctx.anchorX = ctx.parentX
      ctx.anchorY = ctx.parentY
      return
    }
    const named = this.named.get(name)
    if (named) {
      ctx.anchorX = named.box.left + named.box.width / 2
      ctx.anchorY = named.box.top + named.box.height / 2
      ctx.shape = SHAPE_ELEMENT
      ctx.anchorLeft = named.box.left
      ctx.anchorTop = named.box.top
      ctx.anchorW = named.box.width
      ctx.anchorH = named.box.height
      return
    }
    ctx.anchorX = ctx.restX
    ctx.anchorY = ctx.restY
  }

  pause(): void {
    this.paused = true
    kernel.sleep(this)
  }

  resume(): void {
    this.paused = false
    this.kick()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.paused = true
    if (this.drag.target) {
      try {
        if (this.drag.pointerId >= 0) this.drag.target.element.releasePointerCapture(this.drag.pointerId)
      } catch {
        undefined
      }
      this.drag.target.dragLive = false
      this.drag.target = null
    }
    this.drag.live = false
    this.drag.armed = false
    this.drag.pointerId = -1
    if (this.gesture.target) {
      this.gesture.target.press = 0
      this.gesture.target.holdActive = 0
    }
    this.gesture.target = null
    this.gesture.kind = ""
    this.gesture.pointerId = -1
    kernel.remove(this)
    this.unbind.forEach((fn) => fn())
    this.unbind = []
    this.targets.forEach((target) => target.destroy())
    this.targets.clear()
    this.restoreDepthMarks()
    this.restoreScene()
    this.root.style.perspective = this.ownedRoot.perspective
    this.root.style.transformStyle = this.ownedRoot.transformStyle
    this.root.style.transform = this.ownedRoot.transform
    this.lastSceneTransform = ""
    this.list.length = 0
    this.named.clear()
    this.parents.clear()
    this.parentEls.clear()
    this.chains = []
    this.hash.clear()
    this.pointerLog = []
    this.logStart = 0
    this.watched.clear()
    this.audios.forEach((item) => item.destroy())
    this.audios = []
    this.videos.forEach((item) => item.destroy())
    this.videos = []
  }

  bindSignal(signal: AbortSignal): void {
    const abort = () => this.destroy()
    if (signal.aborted) {
      this.destroy()
      return
    }
    signal.addEventListener("abort", abort)
    this.unbind.push(() => signal.removeEventListener("abort", abort))
  }
}

let app: KinesisApp | undefined

export function getKinesis(): KinesisApp | undefined {
  return app
}

export function createKinesis(root: string | HTMLElement, options?: CreateKinesisOptions): KinesisScope {
  if (typeof window === "undefined") {
    throw new Error("createKinesis requires a browser environment")
  }
  const element = typeof root === "string" ? document.querySelector<HTMLElement>(root) : root
  if (!element) throw new Error("Kinesis scope root not found")
  if (!element.hasAttribute("data-kinesis")) element.setAttribute("data-kinesis", "")
  const existing = kernel.byRoot.get(element)
  if (existing) return existing
  registerCssProperties()
  const scope = new ScopeRuntime(element)
  if (options?.signal) scope.bindSignal(options.signal)
  return scope
}

export function initKinesis(root?: ParentNode, options?: CreateKinesisOptions): KinesisApp {
  if (typeof window === "undefined") {
    return { scopes: [], refresh() {}, destroy() {} }
  }
  if (app) app.destroy()
  registerCssProperties()
  const scopeRoot = root ?? document
  const nodes = Array.from(scopeRoot.querySelectorAll<HTMLElement>("[data-kinesis]"))
  const scopes = nodes.map((node) => {
    kernel.byRoot.get(node)?.destroy()
    return new ScopeRuntime(node)
  })
  const next: KinesisApp = {
    scopes,
    refresh() {
      scopes.forEach((scope) => scope.refresh())
    },
    destroy() {
      scopes.forEach((scope) => scope.destroy())
      if (app === next) app = undefined
    },
  }
  app = next
  if (options?.signal) {
    const abort = () => next.destroy()
    if (options.signal.aborted) abort()
    else options.signal.addEventListener("abort", abort, { once: true })
  }
  return next
}

export type { TargetConfig }
