import { expect, test } from "@playwright/test"
import { computed, frames, mount, style, translation } from "./helpers"

const scope = "position:absolute;left:0;top:0;width:800px;height:600px"

test.describe("style ownership", () => {
  test("the author's transform and transform-origin are never touched", async ({ page }) => {
    await mount(page, {
      css: `
        [data-kinesis] { ${scope}; --k-motion: instant }
        .badge { position: absolute; left: 50%; top: 50%; width: 80px; height: 40px;
                 transform: translate(-50%, -50%); transform-origin: bottom left; --k-parallax: 20px }
      `,
      html: `<section data-kinesis><div class="badge"></div></section>`,
    })
    await page.mouse.move(800, 300)
    await frames(page, 3)
    expect(await style(page, ".badge", "transform")).toBe("")
    expect(await computed(page, ".badge", "transform")).toBe("matrix(1, 0, 0, 1, -40, -20)")
    expect(await computed(page, ".badge", "transform-origin")).toBe("0px 40px")
    expect(await translation(page, ".badge")).toEqual([-20, 0, 0])
    // At rest the element is exactly where the author put it.
    const box = await page.$eval(".badge", (el) => el.getBoundingClientRect().toJSON())
    expect(box.left).toBe(400 - 40 - 20)
  })

  test("author translate, rotate, and scale are composed", async ({ page }) => {
    await mount(page, {
      css: `
        [data-kinesis] { ${scope}; --k-motion: instant }
        .x { width: 40px; height: 40px; translate: 10px 5px; scale: 2; --k-parallax: 20px }
      `,
      html: `<section data-kinesis><div class="x"></div></section>`,
    })
    await page.mouse.move(800, 300)
    await frames(page, 3)
    expect(await style(page, ".x", "translate")).toContain("calc(")
    expect(await computed(page, ".x", "translate")).toBe("-10px 5px")
    expect(await computed(page, ".x", "scale")).toBe("2")
  })

  test("destroy restores inline styles exactly", async ({ page }) => {
    await mount(page, {
      css: `[data-kinesis] { ${scope}; --k-motion: instant }`,
      html: `<section data-kinesis><div class="x" style="opacity: 0.5; color: red; width: 40px; height: 40px">x</div></section>`,
      init: false,
    })
    const before = await page.$eval(".x", (el) => (el as HTMLElement).style.cssText)
    await page.evaluate(() => {
      window.K.initKinesis()
      const handle = window.K.kinesis(document.querySelector(".x")!, { parallax: 20, when: "near", opacity: [0.2, 1], color: "blue" })
      ;(window as unknown as { h: typeof handle }).h = handle
    })
    await page.mouse.move(800, 300)
    await frames(page, 3)
    expect(await page.$eval(".x", (el) => (el as HTMLElement).style.cssText)).not.toBe(before)
    await page.evaluate(() => (window as unknown as { h: { destroy(): void } }).h.destroy())
    await frames(page, 2)
    expect(await page.$eval(".x", (el) => (el as HTMLElement).style.cssText)).toBe(before)
  })

  test("tilt gets perspective from its parent, depth gets a preserve-3d chain, and both are restored", async ({ page }) => {
    await mount(page, {
      css: `
        [data-kinesis] { ${scope}; --k-motion: instant }
        .card { width: 300px; height: 200px; --k-tilt: 10deg }
        .title { --k-depth: 40px }
      `,
      html: `<section data-kinesis><div class="card"><div class="inner"><h2 class="title">Title</h2></div></div></section>`,
    })
    expect(await style(page, "[data-kinesis]", "perspective")).toBe("1000px")
    expect(await style(page, ".card", "transform-style")).toBe("preserve-3d")
    expect(await style(page, ".inner", "transform-style")).toBe("preserve-3d")
    expect(await style(page, ".title", "translate")).toBe("0px 0px 40px")
    await page.evaluate(() => window.K.initKinesis().destroy())
    expect(await style(page, "[data-kinesis]", "perspective")).toBe("")
    expect(await style(page, ".card", "transform-style")).toBe("")
    expect(await style(page, ".title", "translate")).toBe("")
  })
})
