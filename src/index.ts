export { initKinesis, createKinesis, getKinesis } from "./runtime"
export type {
  KinesisApp,
  KinesisScope,
  MotionHandle,
  PointerSignals,
  OrientationSignals,
  ProximitySignals,
  ViewSignals,
  ScrollSignals,
  GroupHandle,
  FieldHandle,
  FieldOptions,
  FieldForce,
  FieldShape,
  FalloffName,
} from "./runtime"
export {
  fieldFalloff,
  falloffId,
  evaluateCircle,
  evaluateElement,
  evaluateField,
  SpatialHash,
} from "./field"
export type { FieldSample } from "./field"
export { createFieldOverlay } from "./devtools"
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
