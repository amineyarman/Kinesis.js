import { configKeys, type Config, type KinesisProps } from "./config"
import { attachInput } from "./input"
import { registerProperties } from "./properties"
import { Scope } from "./scope"
import { configure, type KinesisOptions } from "./settings"
import { source, type Signal } from "./signal"
import type { Channel, Styled, Target } from "./target"

export type Bindings = { [K in Channel]?: Signal } & { [name: `--${string}`]: Signal }

export interface DragDetail {
  /** Drag offset from the resting position, in px. */
  x: number
  y: number
  /** Pointer velocity in px/s. */
  velocityX: number
  velocityY: number
}

export type KinesisEvent = "dragstart" | "drag" | "dragend"

/** Control over one element. Created by `kinesis(element)`. */
export interface KinesisTarget {
  readonly element: Element
  /** Current reaction progress (`--k-when`), as a signal. */
  readonly progress: Signal
  /** Sets props from JavaScript. They override CSS until `reset()`. */
  set(props: KinesisProps): this
  /** Returns props to their CSS values. With no names, resets every JavaScript prop. */
  reset(...names: (keyof KinesisProps)[]): this
  /** Drives output channels or CSS variables from signals. */
  bind(bindings: Bindings): this
  /** Removes bindings. With no names, removes all of them. */
  unbind(...names: string[]): this
  /** Listens for drag events. Returns an unsubscribe function. */
  on(event: KinesisEvent, fn: (detail: DragDetail) => void): () => void
  /** Removes everything added from JavaScript. Motion declared in CSS keeps running. */
  destroy(): void
}

/** The same controls applied to several elements. Created by `kinesis(selector)`. */
export interface KinesisTargets {
  readonly targets: KinesisTarget[]
  set(props: KinesisProps): this
  reset(...names: (keyof KinesisProps)[]): this
  bind(bindings: Bindings): this
  unbind(...names: string[]): this
  on(event: KinesisEvent, fn: (detail: DragDetail) => void): () => void
  destroy(): void
}

export interface KinesisScope {
  readonly root: Element
  /** Returns control over an element inside this scope, optionally setting props. */
  target(element: Element, props?: KinesisProps): KinesisTarget
  /** Re-reads CSS and re-measures. Needed only for changes Kinesis cannot observe. */
  refresh(): void
  pause(): void
  resume(): void
  destroy(): void
}

export interface KinesisApp {
  refresh(): void
  destroy(): void
}

const scopes = new Map<Element, Scope>()
const handles = new WeakMap<Target, KinesisTarget>()
let documentScope: Scope | null = null
let app: KinesisApp | null = null

const isStyled = (node: unknown): node is Styled =>
  (typeof HTMLElement !== "undefined" && node instanceof HTMLElement) ||
  (typeof SVGElement !== "undefined" && node instanceof SVGElement)

function ensureScope(root: Styled): Scope {
  const existing = scopes.get(root)
  if (existing && !existing.destroyed) return existing
  registerProperties()
  const scope = new Scope(root)
  scopes.set(root, scope)
  return scope
}

function scopeFor(el: Element): Scope {
  const root = el.closest("[data-kinesis]")
  if (root && isStyled(root)) return ensureScope(root)
  if (!documentScope || documentScope.destroyed) {
    registerProperties()
    documentScope = new Scope(document.documentElement, { discover: false })
  }
  return documentScope
}

class TargetHandle implements KinesisTarget {
  private signal: Signal | null = null

  constructor(
    private readonly scope: Scope,
    private readonly target: Target,
  ) {}

  get element(): Element {
    return this.target.el
  }

  get progress(): Signal {
    const target = this.target
    this.signal ??= source(
      () => target.progress,
      () => target.animating,
    )
    return this.signal
  }

  set(props: KinesisProps): this {
    this.scope.attach(this.target.el, props)
    return this
  }

  reset(...names: (keyof KinesisProps)[]): this {
    if (!names.length) {
      this.target.js = {}
    } else {
      const js = { ...this.target.js }
      for (const name of names) for (const key of configKeys(name)) delete js[key as keyof Config]
      this.target.js = js
    }
    this.scope.changed(this.target)
    return this
  }

  bind(bindings: Bindings): this {
    for (const [name, signal] of Object.entries(bindings)) if (signal) this.target.bind(name, signal)
    this.scope.changed(this.target)
    return this
  }

  unbind(...names: string[]): this {
    for (const name of names.length ? names : [...this.target.bindings.keys()]) this.target.unbind(name)
    this.scope.changed(this.target)
    return this
  }

  on(event: KinesisEvent, fn: (detail: DragDetail) => void): () => void {
    const listener = (e: Event) => {
      if (e.target === this.target.el) fn((e as CustomEvent<DragDetail>).detail)
    }
    this.target.el.addEventListener(`kinesis:${event}`, listener)
    return () => this.target.el.removeEventListener(`kinesis:${event}`, listener)
  }

  destroy(): void {
    this.target.js = {}
    for (const name of [...this.target.bindings.keys()]) this.target.unbind(name)
    this.scope.changed(this.target)
  }
}

class TargetGroup implements KinesisTargets {
  constructor(readonly targets: KinesisTarget[]) {}

  set(props: KinesisProps): this {
    for (const target of this.targets) target.set(props)
    return this
  }

  reset(...names: (keyof KinesisProps)[]): this {
    for (const target of this.targets) target.reset(...names)
    return this
  }

  bind(bindings: Bindings): this {
    for (const target of this.targets) target.bind(bindings)
    return this
  }

  unbind(...names: string[]): this {
    for (const target of this.targets) target.unbind(...names)
    return this
  }

  on(event: KinesisEvent, fn: (detail: DragDetail) => void): () => void {
    const offs = this.targets.map((target) => target.on(event, fn))
    return () => {
      for (const off of offs) off()
    }
  }

  destroy(): void {
    for (const target of this.targets) target.destroy()
  }
}

function handleFor(el: Styled, props?: KinesisProps): KinesisTarget {
  const scope = scopeFor(el)
  const target = scope.attach(el, props)
  let handle = handles.get(target)
  if (!handle) handles.set(target, (handle = new TargetHandle(scope, target)))
  return handle
}

function resolve(target: string | Element | ArrayLike<Element> | Iterable<Element>): Styled[] {
  if (typeof document === "undefined") return []
  if (typeof target === "string") return [...document.querySelectorAll(target)].filter(isStyled)
  if (target instanceof Element) return isStyled(target) ? [target] : []
  return [...(target as Iterable<Element>)].filter(isStyled)
}

/**
 * Animates elements from JavaScript with the same vocabulary as CSS.
 *
 * ```js
 * kinesis(".card", { tilt: 8, area: "self" })
 * ```
 */
export function kinesis(target: Element, props?: KinesisProps): KinesisTarget
export function kinesis(target: string | ArrayLike<Element> | Iterable<Element>, props?: KinesisProps): KinesisTargets
export function kinesis(
  target: string | Element | ArrayLike<Element> | Iterable<Element>,
  props?: KinesisProps,
): KinesisTarget | KinesisTargets {
  const elements = resolve(target)
  if (target instanceof Element) {
    const el = elements[0]
    if (!el) throw new TypeError("kinesis() needs an HTML or SVG element")
    return handleFor(el, props)
  }
  return new TargetGroup(elements.map((el) => handleFor(el, props)))
}

/** Creates a scope on `root`. Its descendants are discovered from CSS, and it is their pointer area. */
export function createKinesis(root: string | Element, options?: KinesisOptions): KinesisScope {
  const el = typeof root === "string" ? document.querySelector(root) : root
  if (!isStyled(el)) throw new TypeError(`createKinesis() could not find ${String(root)}`)
  configure(options)
  if (!el.hasAttribute("data-kinesis")) el.setAttribute("data-kinesis", "")
  const scope = ensureScope(el)
  return {
    root: el,
    target: (element, props) => {
      if (!isStyled(element) || !el.contains(element)) throw new TypeError("target() needs an element inside the scope")
      return handleFor(element, props)
    },
    refresh: () => scope.refresh(),
    pause: () => {
      scope.paused = true
    },
    resume: () => {
      scope.paused = false
      scope.refresh()
    },
    destroy: () => {
      scope.destroy()
      scopes.delete(el)
    },
  }
}

/** Re-reads CSS in every scope. Needed only after changes Kinesis cannot observe. */
export function refresh(): void {
  for (const scope of scopes.values()) scope.refresh()
}

let refreshTimer = 0
function scheduleRefresh(): void {
  clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(refresh, 120)
}

const isStylesheet = (node: Node): boolean =>
  node instanceof HTMLStyleElement || (node instanceof HTMLLinkElement && node.rel.includes("stylesheet"))

/**
 * Turns every `[data-kinesis]` element into a scope and keeps watching the document, so scopes
 * added later (client-side routing, framework rendering) work without calling it again.
 */
export function initKinesis(options?: KinesisOptions): KinesisApp {
  if (typeof document === "undefined") return { refresh() {}, destroy() {} }
  configure(options)
  if (app) {
    app.refresh()
    return app
  }
  registerProperties()
  attachInput()

  const adopt = (node: Element) => {
    if (node.hasAttribute("data-kinesis") && isStyled(node)) ensureScope(node)
    node.querySelectorAll("[data-kinesis]").forEach((el) => {
      if (isStyled(el)) ensureScope(el)
    })
  }
  adopt(document.documentElement)

  const watchLink = (node: Node) => {
    if (node instanceof HTMLLinkElement) node.addEventListener("load", scheduleRefresh, { once: true })
  }

  const structure = new MutationObserver((records) => {
    let removed = false
    let styles = false
    for (const record of records) {
      if (record.type === "attributes") {
        const el = record.target as Element
        if (el.hasAttribute("data-kinesis")) adopt(el)
        else removed = true
        continue
      }
      if (record.target instanceof HTMLStyleElement) styles = true
      record.addedNodes.forEach((node) => {
        if (isStylesheet(node)) {
          styles = true
          watchLink(node)
        } else if (node instanceof Element) {
          adopt(node)
        }
      })
      if (record.removedNodes.length) removed = true
    }
    if (removed) {
      for (const [root, scope] of scopes) {
        if (!root.isConnected || !root.hasAttribute("data-kinesis")) {
          scope.destroy()
          scopes.delete(root)
        }
      }
    }
    if (styles) scheduleRefresh()
  })
  structure.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-kinesis"],
  })

  // Theme switches usually flip a class or attribute on <html> or <body>.
  const theme = new MutationObserver(scheduleRefresh)
  const themed = { attributes: true, attributeFilter: ["class", "data-theme", "data-mode", "dir", "lang"] }
  theme.observe(document.documentElement, themed)
  if (document.body) theme.observe(document.body, themed)

  const current: KinesisApp = {
    refresh,
    destroy() {
      structure.disconnect()
      theme.disconnect()
      clearTimeout(refreshTimer)
      for (const scope of scopes.values()) scope.destroy()
      scopes.clear()
      documentScope?.destroy()
      documentScope = null
      if (app === current) app = null
    },
  }
  app = current
  return current
}
