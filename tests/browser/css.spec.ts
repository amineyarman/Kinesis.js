import { expect, test } from "@playwright/test"
import { center, computed, frames, mount, style, translation } from "./helpers"

const scope = "position:absolute;left:0;top:0;width:800px;height:600px"

test.describe("CSS resolution", () => {
  test("calc(), var(), em, and vw are resolved by the browser", async ({ page }) => {
    await mount(page, {
      css: `
        [data-kinesis] { ${scope}; --space: 10px; --k-motion: instant }
        .calc { width: 40px; height: 40px; --k-parallax: calc(var(--space) * 3) }
        .em { width: 40px; height: 40px; font-size: 40px; --k-parallax: 2em }
        .vw { width: 40px; height: 40px; --k-parallax: 5vw }
      `,
      html: `<section data-kinesis><div class="calc"></div><div class="em"></div><div class="vw"></div></section>`,
    })
    // Pointer at the right edge, vertical middle: parallax moves each layer left by its full amount.
    await page.mouse.move(800, 300)
    await frames(page, 3)
    expect(await translation(page, ".calc")).toEqual([-30, 0, 0])
    expect(await translation(page, ".em")).toEqual([-80, 0, 0])
    const vw = await page.evaluate(() => window.innerWidth * 0.05)
    expect(await translation(page, ".vw")).toEqual([-vw, 0, 0])
  })

  test("named, modern, and mixed colors all animate", async ({ page }) => {
    await mount(page, {
      css: `
        [data-kinesis] { ${scope}; --k-motion: instant }
        .a { width: 50px; height: 50px; color: black; --k-when: hover; --k-color: tomato }
        .b { width: 50px; height: 50px; --k-when: hover; --k-background: oklch(70% 0.2 30) }
        .c { width: 50px; height: 50px; --k-when: hover; --k-color: color-mix(in srgb, red, blue) }
      `,
      html: `<section data-kinesis><div class="a">a</div><div class="b">b</div><div class="c">c</div></section>`,
    })
    const hover = async (selector: string) => {
      const { x, y } = await center(page, selector)
      await page.mouse.move(x, y)
      await frames(page, 3)
    }
    await hover(".a")
    expect(await computed(page, ".a", "color")).toBe("rgb(255, 99, 71)")
    await hover(".b")
    expect(await computed(page, ".b", "background-color")).toMatch(/^oklch\(0\.7 0\.2 30\)$/)
    expect(await computed(page, ".a", "color")).toBe("rgb(0, 0, 0)")
    await hover(".c")
    expect(await computed(page, ".c", "color")).toMatch(/^color\(srgb 0\.5 0 0\.5\)$|^rgb\(128, 0, 128\)$/)
  })

  test(":hover rules retune the element even when the pointer lands on a child", async ({ page }) => {
    await mount(page, {
      css: `
        [data-kinesis] { ${scope}; --k-motion: instant }
        .card { position: absolute; left: 100px; top: 100px; width: 200px; height: 200px; --k-tilt: 2deg; --k-area: self }
        .card:hover { --k-tilt: 20deg }
        .card p { margin: 0; width: 100%; height: 100% }
      `,
      html: `<section data-kinesis><div class="card"><p>child</p></div></section>`,
    })
    // Halfway to the right edge, vertical middle: half the hovered tilt, around Y.
    await page.mouse.move(250, 200)
    await frames(page, 4)
    expect(await style(page, ".card", "rotate")).toBe("y 10deg")
  })

  test("interaction properties do not leak to descendants", async ({ page }) => {
    await mount(page, {
      css: `
        [data-kinesis] { ${scope}; --k-motion: instant }
        .parent { width: 300px; height: 300px; --k-parallax: 40px }
      `,
      html: `<section data-kinesis><div class="parent"><div class="child">x</div></div></section>`,
    })
    await page.mouse.move(800, 300)
    await frames(page, 3)
    expect(await style(page, ".parent", "translate")).not.toBe("")
    expect(await style(page, ".child", "translate")).toBe("")
  })

  test("media queries change motion on resize", async ({ page }) => {
    await mount(page, {
      css: `
        [data-kinesis] { ${scope}; --k-motion: instant }
        .layer { width: 40px; height: 40px; --k-parallax: 30px }
        @media (max-width: 900px) { .layer { --k-parallax: 10px } }
      `,
      html: `<section data-kinesis><div class="layer"></div></section>`,
    })
    await page.mouse.move(800, 300)
    await frames(page, 3)
    expect(await translation(page, ".layer")).toEqual([-30, 0, 0])
    await page.setViewportSize({ width: 850, height: 800 })
    await page.waitForTimeout(350)
    await page.mouse.move(799, 300)
    await page.mouse.move(800, 300)
    await frames(page, 4)
    expect(await translation(page, ".layer")).toEqual([-10, 0, 0])
  })
})
