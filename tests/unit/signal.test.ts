import { beforeEach, describe, expect, it } from "vitest"
import { frame } from "../../src/frame"
import { computed, time, value } from "../../src/signal"

function nextFrame(dt = 1 / 60): void {
  frame.id += 1
  frame.dt = dt
  frame.now += dt * 1000
}

describe("signals", () => {
  beforeEach(() => nextFrame())

  it("maps and clamps by default", () => {
    const input = value(0.5)
    const mapped = input.map([0, 1], [0, 100])
    expect(mapped.get()).toBe(50)
    input.set(2)
    expect(mapped.get()).toBe(100)
    expect(input.map([0, 1], [0, 100], { clamp: false }).get()).toBe(200)
    expect(input.map((v) => v * 3).get()).toBe(6)
  })

  it("maps reversed ranges", () => {
    const input = value(0.25)
    expect(input.map([0, 1], [1, 0]).get()).toBe(0.75)
  })

  it("steps a shared spring once per frame, however many readers it has", () => {
    const input = value(0)
    const spring = input.spring("smooth")
    const a = spring.map((v) => v)
    const b = spring.map((v) => v * 2)
    const solo = value(0)
    const reference = solo.spring("smooth")

    input.set(100)
    solo.set(100)
    nextFrame()
    a.get()
    b.get()
    a.get()
    reference.get()
    expect(spring.get()).toBe(reference.get())
    expect(b.get()).toBe(reference.get() * 2)
  })

  it("reports activity while a spring moves and after a value changes", () => {
    const input = value(0)
    const spring = input.spring("snappy")
    expect(spring.active()).toBe(false)
    input.set(10)
    expect(input.active()).toBe(true)
    let frames = 0
    do {
      nextFrame()
      spring.get()
      frames += 1
    } while (spring.active() && frames < 500)
    expect(spring.get()).toBe(10)
    expect(frames).toBeLessThan(500)
    nextFrame()
    expect(input.active()).toBe(false)
  })

  it("tracks computed dependencies", () => {
    const a = value(2)
    const b = value(3)
    const product = computed(() => a.get() * b.get())
    expect(product.get()).toBe(6)
    nextFrame()
    nextFrame()
    expect(product.active()).toBe(false)
    b.set(4)
    expect(product.get()).toBe(8)
    expect(product.active()).toBe(true)
  })

  it("time always wants frames", () => {
    expect(time.active()).toBe(true)
  })
})
