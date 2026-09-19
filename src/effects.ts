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
    audioScaleMin: parsePair(read(style, "--k-audio-scale") || "1 1.2", Number.parseFloat)[0],
    audioScaleMax: parsePair(read(style, "--k-audio-scale") || "1 1.2", Number.parseFloat)[1],
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

export function computeOutput(
  config: TargetConfig,
  pointer: PointerState,
  rect: DOMRect,
  scrollProgress: number,
  reduceMotion: boolean,
  audioLevel = 0,
  source = "pointer",
  delayed?: PointerState,
): MotionOutput {
  const output: MotionOutput = { x: 0, y: 0, z: 0, rotateX: 0, rotateY: 0, rotateZ: 0, scaleX: 1, scaleY: 1, path: 0 }
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

  const following = config.follow !== "none" && config.follow !== ""
  if (following || config.trail > 0) {
    const chase = config.trail > 0 && delayed ? delayed : pointer
    output.x += (chase.x - cx) * intensity + (following ? config.followOffsetX : 0)
    output.y += (chase.y - cy) * intensity + (following ? config.followOffsetY : 0)
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
  rect: DOMRect | undefined
  private springs: Record<keyof MotionOutput, Spring>
  private lastTransform = ""

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
  }

  refresh(config: TargetConfig): void {
    this.config = config
    const preset = motionPreset(config)
    ;(Object.keys(this.springs) as (keyof MotionOutput)[]).forEach((key) => {
      this.springs[key].setPreset(preset.stiffness, preset.damping, preset.mass)
    })
  }

  apply(output: MotionOutput, dt: number, reduceMotion: boolean): boolean {
    if (this.paused) return false
    const origin = this.config.tiltOrigin || "center"
    this.element.style.transformOrigin = origin
    if (this.config.path) {
      const raw = this.config.path.trim()
      this.element.style.offsetPath = raw.startsWith("url(") || raw.startsWith("#")
        ? raw.startsWith("#")
          ? `url(${raw})`
          : raw
        : `path("${raw.replace(/"/g, "")}")`
      this.element.style.offsetRotate = "auto"
    }

    let active = false
    ;(Object.keys(this.bindings) as (keyof MotionOutput)[]).forEach((key) => {
      const signal = this.bindings[key]
      if (!signal) return
      signal.step(dt)
      output[key] += signal.value
    })
    ;(Object.keys(this.springs) as (keyof MotionOutput)[]).forEach((key) => {
      this.springs[key].target = reduceMotion
        ? key === "scaleX" || key === "scaleY"
          ? 1
          : 0
        : output[key]
      if (this.config.motion === "instant" || reduceMotion) {
        this.springs[key].value = this.springs[key].target
        this.springs[key].velocity = 0
      } else if (this.springs[key].step(dt)) {
        active = true
      }
    })

    if (this.config.path) {
      this.element.style.offsetDistance = `${this.springs.path.value.toFixed(2)}%`
      this.element.style.transform = ""
      this.lastTransform = ""
    } else {
      const transform = `translate3d(${this.springs.x.value.toFixed(2)}px, ${this.springs.y.value.toFixed(2)}px, ${this.springs.z.value.toFixed(2)}px) rotateX(${this.springs.rotateX.value.toFixed(3)}deg) rotateY(${this.springs.rotateY.value.toFixed(3)}deg) rotateZ(${this.springs.rotateZ.value.toFixed(3)}deg) scale3d(${this.springs.scaleX.value.toFixed(3)}, ${this.springs.scaleY.value.toFixed(3)}, 1)`
      if (transform !== this.lastTransform) {
        this.element.style.transform = transform
        this.lastTransform = transform
      }
    }
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
