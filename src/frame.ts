/**
 * The single frame loop. Every scope and signal runs inside it in three phases:
 * read (layout and style), compute (pure math), write (styles). It sleeps whenever a frame
 * reports nothing left to do.
 */
export interface FrameClient {
  /** Layout and style reads for anything invalidated since the last frame. */
  read(): void
  /** Pure math. Returns true while motion is still in progress. */
  compute(dt: number, now: number): boolean
  /** Style writes. */
  write(): void
}

export const frame = {
  /** Increments once per frame; signals cache on it. */
  id: 0,
  /** Seconds since the previous frame, capped at 0.1. */
  dt: 1 / 60,
  now: 0,
}

type Hook = (dt: number, now: number) => boolean

const clients = new Set<FrameClient>()
const before: Hook[] = []
const after: Hook[] = []
let handle = 0
let last = 0
let listening = false

const hasWindow = () => typeof window !== "undefined" && typeof requestAnimationFrame === "function"

function listen(): void {
  if (listening || typeof document === "undefined") return
  listening = true
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (handle) cancelAnimationFrame(handle)
      handle = 0
      last = 0
    } else {
      wake()
    }
  })
}

export function addClient(client: FrameClient): void {
  clients.add(client)
  listen()
  wake()
}

export function removeClient(client: FrameClient): void {
  clients.delete(client)
}

/** Runs before scopes each frame (input sampling). Returning true keeps the loop awake. */
export function beforeFrame(hook: Hook): () => void {
  before.push(hook)
  return () => before.splice(before.indexOf(hook), 1)
}

/** Runs after scopes each frame (signal subscribers). Returning true keeps the loop awake. */
export function afterFrame(hook: Hook): () => void {
  after.push(hook)
  return () => after.splice(after.indexOf(hook), 1)
}

export function wake(): void {
  if (handle || !hasWindow() || (typeof document !== "undefined" && document.hidden)) return
  handle = requestAnimationFrame(tick)
}

export function isAwake(): boolean {
  return handle !== 0
}

/** Advances one frame. Exposed for tests and for hosts that own their own loop. */
export function tick(now: number): void {
  handle = 0
  const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60
  last = now
  frame.id += 1
  frame.dt = dt
  frame.now = now
  let active = false
  for (let index = 0; index < before.length; index += 1) if (before[index]!(dt, now)) active = true
  for (const client of clients) client.read()
  for (const client of clients) if (client.compute(dt, now)) active = true
  for (const client of clients) client.write()
  for (let index = 0; index < after.length; index += 1) if (after[index]!(dt, now)) active = true
  if (active) wake()
  else last = 0
}
