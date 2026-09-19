export { initKinesis, createKinesis, getKinesis } from "./runtime"
export type { KinesisApp, KinesisScope, MotionHandle, PointerSignals, OrientationSignals, ProximitySignals, ViewSignals, ScrollSignals } from "./runtime"
export { KSignal } from "./signal"
export { KinesisAudio, audioBands, bandEnergy, hzToBin, peakEnergy, resolveBand } from "./audio"
export type { AudioBandName, AudioSourceInput } from "./audio"
export {
  cssProperties,
  cssPropertyMap,
  catalogProperties,
  motionPresets,
  defaultMotionPreset,
  getMotionPreset,
} from "./spec"
export type {
  CssPropertySpec,
  MotionPresetSpec,
  PreviewKind,
  PropertyCategory,
  PropertyStatus,
} from "./spec"
