import { beforeFrame, wake } from "./frame"
import { clamp } from "./math"

/**
 * Page-wide input, shared by every scope: one set of listeners no matter how many elements
 * move. Handlers only store the latest sample; everything else happens in the frame.
 */
export const input = {
  x: 0,
  y: 0,
  /** A pointer is over the window (for touch: while touching). */
  present: false,
  type: "mouse" as string,
  /** The pointer moved since the previous frame. */
  moved: false,
  /** Smoothed pointer velocity in px/s. */
  vx: 0,
  vy: 0,
  scrollX: 0,
  scrollY: 0,
  /** Scroll changed since the previous frame. */
  scrolled: false,
  scrollVelocity: 0,
  /** Maximum document scroll, refreshed lazily. */
  scrollMax: 1,
  scrollMaxDirty: true,
  viewportWidth: 0,
  viewportHeight: 0,
  orientation: { enabled: false, active: false, x: 0, y: 0, changed: false },
}

type Listener = (event: Event) => void

const containerScroll = new Set<(target: Element) => void>()
const resize = new Set<() => void>()
let attached = false
let lastX = 0
let lastY = 0
let lastScroll = 0
let rawMoved = false
let rawScrolled = false

function measureViewport(): void {
  input.viewportWidth = window.innerWidth
  input.viewportHeight = window.innerHeight
}

const onMove: Listener = (event) => {
  const pointer = event as PointerEvent
  input.x = pointer.clientX
  input.y = pointer.clientY
  input.type = pointer.pointerType || "mouse"
  input.present = pointer.pointerType !== "touch" || pointer.buttons > 0 || pointer.type === "pointerdown"
  rawMoved = true
  wake()
}

const onUp: Listener = (event) => {
  const pointer = event as PointerEvent
  if (pointer.pointerType === "touch") {
    input.present = false
    rawMoved = true
    wake()
  }
}

const onLeave: Listener = (event) => {
  const mouse = event as MouseEvent
  if (mouse.relatedTarget) return
  input.present = false
  rawMoved = true
  wake()
}

const onScroll: Listener = (event) => {
  const target = event.target
  if (target === document || target === document.documentElement || target === window) {
    rawScrolled = true
    wake()
    return
  }
  if (target instanceof Element) for (const fn of containerScroll) fn(target)
}

const onResize: Listener = () => {
  measureViewport()
  input.scrollMaxDirty = true
  for (const fn of resize) fn()
  wake()
}

const onOrientation: Listener = (event) => {
  const orientation = event as DeviceOrientationEvent
  if (!input.orientation.enabled || orientation.gamma == null || orientation.beta == null) return
  input.orientation.active = true
  input.orientation.x = clamp(orientation.gamma / 30, -1, 1)
  input.orientation.y = clamp((orientation.beta - 45) / 30, -1, 1)
  input.orientation.changed = true
  wake()
}

export function attachInput(): void {
  if (attached || typeof window === "undefined") return
  attached = true
  measureViewport()
  input.scrollX = window.scrollX
  input.scrollY = window.scrollY
  lastScroll = input.scrollY
  const passive = { passive: true }
  window.addEventListener("pointermove", onMove, passive)
  window.addEventListener("pointerdown", onMove, passive)
  window.addEventListener("pointerup", onUp, passive)
  window.addEventListener("pointercancel", onUp, passive)
  document.addEventListener("mouseout", onLeave, passive)
  document.addEventListener("scroll", onScroll, { passive: true, capture: true })
  window.addEventListener("resize", onResize, passive)
  window.addEventListener("deviceorientation", onOrientation, passive)
  beforeFrame(sample)
}

export function onContainerScroll(fn: (target: Element) => void): () => void {
  containerScroll.add(fn)
  return () => containerScroll.delete(fn)
}

export function onResizeWindow(fn: () => void): () => void {
  resize.add(fn)
  return () => resize.delete(fn)
}

/** Converts raw event samples into per-frame values. Runs first in every frame. */
function sample(dt: number): boolean {
  input.moved = rawMoved
  rawMoved = false
  input.scrolled = rawScrolled
  rawScrolled = false
  input.orientation.changed = false
  const blend = 1 - Math.exp(-dt / 0.06)
  const rawVx = input.moved ? (input.x - lastX) / dt : 0
  const rawVy = input.moved ? (input.y - lastY) / dt : 0
  input.vx += (rawVx - input.vx) * blend
  input.vy += (rawVy - input.vy) * blend
  lastX = input.x
  lastY = input.y
  if (input.scrolled) {
    input.scrollX = window.scrollX
    input.scrollY = window.scrollY
  }
  const rawScroll = (input.scrollY - lastScroll) / dt
  input.scrollVelocity += (rawScroll - input.scrollVelocity) * blend
  lastScroll = input.scrollY
  if (Math.abs(input.vx) < 1 && Math.abs(input.vy) < 1) {
    input.vx = 0
    input.vy = 0
  }
  if (Math.abs(input.scrollVelocity) < 1) input.scrollVelocity = 0
  // Decaying velocity only matters to bound signals; they keep the loop awake themselves.
  return false
}

/** Reads document height only when it may have changed. Call from a read phase. */
export function refreshScrollMax(): void {
  if (!input.scrollMaxDirty || typeof document === "undefined") return
  input.scrollMaxDirty = false
  input.scrollMax = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
}

/**
 * Enables device orientation as a pointer substitute on touch devices. On iOS this must run
 * inside a user gesture (a click handler).
 */
export async function requestOrientation(): Promise<boolean> {
  if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") return false
  const ctor = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<"granted" | "denied">
  }
  if (typeof ctor.requestPermission === "function") {
    try {
      if ((await ctor.requestPermission()) !== "granted") return false
    } catch {
      return false
    }
  }
  attachInput()
  input.orientation.enabled = true
  return true
}
