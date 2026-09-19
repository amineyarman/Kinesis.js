import { expect, it } from "vitest"
import { kinesisRegistry, kinesisRegistryMap, publicShipInteractions, registryLane } from "../spec/registry"

it("ships a small public language", () => {
  expect(publicShipInteractions().map((entry) => entry.id).sort()).toEqual([
    "depth",
    "drag",
    "face",
    "follow",
    "magnetic",
    "parallax",
    "path",
    "repel",
    "tilt",
    "trail",
    "wave",
  ])
  expect(kinesisRegistryMap.attract.status).toBe("FOLDED")
  expect(kinesisRegistryMap.attract.publicPrimitive).toBe(false)
  expect(kinesisRegistryMap.ripple.status).toBe("RECIPE")
  expect(kinesisRegistryMap.lens.status).toBe("RECIPE")
  expect(kinesisRegistryMap.bend.status).toBe("RECIPE")
  expect(kinesisRegistryMap.drag.ready).toBe(true)
  expect(registryLane(kinesisRegistryMap.scroll)).toBe("source")
  expect(registryLane(kinesisRegistryMap.orbit)).toBe("next")
  expect(registryLane(kinesisRegistryMap.wake)).toBe("lab")
  expect(kinesisRegistry.every((entry) => entry.id && entry.kind && entry.status)).toBe(true)
})
