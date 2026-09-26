import { describe, expect, it } from "vitest"
import { fmt, parseAngle, parseRotate, parseTime, rotateValue, shortestAngle, splitTokens } from "../../src/math"

type Matrix = number[][]

const multiply = (a: Matrix, b: Matrix): Matrix =>
  a.map((row, i) => row.map((_, j) => a[i]!.reduce((sum, _, k) => sum + a[i]![k]! * b[k]![j]!, 0)))

/** The rotate3d() matrix exactly as defined by CSS Transforms 2. */
function rotate3d(x: number, y: number, z: number, degrees: number): Matrix {
  const length = Math.hypot(x, y, z)
  ;[x, y, z] = [x / length, y / length, z / length]
  const half = (degrees * Math.PI) / 360
  const sc = Math.sin(half) * Math.cos(half)
  const sq = Math.sin(half) ** 2
  return [
    [1 - 2 * (y * y + z * z) * sq, 2 * (x * y * sq - z * sc), 2 * (x * z * sq + y * sc)],
    [2 * (x * y * sq + z * sc), 1 - 2 * (x * x + z * z) * sq, 2 * (y * z * sq - x * sc)],
    [2 * (x * z * sq - y * sc), 2 * (y * z * sq + x * sc), 1 - 2 * (x * x + y * y) * sq],
  ]
}

const fromValue = (value: string): Matrix => {
  const tokens = value.split(" ")
  if (tokens.length === 1) return rotate3d(0, 0, 1, Number.parseFloat(tokens[0]!))
  const [x, y, z, angle] = tokens
  return rotate3d(Number(x), Number(y), Number(z), Number.parseFloat(angle!))
}

const expectMatrix = (actual: Matrix, expected: Matrix) => {
  actual.forEach((row, i) => row.forEach((cell, j) => expect(cell).toBeCloseTo(expected[i]![j]!, 3)))
}

describe("rotateValue", () => {
  const cases: [number, number, number][] = [
    [10, 0, 0],
    [0, -14, 0],
    [8, 12, 0],
    [-20, 5, 33],
    [3, -7, 170],
    [45, 45, 45],
  ]
  for (const [rx, ry, rz] of cases) {
    it(`matches rotateX(${rx}) rotateY(${ry}) rotateZ(${rz})`, () => {
      const expected = multiply(multiply(rotate3d(1, 0, 0, rx), rotate3d(0, 1, 0, ry)), rotate3d(0, 0, 1, rz))
      expectMatrix(fromValue(rotateValue(rx, ry, rz)), expected)
    })
  }

  it("composes with the author's rotate, Kinesis on the outside", () => {
    const author = parseRotate("y 30deg")
    const expected = multiply(rotate3d(1, 0, 0, 12), rotate3d(0, 1, 0, 30))
    expectMatrix(fromValue(rotateValue(12, 0, 0, author)), expected)
  })

  it("uses a plain angle for 2D rotation and nothing for none", () => {
    expect(rotateValue(0, 0, 90)).toBe("90deg")
    expect(rotateValue(0, 0, 0)).toBe("")
  })
})

describe("parsing", () => {
  it("splits tokens outside parentheses", () => {
    expect(splitTokens("rgb(255, 0, 0) oklch(70% 0.2 30)")).toEqual(["rgb(255, 0, 0)", "oklch(70% 0.2 30)"])
    expect(splitTokens("  30px   16px ")).toEqual(["30px", "16px"])
    expect(splitTokens("calc(50% - 10px) 4px")).toEqual(["calc(50% - 10px)", "4px"])
  })

  it("parses rotate values in every computed form", () => {
    expect(parseRotate("none")).toBeNull()
    expect(parseRotate("45deg")!.z).toBeCloseTo(Math.sin(Math.PI / 8))
    expect(parseRotate("x 90deg")!.x).toBeCloseTo(Math.SQRT1_2)
    expect(parseRotate("0 1 0 90deg")!.y).toBeCloseTo(Math.SQRT1_2)
  })

  it("parses angles and times", () => {
    expect(parseAngle("0.25turn")).toBe(90)
    expect(parseAngle("100grad")).toBe(90)
    expect(parseAngle(`${Math.PI}rad`)).toBeCloseTo(180)
    expect(parseTime("0.06s")).toBeCloseTo(60)
    expect(parseTime("250ms")).toBe(250)
  })

  it("formats numbers compactly", () => {
    expect(fmt(1.5)).toBe("1.5")
    expect(fmt(2)).toBe("2")
    expect(fmt(-0.0001)).toBe("0")
    expect(fmt(3.14159, 2)).toBe("3.14")
  })

  it("takes the short way around", () => {
    expect(shortestAngle(170, -170)).toBe(20)
    expect(shortestAngle(-170, 170)).toBe(-20)
    expect(shortestAngle(0, 90)).toBe(90)
  })
})
