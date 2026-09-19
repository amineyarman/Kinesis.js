import type { MotionPresetSpec } from "./types"

export const motionPresets: MotionPresetSpec[] = [
  { name: "instant", label: "Instant", stiffness: 1200, damping: 80, mass: 1 },
  { name: "smooth", label: "Smooth", stiffness: 140, damping: 22, mass: 1 },
  { name: "soft", label: "Soft", stiffness: 90, damping: 20, mass: 1 },
  { name: "snappy", label: "Snappy", stiffness: 280, damping: 24, mass: 1 },
  { name: "elastic", label: "Elastic", stiffness: 200, damping: 12, mass: 1 },
  { name: "heavy", label: "Heavy", stiffness: 70, damping: 28, mass: 1.4 },
]

export const defaultMotionPreset = "smooth"

export function getMotionPreset(name: string): MotionPresetSpec {
  return motionPresets.find((preset) => preset.name === name) ?? motionPresets[1]!
}
