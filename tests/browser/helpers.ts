import type { Page } from "@playwright/test"

declare global {
  interface Window {
    K: typeof import("../../src/index")
    T: typeof import("../../src/text")
    ready: boolean
  }
}

export interface Fixture {
  css?: string
  html: string
  init?: boolean
}

/** Loads the blank fixture, injects markup and styles, and starts Kinesis. */
export async function mount(page: Page, { css = "", html, init = true }: Fixture): Promise<void> {
  await page.goto("/tests/browser/fixtures/blank.html")
  await page.waitForFunction(() => window.ready)
  await page.evaluate(
    ({ css, html, init }) => {
      const style = document.createElement("style")
      style.textContent = css
      document.head.append(style)
      document.body.insertAdjacentHTML("beforeend", html)
      if (init) window.K.initKinesis()
    },
    { css, html, init },
  )
  await frames(page, 3)
}

export const frames = (page: Page, count = 2): Promise<void> =>
  page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let seen = 0
        const step = () => (++seen >= count ? resolve() : requestAnimationFrame(step))
        requestAnimationFrame(step)
      }),
    count,
  )

export const style = (page: Page, selector: string, property: string): Promise<string> =>
  page.$eval(selector, (el, property) => (el as HTMLElement).style.getPropertyValue(property), property)

export const computed = (page: Page, selector: string, property: string): Promise<string> =>
  page.$eval(selector, (el, property) => getComputedStyle(el).getPropertyValue(property), property)

/** Center of an element in client coordinates, ignoring any transform Kinesis applied. */
export async function center(page: Page, selector: string): Promise<{ x: number; y: number }> {
  return page.$eval(selector, (el) => {
    const s = (el as HTMLElement).style
    const saved = { translate: s.translate, rotate: s.rotate, scale: s.scale }
    s.translate = s.rotate = s.scale = ""
    const r = el.getBoundingClientRect()
    Object.assign(s, saved)
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
}

/** Counts getComputedStyle calls made while `action` runs, plus the frames after it. */
export async function countStyleReads(page: Page, action: string, settle = 3): Promise<number> {
  await page.evaluate(() => {
    const original = window.getComputedStyle
    ;(window as unknown as { __reads: number }).__reads = 0
    window.getComputedStyle = function (...args: Parameters<typeof getComputedStyle>) {
      ;(window as unknown as { __reads: number }).__reads += 1
      return original.apply(this, args)
    }
    ;(window as unknown as { __restore: () => void }).__restore = () => {
      window.getComputedStyle = original
    }
  })
  await page.evaluate(action)
  await frames(page, settle)
  return page.evaluate(() => {
    ;(window as unknown as { __restore: () => void }).__restore()
    return (window as unknown as { __reads: number }).__reads
  })
}

/** The `translate` Kinesis wrote, as numbers. Browsers drop trailing zero components. */
export async function translation(page: Page, selector: string): Promise<[number, number, number]> {
  const value = await style(page, selector, "translate")
  const [x = 0, y = 0, z = 0] = value ? value.split(" ").map(Number.parseFloat) : []
  return [x, y, z]
}
