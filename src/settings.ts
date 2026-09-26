export type ReducedMotion = "user" | "always" | "never"

export interface KinesisOptions {
  /**
   * `user` (default) follows `prefers-reduced-motion`. `always` and `never` override it.
   * Reduced motion holds pointer effects and transform outputs at rest; opacity, color,
   * blur, and drag keep working.
   */
  reducedMotion?: ReducedMotion
  /** Logs configuration mistakes to the console. */
  debug?: boolean
}

export const settings: Required<KinesisOptions> = {
  reducedMotion: "user",
  debug: false,
}

const listeners = new Set<() => void>()
let query: MediaQueryList | null = null

export function configure(options: KinesisOptions = {}): void {
  const before = settings.reducedMotion
  if (options.reducedMotion) settings.reducedMotion = options.reducedMotion
  if (options.debug !== undefined) settings.debug = options.debug
  if (before !== settings.reducedMotion) for (const fn of listeners) fn()
}

export function reduceMotion(): boolean {
  if (settings.reducedMotion === "always") return true
  if (settings.reducedMotion === "never") return false
  if (!query && typeof matchMedia === "function") {
    query = matchMedia("(prefers-reduced-motion: reduce)")
    query.addEventListener("change", () => {
      for (const fn of listeners) fn()
    })
  }
  return query?.matches ?? false
}

export function onMotionPreference(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const warned = new WeakMap<object, Set<string>>()

export function warn(message: string, subject?: Element): void {
  if (!settings.debug) return
  const key = subject ?? warned
  let seen = warned.get(key)
  if (!seen) warned.set(key, (seen = new Set()))
  if (seen.has(message)) return
  seen.add(message)
  console.warn(`[kinesis] ${message}`, subject ?? "")
}
