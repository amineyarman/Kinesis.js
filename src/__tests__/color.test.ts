import { expect, it } from "vitest"
import { composeFilter, lerpColor, parseColor, serializeColor } from "../color"
import { responseChannels, responseChannelMap } from "../spec/responses"

it("parses hex and mixes in oklab", () => {
  const from = parseColor("#000")
  const to = parseColor("#fff")
  expect(from).toBeTruthy()
  expect(to).toBeTruthy()
  const mid = serializeColor(lerpColor(from!, to!, 0.5))
  const rgb = mid.match(/\d+/g)?.map(Number) ?? []
  expect(rgb[0]).toBe(rgb[1])
  expect(rgb[1]).toBe(rgb[2])
  expect(rgb[0]).toBeGreaterThan(80)
  expect(rgb[0]).toBeLessThan(200)
})

it("parses rgb and transparent", () => {
  expect(serializeColor(parseColor("rgb(255, 0, 0)")!)).toBe("rgb(255, 0, 0)")
  expect(parseColor("transparent")?.alpha).toBe(0)
  expect(parseColor("none")).toBeNull()
})

it("composeFilter skips identity and caps blur", () => {
  expect(composeFilter(0, 1, 1, 1)).toBe("")
  expect(composeFilter(4, 1, 1, 1)).toBe("blur(4.00px)")
  expect(composeFilter(40, 1.2, 1, 1)).toBe("blur(16.00px) brightness(1.200)")
})

it("response channels are a closed catalog", () => {
  expect(responseChannelMap.opacity?.cost).toBe("A")
  expect(responseChannelMap.color?.cost).toBe("B")
  expect(responseChannelMap.blur?.cost).toBe("C")
  expect(responseChannels.every((entry) => entry.ready)).toBe(true)
})
