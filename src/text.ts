export type TextUnit = "chars" | "words" | "lines"

export interface TextBinding {
  refresh(): void
  destroy(): void
}

const UNITS = new Set<TextUnit>(["chars", "words", "lines"])

function reduced(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
}

function unitOf(style: CSSStyleDeclaration): TextUnit | "" {
  const value = style.getPropertyValue("--k-text").trim()
  return UNITS.has(value as TextUnit) ? (value as TextUnit) : ""
}

function wrap(text: string): HTMLElement {
  const span = document.createElement("span")
  span.dataset.kUnit = ""
  span.setAttribute("aria-hidden", "true")
  span.textContent = text === " " ? "\u00a0" : text
  return span
}

function sourceText(element: HTMLElement): string {
  return element.dataset.kSourceText ?? element.textContent ?? ""
}

function restore(element: HTMLElement): void {
  const text = element.dataset.kSourceText
  if (text == null) return
  element.replaceChildren(document.createTextNode(text))
}

function splitChars(element: HTMLElement, text: string): HTMLElement[] {
  const nodes: HTMLElement[] = []
  for (const char of text) {
    if (!char.trim() && char !== " ") {
      element.append(char)
      continue
    }
    const node = wrap(char)
    element.append(node)
    nodes.push(node)
  }
  return nodes
}

function splitWords(element: HTMLElement, text: string): HTMLElement[] {
  const nodes: HTMLElement[] = []
  text.split(/(\s+)/).forEach((part) => {
    if (!part) return
    if (/^\s+$/.test(part)) {
      element.append(part)
      return
    }
    const node = wrap(part)
    element.append(node)
    nodes.push(node)
  })
  return nodes
}

function splitLines(element: HTMLElement, text: string): HTMLElement[] {
  const words = splitWords(element, text)
  if (words.length < 2) return words
  const lines: string[] = []
  let current = ""
  let top = Number.NaN
  words.forEach((word, index) => {
    const box = word.getBoundingClientRect()
    if (!Number.isFinite(top)) top = box.top
    if (Math.abs(box.top - top) > 1 && current) {
      lines.push(current)
      current = word.textContent ?? ""
      top = box.top
    } else {
      current += (current && !current.endsWith(" ") ? " " : "") + (word.textContent ?? "")
    }
    if (index === words.length - 1 && current) lines.push(current)
  })
  element.replaceChildren()
  return lines.map((line) => {
    const node = wrap(line)
    element.append(node)
    return node
  })
}

export function splitText(element: HTMLElement, units: TextUnit = "chars"): HTMLElement[] {
  if (typeof document === "undefined") return []
  const text = sourceText(element)
  if (!element.dataset.kSourceText) element.dataset.kSourceText = text
  if (!element.getAttribute("aria-label") && !element.getAttribute("aria-labelledby")) {
    const name = text.replace(/\s+/g, " ").trim()
    if (name) element.setAttribute("aria-label", name)
  }
  restore(element)
  element.dataset.kText = units
  element.replaceChildren()
  if (units === "words") return splitWords(element, text)
  if (units === "lines") return splitLines(element, text)
  const nodes = splitChars(element, text)
  if (nodes.length > 150) {
    console.warn(`@kinesisjs/text: ${nodes.length} character units. Keep interactive groups near 150.`)
  }
  return nodes
}

function hostsOf(root: ParentNode): HTMLElement[] {
  const origins: Element[] = []
  if (root instanceof Element) origins.push(root)
  if ("querySelectorAll" in root) {
    root.querySelectorAll("[data-kinesis]").forEach((node) => origins.push(node))
  }
  if (!origins.length && root instanceof Document && root.body) origins.push(root.body)
  const seen = new Set<HTMLElement>()
  origins.forEach((origin) => {
    if (origin instanceof HTMLElement && unitOf(getComputedStyle(origin))) seen.add(origin)
    origin.querySelectorAll<HTMLElement>("*").forEach((node) => {
      if (unitOf(getComputedStyle(node))) seen.add(node)
    })
  })
  return Array.from(seen)
}

export function bindText(root?: ParentNode | { root: HTMLElement; refresh?(): void }): TextBinding {
  if (typeof document === "undefined") {
    return { refresh() {}, destroy() {} }
  }
  root = root ?? document
  const node = "root" in root ? root.root : root
  const refreshScene = "refresh" in root ? root.refresh : undefined
  const observed = new Map<HTMLElement, ResizeObserver>()

  const apply = (element: HTMLElement) => {
    const units = unitOf(getComputedStyle(element))
    if (!units) return
    if (reduced()) {
      if (element.dataset.kText) restore(element)
      return
    }
    splitText(element, units)
    if (units !== "lines") return
    if (observed.has(element)) return
    const ro = new ResizeObserver(() => {
      splitText(element, "lines")
      refreshScene?.()
    })
    ro.observe(element)
    observed.set(element, ro)
  }

  const refresh = () => {
    if (typeof document === "undefined") return
    hostsOf(node).forEach(apply)
    refreshScene?.()
  }

  refresh()

  return {
    refresh,
    destroy() {
      observed.forEach((ro, element) => {
        ro.disconnect()
        restore(element)
        delete element.dataset.kText
      })
      observed.clear()
    },
  }
}
