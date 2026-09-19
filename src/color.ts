import { clamp, lerp } from "./core"

export interface Color {
  l: number
  a: number
  b: number
  alpha: number
}

export const BLUR_MAX = 16

const NAMES: Record<string, string> = {
  transparent: "#00000000",
  black: "#000000",
  white: "#ffffff",
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
}

export function rgbToOklab(r: number, g: number, b: number, alpha = 1): Color {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
    alpha,
  }
}

function oklabToRgb(color: Color): { r: number; g: number; b: number; alpha: number } {
  const l_ = color.l + 0.3963377774 * color.a + 0.2158037573 * color.b
  const m_ = color.l - 0.1055613458 * color.a - 0.0638541728 * color.b
  const s_ = color.l - 0.0894841775 * color.a - 1.291485548 * color.b
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  return {
    r: linearToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    alpha: color.alpha,
  }
}

function hueToRgb(p: number, q: number, t: number): number {
  let h = t
  if (h < 0) h += 1
  if (h > 1) h -= 1
  if (h < 1 / 6) return p + (q - p) * 6 * h
  if (h < 1 / 2) return q
  if (h < 2 / 3) return p + (q - p) * (2 / 3 - h) * 6
  return p
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360 / 360
  if (s <= 0) return { r: l, g: l, b: l }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: hueToRgb(p, q, hue + 1 / 3),
    g: hueToRgb(p, q, hue),
    b: hueToRgb(p, q, hue - 1 / 3),
  }
}

function parseHex(value: string): Color | null {
  const hex = value.slice(1)
  if (![3, 4, 6, 8].includes(hex.length) || /[^0-9a-f]/i.test(hex)) return null
  const expand = (hex.length < 6 ? hex.split("").map((item) => item + item).join("") : hex).padEnd(8, "f")
  return rgbToOklab(
    Number.parseInt(expand.slice(0, 2), 16) / 255,
    Number.parseInt(expand.slice(2, 4), 16) / 255,
    Number.parseInt(expand.slice(4, 6), 16) / 255,
    Number.parseInt(expand.slice(6, 8), 16) / 255,
  )
}

function parseChannels(value: string): number[] {
  return value
    .split(/[\s,/]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (part.endsWith("%")) return Number.parseFloat(part) / 100
      return Number.parseFloat(part)
    })
}

export function parseColor(input: string): Color | null {
  const value = input.trim().toLowerCase()
  if (!value || value === "none") return null
  const named = NAMES[value]
  if (named) return parseColor(named)
  if (value.startsWith("#")) return parseHex(value)
  const fn = value.match(/^(rgba?|hsla?)\((.+)\)$/)
  if (!fn) return null
  const kind = fn[1] ?? ""
  const nums = parseChannels(fn[2] ?? "")
  if (nums.length < 3 || nums.some((item) => Number.isNaN(item))) return null
  const alpha = nums[3] ?? 1
  if (kind.startsWith("hsl")) {
    const rgb = hslToRgb(nums[0] ?? 0, clamp(nums[1] ?? 0, 0, 1), clamp(nums[2] ?? 0, 0, 1))
    return rgbToOklab(rgb.r, rgb.g, rgb.b, clamp(alpha, 0, 1))
  }
  const scale = (nums[0] ?? 0) > 1 || (nums[1] ?? 0) > 1 || (nums[2] ?? 0) > 1 ? 255 : 1
  return rgbToOklab(
    clamp((nums[0] ?? 0) / scale, 0, 1),
    clamp((nums[1] ?? 0) / scale, 0, 1),
    clamp((nums[2] ?? 0) / scale, 0, 1),
    clamp(alpha, 0, 1),
  )
}

export function lerpColor(from: Color, to: Color, amount: number): Color {
  const t = clamp(amount, 0, 1)
  return {
    l: lerp(from.l, to.l, t),
    a: lerp(from.a, to.a, t),
    b: lerp(from.b, to.b, t),
    alpha: lerp(from.alpha, to.alpha, t),
  }
}

export function serializeColor(color: Color): string {
  const rgb = oklabToRgb(color)
  const r = Math.round(clamp(rgb.r, 0, 1) * 255)
  const g = Math.round(clamp(rgb.g, 0, 1) * 255)
  const b = Math.round(clamp(rgb.b, 0, 1) * 255)
  const alpha = clamp(rgb.alpha, 0, 1)
  if (alpha >= 0.999) return `rgb(${r}, ${g}, ${b})`
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
}

export function composeFilter(blur: number, brightness: number, contrast: number, saturate: number): string {
  const parts: string[] = []
  const capped = Math.min(Math.max(blur, 0), BLUR_MAX)
  if (capped > 0.01) parts.push(`blur(${capped.toFixed(2)}px)`)
  if (Math.abs(brightness - 1) > 0.001) parts.push(`brightness(${brightness.toFixed(3)})`)
  if (Math.abs(contrast - 1) > 0.001) parts.push(`contrast(${contrast.toFixed(3)})`)
  if (Math.abs(saturate - 1) > 0.001) parts.push(`saturate(${saturate.toFixed(3)})`)
  return parts.join(" ")
}
