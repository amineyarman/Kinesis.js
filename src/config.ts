import { parseAngle, parseLength, parseTime, splitTokens } from "./math"
import { presets, resolveMotion, type Motion, type MotionPreset, type SpringOptions } from "./spring"

export type When = "near" | "hover" | "press" | "view" | "scroll" | "page"
export type Area = "scope" | "self" | "viewport"
export type Axis = "both" | "x" | "y"
export type DragAxis = "x" | "y" | "both"
export type Bounds = "parent" | "scope" | "viewport"
export type Release = "throw" | "stay" | "return"
export type Range = [from: number, to: number]
export type ColorRange = [from: string, to: string]

/** The whole vocabulary in JavaScript form. Numbers are px, deg, or ms. */
export interface KinesisProps {
  motion?: MotionPreset | SpringOptions | [stiffness: number, damping: number, mass?: number]
  intensity?: number
  perspective?: number
  parallax?: number | [x: number, y: number]
  tilt?: number | [x: number, y: number]
  magnetic?: number
  repel?: number
  follow?: number
  look?: number
  point?: number | null
  spin?: number
  depth?: number
  drag?: DragAxis | null
  when?: When | `${When} once` | null
  x?: number | Range
  y?: number | Range
  rotate?: number | Range
  scale?: number | Range
  opacity?: number | Range
  blur?: number | Range
  color?: string | ColorRange
  background?: string | ColorRange
  area?: Area
  radius?: number
  limit?: number | null
  axis?: Axis
  bounds?: Bounds | null
  release?: Release
  delay?: number
  stagger?: number
  index?: number
  track?: boolean
}

export interface Config {
  motion: Motion
  intensity: number
  perspective: number
  parallax: [number, number]
  tilt: [number, number]
  magnetic: number
  repel: number
  follow: number
  look: number
  /** Direction the artwork faces, like gradient angles. NaN when unset. */
  point: number
  /** Flat rotation at the edge of the area, like turning a dial. */
  spin: number
  depth: number
  drag: DragAxis | ""
  when: When | ""
  once: boolean
  x: Range | null
  y: Range | null
  rotate: Range | null
  scale: Range | null
  opacity: Range | null
  blur: Range | null
  color: ColorRange | null
  background: ColorRange | null
  area: Area
  radius: number
  limit: number
  axis: Axis
  bounds: Bounds | ""
  release: Release
  delay: number
  stagger: number
  index: number
  track: boolean
}

export const WHEN: readonly When[] = ["near", "hover", "press", "view", "scroll", "page"]

export function defaultConfig(): Config {
  return {
    motion: presets.smooth!,
    intensity: 1,
    perspective: 1000,
    parallax: [0, 0],
    tilt: [0, 0],
    magnetic: 0,
    repel: 0,
    follow: 0,
    look: 0,
    point: Number.NaN,
    spin: 0,
    depth: 0,
    drag: "",
    when: "",
    once: false,
    x: null,
    y: null,
    rotate: null,
    scale: null,
    opacity: null,
    blur: null,
    color: null,
    background: null,
    area: "scope",
    radius: 200,
    limit: Number.POSITIVE_INFINITY,
    axis: "both",
    bounds: "",
    release: "throw",
    delay: 0,
    stagger: 0,
    index: -1,
    track: false,
  }
}

const read = (style: CSSStyleDeclaration, name: string): string => style.getPropertyValue(name).trim()

const unset = (value: string, initial: string): boolean => value === "" || value === initial || value === "none"

function nonZero(value: string): boolean {
  for (const token of splitTokens(value)) if (Number.parseFloat(token)) return true
  return false
}

/** Cheap check run on every element during discovery: 11 reads, no parsing for most. */
export function usesKinesis(style: CSSStyleDeclaration): boolean {
  const parallax = read(style, "--k-parallax")
  if (!unset(parallax, "0px") && nonZero(parallax)) return true
  const tilt = read(style, "--k-tilt")
  if (!unset(tilt, "0deg") && nonZero(tilt)) return true
  const magnetic = read(style, "--k-magnetic")
  if (!unset(magnetic, "0") && nonZero(magnetic)) return true
  const repel = read(style, "--k-repel")
  if (!unset(repel, "0px") && nonZero(repel)) return true
  const follow = read(style, "--k-follow")
  if (!unset(follow, "0") && nonZero(follow)) return true
  const look = read(style, "--k-look")
  if (!unset(look, "0deg") && nonZero(look)) return true
  const depth = read(style, "--k-depth")
  if (!unset(depth, "0px") && nonZero(depth)) return true
  const spin = read(style, "--k-spin")
  if (!unset(spin, "0deg") && nonZero(spin)) return true
  return (
    !unset(read(style, "--k-point"), "none") ||
    !unset(read(style, "--k-drag"), "none") ||
    !unset(read(style, "--k-when"), "none") ||
    !unset(read(style, "--k-track"), "none")
  )
}

function pair(value: string, parse: (token: string) => number): [number, number] {
  const tokens = splitTokens(value)
  if (!tokens.length) return [0, 0]
  const first = parse(tokens[0]!)
  return [first, tokens.length > 1 ? parse(tokens[1]!) : first]
}

function range(value: string, parse: (token: string) => number, rest: number, initial: string): Range | null {
  if (unset(value, initial)) return null
  const tokens = splitTokens(value)
  if (!tokens.length) return null
  if (tokens.length === 1) {
    const to = parse(tokens[0]!)
    return to === rest ? null : [rest, to]
  }
  return [parse(tokens[0]!), parse(tokens[1]!)]
}

function colorRange(value: string): ColorRange | null {
  if (unset(value, "none")) return null
  const tokens = splitTokens(value)
  if (tokens.length === 1) return ["", tokens[0]!]
  return [tokens[0]!, tokens[1]!]
}

function motionFrom(value: string, warn?: (message: string) => void): Motion {
  if (!value) return presets.smooth!
  const tokens = splitTokens(value)
  if (tokens.length >= 2) {
    const [stiffness, damping, mass] = tokens.map(Number.parseFloat)
    if (Number.isFinite(stiffness) && Number.isFinite(damping)) {
      return { stiffness: stiffness!, damping: damping!, mass: Number.isFinite(mass) ? mass! : 1 }
    }
  }
  if (value in presets) return presets[value]!
  warn?.(`unknown --k-motion "${value}", using smooth`)
  return presets.smooth!
}

const oneOf = <T extends string, F extends string>(value: string, allowed: readonly T[], fallback: F): T | F =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback

function whenFrom(value: string, warn?: (message: string) => void): { when: When | ""; once: boolean } {
  if (unset(value, "none")) return { when: "", once: false }
  const tokens = splitTokens(value)
  const when = tokens.find((token) => (WHEN as readonly string[]).includes(token)) as When | undefined
  if (!when) warn?.(`unknown --k-when "${value}"`)
  return { when: when ?? "", once: tokens.includes("once") }
}

/** Reads a full config from resolved styles. Only called for elements that use Kinesis. */
export function readConfig(style: CSSStyleDeclaration, warn?: (message: string) => void): Config {
  const fontSize = Number.parseFloat(style.fontSize) || 16
  const length = (token: string) => parseLength(token, fontSize)
  const config = defaultConfig()
  config.motion = motionFrom(read(style, "--k-motion"), warn)
  config.intensity = Number.parseFloat(read(style, "--k-intensity") || "1")
  if (!Number.isFinite(config.intensity)) config.intensity = 1
  config.perspective = length(read(style, "--k-perspective") || "1000px") || 1000
  config.parallax = pair(read(style, "--k-parallax"), length)
  config.tilt = pair(read(style, "--k-tilt"), parseAngle)
  config.magnetic = Number.parseFloat(read(style, "--k-magnetic")) || 0
  config.repel = length(read(style, "--k-repel") || "0")
  config.follow = Number.parseFloat(read(style, "--k-follow")) || 0
  config.look = parseAngle(read(style, "--k-look") || "0")
  const point = read(style, "--k-point")
  config.point = unset(point, "none") ? Number.NaN : parseAngle(point)
  config.spin = parseAngle(read(style, "--k-spin") || "0")
  config.depth = length(read(style, "--k-depth") || "0")
  config.drag = oneOf(read(style, "--k-drag"), ["x", "y", "both"] as const, "")
  Object.assign(config, whenFrom(read(style, "--k-when"), warn))
  config.x = range(read(style, "--k-x"), length, 0, "0px")
  config.y = range(read(style, "--k-y"), length, 0, "0px")
  config.rotate = range(read(style, "--k-rotate"), parseAngle, 0, "0deg")
  config.scale = range(read(style, "--k-scale"), Number.parseFloat, 1, "none")
  config.opacity = range(read(style, "--k-opacity"), Number.parseFloat, 1, "none")
  config.blur = range(read(style, "--k-blur"), length, 0, "0px")
  config.color = colorRange(read(style, "--k-color"))
  config.background = colorRange(read(style, "--k-background"))
  config.area = oneOf(read(style, "--k-area"), ["scope", "self", "viewport"] as const, "scope")
  config.radius = length(read(style, "--k-radius") || "200px") || 200
  const limit = read(style, "--k-limit")
  config.limit = unset(limit, "none") ? Number.POSITIVE_INFINITY : length(limit)
  config.axis = oneOf(read(style, "--k-axis"), ["both", "x", "y"] as const, "both")
  config.bounds = oneOf(read(style, "--k-bounds"), ["parent", "scope", "viewport"] as const, "")
  config.release = oneOf(read(style, "--k-release"), ["throw", "stay", "return"] as const, "throw")
  config.delay = parseTime(read(style, "--k-delay") || "0")
  config.stagger = parseTime(read(style, "--k-stagger") || "0")
  const index = Number.parseInt(read(style, "--k-index"), 10)
  config.index = Number.isFinite(index) ? index : -1
  config.track = read(style, "--k-track") === "pointer"
  return config
}

const toRange = (value: number | Range | undefined, rest: number): Range | null | undefined => {
  if (value === undefined) return undefined
  if (Array.isArray(value)) return [value[0], value[1]]
  return value === rest ? null : [rest, value]
}

/** Normalizes JavaScript props into config overrides. Only keys present in `props` are returned. */
export function propsToConfig(props: KinesisProps): Partial<Config> {
  const out: Partial<Config> = {}
  const has = (key: keyof KinesisProps) => Object.prototype.hasOwnProperty.call(props, key)
  if (has("motion")) out.motion = resolveMotion(props.motion)
  if (has("intensity")) out.intensity = props.intensity ?? 1
  if (has("perspective")) out.perspective = props.perspective ?? 1000
  if (has("parallax")) {
    const value = props.parallax ?? 0
    out.parallax = Array.isArray(value) ? [value[0], value[1]] : [value, value]
  }
  if (has("tilt")) {
    const value = props.tilt ?? 0
    out.tilt = Array.isArray(value) ? [value[0], value[1]] : [value, value]
  }
  if (has("magnetic")) out.magnetic = props.magnetic ?? 0
  if (has("repel")) out.repel = props.repel ?? 0
  if (has("follow")) out.follow = props.follow ?? 0
  if (has("look")) out.look = props.look ?? 0
  if (has("point")) out.point = props.point ?? Number.NaN
  if (has("spin")) out.spin = props.spin ?? 0
  if (has("depth")) out.depth = props.depth ?? 0
  if (has("drag")) out.drag = props.drag ?? ""
  if (has("when")) Object.assign(out, whenFrom(props.when ?? "none"))
  const ranges = [
    ["x", 0],
    ["y", 0],
    ["rotate", 0],
    ["scale", 1],
    ["opacity", 1],
    ["blur", 0],
  ] as const
  for (const [key, rest] of ranges) {
    if (has(key)) out[key] = toRange(props[key], rest) ?? null
  }
  for (const key of ["color", "background"] as const) {
    if (!has(key)) continue
    const value = props[key]
    out[key] = value == null ? null : Array.isArray(value) ? [value[0], value[1]] : ["", value]
  }
  if (has("area")) out.area = props.area ?? "scope"
  if (has("radius")) out.radius = props.radius ?? 200
  if (has("limit")) out.limit = props.limit ?? Number.POSITIVE_INFINITY
  if (has("axis")) out.axis = props.axis ?? "both"
  if (has("bounds")) out.bounds = props.bounds ?? ""
  if (has("release")) out.release = props.release ?? "throw"
  if (has("delay")) out.delay = props.delay ?? 0
  if (has("stagger")) out.stagger = props.stagger ?? 0
  if (has("index")) out.index = props.index ?? -1
  if (has("track")) out.track = Boolean(props.track)
  return out
}

/** Config keys owned by each JavaScript prop, used by `reset()`. */
export function configKeys(prop: keyof KinesisProps): (keyof Config)[] {
  return prop === "when" ? ["when", "once"] : [prop as keyof Config]
}

/** True when a config needs pointer input at all. */
export const usesPointer = (config: Config): boolean =>
  config.parallax[0] !== 0 ||
  config.parallax[1] !== 0 ||
  config.tilt[0] !== 0 ||
  config.tilt[1] !== 0 ||
  config.magnetic !== 0 ||
  config.repel !== 0 ||
  config.follow !== 0 ||
  config.look !== 0 ||
  !Number.isNaN(config.point) ||
  config.spin !== 0 ||
  config.when === "near" ||
  config.when === "hover" ||
  config.track

/** True when a config does anything at all. */
export const isActive = (config: Config): boolean =>
  usesPointer(config) || config.depth !== 0 || config.drag !== "" || config.when !== ""

export const rotates3d = (config: Config): boolean =>
  config.tilt[0] !== 0 || config.tilt[1] !== 0 || config.look !== 0
