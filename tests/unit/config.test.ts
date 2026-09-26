import { describe, expect, it } from "vitest"
import { isActive, propsToConfig, readConfig, usesKinesis, usesPointer } from "../../src/config"
import { properties } from "../../src/properties"
import { presets } from "../../src/spring"

/** A computed style as the browser returns it for registered properties: resolved, canonical units. */
function computed(values: Record<string, string>): CSSStyleDeclaration {
  const initial = Object.fromEntries(properties.map((property) => [property.name, property.initial]))
  const all: Record<string, string> = { ...initial, "font-size": "16px", ...values }
  return {
    getPropertyValue: (name: string) => all[name] ?? "",
    fontSize: all["font-size"],
  } as unknown as CSSStyleDeclaration
}

describe("discovery", () => {
  it("ignores elements that only carry defaults", () => {
    expect(usesKinesis(computed({}))).toBe(false)
    expect(usesKinesis(computed({ "--k-parallax": "0px 0px", "--k-motion": "bouncy" }))).toBe(false)
  })

  it("finds each trigger", () => {
    const triggers: Record<string, string> = {
      "--k-parallax": "30px",
      "--k-tilt": "8deg",
      "--k-magnetic": "0.3",
      "--k-repel": "20px",
      "--k-follow": "1",
      "--k-look": "12deg",
      "--k-point": "0deg",
      "--k-spin": "20deg",
      "--k-depth": "40px",
      "--k-drag": "x",
      "--k-when": "view",
      "--k-track": "pointer",
    }
    for (const [name, value] of Object.entries(triggers)) {
      expect(usesKinesis(computed({ [name]: value })), name).toBe(true)
    }
  })

  it("also works with unregistered (untyped, empty) properties", () => {
    const style = { getPropertyValue: () => "", fontSize: "16px" } as unknown as CSSStyleDeclaration
    expect(usesKinesis(style)).toBe(false)
  })
})

describe("readConfig", () => {
  it("reads pairs and single values", () => {
    const config = readConfig(computed({ "--k-parallax": "30px 16px", "--k-tilt": "8deg" }))
    expect(config.parallax).toEqual([30, 16])
    expect(config.tilt).toEqual([8, 8])
  })

  it("reads ranges: one value means from rest", () => {
    const config = readConfig(
      computed({
        "--k-when": "view once",
        "--k-y": "40px 0px",
        "--k-scale": "1.2",
        "--k-opacity": "0 1",
        "--k-rotate": "90deg",
        "--k-color": "rgb(255, 0, 0)",
        "--k-background": "rgb(0, 0, 0) oklch(0.7 0.2 30)",
      }),
    )
    expect(config.when).toBe("view")
    expect(config.once).toBe(true)
    expect(config.y).toEqual([40, 0])
    expect(config.scale).toEqual([1, 1.2])
    expect(config.opacity).toEqual([0, 1])
    expect(config.rotate).toEqual([0, 90])
    expect(config.color).toEqual(["", "rgb(255, 0, 0)"])
    expect(config.background).toEqual(["rgb(0, 0, 0)", "oklch(0.7 0.2 30)"])
    expect(config.x).toBeNull()
  })

  it("reads motion presets and custom springs", () => {
    expect(readConfig(computed({ "--k-motion": "bouncy" })).motion).toBe(presets.bouncy)
    expect(readConfig(computed({ "--k-motion": "300 20" })).motion).toEqual({ stiffness: 300, damping: 20, mass: 1 })
    expect(readConfig(computed({ "--k-motion": "instant" })).motion).toBeNull()
  })

  it("warns about unknown keywords and falls back", () => {
    const warnings: string[] = []
    const config = readConfig(computed({ "--k-when": "hovr", "--k-motion": "wobbly" }), (m) => warnings.push(m))
    expect(config.when).toBe("")
    expect(config.motion).toBe(presets.smooth)
    expect(warnings).toHaveLength(2)
  })

  it("reads modifiers", () => {
    const config = readConfig(
      computed({
        "--k-area": "self",
        "--k-radius": "120px",
        "--k-limit": "8px",
        "--k-axis": "x",
        "--k-drag": "both",
        "--k-bounds": "parent",
        "--k-release": "return",
        "--k-stagger": "0.04s",
        "--k-index": "3",
        "--k-point": "90deg",
      }),
    )
    expect(config.area).toBe("self")
    expect(config.radius).toBe(120)
    expect(config.limit).toBe(8)
    expect(config.axis).toBe("x")
    expect(config.drag).toBe("both")
    expect(config.bounds).toBe("parent")
    expect(config.release).toBe("return")
    expect(config.stagger).toBeCloseTo(40)
    expect(config.index).toBe(3)
    expect(config.point).toBe(90)
  })

  it("leaves point unset by default and limits unbounded", () => {
    const config = readConfig(computed({}))
    expect(Number.isNaN(config.point)).toBe(true)
    expect(config.limit).toBe(Number.POSITIVE_INFINITY)
    expect(isActive(config)).toBe(false)
  })
})

describe("propsToConfig", () => {
  it("only returns what was passed", () => {
    expect(propsToConfig({ tilt: 8 })).toEqual({ tilt: [8, 8] })
  })

  it("normalizes like CSS", () => {
    const config = propsToConfig({
      parallax: [20, 10],
      when: "view once",
      y: [40, 0],
      scale: 1.1,
      color: "tomato",
      motion: "bouncy",
      drag: "x",
      track: true,
    })
    expect(config.parallax).toEqual([20, 10])
    expect(config.when).toBe("view")
    expect(config.once).toBe(true)
    expect(config.y).toEqual([40, 0])
    expect(config.scale).toEqual([1, 1.1])
    expect(config.color).toEqual(["", "tomato"])
    expect(config.motion).toBe(presets.bouncy)
    expect(config.drag).toBe("x")
    expect(config.track).toBe(true)
  })

  it("clears with null", () => {
    expect(propsToConfig({ drag: null, point: null, when: null })).toMatchObject({ drag: "", when: "" })
  })

  it("knows which configs need the pointer", () => {
    const base = readConfig(computed({}))
    expect(usesPointer({ ...base, when: "near" })).toBe(true)
    expect(usesPointer({ ...base, when: "view" })).toBe(false)
  })
})
