import { expect, test } from "@playwright/test"
import { center, computed, frames, mount, style, translation } from "./helpers"

const scope = "position:absolute;left:0;top:0;width:1000px;height:700px"

test.describe("reactions", () => {
  test("near scales a dock icon by distance", async ({ page }) => {
    await mount(page, {
      css: `
        [data-kinesis] { ${scope}; --k-motion: instant }
        .icon { position: absolute; top: 300px; width: 48px; height: 48px; --k-when: near; --k-radius: 150px; --k-scale: 1.5 }
        .a { left: 100px } .b { left: 160px } .c { left: 500px }
      `,
      html: `<section data-kinesis><div class="icon a"></div><div class="icon b"></div><div class="icon c"></div></section>`,
    })
    const a = await center(page, ".a")
    await page.mouse.move(a.x, a.y)
    await frames(page, 3)
    expect(await style(page, ".a", "scale")).toBe("1.5")
    const b = Number(await style(page, ".b", "scale"))
    expect(b).toBeGreaterThan(1)
    expect(b).toBeLessThan(1.5)
    expect(await style(page, ".c", "scale")).toBe("")
    expect(await style(page, ".a", "--k-progress")).toBe("1")
  })

  test("press responds to pointer and keyboard", async ({ page }) => {
    await mount(page, {
      css: `
        [data-kinesis] { ${scope}; --k-motion: instant }
        button { --k-when: press; --k-scale: 0.9 }
      `,
      html: `<section data-kinesis><button>Press</button></section>`,
    })
    const { x, y } = await center(page, "button")
    await page.mouse.move(x, y)
    await page.mouse.down()
    await frames(page, 3)
    expect(await style(page, "button", "scale")).toBe("0.9")
    await page.mouse.up()
    await frames(page, 3)
    expect(await style(page, "button", "scale")).toBe("")
    await page.focus("button")
    await page.keyboard.down("Enter")
    await frames(page, 3)
    expect(await style(page, "button", "scale")).toBe("0.9")
    await page.keyboard.up("Enter")
    await frames(page, 3)
    expect(await style(page, "button", "scale")).toBe("")
  })

  test("hover also responds to keyboard focus", async ({ page }) => {
    await mount(page, {
      css: `
        [data-kinesis] { ${scope}; --k-motion: instant }
        a { display: inline-block; --k-when: hover; --k-y: -4px }
      `,
      html: `<section data-kinesis><a href="#">Link</a></section>`,
    })
    await page.keyboard.press("Tab")
    await frames(page, 3)
    expect(await style(page, "a", "translate")).toBe("0px -4px")
  })

  test("view reveals once and stays revealed", async ({ page }) => {
    await mount(page, {
      css: `
        .spacer { height: 2000px }
        .reveal { height: 100px; --k-when: view once; --k-motion: instant; --k-opacity: 0 1; --k-y: 40px 0px }
      `,
      html: `<section data-kinesis><div class="spacer"></div><div class="reveal">Hello</div><div class="spacer"></div></section>`,
    })
    expect(await style(page, ".reveal", "opacity")).toBe("0")
    await page.evaluate(() => document.querySelector(".reveal")!.scrollIntoView({ block: "center" }))
    await page.waitForTimeout(200)
    await frames(page, 3)
    expect(await style(page, ".reveal", "opacity")).toBe("1")
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(200)
    await frames(page, 3)
    expect(await style(page, ".reveal", "opacity")).toBe("1")
  })

  test("stagger delays siblings in order", async ({ page }) => {
    await mount(page, {
      css: `
        [data-kinesis] { ${scope} }
        li { --k-when: view; --k-motion: instant; --k-opacity: 0.5 1; --k-stagger: 200ms }
      `,
      html: `<section data-kinesis><ul><li>a</li><li>b</li><li>c</li></ul></section>`,
    })
    await page.waitForTimeout(100)
    const early = await page.$$eval("li", (items) => items.map((el) => (el as HTMLElement).style.opacity))
    expect(early[0]).toBe("1")
    expect(early[2]).toBe("0.5")
    await page.waitForTimeout(500)
    await frames(page, 2)
    const late = await page.$$eval("li", (items) => items.map((el) => (el as HTMLElement).style.opacity))
    expect(late).toEqual(["1", "1", "1"])
  })

  test("--k-progress and --k-pointer-* are readable by any CSS", async ({ page }) => {
    await mount(page, {
      css: `
        [data-kinesis] { ${scope}; --k-motion: instant }
        .glow { position: absolute; left: 100px; top: 100px; width: 200px; height: 100px; --k-track: pointer;
                --k-when: hover; width: calc(200px + var(--k-progress) * 0px) }
      `,
      html: `<section data-kinesis><div class="glow"></div></section>`,
    })
    await page.mouse.move(150, 125)
    await frames(page, 4)
    expect(await style(page, ".glow", "--k-pointer-x")).toBe("0.25")
    expect(await style(page, ".glow", "--k-pointer-y")).toBe("0.25")
    expect(await computed(page, ".glow", "--k-progress")).toBe("1")
  })
})

test.describe("pointer effects", () => {
  test("magnetic pulls toward the pointer and returns when it leaves", async ({ page }) => {
    await mount(page, {
      css: `
        [data-kinesis] { ${scope}; --k-motion: instant }
        .cta { position: absolute; left: 400px; top: 300px; width: 120px; height: 40px; --k-magnetic: 0.5; --k-radius: 150px }
      `,
      html: `<section data-kinesis><button class="cta">Buy</button></section>`,
    })
    const c = await center(page, ".cta")
    await page.mouse.move(c.x + 60, c.y)
    await frames(page, 3)
    const [x] = (await style(page, ".cta", "translate")).split(" ")
    expect(Number.parseFloat(x!)).toBeGreaterThan(5)
    await page.mouse.move(10, 10)
    await frames(page, 3)
    expect(await style(page, ".cta", "translate")).toBe("")
  })

  test("reduced motion holds transforms but keeps opacity reactions", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await mount(page, {
      css: `
        [data-kinesis] { ${scope}; --k-motion: instant }
        .layer { width: 40px; height: 40px; --k-parallax: 30px }
        .fade { position: absolute; left: 300px; top: 300px; width: 40px; height: 40px; --k-when: near; --k-opacity: 0.3 1; --k-scale: 1.5 }
      `,
      html: `<section data-kinesis><div class="layer"></div><div class="fade"></div></section>`,
    })
    const c = await center(page, ".fade")
    await page.mouse.move(c.x, c.y)
    await frames(page, 3)
    expect(await style(page, ".layer", "translate")).toBe("")
    expect(await style(page, ".fade", "opacity")).toBe("1")
    expect(await style(page, ".fade", "scale")).toBe("")
  })

  test("SVG elements move too", async ({ page }) => {
    await mount(page, {
      css: `
        [data-kinesis] { ${scope}; --k-motion: instant }
        circle { --k-parallax: 10px }
      `,
      html: `<section data-kinesis><svg width="400" height="300"><circle cx="100" cy="100" r="20" /></svg></section>`,
    })
    await page.mouse.move(1000, 350)
    await frames(page, 3)
    expect(await translation(page, "circle")).toEqual([-10, 0, 0])
  })

  test("nested scopes are independent", async ({ page }) => {
    await mount(page, {
      css: `
        .outer { position: absolute; left: 0; top: 0; width: 1000px; height: 700px; --k-motion: instant }
        .inner { position: absolute; left: 0; top: 0; width: 200px; height: 200px; --k-motion: instant }
        .layer { width: 20px; height: 20px; --k-parallax: 10px }
      `,
      html: `<section class="outer" data-kinesis><div class="layer" id="o"></div><section class="inner" data-kinesis><div class="layer" id="i"></div></section></section>`,
    })
    // Right edge of the outer scope: outside the inner scope, so only the outer layer moves.
    await page.mouse.move(1000, 350)
    await frames(page, 3)
    expect(await translation(page, "#o")).toEqual([-10, 0, 0])
    expect(await style(page, "#i", "translate")).toBe("")
  })
})

test.describe("spin", () => {
  test("spin turns with the pointer's horizontal position", async ({ page }) => {
    await mount(page, {
      css: `
        [data-kinesis] { ${scope}; --k-motion: instant }
        .wheel { width: 60px; height: 60px; --k-spin: 180deg }
      `,
      html: `<section data-kinesis><div class="wheel"></div></section>`,
    })
    await page.mouse.move(750, 350)
    await frames(page, 3)
    expect(await style(page, ".wheel", "rotate")).toBe("90deg")
    await page.mouse.move(0, 350)
    await frames(page, 3)
    expect(await style(page, ".wheel", "rotate")).toBe("-180deg")
  })
})

test.describe("drag", () => {
  test("drags within bounds and throws", async ({ page }) => {
    await mount(page, {
      css: `
        .box { position: absolute; left: 0; top: 0; width: 400px; height: 300px }
        .knob { width: 50px; height: 50px; background: #333; --k-drag: both; --k-bounds: parent; --k-release: stay }
      `,
      html: `<section data-kinesis class="box"><div class="knob"></div></section>`,
    })
    await page.mouse.move(25, 25)
    await page.mouse.down()
    await page.mouse.move(125, 75, { steps: 5 })
    await frames(page, 2)
    expect(await translation(page, ".knob")).toEqual([100, 50, 0])
    expect(await page.$eval(".knob", (el) => el.hasAttribute("data-kinesis-dragging"))).toBe(true)
    await page.mouse.move(1000, 75, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(800)
    const [x, y] = await translation(page, ".knob")
    expect(x).toBeCloseTo(350, 0)
    expect(y).toBe(50)
  })

  test("release: return springs home and emits events", async ({ page }) => {
    await mount(page, {
      css: `.knob { width: 50px; height: 50px; --k-drag: x; --k-release: return; --k-motion: snappy }`,
      html: `<section data-kinesis style="position:absolute;inset:0"><div class="knob"></div></section>`,
    })
    await page.evaluate(() => {
      ;(window as unknown as { events: string[] }).events = []
      const handle = window.K.kinesis(document.querySelector(".knob")!)
      for (const name of ["dragstart", "dragend"] as const) {
        handle.on(name, () => (window as unknown as { events: string[] }).events.push(name))
      }
    })
    await page.mouse.move(25, 25)
    await page.mouse.down()
    await page.mouse.move(200, 200, { steps: 5 })
    await frames(page, 2)
    expect(await translation(page, ".knob")).toEqual([175, 0, 0])
    await page.mouse.up()
    await page.waitForTimeout(1200)
    expect(await style(page, ".knob", "translate")).toBe("")
    expect(await page.evaluate(() => (window as unknown as { events: string[] }).events)).toEqual(["dragstart", "dragend"])
  })
})

test.describe("JavaScript API", () => {
  test("kinesis() uses the CSS vocabulary; reset() returns to CSS", async ({ page }) => {
    await mount(page, {
      css: `
        [data-kinesis] { ${scope}; --k-motion: instant }
        .card { width: 100px; height: 100px; --k-parallax: 10px }
      `,
      html: `<section data-kinesis><div class="card"></div></section>`,
    })
    await page.mouse.move(1000, 350)
    await frames(page, 3)
    expect(await translation(page, ".card")).toEqual([-10, 0, 0])
    await page.evaluate(() => {
      ;(window as unknown as { card: unknown }).card = window.K.kinesis(document.querySelector(".card")!, { parallax: 50 })
    })
    await frames(page, 3)
    expect(await translation(page, ".card")).toEqual([-50, 0, 0])
    await page.evaluate(() => (window as unknown as { card: { reset(): void } }).card.reset())
    await frames(page, 3)
    expect(await translation(page, ".card")).toEqual([-10, 0, 0])
  })

  test("bind() drives channels and custom properties from signals", async ({ page }) => {
    await mount(page, {
      css: `[data-kinesis] { ${scope} }`,
      html: `<section data-kinesis><div class="meter" style="width:10px;height:10px"></div></section>`,
    })
    await page.evaluate(() => {
      const level = window.K.value(0)
      ;(window as unknown as { level: typeof level }).level = level
      window.K.kinesis(document.querySelector(".meter")!).bind({
        scale: level.map([0, 1], [1, 2]),
        "--level": level,
      })
    })
    await page.evaluate(() => (window as unknown as { level: { set(v: number): void } }).level.set(0.5))
    await frames(page, 3)
    expect(await style(page, ".meter", "scale")).toBe("1.5")
    expect(await style(page, ".meter", "--level")).toBe("0.5")
  })

  test("handles expose near and pointer signals for custom motion", async ({ page }) => {
    await mount(page, {
      css: `[data-kinesis] { ${scope} } .hub { position: absolute; left: 200px; top: 200px; width: 100px; height: 100px }`,
      html: `<section data-kinesis><div class="hub"></div></section>`,
    })
    await page.evaluate(() => {
      const { kinesis, computed } = window.K
      const hub = kinesis(document.querySelector(".hub")!, { radius: 100 })
      hub.bind({
        rotate: computed(() => (Math.atan2(hub.pointer.y.get(), hub.pointer.x.get()) * 180) / Math.PI),
        "--near": hub.near,
      })
    })
    await page.mouse.move(250, 350)
    await frames(page, 3)
    expect(await style(page, ".hub", "rotate")).toBe("90deg")
    expect(Number(await style(page, ".hub", "--near"))).toBe(0)
    await page.mouse.move(260, 250)
    await frames(page, 3)
    expect(Number(await style(page, ".hub", "--near"))).toBeGreaterThan(0.9)
  })

  test("elements outside any scope can still be animated", async ({ page }) => {
    await mount(page, {
      css: `.free { position: absolute; left: 100px; top: 100px; width: 40px; height: 40px }`,
      html: `<div class="free"></div>`,
      init: false,
    })
    await page.evaluate(() => window.K.kinesis(".free", { look: 20, radius: 100, motion: "instant" }))
    await page.mouse.move(600, 120)
    await frames(page, 3)
    expect(await style(page, ".free", "rotate")).toBe("y 20deg")
  })
})

test.describe("text", () => {
  test("splitText keeps the text accessible and numbers the units", async ({ page }) => {
    await mount(page, {
      html: `<h1 class="title">Hi <a href="#">there</a></h1>`,
      init: false,
    })
    const result = await page.evaluate(() => {
      const split = window.T.splitText(".title", "chars")
      const title = document.querySelector(".title")!
      return {
        chars: split.chars.map((el) => el.textContent),
        indexes: split.chars.map((el) => el.style.getPropertyValue("--k-index")),
        hidden: [...title.querySelectorAll("[aria-hidden=true]")].length,
        spoken: [...title.querySelectorAll(".k-sr")].map((el) => el.textContent).join(""),
        linkStillThere: title.querySelector("a")?.getAttribute("href"),
      }
    })
    expect(result.chars).toEqual(["H", "i", "t", "h", "e", "r", "e"])
    expect(result.indexes).toEqual(["0", "1", "2", "3", "4", "5", "6"])
    expect(result.hidden).toBe(2)
    expect(result.spoken).toBe("Hi there")
    expect(result.linkStillThere).toBe("#")
    const accessible = await page.getByRole("heading", { name: "Hi there" }).count()
    expect(accessible).toBe(1)
  })
})
