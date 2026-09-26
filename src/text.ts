export type SplitBy = "chars" | "words" | "lines"

export interface SplitResult {
  readonly element: HTMLElement
  chars: HTMLElement[]
  words: HTMLElement[]
  lines: HTMLElement[]
  /** Restores the original content. */
  revert(): void
}

const HIDDEN =
  "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0"
const results = new WeakMap<HTMLElement, SplitResult>()

type Segmenter = { segment(input: string): Iterable<{ segment: string }> }
let segmenter: Segmenter | null | undefined

function graphemes(text: string): string[] {
  if (segmenter === undefined) {
    const Ctor = (Intl as unknown as { Segmenter?: new (locale?: string, options?: object) => Segmenter }).Segmenter
    segmenter = Ctor ? new Ctor(undefined, { granularity: "grapheme" }) : null
  }
  return segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text)
}

function unit(className: string, index: number): HTMLElement {
  const span = document.createElement("span")
  span.className = className
  span.style.display = "inline-block"
  span.style.setProperty("--k-index", String(index))
  return span
}

/**
 * Wraps words or characters in spans so each can be animated, for example with
 * `.k-char { --k-when: view; --k-y: 0.6em 0; --k-stagger: 30ms }`.
 *
 * Screen readers keep reading the original text: every split text run is paired with a
 * visually hidden copy, and the animated spans are `aria-hidden`. Links and emphasis inside
 * the element keep their semantics.
 */
export function splitText(target: string | HTMLElement, by: SplitBy = "chars"): SplitResult {
  const el = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target
  if (!el) throw new TypeError(`splitText() could not find ${String(target)}`)
  results.get(el)?.revert()

  const original = Array.from(el.childNodes, (node) => node.cloneNode(true))
  const chars: HTMLElement[] = []
  const words: HTMLElement[] = []
  const runs: HTMLElement[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const texts: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if ((node as Text).data.trim()) texts.push(node as Text)
  }

  for (const text of texts) {
    const hidden = document.createElement("span")
    hidden.className = "k-sr"
    hidden.style.cssText = HIDDEN
    hidden.textContent = text.data
    const visual = document.createElement("span")
    visual.setAttribute("aria-hidden", "true")
    for (const part of text.data.split(/(\s+)/)) {
      if (!part) continue
      if (/^\s+$/.test(part)) {
        visual.append(part)
        continue
      }
      const word = unit("k-word", words.length)
      words.push(word)
      if (by === "chars") {
        for (const grapheme of graphemes(part)) {
          const char = unit("k-char", chars.length)
          char.textContent = grapheme
          chars.push(char)
          word.append(char)
        }
      } else {
        word.textContent = part
      }
      visual.append(word)
    }
    runs.push(visual)
    text.replaceWith(hidden, visual)
  }

  const lines: HTMLElement[] = []
  let observer: ResizeObserver | undefined
  if (by === "lines") {
    if (runs.length === 1 && el.children.length === 2) {
      groupLines(runs[0]!, words, lines)
      let width = el.clientWidth
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => {
          if (el.clientWidth === width) return
          width = el.clientWidth
          requestAnimationFrame(() => splitText(el, "lines"))
        })
        observer.observe(el)
      }
    } else if (typeof console !== "undefined") {
      console.warn("[kinesis] splitText(..., 'lines') needs plain text; splitting into words instead", el)
    }
  }

  const result: SplitResult = {
    element: el,
    chars,
    words,
    lines,
    revert() {
      observer?.disconnect()
      el.replaceChildren(...original)
      results.delete(el)
    },
  }
  results.set(el, result)
  return result
}

function groupLines(run: HTMLElement, words: HTMLElement[], lines: HTMLElement[]): void {
  const tops = words.map((word) => word.offsetTop)
  run.replaceChildren()
  let line: HTMLElement | null = null
  let top = Number.NaN
  words.forEach((word, index) => {
    const wordTop = tops[index]!
    if (!line || Math.abs(wordTop - top) > 2) {
      line = unit("k-line", lines.length)
      line.style.display = "block"
      lines.push(line)
      run.append(line)
      top = wordTop
    } else {
      line.append(" ")
    }
    line.append(word)
  })
}

/** Splits every element with a `data-k-split` attribute ("chars", "words", or "lines"). */
export function splitAll(root: ParentNode = document): SplitResult[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-k-split]"), (el) => {
    const by = el.dataset.kSplit as SplitBy
    return splitText(el, by === "words" || by === "lines" ? by : "chars")
  })
}
