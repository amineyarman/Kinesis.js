import {
  computeOutput,
  isMotionTarget,
  parseTargetConfig,
  restOutput,
  shouldReduceMotion,
  TargetRuntime,
  type MotionOutput,
  type PointerState,
  type TargetConfig,
} from "./effects"
import { KSignal } from "./signal"
import { KinesisAudio, type AudioSourceInput } from "./audio"
import { registerCssProperties } from "./register"
import { clamp, Spring } from "./core"
import { getMotionPreset } from "./spec/motion-presets"

export interface MotionHandle {
  element: HTMLElement
  get(name: string): string
  set(values: Record<string, string | number | number[]>): this
  to(values: Record<string, string | number | number[]>, options?: { motion?: string }): Promise<this>
  reset(names?: string | string[]): this
  bind(bindings: Partial<Record<keyof MotionOutput, KSignal>>): this
  parallax(value: { x?: number; y?: number }): this
  tilt(value: { x?: number; y?: number }): this
  magnetic(value: { radius?: number; force?: number }): this
  audio(value: { source: KinesisAudio; band?: string; scale?: number[]; motion?: string }): this
  pause(): this
  resume(): this
  refresh(): this
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
  proximity(selector: string | HTMLElement): ProximitySignals
  inView(selector: string | HTMLElement): ViewSignals
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
  springStiffness: "--k-spring-stiffness",
  springDamping: "--k-spring-damping",
  springMass: "--k-spring-mass",
  smoothing: "--k-smoothing",
}

function formatCssValue(name: string, value: string | number | number[]): string {
  if (Array.isArray(value)) {
    if (name.includes("tilt")) return value.map((item) => `${item}deg`).join(" ")
    if (name.includes("audio-scale")) return value.map(String).join(" ")
    return value.map((item) => `${item}px`).join(" ")
  }
  if (typeof value === "number") {
    if (name.includes("tilt") || name.includes("rotate")) return `${value}deg`
    if (
      name.includes("force") ||
      name.includes("intensity") ||
      name.includes("depth") ||
      name.includes("audio") ||
      name.includes("spring") ||
      name.includes("smoothing") ||
      name === "--k-motion"
    ) {
      return String(value)
    }
    if (name === "--k-motion" || name === "--k-source") return String(value)
    return `${value}${name.includes("radius") || name.includes("parallax") || name.includes("repel") || name.includes("attract") ? "px" : ""}`
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
      target.bindings = { ...target.bindings, ...bindings }
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
  frame: 0,
  scrollRaf: 0,
  io: undefined as IntersectionObserver | undefined,
  add(scope: ScopeRuntime) {
    this.members.add(scope)
    this.byRoot.set(scope.root, scope)
    this.io?.observe(scope.root)
    if (this.hooked) return
    this.hooked = true
    window.addEventListener("scroll", this.scroll, { passive: true })
    window.addEventListener("resize", this.resize, { passive: true })
    window.addEventListener("pointerdown", this.press, { passive: true })
    window.addEventListener("pointerup", this.press, { passive: true })
    window.addEventListener("pointercancel", this.press, { passive: true })
    window.addEventListener("deviceorientation", this.orient)
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
  },
  wake(scope: ScopeRuntime) {
    if (!scope.canWake()) return
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
  private audioFor = new WeakMap<HTMLElement, KinesisAudio>()

  constructor(root: HTMLElement) {
    this.root = root
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

    kernel.add(this)
    this.unbind.push(() => kernel.remove(this))
    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(() => {
        this.layoutDirty = true
        this.kick()
      })
      resizeObserver.observe(this.root)
      this.unbind.push(() => resizeObserver.disconnect())
    }

    const observer = new MutationObserver(() => this.invalidate())
    observer.observe(this.root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "data-kinesis"],
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
    return !this.destroyed && !this.paused && this.visible
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
    const rect =
      element === this.root
        ? this.rootRect ?? this.copyBox(element.getBoundingClientRect())
        : this.targets.get(element)?.rect ?? this.copyBox(element.getBoundingClientRect())
    const view = window.innerHeight || 1
    return Math.min(1, Math.max(0, 1 - rect.top / (view + rect.height)))
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
    }
    this.measuredScrollX = x
    this.measuredScrollY = y
  }

  private rememberSources(): void {
    let scroll = false
    let orient = false
    let depth = false
    let tilt = false
    const consider = (config?: TargetConfig) => {
      if (!config) return
      if (
        config.source === "scroll" ||
        config.scrollX !== 0 ||
        config.scrollY !== 0 ||
        config.scrollRotate !== 0 ||
        !!config.path
      ) {
        scroll = true
      }
      if (config.source === "orientation") orient = true
      if (config.depth) depth = true
      if (config.tiltX || config.tiltY || config.depth) tilt = true
    }
    consider(this.scopeConfig)
    this.targets.forEach((target) => consider(target.config))
    this.scrollDriven = scroll
    this.orientDriven = orient
    this.depthScene = depth
    this.threeD = !!this.sceneEl || depth || tilt
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
        node.style.setProperty("transform-style", "preserve-3d")
      }
      node = node.parentElement
    }
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
    for (let index = 0; index < restores.length; index += 1) {
      const item = restores[index]
      if (item) item.node.style.transform = item.transform
    }
    this.measuredScrollX = window.scrollX || 0
    this.measuredScrollY = window.scrollY || 0
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
    nodes.forEach((node) => {
      if (node === this.root) return
      const config = parseTargetConfig(getComputedStyle(node))
      if (!isMotionTarget(config)) return
      seen.add(node)
      const existing = this.targets.get(node)
      if (existing) existing.refresh(config)
      else this.targets.set(node, new TargetRuntime(node, config))
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
    const rootProgress = this.scrollDriven ? this.scrollProgress(this.root) : 0
    this.targets.forEach((target) => {
      if (target.paused) return
      if (!target.rect) this.measure(target)
      const config = target.config
      const reduce = shouldReduceMotion(config, this.systemReduce)
      const source = this.resolveSource(config)
      const pointer = this.inputFor(config, target.element)
      if (!this.pointerInside && source === "pointer" && target.rect) {
        pointer.nx = 0
        pointer.ny = 0
        pointer.x = target.rect.left + target.rect.width / 2
        pointer.y = target.rect.top + target.rect.height / 2
      }
      const culled = target.outsideProximity(pointer)
      if (culled && !target.busy) return
      if (culled) {
        if (target.simulate(restOutput(target.scratch), dt, reduce, snap)) active = true
        return
      }
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
        target.usesPath ? rootProgress : this.scrollProgress(target.element),
        reduce,
        audioLevel,
        source,
        delayed,
        target.scratch,
      )
      if (target.simulate(output, dt, reduce, snap)) active = true
    })
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
    this.targets.get(element)?.destroy()
    this.targets.delete(element)
    this.rememberSources()
  }

  ensureTarget(element: HTMLElement): TargetRuntime {
    const existing = this.targets.get(element)
    if (existing) return existing
    const config = parseTargetConfig(getComputedStyle(element))
    const target = new TargetRuntime(element, config)
    this.targets.set(element, target)
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
      pointer.ny = this.scrollProgress(element) * 2 - 1
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
      progress: new KSignal(() => this.scrollProgress(element)),
    }
  }

  motion(selector: string | HTMLElement): MotionHandle {
    return createHandle(this.locate(selector), this)
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
    this.destroyed = true
    this.paused = true
    kernel.remove(this)
    this.unbind.forEach((fn) => fn())
    this.targets.forEach((target) => target.destroy())
    this.targets.clear()
    this.root.style.perspective = ""
    this.root.style.transformStyle = ""
    this.root.style.transform = ""
    const scene = this.root.querySelector<HTMLElement>("[data-k-scene]")
    if (scene) {
      scene.style.transform = ""
      scene.style.transformStyle = ""
    }
    this.audios.forEach((item) => item.destroy())
    this.audios = []
  }
}

let app: KinesisApp | undefined

export function getKinesis(): KinesisApp | undefined {
  return app
}

export function createKinesis(root: string | HTMLElement): KinesisScope {
  if (typeof window === "undefined") {
    throw new Error("createKinesis requires a browser environment")
  }
  const element = typeof root === "string" ? document.querySelector<HTMLElement>(root) : root
  if (!element) throw new Error("Kinesis scope root not found")
  if (!element.hasAttribute("data-kinesis")) element.setAttribute("data-kinesis", "")
  registerCssProperties()
  return new ScopeRuntime(element)
}

export function initKinesis(root: ParentNode = document): KinesisApp {
  if (typeof window === "undefined") {
    return { scopes: [], refresh() {}, destroy() {} }
  }
  if (app) app.destroy()
  registerCssProperties()
  const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-kinesis]"))
  const scopes = nodes.map((node) => new ScopeRuntime(node))
  app = {
    scopes,
    refresh() {
      scopes.forEach((scope) => scope.refresh())
    },
    destroy() {
      scopes.forEach((scope) => scope.destroy())
    },
  }
  return app
}

export type { TargetConfig }
