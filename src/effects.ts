import { angleToDeg, clamp, lengthToPx, lerp, splitValues, Spring } from "./core"
import {
  evaluateField,
  falloffId,
  magneticFalloffId,
  MODE_ATTRACT,
  MODE_DIRECTIONAL,
  MODE_REPEL,
  MODE_VORTEX,
  orbitAngle,
  SHAPE_CIRCLE,
  type FieldSample,
  createFieldSample,
} from "./field"
import { computeEdge } from "./edge"
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
  magneticFalloff: number
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
  pathOrient: string
  audioBand: string
  audioBin: number
  audioScaleMin: number
  audioScaleMax: number
  springStiffness: number
  springDamping: number
  springMass: number
  smoothing: number
  anchor: string
  anchorName: string
  face: number
  faceAxis: string
  faceInvert: boolean
  orbit: number
  orbitSpeed: number
  orbitDirection: number
  orbitMode: string
  orbitPhase: number
  vortex: number
  vortexRadius: number
  vortexSpin: number
  vortexPull: number
  vortexFalloff: number
  wind: number
  windRadius: number
  windFalloff: number
  windThreshold: number
  windLimit: number
  tether: number
  tetherSlack: number
  tetherAxis: string
  tetherLimit: number
  group: string
  groupOrder: string
  groupIndex: number
  groupCount: number
  wave: number
  waveAxis: string
  waveSpread: number
  waveRadius: number
  ripple: number
  rippleRadius: number
  rippleFalloff: number
  lensScale: number
  lensRadius: number
  lensOn: boolean
  bend: number
  bendRadius: number
  chain: number
  wake: number
  wakeForce: number
  wakeRadius: number
  edge: number
  edgeForce: number
  edgeBox: string
}

export interface GroupConfig {
  kind: string
  order: string
  wave: number
  waveAxis: string
  waveSpread: number
  waveRadius: number
  ripple: number
  rippleRadius: number
  rippleFalloff: number
  lensScale: number
  lensRadius: number
  bend: number
  bendRadius: number
  orbit: number
  orbitSpeed: number
  orbitDirection: number
  orbitMode: string
  orbitPhase: number
  chain: number
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

export interface ComputeContext {
  clock: number
  dt: number
  velX: number
  velY: number
  speed: number
  sceneX: number
  sceneY: number
  parentX: number
  parentY: number
  anchorX: number
  anchorY: number
  restX: number
  restY: number
  groupIndex: number
  groupCount: number
  orbitAngle: number
  orbitVel: number
  windNx: number
  windNy: number
  windGain: number
  shape: number
  anchorLeft: number
  anchorTop: number
  anchorW: number
  anchorH: number
  pointerLive: boolean
  sample: FieldSample
  hasChain: boolean
  chainX: number
  chainY: number
  wakeNow: number
  wakeStart: number
  wakeLog: Array<{ t: number; x: number; y: number }> | null
  boxLeft: number
  boxTop: number
  boxW: number
  boxH: number
}

export const defaults: TargetConfig = {
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
  magneticFalloff: magneticFalloffId("smooth"),
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
  pathOrient: "auto",
  audioBand: "none",
  audioBin: -1,
  audioScaleMin: 1,
  audioScaleMax: 1.2,
  springStiffness: 180,
  springDamping: 22,
  springMass: 1,
  smoothing: 0,
  anchor: "pointer",
  anchorName: "",
  face: 0,
  faceAxis: "both",
  faceInvert: false,
  orbit: 0,
  orbitSpeed: 0.25,
  orbitDirection: 1,
  orbitMode: "time",
  orbitPhase: 0,
  vortex: 0,
  vortexRadius: 200,
  vortexSpin: 1,
  vortexPull: 0.35,
  vortexFalloff: falloffId("smooth"),
  wind: 0,
  windRadius: 200,
  windFalloff: falloffId("smooth"),
  windThreshold: 0.02,
  windLimit: 1,
  tether: 0,
  tetherSlack: 0,
  tetherAxis: "both",
  tetherLimit: 0,
  group: "",
  groupOrder: "",
  groupIndex: 0,
  groupCount: 0,
  wave: 0,
  waveAxis: "y",
  waveSpread: 0.18,
  waveRadius: 160,
  ripple: 0,
  rippleRadius: 180,
  rippleFalloff: falloffId("smooth"),
  lensScale: 1.25,
  lensRadius: 120,
  lensOn: false,
  bend: 0,
  bendRadius: 160,
  chain: 0,
  wake: 0,
  wakeForce: 0,
  wakeRadius: 90,
  edge: 0,
  edgeForce: 0,
  edgeBox: "scene",
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

function authored(value: string, blanks: string[]): boolean {
  return Boolean(value) && !blanks.includes(value)
}

function optionalPx(value: string): number {
  if (!value || value === "none") return 0
  return lengthToPx(value)
}

function optionalNum(value: string): number {
  if (!value || value === "none") return 0
  return Number.parseFloat(value) || 0
}

function optionalDeg(value: string): number {
  if (!value || value === "none") return 0
  return angleToDeg(value)
}

function winding(value: string): number {
  return value === "counter-clockwise" || value === "counterclockwise" || value === "ccw" ? -1 : 1
}

function defaultOrder(kind: string): string {
  if (kind === "wave" || kind === "chain") return "sequence"
  if (kind === "orbit") return "radial"
  return "spatial"
}

function timeToMs(value: string): number {
  if (!value || value === "none") return 0
  if (value.endsWith("ms")) return Number.parseFloat(value) || 0
  if (value.endsWith("s")) return (Number.parseFloat(value) || 0) * 1000
  return Number.parseFloat(value) || 0
}

export const CHAIN_MAX = 64
export const CHAIN_HQ = 32
export const WAKE_MAX_SAMPLES = 12

export function solveChain(
  restX: number[],
  restY: number[],
  prevX: number[],
  prevY: number[],
  anchorX: number,
  anchorY: number,
  sep: number,
  passes: number,
  outX: number[],
  outY: number[],
): void {
  const count = restX.length
  if (!count) return
  for (let index = 0; index < count; index += 1) {
    outX[index] = Number.isFinite(prevX[index]) ? prevX[index]! : restX[index]!
    outY[index] = Number.isFinite(prevY[index]) ? prevY[index]! : restY[index]!
  }
  outX[0] = anchorX
  outY[0] = anchorY
  const reach = (from: number, to: number) => {
    const dx = outX[to]! - outX[from]!
    const dy = outY[to]! - outY[from]!
    const d = Math.hypot(dx, dy)
    if (d < 1e-6) {
      outX[to] = outX[from]! + sep
      outY[to] = outY[from]!
      return
    }
    outX[to] = outX[from]! + (dx / d) * sep
    outY[to] = outY[from]! + (dy / d) * sep
  }
  const forward = () => {
    for (let index = 1; index < count; index += 1) reach(index - 1, index)
  }
  forward()
  if (passes > 1 && count > 1) {
    for (let index = count - 2; index > 0; index -= 1) reach(index + 1, index)
    outX[0] = anchorX
    outY[0] = anchorY
    forward()
  }
}

export function parseGroupConfig(style: CSSStyleDeclaration): GroupConfig {
  const kind = read(style, "--k-group")
  const order = read(style, "--k-group-order")
  const chain = optionalPx(read(style, "--k-chain"))
  const resolved = kind && kind !== "none" ? kind : chain ? "chain" : ""
  return {
    kind: resolved,
    order: order && order !== "none" && order !== "auto" ? order : defaultOrder(resolved),
    wave: optionalPx(read(style, "--k-wave")),
    waveAxis: read(style, "--k-wave-axis") || "y",
    waveSpread: Number.parseFloat(read(style, "--k-wave-spread") || "0.18") || 0.18,
    waveRadius: lengthToPx(read(style, "--k-wave-radius") || "160px"),
    ripple: optionalPx(read(style, "--k-ripple")),
    rippleRadius: lengthToPx(read(style, "--k-ripple-radius") || "180px"),
    rippleFalloff: falloffId(read(style, "--k-ripple-falloff") || "smooth"),
    lensScale: Number.parseFloat(read(style, "--k-lens-scale") || "1.25") || 1.25,
    lensRadius: lengthToPx(read(style, "--k-lens-radius") || "120px"),
    bend: optionalDeg(read(style, "--k-bend")),
    bendRadius: lengthToPx(read(style, "--k-bend-radius") || "160px"),
    orbit: optionalPx(read(style, "--k-orbit")),
    orbitSpeed: Number.parseFloat(read(style, "--k-orbit-speed") || "0.25") || 0.25,
    orbitDirection: winding(read(style, "--k-orbit-direction") || "clockwise"),
    orbitMode: read(style, "--k-orbit-mode") || "time",
    orbitPhase: angleToDeg(read(style, "--k-orbit-phase") || "0deg"),
    chain: resolved === "chain" ? chain || 20 : chain,
  }
}

export function applyGroupConfig(config: TargetConfig, group: GroupConfig, index: number, count: number): void {
  if (!group.kind) return
  config.group = group.kind
  config.groupOrder = group.order || defaultOrder(group.kind)
  config.groupIndex = index
  config.groupCount = count
  if (group.kind === "wave") {
    if (!config.wave) {
      config.wave = group.wave
      config.waveAxis = group.waveAxis
      config.waveSpread = group.waveSpread
      config.waveRadius = group.waveRadius
    }
  } else if (group.kind === "ripple") {
    if (!config.ripple) {
      config.ripple = group.ripple
      config.rippleRadius = group.rippleRadius
      config.rippleFalloff = group.rippleFalloff
    }
  } else if (group.kind === "lens") {
    if (!config.lensOn) {
      config.lensScale = group.lensScale
      config.lensRadius = group.lensRadius
      config.lensOn = true
    }
  } else if (group.kind === "bend") {
    if (!config.bend) {
      config.bend = group.bend
      config.bendRadius = group.bendRadius
    }
  } else if (group.kind === "orbit") {
    if (!config.orbit) {
      config.orbit = group.orbit
      config.orbitSpeed = group.orbitSpeed
      config.orbitDirection = group.orbitDirection
      config.orbitMode = group.orbitMode
    }
    if (!config.orbitPhase && count) config.orbitPhase = (360 / count) * index
  } else if (group.kind === "chain") {
    if (!config.chain) config.chain = group.chain || 20
  }
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
  const lensScaleRaw = read(style, "--k-lens-scale")
  const lensRadiusRaw = read(style, "--k-lens-radius")
  const anchorName = read(style, "--k-anchor-name")
  const groupKind = read(style, "--k-group")
  const wake = timeToMs(read(style, "--k-wake"))
  const edge = optionalPx(read(style, "--k-edge"))
  const grouped = Boolean((groupKind && groupKind !== "none") || optionalPx(read(style, "--k-chain")))

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
    magneticFalloff: magneticFalloffId(read(style, "--k-magnetic-falloff") || "smooth"),
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
    pathOrient: read(style, "--k-path-orient") || "auto",
    audioBand: read(style, "--k-audio-band") || "none",
    audioBin: audioBinRaw && audioBinRaw !== "none" ? Number.parseInt(audioBinRaw, 10) : -1,
    audioScaleMin,
    audioScaleMax,
    springStiffness: Number.parseFloat(read(style, "--k-spring-stiffness") || "180") || 180,
    springDamping: Number.parseFloat(read(style, "--k-spring-damping") || "22") || 22,
    springMass: Number.parseFloat(read(style, "--k-spring-mass") || "1") || 1,
    smoothing: Number.parseFloat(read(style, "--k-smoothing") || "0") || 0,
    anchor: read(style, "--k-anchor") || "pointer",
    anchorName: anchorName && anchorName !== "none" ? anchorName : "",
    face: grouped ? 0 : optionalDeg(read(style, "--k-face")),
    faceAxis: read(style, "--k-face-axis") || "both",
    faceInvert: read(style, "--k-face-invert") === "1",
    orbit: grouped ? 0 : optionalPx(read(style, "--k-orbit")),
    orbitSpeed: Number.parseFloat(read(style, "--k-orbit-speed") || "0.25") || 0.25,
    orbitDirection: winding(read(style, "--k-orbit-direction") || "clockwise"),
    orbitMode: read(style, "--k-orbit-mode") || "time",
    orbitPhase: angleToDeg(read(style, "--k-orbit-phase") || "0deg"),
    vortex: optionalNum(read(style, "--k-vortex")),
    vortexRadius: lengthToPx(read(style, "--k-vortex-radius") || "200px"),
    vortexSpin: Number.parseFloat(read(style, "--k-vortex-spin") || "1") || 0,
    vortexPull: Number.parseFloat(read(style, "--k-vortex-pull") || "0.35") || 0,
    vortexFalloff: falloffId(read(style, "--k-vortex-falloff") || "smooth"),
    wind: optionalPx(read(style, "--k-wind")),
    windRadius: lengthToPx(read(style, "--k-wind-radius") || "200px"),
    windFalloff: falloffId(read(style, "--k-wind-falloff") || "smooth"),
    windThreshold: Number.parseFloat(read(style, "--k-wind-threshold") || "0.02") || 0,
    windLimit: Number.parseFloat(read(style, "--k-wind-limit") || "1") || 1,
    tether: optionalPx(read(style, "--k-tether")),
    tetherSlack: lengthToPx(read(style, "--k-tether-slack") || "0px"),
    tetherAxis: read(style, "--k-tether-axis") || "both",
    tetherLimit: optionalPx(read(style, "--k-tether-limit")),
    group: "",
    groupOrder: "",
    groupIndex: 0,
    groupCount: 0,
    wave: grouped ? 0 : optionalPx(read(style, "--k-wave")),
    waveAxis: read(style, "--k-wave-axis") || "y",
    waveSpread: Number.parseFloat(read(style, "--k-wave-spread") || "0.18") || 0.18,
    waveRadius: lengthToPx(read(style, "--k-wave-radius") || "160px"),
    ripple: grouped ? 0 : optionalPx(read(style, "--k-ripple")),
    rippleRadius: lengthToPx(read(style, "--k-ripple-radius") || "180px"),
    rippleFalloff: falloffId(read(style, "--k-ripple-falloff") || "smooth"),
    lensScale: lensScaleRaw && lensScaleRaw !== "none" ? Number.parseFloat(lensScaleRaw) || 1.25 : 1.25,
    lensRadius: lengthToPx(lensRadiusRaw || "120px"),
    lensOn: !grouped && Boolean(lensScaleRaw && lensScaleRaw !== "none"),
    bend: grouped ? 0 : optionalDeg(read(style, "--k-bend")),
    bendRadius: lengthToPx(read(style, "--k-bend-radius") || "160px"),
    chain: grouped ? 0 : optionalPx(read(style, "--k-chain")),
    wake,
    wakeForce: optionalPx(read(style, "--k-wake-force")) || (wake ? 28 : 0),
    wakeRadius: lengthToPx(read(style, "--k-wake-radius") || "90px"),
    edge,
    edgeForce: optionalPx(read(style, "--k-edge-force")) || (edge ? 24 : 0),
    edgeBox: read(style, "--k-edge-box") || "scene",
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
    (config.audioBand !== "none" && config.audioBand !== "") ||
    config.face !== 0 ||
    config.orbit !== 0 ||
    config.vortex !== 0 ||
    config.wind !== 0 ||
    config.tether !== 0 ||
    config.wave !== 0 ||
    config.ripple !== 0 ||
    config.lensOn ||
    config.bend !== 0 ||
    config.chain !== 0 ||
    config.wake !== 0 ||
    config.edge !== 0
  )
}

export function usesNamedAnchor(config: TargetConfig): boolean {
  const anchor = config.anchor
  return Boolean(anchor) && anchor !== "pointer" && anchor !== "auto"
}

export function isTimeDriven(config: TargetConfig): boolean {
  return config.orbit !== 0 && config.orbitMode === "time" && usesNamedAnchor(config)
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

export function createComputeContext(): ComputeContext {
  return {
    clock: 0,
    dt: 1 / 60,
    velX: 0,
    velY: 0,
    speed: 0,
    sceneX: 0,
    sceneY: 0,
    parentX: 0,
    parentY: 0,
    anchorX: 0,
    anchorY: 0,
    restX: 0,
    restY: 0,
    groupIndex: 0,
    groupCount: 0,
    orbitAngle: Number.NaN,
    orbitVel: 0,
    windNx: 0,
    windNy: 0,
    windGain: 0,
    shape: SHAPE_CIRCLE,
    anchorLeft: 0,
    anchorTop: 0,
    anchorW: 0,
    anchorH: 0,
    pointerLive: true,
    sample: createFieldSample(),
    hasChain: false,
    chainX: 0,
    chainY: 0,
    wakeNow: 0,
    wakeStart: 0,
    wakeLog: null,
    boxLeft: 0,
    boxTop: 0,
    boxW: 0,
    boxH: 0,
  }
}

function sampleToward(
  config: TargetConfig,
  radius: number,
  falloff: number,
  mode: number,
  ctx: ComputeContext | undefined,
  pointer: PointerState,
  restX: number,
  restY: number,
  spin = 1,
  pull = 0.35,
): FieldSample {
  const sample = ctx?.sample ?? createFieldSample()
  const sourceX = ctx?.anchorX ?? pointer.x
  const sourceY = ctx?.anchorY ?? pointer.y
  return evaluateField(
    sourceX,
    sourceY,
    restX,
    restY,
    radius,
    falloff,
    mode,
    sample,
    ctx?.shape ?? SHAPE_CIRCLE,
    ctx?.anchorLeft ?? 0,
    ctx?.anchorTop ?? 0,
    ctx?.anchorW ?? 0,
    ctx?.anchorH ?? 0,
    spin,
    pull,
    ctx?.windNx ?? 0,
    ctx?.windNy ?? 0,
    config.orbitDirection,
  )
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
  ctx?: ComputeContext,
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
  if (config.path) {
    const axis = config.axis === "y" ? ny : nx
    const t = source === "pointer" || source === "orientation" ? (axis + 1) / 2 : scrollProgress
    output.path = clamp(t * 100 * config.pathStrength, 0, 100)
  }

  const restX = ctx?.restX ?? rect.left + rect.width / 2
  const restY = ctx?.restY ?? rect.top + rect.height / 2
  if (ctx?.hasChain) {
    output.x += (ctx.chainX - restX) * intensity
    output.y += (ctx.chainY - restY) * intensity
  }
  if (config.edge > 0 && config.edgeForce !== 0 && ctx && ctx.boxW > 0 && ctx.boxH > 0) {
    const sample = computeEdge(restX, restY, ctx.boxLeft, ctx.boxTop, ctx.boxW, ctx.boxH, config.edge)
    output.x += sample.nx * config.edgeForce * sample.progress * intensity
    output.y += sample.ny * config.edgeForce * sample.progress * intensity
  }
  const pointerAnchor = !config.anchor || config.anchor === "pointer"
  const live = !pointerAnchor || ctx?.pointerLive !== false
  const following = config.follow !== "none" && config.follow !== ""
  const needsDistance =
    config.magneticRadius > 0 ||
    config.attract !== 0 ||
    config.repel !== 0 ||
    following ||
    config.trail > 0 ||
    config.vortex !== 0 ||
    config.wind !== 0 ||
    config.ripple !== 0 ||
    config.lensOn ||
    config.bend !== 0

  if (needsDistance && live) {
    if (config.magneticRadius > 0) {
      const sample = sampleToward(
        config,
        config.magneticRadius,
        config.magneticFalloff,
        MODE_ATTRACT,
        ctx,
        pointer,
        restX,
        restY,
      )
      if (sample.active) {
        const travel = config.magneticForce * intensity * Math.min(sample.d, config.magneticRadius)
        if (config.magneticAxis !== "y") output.x += sample.vx * travel
        if (config.magneticAxis !== "x") output.y += sample.vy * travel
      }
    }

    if (config.attract !== 0) {
      const sample = sampleToward(config, config.attractRadius, magneticFalloffId("smooth"), MODE_ATTRACT, ctx, pointer, restX, restY)
      if (sample.active) {
        output.x += sample.vx * config.attract * intensity
        output.y += sample.vy * config.attract * intensity
      }
    }

    if (config.repel !== 0) {
      const sample = sampleToward(config, config.repelRadius, magneticFalloffId("smooth"), MODE_REPEL, ctx, pointer, restX, restY)
      if (sample.active) {
        output.x += sample.vx * config.repel * intensity
        output.y += sample.vy * config.repel * intensity
      }
    }

    if (config.vortex !== 0) {
      const sample = sampleToward(
        config,
        config.vortexRadius,
        config.vortexFalloff,
        MODE_VORTEX,
        ctx,
        pointer,
        restX,
        restY,
        config.vortexSpin,
        config.vortexPull,
      )
      if (sample.active) {
        const max = config.vortex * 80 * intensity
        output.x += sample.vx * max
        output.y += sample.vy * max
      }
    }

    if (config.wind !== 0 && (ctx?.windGain ?? 0) >= config.windThreshold) {
      const sample = sampleToward(config, config.windRadius, config.windFalloff, MODE_DIRECTIONAL, ctx, pointer, restX, restY)
      if (sample.active) {
        const gain = Math.min(ctx?.windGain ?? 0, config.windLimit)
        output.x += sample.i * (ctx?.windNx ?? 0) * config.wind * gain * intensity
        output.y += sample.i * (ctx?.windNy ?? 0) * config.wind * gain * intensity
      }
    }

    if (config.ripple !== 0) {
      const sample = sampleToward(config, config.rippleRadius, config.rippleFalloff, MODE_REPEL, ctx, pointer, restX, restY)
      if (sample.active) {
        output.x += sample.vx * config.ripple * intensity
        output.y += sample.vy * config.ripple * intensity
      }
    }

    if (config.lensOn) {
      const sample = sampleToward(config, config.lensRadius, falloffId("smooth"), MODE_ATTRACT, ctx, pointer, restX, restY)
      const scale = lerp(1, config.lensScale, sample.i)
      output.scaleX *= scale
      output.scaleY *= scale
    }

    if (config.bend !== 0) {
      const sample = sampleToward(config, config.bendRadius, falloffId("smooth"), MODE_ATTRACT, ctx, pointer, restX, restY)
      if (sample.active) {
        const signed = restX - (ctx?.anchorX ?? pointer.x)
        output.rotateZ += Math.sign(signed || 1) * sample.i * config.bend * intensity
        output.y += sample.i * config.bend * 0.35 * intensity * Math.sign(signed || 1)
      }
    }

    if (following || config.trail > 0) {
      const chase = config.trail > 0 && delayed ? delayed : pointer
      output.x += (chase.x - restX) * intensity + (following ? config.followOffsetX : 0)
      output.y += (chase.y - restY) * intensity + (following ? config.followOffsetY : 0)
    }
  }

  if (live && config.orbit !== 0) {
    const ax = ctx?.anchorX ?? pointer.x
    const ay = ctx?.anchorY ?? pointer.y
    let angle = 0
    if (config.orbitMode === "position") {
      angle = Math.atan2(pointer.y - ay, pointer.x - ax) + (config.orbitPhase * Math.PI) / 180
    } else if (config.orbitMode === "inertial" && ctx) {
      const want = Math.atan2(pointer.y - ay, pointer.x - ax)
      if (!Number.isFinite(ctx.orbitAngle)) ctx.orbitAngle = want + (config.orbitPhase * Math.PI) / 180
      let delta = want - ctx.orbitAngle
      if (delta > Math.PI) delta -= Math.PI * 2
      if (delta < -Math.PI) delta += Math.PI * 2
      ctx.orbitVel += delta * 12 * ctx.dt
      ctx.orbitAngle += ctx.orbitVel * ctx.dt
      ctx.orbitVel *= 0.9
      angle = ctx.orbitAngle
    } else {
      angle = orbitAngle(ctx?.clock ?? 0, config.orbitSpeed, config.orbitDirection, config.orbitPhase)
    }
    output.x += ax + Math.cos(angle) * config.orbit - restX
    output.y += ay + Math.sin(angle) * config.orbit - restY
  }

  if (live && config.tether !== 0) {
    const ax = ctx?.anchorX ?? pointer.x
    const ay = ctx?.anchorY ?? pointer.y
    let dx = ax - restX
    let dy = ay - restY
    if (config.tetherAxis === "x") dy = 0
    if (config.tetherAxis === "y") dx = 0
    const d = Math.hypot(dx, dy)
    const reach = config.tether + config.tetherSlack
    if (d > reach) {
      let ox = dx * ((d - config.tether) / d)
      let oy = dy * ((d - config.tether) / d)
      if (config.tetherLimit > 0) {
        const mag = Math.hypot(ox, oy)
        if (mag > config.tetherLimit) {
          ox *= config.tetherLimit / mag
          oy *= config.tetherLimit / mag
        }
      }
      output.x += ox * intensity
      output.y += oy * intensity
    }
  }

  if (live && config.face !== 0) {
    const ax = ctx?.anchorX ?? pointer.x
    const ay = ctx?.anchorY ?? pointer.y
    const dx = ax - restX
    const dy = ay - restY
    if (dx * dx + dy * dy > 1e-6) {
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI
      if (config.faceInvert) deg += 180
      const turned = clamp(deg, -config.face, config.face) * intensity
      if (config.faceAxis === "x") output.rotateY += turned
      else if (config.faceAxis === "y") output.rotateX += turned
      else output.rotateZ += turned
    }
  }

  if (live && config.wave !== 0) {
    const count = ctx?.groupCount || config.groupCount || 1
    const index = ctx?.groupIndex ?? config.groupIndex
    const spatial = config.groupOrder === "spatial"
    let influence = 0
    if (spatial) {
      const sample = sampleToward(config, config.waveRadius, falloffId("smooth"), MODE_ATTRACT, ctx, pointer, restX, restY)
      influence = sample.i
    } else {
      const cursor = (nx + 1) * 0.5
      const t = count > 1 ? (index + 0.5) / count : 0.5
      const spread = Math.max(config.waveSpread, 0.001)
      influence = fieldInfluence(1 - clamp(Math.abs(t - cursor) / spread, 0, 1))
    }
    if (config.waveAxis !== "y") output.x += influence * config.wave * intensity
    if (config.waveAxis !== "x") output.y += influence * config.wave * intensity
  }

  if (config.wake > 0 && config.wakeForce !== 0 && ctx?.wakeLog) {
    const log = ctx.wakeLog
    const oldest = ctx.wakeNow - config.wake
    let taken = 0
    for (let index = log.length - 1; index >= ctx.wakeStart && taken < WAKE_MAX_SAMPLES; index -= 1) {
      const sample = log[index]
      if (!sample || sample.t < oldest) break
      const newer = log[index + 1]
      const age = (ctx.wakeNow - sample.t) / config.wake
      const decay = 1 - age
      const dx = restX - sample.x
      const dy = restY - sample.y
      const d2 = dx * dx + dy * dy
      const radius2 = config.wakeRadius * config.wakeRadius
      if (d2 < radius2) {
        const d = Math.sqrt(d2) || 1
        const t = 1 - d / config.wakeRadius
        const i = fieldInfluence(t)
        let dirx = newer ? newer.x - sample.x : 0
        let diry = newer ? newer.y - sample.y : 0
        const mag = Math.hypot(dirx, diry)
        if (mag > 1e-6) {
          dirx /= mag
          diry /= mag
        } else {
          dirx = dx / d
          diry = dy / d
        }
        output.x += (dirx * 0.7 + (dx / d) * 0.3) * config.wakeForce * i * decay * intensity
        output.y += (diry * 0.7 + (dy / d) * 0.3) * config.wakeForce * i * decay * intensity
      }
      taken += 1
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

function fieldInfluence(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t
  return x * x * (3 - 2 * x)
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
  usesAnchor = false
  timeDriven = false
  hitGen = 0
  orbitAngle = Number.NaN
  orbitVel = 0
  chainX = Number.NaN
  chainY = Number.NaN
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
  private lastOffsetRotate = ""
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
    const field = pull || config.vortex !== 0 || config.wind !== 0 || config.ripple !== 0 || config.lensOn || config.bend !== 0
    const shift = pull || follow || config.trail || config.scrollX || config.orbit || config.vortex || config.wind || config.tether || config.wave || config.ripple || config.bend || config.chain || config.wake || config.edge
    this.bound = CHANNELS.some((key) => !!this.bindings[key])
    this.drive.x = !!(config.parallaxX || shift || this.bindings.x)
    this.drive.y = !!(config.parallaxY || shift || this.bindings.y)
    this.drive.z = !!(config.depth || this.bindings.z)
    this.drive.rotateX = !!(config.tiltX || (config.face && config.faceAxis === "y") || this.bindings.rotateX)
    this.drive.rotateY = !!(config.tiltY || (config.face && config.faceAxis === "x") || this.bindings.rotateY)
    this.drive.rotateZ = !!(config.rotate || config.scrollRotate || config.face || config.bend || this.bindings.rotateZ)
    this.drive.scaleX = !!((audio && config.audioBin < 0) || config.lensOn || this.bindings.scaleX)
    this.drive.scaleY = !!(audio || config.lensOn || this.bindings.scaleY)
    this.drive.path = !!(config.path || this.bindings.path)
    this.usesAudio = audio
    this.usesPath = !!config.path
    this.usesAnchor = usesNamedAnchor(config)
    this.timeDriven = isTimeDriven(config)
    this.proximityOnly =
      field &&
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
      !config.trail &&
      !config.orbit &&
      !config.tether &&
      !config.face &&
      !config.wave &&
      !config.chain &&
      !config.wake &&
      !config.edge &&
      !this.usesAnchor
    this.proximityRadius = Math.max(
      config.repel ? config.repelRadius : 0,
      config.attract ? config.attractRadius : 0,
      config.magneticRadius,
      config.vortex ? config.vortexRadius : 0,
      config.wind ? config.windRadius : 0,
      config.ripple ? config.rippleRadius : 0,
      config.lensOn ? config.lensRadius : 0,
      config.bend ? config.bendRadius : 0,
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
        if (key === "path") output.path = signal.value
        else output[key] += signal.value
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
        this.lastOffsetPath = offsetPath
      }
      const rotate = this.config.pathOrient === "none" ? "0deg" : this.config.pathOrient || "auto"
      if (rotate !== this.lastOffsetRotate) {
        this.element.style.offsetRotate = rotate
        this.lastOffsetRotate = rotate
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
