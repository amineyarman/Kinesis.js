export { createKinesis, initKinesis, kinesis, refresh } from "./api"
export type {
  Bindings,
  DragDetail,
  KinesisApp,
  KinesisEvent,
  KinesisScope,
  KinesisTarget,
  KinesisTargets,
} from "./api"
export type {
  Area,
  Axis,
  Bounds,
  ColorRange,
  DragAxis,
  KinesisProps,
  Range,
  Release,
  When,
} from "./config"
export { requestOrientation } from "./input"
export { properties } from "./properties"
export type { PropertyDefinition } from "./properties"
export { configure } from "./settings"
export type { KinesisOptions, ReducedMotion } from "./settings"
export { computed, pointer, scroll, Signal, time, value } from "./signal"
export type { MapOptions, ValueSignal } from "./signal"
export { presets } from "./spring"
export type { MotionPreset, SpringOptions } from "./spring"
export type { Channel } from "./target"

export const version = "2.0.0"
