import { propsToConfig, readConfig, usesKinesis, type Config, type KinesisProps } from "./config"
import { dragLimits, project, rubberBand } from "./effects"
import { addClient, removeClient, wake, type FrameClient } from "./frame"
import { attachInput, input, onContainerScroll, onResizeWindow, refreshScrollMax } from "./input"
import { clamp } from "./math"
import { outputs } from "./properties"
import { onMotionPreference, reduceMotion, settings, warn } from "./settings"
import { Target, type Box, type FrameEnv, type Styled } from "./target"

const SKIP = new Set(["SCRIPT", "STYLE", "TEMPLATE", "LINK", "META", "NOSCRIPT", "TITLE", "HEAD", "BR", "WBR", "IFRAME"])
const DRAG_THRESHOLD = 4
const KEY_STEP = 10

const isStyled = (node: unknown): node is Styled =>
  (typeof HTMLElement !== "undefined" && node instanceof HTMLElement) ||
  (typeof SVGElement !== "undefined" && node instanceof SVGElement)

/** Inline `--k-*` declarations, used to ignore style mutations that only Kinesis made. */
function inlineSignature(el: Element): string {
  if (!isStyled(el)) return ""
  const style = el.style
  let signature = ""
  for (let index = 0; index < style.length; index += 1) {
    const name = style[index]!
    if (name.startsWith("--k-") && !(outputs as readonly string[]).includes(name)) {
      signature += `${name}:${style.getPropertyValue(name)};`
    }
  }
  return signature
}

function sameConfig(a: Config | null, b: Config): boolean {
  if (!a) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

interface Drag {
  target: Target
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
  started: boolean
  limits: ReturnType<typeof dragLimits>
}

/**
 * A scope is the boundary Kinesis discovers targets in and the default area the pointer is
 * measured against. `[data-kinesis]` elements become scopes; so can any element via
 * `createKinesis()`. The document scope hosts elements animated only from JavaScript.
 */
export class Scope implements FrameClient {
  readonly root: Styled
  readonly discover: boolean
  readonly targets = new Map<Element, Target>()
  paused = false

  private list: Target[] = []
  private listDirty = true
  private fullScan: boolean
  private readonly scans = new Set<Element>()
  private readonly retunes = new Set<Element>()
  private geometryDirty = true
  private structureDirty = true
  private rootBox: Box = { left: 0, top: 0, width: 0, height: 0 }
  private rootFixed = false
  private rootVisible = true
  private usesPointer = false
  private usesScroll = false
  private usesPage = false
  private bindings = 0
  private moving = true
  private poked = true
  private readonly env: FrameEnv = { now: 0, reduce: false, area: { left: 0, top: 0, width: 0, height: 0 } }
  private readonly chain = new Map<Styled, Map<string, string>>()
  private chainKey = ""
  private readonly signatures = new WeakMap<Element, string>()
  private readonly viewing = new Set<Element>()
  private readonly pressed = new Set<Target>()
  private drag: Drag | null = null
  private suppressClick = false
  private mutations?: MutationObserver
  private resizes?: ResizeObserver
  private visibility?: IntersectionObserver
  private views?: IntersectionObserver
  private readonly cleanups: Array<() => void> = []
  private rescanTimer = 0
  private isDestroyed = false

  constructor(root: Styled, options: { discover?: boolean } = {}) {
    this.root = root
    this.discover = options.discover !== false
    this.fullScan = this.discover
    attachInput()

    if (typeof MutationObserver !== "undefined" && this.discover) {
      this.mutations = new MutationObserver((records) => this.onMutations(records))
      this.mutations.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden"],
      })
    }
    if (typeof ResizeObserver !== "undefined") {
      this.resizes = new ResizeObserver(() => {
        this.geometryDirty = true
        this.poke()
      })
      this.resizes.observe(root)
    }
    if (typeof IntersectionObserver !== "undefined") {
      this.visibility = new IntersectionObserver((entries) => this.onVisibility(entries), { rootMargin: "25% 0px" })
      this.visibility.observe(root)
      this.views = new IntersectionObserver((entries) => this.onView(entries), { rootMargin: "0px 0px -12% 0px" })
    }

    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (event: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      root.addEventListener(type, fn as EventListener, options)
      this.cleanups.push(() => root.removeEventListener(type, fn as EventListener, options))
    }
    on("pointerover", (event) => this.onOver(event), { passive: true })
    on("pointerout", (event) => this.onOut(event), { passive: true })
    on("pointerdown", (event) => this.onDown(event))
    on("focusin", (event) => this.onFocus(event))
    on("focusout", (event) => this.onFocus(event))
    on("keydown", (event) => this.onKey(event, true))
    on("keyup", (event) => this.onKey(event, false))
    on("dragstart", (event) => {
      if (this.chainTarget(event.target, (target) => target.config.drag !== "")) event.preventDefault()
    })
    on(
      "click",
      (event) => {
        if (!this.suppressClick) return
        this.suppressClick = false
        event.preventDefault()
        event.stopPropagation()
      },
      { capture: true },
    )

    this.cleanups.push(
      onContainerScroll((scroller) => {
        if (scroller.contains(this.root) || this.root.contains(scroller)) {
          this.geometryDirty = true
          this.poke()
        }
      }),
      onResizeWindow(() => {
        this.geometryDirty = true
        this.poke()
        if (!this.discover) return
        clearTimeout(this.rescanTimer)
        this.rescanTimer = window.setTimeout(() => this.refresh(), 200)
      }),
      onMotionPreference(() => this.invalidate()),
    )
    addClient(this)
  }

  /** True when `el` belongs to this scope rather than to a nested one. */
  owns(el: Element): boolean {
    const scope = el.closest("[data-kinesis]")
    return this.root.hasAttribute("data-kinesis") ? scope === this.root : scope === null
  }

  get size(): number {
    return this.targets.size
  }

  // --- public operations ------------------------------------------------------------------

  /** Attaches JavaScript props to an element, creating a target if needed. */
  attach(el: Styled, props?: KinesisProps): Target {
    let target = this.targets.get(el)
    if (!target) {
      target = this.add(el)
      target.needsSnapshot = true
    }
    if (props) target.js = { ...target.js, ...propsToConfig(props) }
    target.update()
    this.structureDirty = true
    this.poke()
    return target
  }

  /**
   * Applies changes made to a target's JavaScript props or bindings. A target left with no
   * CSS, props, or bindings is removed and its styles restored.
   */
  changed(target: Target): void {
    if (!this.targets.has(target.el)) return
    this.syncBindings()
    if (!target.hasConfig) {
      this.remove(target)
      this.poke()
      return
    }
    target.update()
    this.structureDirty = true
    this.poke()
  }

  get destroyed(): boolean {
    return this.isDestroyed
  }

  /** Re-reads every element's CSS and re-measures. Call after changes Kinesis cannot observe. */
  refresh(): void {
    if (this.isDestroyed) return
    this.fullScan = this.discover
    this.geometryDirty = true
    this.structureDirty = true
    this.poke()
  }

  /** Marks every target for a rewrite, for example after the reduced-motion preference changes. */
  invalidate(): void {
    for (const target of this.targets.values()) target.touch()
    this.poke()
  }

  destroy(): void {
    if (this.isDestroyed) return
    this.isDestroyed = true
    clearTimeout(this.rescanTimer)
    this.endDrag(null)
    removeClient(this)
    this.mutations?.disconnect()
    this.resizes?.disconnect()
    this.visibility?.disconnect()
    this.views?.disconnect()
    for (const fn of this.cleanups) fn()
    for (const target of this.targets.values()) target.destroy()
    this.targets.clear()
    this.list = []
    this.restoreChain()
  }

  poke(): void {
    this.poked = true
    wake()
  }

  // --- frame ------------------------------------------------------------------------------

  read(): void {
    if (this.isDestroyed || this.paused) return
    if (!this.discover) {
      // Without a MutationObserver, release elements that have left the page here.
      for (const target of this.list) if (!target.el.isConnected) this.remove(target)
    }
    if (this.fullScan) {
      this.fullScan = false
      this.scans.clear()
      this.scan(this.root)
    } else if (this.scans.size) {
      const nodes = [...this.scans]
      this.scans.clear()
      for (const node of nodes) if (node.isConnected && this.owns(node)) this.scan(node)
    }
    if (this.retunes.size) {
      const nodes = [...this.retunes]
      this.retunes.clear()
      this.retune(nodes)
    }
    if (this.listDirty) {
      this.listDirty = false
      this.list = [...this.targets.values()]
    }
    this.snapshotPending()
    if (this.structureDirty) {
      this.structureDirty = false
      this.rebuildStructure()
    }
    if (this.geometryDirty) {
      this.geometryDirty = false
      this.measure()
    }
    if (this.usesPage) refreshScrollMax()
  }

  compute(dt: number, now: number): boolean {
    if (this.isDestroyed || this.paused) return false
    const needed =
      this.poked ||
      this.moving ||
      this.bindings > 0 ||
      (input.moved && this.usesPointer) ||
      (input.scrolled && (this.usesPointer || this.usesScroll)) ||
      input.orientation.changed
    this.poked = false
    if (!needed) return false
    if (!this.rootVisible && !this.drag) {
      this.moving = false
      return false
    }
    const env = this.env
    env.now = now
    env.reduce = reduceMotion()
    const scrollX = this.rootFixed ? 0 : input.scrollX
    const scrollY = this.rootFixed ? 0 : input.scrollY
    env.area.left = this.rootBox.left - scrollX
    env.area.top = this.rootBox.top - scrollY
    env.area.width = this.rootBox.width
    env.area.height = this.rootBox.height
    let active = false
    for (let index = 0; index < this.list.length; index += 1) {
      const target = this.list[index]!
      if (!target.visible && !target.dragging) continue
      if (target.compute(dt, env)) active = true
    }
    this.moving = active
    return active
  }

  write(): void {
    if (this.isDestroyed || this.paused) return
    for (let index = 0; index < this.list.length; index += 1) {
      const target = this.list[index]!
      if (target.visible || target.dragging) target.write(this.env)
    }
    // Records produced by our own writes are not configuration changes.
    this.mutations?.takeRecords()
  }

  // --- discovery --------------------------------------------------------------------------

  private scan(start: Element): void {
    if (!this.discover) return
    const elements: Element[] = []
    if (!SKIP.has(start.tagName)) elements.push(start)
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        const el = node as Element
        if (el.hasAttribute("data-kinesis") && el !== this.root) return NodeFilter.FILTER_REJECT
        return SKIP.has(el.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
      },
    })
    for (let node = walker.nextNode(); node; node = walker.nextNode()) elements.push(node as Element)

    // Restore author styles first so every snapshot below reads the author's values.
    for (const el of elements) this.targets.get(el)?.unstyle(false)

    let changed = false
    for (const el of elements) {
      if (!isStyled(el)) continue
      const style = getComputedStyle(el)
      const target = this.targets.get(el)
      if (usesKinesis(style)) {
        const next = target ?? this.add(el)
        next.css = readConfig(style, (message) => warn(message, el))
        next.snapshot(style)
        next.update()
        this.signatures.set(el, inlineSignature(el))
        this.check(next, style)
        changed = true
      } else if (target) {
        if (Object.keys(target.js).length || target.bindings.size) {
          target.css = null
          target.snapshot(style)
          target.update()
        } else {
          this.remove(target)
        }
        changed = true
      }
    }
    if (changed) {
      this.structureDirty = true
      this.geometryDirty = true
    }
  }

  /** Targets attached from JavaScript still compose with the author's styles, and may have CSS too. */
  private snapshotPending(): void {
    const pending = this.list.filter((target) => target.needsSnapshot)
    if (!pending.length) return
    for (const target of pending) target.unstyle(false)
    for (const target of pending) {
      const style = getComputedStyle(target.el)
      target.snapshot(style)
      if (this.discover && this.owns(target.el)) {
        target.css = usesKinesis(style) ? readConfig(style, (message) => warn(message, target.el)) : null
        target.update()
      }
    }
    this.structureDirty = true
    this.geometryDirty = true
  }

  /** Re-reads configuration along hovered or focused ancestor chains, so `:hover` rules apply. */
  private retune(nodes: Element[]): void {
    for (const el of nodes) {
      if (!el.isConnected || !isStyled(el) || !this.owns(el)) continue
      const style = getComputedStyle(el)
      const target = this.targets.get(el)
      if (usesKinesis(style)) {
        const next = readConfig(style, (message) => warn(message, el))
        if (target) {
          if (sameConfig(target.css, next)) continue
          target.css = next
          target.update()
        } else {
          const created = this.add(el)
          created.css = next
          created.snapshot(style)
          created.update()
          this.geometryDirty = true
        }
        this.structureDirty = true
      } else if (target?.css && !Object.keys(target.js).length && !target.bindings.size) {
        this.remove(target)
        this.structureDirty = true
      }
    }
  }

  private queueChain(from: EventTarget | null): void {
    if (!this.discover || !(from instanceof Element) || !this.root.contains(from)) return
    for (let node: Element | null = from; node; node = node.parentElement) {
      this.retunes.add(node)
      if (node === this.root) break
    }
  }

  private add(el: Styled): Target {
    const target = new Target(el)
    this.targets.set(el, target)
    this.listDirty = true
    this.structureDirty = true
    this.geometryDirty = true
    this.resizes?.observe(el)
    this.visibility?.observe(el)
    return target
  }

  private remove(target: Target): void {
    if (this.drag?.target === target) this.endDrag(null)
    target.destroy()
    this.targets.delete(target.el)
    this.pressed.delete(target)
    this.listDirty = true
    this.structureDirty = true
    if (target.el !== this.root) {
      this.resizes?.unobserve(target.el)
      this.visibility?.unobserve(target.el)
    }
    if (this.viewing.delete(target.el)) this.views?.unobserve(target.el)
    this.syncBindings()
  }

  private syncBindings(): void {
    let count = 0
    for (const target of this.targets.values()) if (target.bindings.size) count += 1
    this.bindings = count
  }

  private check(target: Target, style: CSSStyleDeclaration): void {
    if (style.display === "inline" && target.el instanceof HTMLElement) {
      warn("inline elements cannot be transformed; use display: inline-block", target.el)
    }
    const transition = style.transitionProperty
    if (/\b(all|translate|rotate|scale|opacity|filter|color|background-color)\b/.test(transition) && style.transitionDuration !== "0s") {
      warn(`a CSS transition on "${transition}" fights Kinesis; exclude the properties Kinesis animates`, target.el)
    }
  }

  // --- mutations and observers ---------------------------------------------------------------

  private onMutations(records: MutationRecord[]): void {
    if (!this.root.isConnected) {
      this.destroy()
      return
    }
    let pruned = false
    for (const record of records) {
      if (record.type === "childList") {
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) this.scans.add(node)
        })
        if (record.removedNodes.length) pruned = true
        this.geometryDirty = true
        continue
      }
      const el = record.target as Element
      if (record.attributeName === "style") {
        this.targets.get(el)?.verify()
        const signature = inlineSignature(el)
        if (signature === (this.signatures.get(el) ?? "")) continue
        this.signatures.set(el, signature)
      } else {
        this.geometryDirty = true
      }
      this.scans.add(el)
    }
    if (pruned) {
      for (const target of [...this.targets.values()]) {
        if (!target.el.isConnected || (target.el !== this.root && !this.owns(target.el))) this.remove(target)
      }
    }
    this.poke()
  }

  private onVisibility(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      if (entry.target === this.root) {
        this.rootVisible = entry.isIntersecting
        if (!this.targets.has(this.root)) continue
      }
      const target = this.targets.get(entry.target)
      if (!target) continue
      const was = target.visible
      target.visible = entry.isIntersecting
      if (!was && target.visible && (target.config.when === "scroll" || target.config.when === "page")) {
        target.compute(0, this.env)
        target.settle()
      }
    }
    this.poke()
  }

  private onView(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const target = this.targets.get(entry.target)
      if (!target) continue
      target.inView = entry.isIntersecting
      if (target.inView && target.config.once) target.latched = true
    }
    this.poke()
  }

  // --- structure: observers, stagger, 3D ---------------------------------------------------

  private rebuildStructure(): void {
    let pointer = false
    let scroll = false
    let page = false
    const groups = new Map<Element | null, Target[]>()
    for (const target of this.list) {
      const config = target.config
      if (target.pointerDriven) pointer = true
      if (config.when === "scroll" || config.when === "page") scroll = true
      if (config.when === "page") page = true
      const wantsView = config.when === "view"
      if (wantsView && !this.viewing.has(target.el)) {
        this.viewing.add(target.el)
        this.views?.observe(target.el)
      } else if (!wantsView && this.viewing.delete(target.el)) {
        this.views?.unobserve(target.el)
        target.inView = false
      }
      if (!this.views && wantsView) target.inView = true
      if (config.stagger) {
        const key = target.el.parentElement
        const group = groups.get(key)
        if (group) group.push(target)
        else groups.set(key, [target])
      } else {
        target.order = 0
      }
    }
    for (const group of groups.values()) {
      group.forEach((target, position) => {
        target.order = target.config.index >= 0 ? target.config.index : position
      })
    }
    this.usesPointer = pointer
    this.usesScroll = scroll
    this.usesPage = page
    this.syncBindings()
    this.rebuildChain()
  }

  private restoreChain(): void {
    for (const [el, values] of this.chain) {
      for (const [name, value] of values) el.style.setProperty(name, value)
    }
    this.chain.clear()
  }

  private setChain(el: Styled, name: string, value: string): void {
    let values = this.chain.get(el)
    if (!values) this.chain.set(el, (values = new Map()))
    if (!values.has(name)) values.set(name, el.style.getPropertyValue(name))
    el.style.setProperty(name, value)
  }

  /**
   * Tilted elements need perspective from their parent; depth children need
   * `transform-style: preserve-3d` on every element between them and the tilted ancestor.
   */
  private rebuildChain(): void {
    const key = this.list
      .filter((target) => target.rotates3d || target.config.depth !== 0)
      .map((target) => `${target.id}:${target.rotates3d ? 1 : 0}:${target.config.depth ? 1 : 0}:${target.config.perspective}`)
      .join("|")
    if (key === this.chainKey) return
    this.chainKey = key
    this.restoreChain()
    for (const target of this.list) {
      if (!target.rotates3d && target.config.depth === 0) continue
      let anchor: Target | undefined
      for (let node = target.el.parentElement; node; node = node.parentElement) {
        const candidate = this.targets.get(node)
        if (candidate?.rotates3d) {
          anchor = candidate
          break
        }
        if (node === this.root) break
      }
      if (anchor) {
        for (let node = target.el.parentElement; node && isStyled(node); node = node.parentElement) {
          this.setChain(node, "transform-style", "preserve-3d")
          this.checkFlattening(node)
          if (node === anchor.el) break
        }
        continue
      }
      const parent = target.el.parentElement
      if (parent && isStyled(parent) && getComputedStyle(parent).perspective === "none") {
        this.setChain(parent, "perspective", `${target.config.perspective}px`)
      }
    }
  }

  private checkFlattening(el: Styled): void {
    if (!settings.debug) return
    const style = getComputedStyle(el)
    if (style.overflow !== "visible" || style.filter !== "none" || Number.parseFloat(style.opacity) < 1) {
      warn("overflow, filter, or opacity flattens 3D here, so --k-depth children render flat", el)
    }
  }

  // --- geometry ------------------------------------------------------------------------------

  private measure(): void {
    for (const target of this.list) target.unstyle(true)
    const scrollX = window.scrollX
    const scrollY = window.scrollY
    const fixedCache = new Map<Element, boolean>()
    const isFixed = (el: Element): boolean => {
      const chain: Element[] = []
      let result = false
      for (let node: Element | null = el; node && node !== document.documentElement; node = node.parentElement) {
        const cached = fixedCache.get(node)
        if (cached !== undefined) {
          result = cached
          break
        }
        chain.push(node)
        if (getComputedStyle(node).position === "fixed") {
          result = true
          break
        }
      }
      for (const node of chain) fixedCache.set(node, result)
      return result
    }
    const box = (el: Element, fixed: boolean): Box => {
      const rect = el.getBoundingClientRect()
      return {
        left: rect.left + (fixed ? 0 : scrollX),
        top: rect.top + (fixed ? 0 : scrollY),
        width: rect.width,
        height: rect.height,
      }
    }
    if (this.root === document.documentElement) {
      // Elements animated from JavaScript outside any scope use the viewport as their area.
      this.rootFixed = true
      this.rootBox = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
    } else {
      this.rootFixed = isFixed(this.root)
      this.rootBox = box(this.root, this.rootFixed)
    }
    for (const target of this.list) {
      const fixed = isFixed(target.el)
      target.measure(box(target.el, fixed), fixed)
    }
  }

  // --- interaction ---------------------------------------------------------------------------

  private chainTarget(from: EventTarget | null, test: (target: Target) => boolean): Target | undefined {
    if (!(from instanceof Element)) return undefined
    for (let node: Element | null = from; node; node = node.parentElement) {
      const target = this.targets.get(node)
      if (target && test(target)) return target
      if (node === this.root) break
    }
    return undefined
  }

  private chainTargets(from: Element | null): Set<Target> {
    const found = new Set<Target>()
    for (let node = from; node; node = node.parentElement) {
      const target = this.targets.get(node)
      if (target) found.add(target)
      if (node === this.root) break
    }
    return found
  }

  /** `:hover` rules can change configuration, so hovered ancestor chains are re-read. */
  private onOver(event: PointerEvent): void {
    const entering = !(event.relatedTarget instanceof Node) || !this.root.contains(event.relatedTarget)
    if (entering) this.geometryDirty = true
    this.queueChain(event.target)
    this.queueChain(event.relatedTarget)
    this.poke()
  }

  private onOut(event: PointerEvent): void {
    if (event.relatedTarget instanceof Node && this.root.contains(event.relatedTarget)) return
    this.queueChain(event.target)
    this.poke()
  }

  private onFocus(event: FocusEvent): void {
    const active = event.type === "focusin" ? event.target : null
    const chain = this.chainTargets(active instanceof Element ? active : null)
    const visible = active instanceof Element && active.matches(":focus-visible")
    for (const target of this.targets.values()) target.focused = visible && chain.has(target)
    this.queueChain(event.target)
    this.poke()
  }

  private onKey(event: KeyboardEvent, down: boolean): void {
    // The scope's own root node, so focus inside shadow DOM resolves to the real element.
    const active = (this.root.getRootNode() as Document | ShadowRoot).activeElement
    if (!(active instanceof Element) || !this.root.contains(active)) return
    if (event.key === "Enter" || event.key === " ") {
      if (down && event.repeat) return
      for (const target of this.chainTargets(active)) {
        if (target.config.when !== "press") continue
        target.pressed = down
        if (down) this.pressed.add(target)
        else this.pressed.delete(target)
      }
      this.poke()
      return
    }
    if (!down || !event.key.startsWith("Arrow")) return
    const target = this.targets.get(active)
    if (!target || !target.config.drag) return
    const step = event.shiftKey ? KEY_STEP * 5 : KEY_STEP
    const axis = target.config.drag
    let x = target.dragX
    let y = target.dragY
    if (event.key === "ArrowLeft" && axis !== "y") x -= step
    else if (event.key === "ArrowRight" && axis !== "y") x += step
    else if (event.key === "ArrowUp" && axis !== "x") y -= step
    else if (event.key === "ArrowDown" && axis !== "x") y += step
    else return
    event.preventDefault()
    const limits = this.limitsFor(target)
    target.endDrag(clamp(x, limits.minX, limits.maxX), clamp(y, limits.minY, limits.maxY), 0, 0, reduceMotion())
    target.emit("dragend", { x: target.dragX, y: target.dragY, velocityX: 0, velocityY: 0 })
    this.poke()
  }

  private onDown(event: PointerEvent): void {
    if (event.button !== 0 && event.pointerType === "mouse") return
    const chain = this.chainTargets(event.target instanceof Element ? event.target : null)
    let pressing = false
    for (const target of chain) {
      if (target.config.when === "press") {
        target.pressed = true
        this.pressed.add(target)
        pressing = true
      }
    }
    const dragTarget = this.chainTarget(event.target, (target) => target.config.drag !== "")
    if (dragTarget && !this.drag) {
      this.drag = {
        target: dragTarget,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: dragTarget.dragX,
        originY: dragTarget.dragY,
        started: false,
        limits: this.limitsFor(dragTarget),
      }
    }
    if (pressing || this.drag) {
      window.addEventListener("pointermove", this.onDragMove, { passive: false })
      window.addEventListener("pointerup", this.onUp)
      window.addEventListener("pointercancel", this.onUp)
      window.addEventListener("selectstart", this.onSelectStart)
    }
    this.poke()
  }

  private limitsFor(target: Target): ReturnType<typeof dragLimits> {
    const scrollX = target.fixed ? 0 : window.scrollX
    const scrollY = target.fixed ? 0 : window.scrollY
    const rest = {
      left: target.box.left - scrollX,
      top: target.box.top - scrollY,
      width: target.box.width,
      height: target.box.height,
    }
    const bounds = target.config.bounds
    let area: Box | null = null
    if (bounds === "viewport") area = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
    else if (bounds === "scope" || bounds === "parent") {
      const el = bounds === "scope" ? this.root : target.el.parentElement
      if (el) {
        const rect = el.getBoundingClientRect()
        area = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      }
    }
    return dragLimits(rest, area)
  }

  private readonly onDragMove = (event: PointerEvent): void => {
    const drag = this.drag
    if (!drag || event.pointerId !== drag.pointerId) return
    const target = drag.target
    const axis = target.config.drag
    const dx = axis === "y" ? 0 : event.clientX - drag.startX
    const dy = axis === "x" ? 0 : event.clientY - drag.startY
    if (!drag.started) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      drag.started = true
      target.startDrag()
      try {
        target.el.setPointerCapture(drag.pointerId)
      } catch {
        // The pointer may already be gone; the drag continues on window events.
      }
      target.el.setAttribute("data-kinesis-dragging", "")
      target.emit("dragstart", { x: target.dragX, y: target.dragY, velocityX: 0, velocityY: 0 })
    }
    event.preventDefault()
    const { limits } = drag
    const x = rubberBand(drag.originX + dx, limits.minX, limits.maxX)
    const y = rubberBand(drag.originY + dy, limits.minY, limits.maxY)
    target.moveDrag(x, y)
    target.emit("drag", { x, y, velocityX: input.vx, velocityY: input.vy })
    this.poke()
  }

  private readonly onUp = (event: PointerEvent): void => {
    for (const target of this.pressed) target.pressed = false
    this.pressed.clear()
    if (!this.drag || event.pointerId === this.drag.pointerId) this.endDrag(event)
    this.poke()
  }

  private endDrag(event: PointerEvent | null): void {
    window.removeEventListener("pointermove", this.onDragMove)
    window.removeEventListener("pointerup", this.onUp)
    window.removeEventListener("pointercancel", this.onUp)
    window.removeEventListener("selectstart", this.onSelectStart)
    const drag = this.drag
    this.drag = null
    if (!drag?.started) return
    const target = drag.target
    target.el.removeAttribute("data-kinesis-dragging")
    try {
      if (event && target.el.hasPointerCapture(drag.pointerId)) target.el.releasePointerCapture(drag.pointerId)
    } catch {
      // Capture already released.
    }
    const axis = target.config.drag
    const reduce = reduceMotion()
    const vx = axis === "y" ? 0 : input.vx
    const vy = axis === "x" ? 0 : input.vy
    const { minX, maxX, minY, maxY } = drag.limits
    const release = event ? target.config.release : "stay"
    let x = clamp(target.dragX, minX, maxX)
    let y = clamp(target.dragY, minY, maxY)
    if (release === "return") {
      x = 0
      y = 0
      target.endDrag(0, 0, vx, vy, reduce, true)
    } else if (release === "throw" && !reduce) {
      x = clamp(project(target.dragX, vx), minX, maxX)
      y = clamp(project(target.dragY, vy), minY, maxY)
      target.endDrag(x, y, vx, vy, false)
    } else {
      target.endDrag(x, y, 0, 0, reduce || (x === target.dragX && y === target.dragY))
    }
    this.suppressClick = true
    setTimeout(() => {
      this.suppressClick = false
    }, 0)
    target.emit("dragend", { x, y, velocityX: vx, velocityY: vy })
  }

  private readonly onSelectStart = (event: Event): void => {
    if (this.drag?.started) event.preventDefault()
  }
}
