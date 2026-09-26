import { expect, test } from "@playwright/test"
import { countStyleReads, frames, mount } from "./helpers"

const page2000 = `
  <section data-kinesis style="position:relative">
    <div class="layer" style="width:40px;height:40px"></div>
    ${Array.from({ length: 400 }, () => '<p>Lorem <a href="#">ipsum</a> dolor <em>sit</em> amet <span>x</span></p>').join("")}
  </section>`

test.describe("performance contract", () => {
  test("discovery of ~2,000 elements stays cheap", async ({ page }) => {
    await mount(page, { css: ".layer { --k-parallax: 20px }", html: page2000, init: false })
    const elapsed = await page.evaluate(() => {
      const start = performance.now()
      window.K.initKinesis()
      return new Promise<number>((resolve) => requestAnimationFrame(() => resolve(performance.now() - start)))
    })
    // Generous for CI machines; typically a few ms.
    expect(elapsed).toBeLessThan(60)
  })

  test("a class change rescans only the changed subtree", async ({ page }) => {
    await mount(page, { css: ".layer { --k-parallax: 20px }", html: page2000 })
    const reads = await countStyleReads(page, `document.querySelector("section p").classList.add("active")`)
    expect(reads).toBeLessThan(10)
  })

  test("set() from JavaScript never triggers discovery", async ({ page }) => {
    await mount(page, { css: ".layer { --k-parallax: 20px }", html: page2000 })
    await page.evaluate(() => {
      ;(window as unknown as { card: unknown }).card = window.K.kinesis(document.querySelector(".layer")!)
    })
    await frames(page, 3)
    const reads = await countStyleReads(
      page,
      `for (let i = 0; i < 20; i++) window.card.set({ parallax: i, tilt: i })`,
    )
    // At most the one-time perspective check for the new 3D chain; never a scan.
    expect(reads).toBeLessThan(3)
  })

  test("an idle page requests no animation frames", async ({ page }) => {
    await mount(page, { css: ".layer { --k-parallax: 20px }", html: page2000 })
    await page.mouse.move(100, 100)
    await page.waitForTimeout(1500)
    const requested = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let count = 0
          const original = window.requestAnimationFrame
          window.requestAnimationFrame = (fn) => {
            count += 1
            return original(fn)
          }
          setTimeout(() => {
            window.requestAnimationFrame = original
            resolve(count)
          }, 500)
        }),
    )
    expect(requested).toBe(0)
  })

  test("elements added later are discovered, and removed ones are released", async ({ page }) => {
    await mount(page, { css: `.late { width: 40px; height: 40px; --k-parallax: 20px; --k-motion: instant }`, html: `<section data-kinesis style="position:absolute;inset:0"></section>` })
    await page.evaluate(() => document.querySelector("section")!.insertAdjacentHTML("beforeend", '<div class="late"></div>'))
    await frames(page, 3)
    await page.mouse.move(1199, 400)
    await frames(page, 3)
    expect(await page.$eval(".late", (el) => (el as HTMLElement).style.translate)).not.toBe("")
  })

  test("scopes added later are discovered without calling initKinesis again", async ({ page }) => {
    await mount(page, { css: `.late { width: 40px; height: 40px; --k-parallax: 20px; --k-motion: instant }`, html: "" })
    await page.evaluate(() =>
      document.body.insertAdjacentHTML("beforeend", '<section data-kinesis style="position:absolute;inset:0"><div class="late"></div></section>'),
    )
    await frames(page, 3)
    await page.mouse.move(1199, 400)
    await frames(page, 3)
    expect(await page.$eval(".late", (el) => (el as HTMLElement).style.translate)).not.toBe("")
  })
})
