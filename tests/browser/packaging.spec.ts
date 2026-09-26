import { expect, test } from "@playwright/test"
import { frames, mount, translation } from "./helpers"

test("the script-tag build starts itself and exposes window.Kinesis", async ({ page }) => {
  // Serve the built file byte for byte; the dev server would transform it as a module.
  await page.route("**/dist/kinesis.global.js", (route) =>
    route.fulfill({ path: "dist/kinesis.global.js", contentType: "text/javascript" }),
  )
  const response = await page.goto("/tests/browser/fixtures/global.html")
  expect(response?.status()).toBe(200)
  expect(await page.evaluate(() => typeof (window as unknown as { Kinesis?: { kinesis?: unknown } }).Kinesis?.kinesis)).toBe("function")
  await page.mouse.move(800, 300)
  await frames(page, 3)
  expect(await translation(page, ".layer")).toEqual([-20, 0, 0])
})

test("the Vue directive applies, updates, resets, and cleans up", async ({ page }) => {
  await mount(page, {
    css: `[data-kinesis] { position: absolute; left: 0; top: 0; width: 800px; height: 600px; --k-motion: instant }`,
    html: `<section data-kinesis><div class="card" style="width: 40px; height: 40px"></div></section>`,
  })
  await page.evaluate(async () => {
    // A browser URL served by Vite, not a Node module path.
    const url = "/src/vue.ts"
    const { vKinesis } = (await import(/* @vite-ignore */ url)) as typeof import("../../src/vue")
    const el = document.querySelector(".card")!
    ;(window as unknown as { dir: typeof vKinesis; el: Element }).dir = vKinesis
    ;(window as unknown as { el: Element }).el = el
    vKinesis.mounted(el, { value: { parallax: 20, when: "hover", opacity: [0.5, 1] } })
  })
  await page.mouse.move(800, 300)
  await frames(page, 3)
  expect(await translation(page, ".card")).toEqual([-20, 0, 0])
  expect(await page.$eval(".card", (el) => (el as HTMLElement).style.opacity)).toBe("0.5")

  // New props apply; props removed from the object go back to CSS (here: nothing).
  await page.evaluate(() => {
    const w = window as unknown as { dir: { updated(el: Element, b: object): void }; el: Element }
    w.dir.updated(w.el, { value: { parallax: 40 }, oldValue: { parallax: 20, when: "hover", opacity: [0.5, 1] } })
  })
  await page.mouse.move(799, 300)
  await page.mouse.move(800, 300)
  await frames(page, 3)
  expect(await translation(page, ".card")).toEqual([-40, 0, 0])
  expect(await page.$eval(".card", (el) => (el as HTMLElement).style.opacity)).toBe("")

  await page.evaluate(() => {
    const w = window as unknown as { dir: { beforeUnmount(el: Element): void }; el: Element }
    w.dir.beforeUnmount(w.el)
  })
  await frames(page, 2)
  expect(await page.$eval(".card", (el) => (el as HTMLElement).style.cssText)).toBe("width: 40px; height: 40px;")
})
