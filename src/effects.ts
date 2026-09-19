import { angleToDeg, clamp, lengthToPx, lerp, splitValues, Spring } from "./core"
import { getMotionPreset } from "./spec/motion-presets"
import type { KSignal } from "./signal"

export interface TargetConfig {
  enabled: boolean
  source: string
  space: string
  motion: string
  intensity: number
  perspective: number
  reducedMotion: string
  parallaxX: number
  parallaxY: number
  tiltX: number
  tiltY: number
  tiltOrigin: string
  axis: string
  rotate: number
  depth: number
  depthStep: number
  magneticRadius: number
  magneticForce: number
  magneticFalloff: string
  magneticAxis: string
  repel: number
  repelRadius: number
  attract: number
  attractRadius: number
  follow: string
  followOffsetX: number
  followOffsetY: number
  trail: number
  scrollX: number
  scrollY: number
  scrollRotate: number
  path: string
  pathStrength: number
  audioBand: string
  audioBin: number
  audioScaleMin: number
  audioScaleMax: number
  springStiffness: number
  springDamping: number
  springMass: number
  smoothing: number
}

export interface MotionOutput {
  x: number
  y: number
  z: number
  rotateX: number
  rotateY: number
  rotateZ: number
  scaleX: number
  scaleY: number
  path: number
}

const defaults: TargetConfig = {
  enabled: true,
  source: "auto",
  space: "local",
  motion: "smooth",
  intensity: 1,
  perspective: 1000,
  reducedMotion: "respect",
  parallaxX: 0,
  parallaxY: 0,
  tiltX: 0,
  tiltY: 0,
  tiltOrigin: "center",
  axis: "both",
  rotate: 0,
  depth: 0,
  depthStep: 12,
  magneticRadius: 0,
  magneticForce: 1,
  magneticFalloff: "smooth",
  magneticAxis: "both",
  repel: 0,
  repelRadius: 180,
  attract: 0,
  attractRadius: 240,
  follow: "none",
  followOffsetX: 0,
  followOffsetY: 0,
  trail: 0,
  scrollX: 0,
  scrollY: 0,
  scrollRotate: 0,
  path: "",
  pathStrength: 1,
  audioBand: "none",
  audioBin: -1,
  audioScaleMin: 1,
  audioScaleMax: 1.2,
  springStiffness: 180,
  springDamping: 22,
  springMass: 1,
  smoothing: 0,
}

function read(style: CSSStyleDeclaration, name: string): string {
  return style.getPropertyValue(name).trim()
}

function parsePair(
  value: string,
  parser: (token: string) => number,
): [number, number] {
  const parts = splitValues(value)
  if (parts.length === 0) return [0, 0]
  const first = parser(parts[0] ?? "0")
  if (parts.length === 1) return [first, first]
  return [first, parser(parts[1] ?? parts[0] ?? "0")]
}

function falloff(t: number, kind: string): number {
  const clamped = clamp(t, 0, 1)
  if (kind === "linear") return clamped
  if (kind === "sharp") return clamped * clamped
  return 1 - (1 - clamped) * (1 - clamped)
}

function authored(value: string, blanks: string[]): boolean {
  return Boolean(value) && !blanks.includes(value)
}

export function parseTargetConfig(style: CSSStyleDeclaration): TargetConfig {
  const parallax = read(style, "--k-parallax")
  const tilt = read(style, "--k-tilt")
  const [parallaxX, parallaxY] = authored(parallax, ["0px", "0"])
    ? parsePair(parallax, lengthToPx)
    : [
        lengthToPx(read(style, "--k-parallax-x") || "0"),
        lengthToPx(read(style, "--k-parallax-y") || "0"),
      ]
  const [tiltX, tiltY] = authored(tilt, ["0deg", "0"])
    ? parsePair(tilt, angleToDeg)
    : [
        angleToDeg(read(style, "--k-tilt-x") || "0"),
        angleToDeg(read(style, "--k-tilt-y") || "0"),
      ]
  const magneticRadiusRaw = read(style, "--k-magnetic-radius")
  const scroll = read(style, "--k-scroll")
  const [scrollX, scrollY] = authored(scroll, ["0", "0px"])
    ? parsePair(scroll, (token) => lengthToPx(token.includes("px") ? token : `${token}px`))
    : [
        lengthToPx(read(style, "--k-scroll-x") || "0"),
        lengthToPx(read(style, "--k-scroll-y") || "0"),
      ]

  const follow = read(style, "--k-follow") || "none"
  const [followOffsetX, followOffsetY] = parsePair(read(style, "--k-follow-offset") || "0px", lengthToPx)
  const pathRaw = read(style, "--k-path")
  const audioBinRaw = read(style, "--k-audio-bin")
  const [audioScaleMin, audioScaleMax] = parsePair(read(style, "--k-audio-scale") || "1 1.2", Number.parseFloat)

  return {
    enabled: read(style, "--k-enabled") !== "0",
    source: read(style, "--k-source") || defaults.source,
    space: read(style, "--k-space") || defaults.space,
    motion: read(style, "--k-motion") || defaults.motion,
    intensity: Number.parseFloat(read(style, "--k-intensity") || "1") || 1,
    perspective: lengthToPx(read(style, "--k-perspective") || "1000px"),
    reducedMotion: read(style, "--k-reduced-motion") || defaults.reducedMotion,
    parallaxX,
    parallaxY,
    tiltX,
    tiltY,
    tiltOrigin: read(style, "--k-tilt-origin") || "center",
    axis: read(style, "--k-axis") || "both",
    rotate: angleToDeg(read(style, "--k-rotate") || "0deg"),
    depth: Number.parseFloat(read(style, "--k-depth") || "0") || 0,
    depthStep: lengthToPx(read(style, "--k-depth-step") || "12px"),
    magneticRadius: magneticRadiusRaw && magneticRadiusRaw !== "0px" ? lengthToPx(magneticRadiusRaw) : 0,
    magneticForce: Number.parseFloat(read(style, "--k-magnetic-force") || "1") || 0,
    magneticFalloff: read(style, "--k-magnetic-falloff") || "smooth",
    magneticAxis: read(style, "--k-magnetic-axis") || "both",
    repel: lengthToPx(read(style, "--k-repel") || "0"),
    repelRadius: lengthToPx(read(style, "--k-repel-radius") || "180px"),
    attract: lengthToPx(read(style, "--k-attract") || "0"),
    attractRadius: lengthToPx(read(style, "--k-attract-radius") || "240px"),
    follow,
    followOffsetX,
    followOffsetY,
    trail: Number.parseFloat(read(style, "--k-trail") || "0") || 0,
    scrollX,
    scrollY,
    scrollRotate: angleToDeg(read(style, "--k-scroll-rotate") || "0deg"),
    path: pathRaw && pathRaw !== "none" ? pathRaw : "",
    pathStrength: Number.parseFloat(read(style, "--k-path-strength") || "1") || 1,
    audioBand: read(style, "--k-audio-band") || "none",
    audioBin: audioBinRaw && audioBinRaw !== "none" ? Number.parseInt(audioBinRaw, 10) : -1,
    audioScaleMin,
    audioScaleMax,
    springStiffness: Number.parseFloat(read(style, "--k-spring-stiffness") || "180") || 180,
    springDamping: Number.parseFloat(read(style, "--k-spring-damping") || "22") || 22,
    springMass: Number.parseFloat(read(style, "--k-spring-mass") || "1") || 1,
    smoothing: Number.parseFloat(read(style, "--k-smoothing") || "0") || 0,
  }
}

export function isMotionTarget(config: TargetConfig): boolean {
  return (
    config.parallaxX !== 0 ||
    config.parallaxY !== 0 ||
    config.tiltX !== 0 ||
    config.tiltY !== 0 ||
    config.depth !== 0 ||
    config.magneticRadius > 0 ||
    config.repel !== 0 ||
    config.attract !== 0 ||
    (config.follow !== "none" && config.follow !== "") ||
    config.trail !== 0 ||
    config.scrollX !== 0 ||
    config.scrollY !== 0 ||
    config.rotate !== 0 ||
    config.scrollRotate !== 0 ||
    config.path !== "" ||
    config.audioBin >= 0 ||
    (config.audioBand !== "none" && config.audioBand !== "")
  )
}

export interface PointerState {
  x: number
  y: number
  nx: number
  ny: number
}

export interface LayoutBox {
  left: number
  top: number
  width: number
  height: number
}

export const CHANNELS: (keyof MotionOutput)[] = [
  "x",
  "y",
  "z",
  "rotateX",
  "rotateY",
  "rotateZ",
  "scaleX",
  "scaleY",
  "path",
]

export function restOutput(into?: MotionOutput): MotionOutput {
  const output = into ?? {
    x: 0,
    y: 0,
    z: 0,
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
    scaleX: 1,
    scaleY: 1,
    path: 0,
  }
  output.x = 0
  output.y = 0
  output.z = 0
  output.rotateX = 0
  output.rotateY = 0
  output.rotateZ = 0
  output.scaleX = 1
  output.scaleY = 1
  output.path = 0
  return output
}

export function computeOutput(
  config: TargetConfig,
  pointer: PointerState,
  rect: LayoutBox,
  scrollProgress: number,
  reduceMotion: boolean,
  audioLevel = 0,
  source = "pointer",
  delayed?: PointerState,
  into?: MotionOutput,
): MotionOutput {
  const output = restOutput(into)
  if (!config.enabled || reduceMotion) return output

  let nx = pointer.nx
  let ny = pointer.ny
  if (config.axis === "x") ny = 0
  if (config.axis === "y") nx = 0

  const intensity = config.intensity
  output.x += -nx * config.parallaxX * intensity
  output.y += -ny * config.parallaxY * intensity
  output.z += config.depth * config.depthStep * intensity
  output.rotateY += nx * config.tiltY * intensity
  output.rotateX += -ny * config.tiltX * intensity
  const rotateDrive = source === "scroll" ? scrollProgress : config.axis === "y" ? ny : config.axis === "both" ? nx + ny : nx
  output.rotateZ += config.rotate * rotateDrive * intensity
  output.rotateZ += config.scrollRotate * scrollProgress * intensity
  if (config.path) output.path = clamp(scrollProgress * 100 * config.pathStrength, 0, 100)

  const following = config.follow !== "none" && config.follow !== ""
  const needsDistance =
    config.magneticRadius > 0 || config.attract !== 0 || config.repel !== 0 || following || config.trail > 0

  if (needsDistance) {
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = pointer.x - cx
    const dy = pointer.y - cy
    const dist = Math.hypot(dx, dy) || 1
    const ux = dx / dist
    const uy = dy / dist

    if (config.magneticRadius > 0) {
      const t = 1 - clamp(dist / config.magneticRadius, 0, 1)
      const strength = falloff(t, config.magneticFalloff) * config.magneticForce * intensity
      const pull = strength * Math.min(dist, config.magneticRadius)
      if (config.magneticAxis !== "y") output.x += ux * pull
      if (config.magneticAxis !== "x") output.y += uy * pull
    }

    if (config.attract !== 0 && dist < config.attractRadius) {
      const t = 1 - dist / config.attractRadius
      const pull = falloff(t, "smooth") * config.attract * intensity
      output.x += ux * pull
      output.y += uy * pull
    }

    if (config.repel !== 0 && dist < config.repelRadius) {
      const t = 1 - dist / config.repelRadius
      const push = falloff(t, "smooth") * config.repel * intensity
      output.x -= ux * push
      output.y -= uy * push
    }

    if (following || config.trail > 0) {
      const chase = config.trail > 0 && delayed ? delayed : pointer
      output.x += (chase.x - cx) * intensity + (following ? config.followOffsetX : 0)
      output.y += (chase.y - cy) * intensity + (following ? config.followOffsetY : 0)
    }
  }

  output.x += config.scrollX * scrollProgress * intensity
  output.y += config.scrollY * scrollProgress * intensity

  if (config.audioBin >= 0 || (config.audioBand !== "none" && config.audioBand !== "")) {
    const scale = lerp(config.audioScaleMin, config.audioScaleMax, clamp(audioLevel, 0, 1))
    output.scaleY = scale
    if (config.audioBin < 0) output.scaleX = scale
  }
  return output
}

function motionPreset(config: TargetConfig) {
  if (config.motion === "custom") {
    return {
      name: "custom",
      label: "Custom",
      stiffness: config.springStiffness,
      damping: config.springDamping + config.smoothing,
      mass: config.springMass,
    }
  }
  const preset = getMotionPreset(config.motion)
  if (config.smoothing) {
    return { ...preset, damping: preset.damping + config.smoothing }
  }
  return preset
}

export class TargetRuntime {
  readonly element: HTMLElement
  config: TargetConfig
  bindings: Partial<Record<keyof MotionOutput, KSignal>> = {}
  paused = false
  rect: LayoutBox | undefined
  busy = false
  proximityOnly = false
  proximityRadius = 0
  usesAudio = false
  usesPath = false
  readonly scratch: MotionOutput = restOutput()
  private springs: Record<keyof MotionOutput, Spring>
  private drive: Record<keyof MotionOutput, boolean> = {
    x: false,
    y: false,
    z: false,
    rotateX: false,
    rotateY: false,
    rotateZ: false,
    scaleX: false,
    scaleY: false,
    path: false,
  }
  private lastOrigin = ""
  private lastOffsetPath = ""
  private lastOffsetDistance = ""
  private drawnX = NaN
  private drawnY = NaN
  private drawnZ = NaN
  private drawnRx = NaN
  private drawnRy = NaN
  private drawnRz = NaN
  private drawnSx = NaN
  private drawnSy = NaN
  private drawnPath = NaN
  private bound = false

  constructor(element: HTMLElement, config: TargetConfig) {
    this.element = element
    this.config = config
    const preset = motionPreset(config)
    const make = (initial = 0) => new Spring(preset.stiffness, preset.damping, preset.mass, initial)
    this.springs = {
      x: make(),
      y: make(),
      z: make(),
      rotateX: make(),
      rotateY: make(),
      rotateZ: make(),
      scaleX: make(1),
      scaleY: make(1),
      path: make(),
    }
    this.syncDrive()
  }

  refresh(config: TargetConfig): void {
    this.config = config
    const preset = motionPreset(config)
    for (let index = 0; index < CHANNELS.length; index += 1) {
      this.springs[CHANNELS[index]!].setPreset(preset.stiffness, preset.damping, preset.mass)
    }
    this.syncDrive()
  }

  syncDrive(): void {
    const config = this.config
    const follow = config.follow !== "none" && config.follow !== ""
    const audio = config.audioBin >= 0 || (config.audioBand !== "none" && config.audioBand !== "")
    const pull = config.magneticRadius > 0 || config.attract !== 0 || config.repel !== 0
    this.bound = CHANNELS.some((key) => !!this.bindings[key])
    this.drive.x = !!(config.parallaxX || pull || follow || config.trail || config.scrollX || this.bindings.x)
    this.drive.y = !!(config.parallaxY || pull || follow || config.trail || config.scrollY || this.bindings.y)
    this.drive.z = !!(config.depth || this.bindings.z)
    this.drive.rotateX = !!(config.tiltX || this.bindings.rotateX)
    this.drive.rotateY = !!(config.tiltY || this.bindings.rotateY)
    this.drive.rotateZ = !!(config.rotate || config.scrollRotate || this.bindings.rotateZ)
    this.drive.scaleX = !!((audio && config.audioBin < 0) || this.bindings.scaleX)
    this.drive.scaleY = !!(audio || this.bindings.scaleY)
    this.drive.path = !!(config.path || this.bindings.path)
    this.usesAudio = audio
    this.usesPath = !!config.path
    this.proximityOnly =
      pull &&
      !this.bound &&
      !config.parallaxX &&
      !config.parallaxY &&
      !config.tiltX &&
      !config.tiltY &&
      !config.depth &&
      !config.rotate &&
      !config.scrollX &&
      !config.scrollY &&
      !config.scrollRotate &&
      !config.path &&
      !audio &&
      !follow &&
      !config.trail
    this.proximityRadius = Math.max(
      config.repel ? config.repelRadius : 0,
      config.attract ? config.attractRadius : 0,
      config.magneticRadius,
    )
  }

  outsideProximity(pointer: PointerState): boolean {
    if (!this.proximityOnly || !this.rect) return false
    const dx = pointer.x - (this.rect.left + this.rect.width / 2)
    const dy = pointer.y - (this.rect.top + this.rect.height / 2)
    const radius = this.proximityRadius
    return dx * dx + dy * dy >= radius * radius
  }

  simulate(output: MotionOutput, dt: number, reduceMotion: boolean, snap = false): boolean {
    if (this.paused) return false
    let active = false
    if (this.bound) {
      for (let index = 0; index < CHANNELS.length; index += 1) {
        const key = CHANNELS[index]!
        const signal = this.bindings[key]
        if (!signal) continue
        signal.step(dt)
        output[key] += signal.value
      }
    }
    const instant = this.config.motion === "instant" || reduceMotion || snap
    for (let index = 0; index < CHANNELS.length; index += 1) {
      const key = CHANNELS[index]!
      const spring = this.springs[key]
      const rest = key === "scaleX" || key === "scaleY" ? 1 : 0
      spring.target = reduceMotion || !this.drive[key] ? rest : output[key]
      if (instant) {
        spring.value = spring.target
        spring.velocity = 0
      } else if (!spring.settled()) {
        if (spring.step(dt)) active = true
      }
    }
    this.busy = active
    return active
  }

  commit(): void {
    const origin = this.config.tiltOrigin || "center"
    if (origin !== this.lastOrigin) {
      this.element.style.transformOrigin = origin
      this.lastOrigin = origin
    }
    if (this.usesPath) {
      const raw = this.config.path.trim()
      const offsetPath = raw.startsWith("url(") || raw.startsWith("#")
        ? raw.startsWith("#")
          ? `url(${raw})`
          : raw
        : `path("${raw.replace(/"/g, "")}")`
      if (offsetPath !== this.lastOffsetPath) {
        this.element.style.offsetPath = offsetPath
        this.element.style.offsetRotate = "auto"
        this.lastOffsetPath = offsetPath
      }
      const path = this.springs.path.value
      if (path !== this.drawnPath) {
        this.drawnPath = path
        const distance = `${path.toFixed(2)}%`
        if (distance !== this.lastOffsetDistance) {
          this.element.style.offsetDistance = distance
          this.lastOffsetDistance = distance
        }
      }
      if (this.drawnX === this.drawnX) {
        this.element.style.transform = ""
        this.drawnX = NaN
      }
      return
    }
    const x = this.springs.x.value
    const y = this.springs.y.value
    const z = this.springs.z.value
    const rx = this.springs.rotateX.value
    const ry = this.springs.rotateY.value
    const rz = this.springs.rotateZ.value
    const sx = this.springs.scaleX.value
    const sy = this.springs.scaleY.value
    if (
      x !== this.drawnX ||
      y !== this.drawnY ||
      z !== this.drawnZ ||
      rx !== this.drawnRx ||
      ry !== this.drawnRy ||
      rz !== this.drawnRz ||
      sx !== this.drawnSx ||
      sy !== this.drawnSy
    ) {
      this.drawnX = x
      this.drawnY = y
      this.drawnZ = z
      this.drawnRx = rx
      this.drawnRy = ry
      this.drawnRz = rz
      this.drawnSx = sx
      this.drawnSy = sy
      let transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px)`
      if (rx || ry || rz) {
        transform += ` rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) rotateZ(${rz.toFixed(3)}deg)`
      }
      if (sx !== 1 || sy !== 1) {
        transform += ` scale3d(${sx.toFixed(3)}, ${sy.toFixed(3)}, 1)`
      }
      this.element.style.transform = transform
    }
  }

  apply(output: MotionOutput, dt: number, reduceMotion: boolean): boolean {
    const active = this.simulate(output, dt, reduceMotion)
    this.commit()
    return active
  }

  destroy(): void {
    this.element.style.transform = ""
    this.element.style.offsetPath = ""
    this.element.style.offsetDistance = ""
    this.element.style.offsetRotate = ""
  }
}

export function shouldReduceMotion(config: TargetConfig, systemReduce: boolean): boolean {
  if (config.reducedMotion === "ignore") return false
  if (config.reducedMotion === "reduce") return true
  return systemReduce
}
