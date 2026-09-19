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
  PathOptions,
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
export { KSignal } from "./signal"
export { KinesisAudio, audioBands, bandEnergy, hzToBin, peakEnergy, resolveBand } from "./audio"
export type { AudioBandName, AudioSourceInput } from "./audio"
export { computeEdge, createEdgeSample } from "./edge"
export type { EdgeSample } from "./edge"
export { KinesisVideo } from "./video"
export type { VideoSourceInput } from "./video"
export {
  cssProperties,
  cssPropertyMap,
  catalogProperties,
  motionPresets,
  defaultMotionPreset,
  getMotionPreset,
  kinesisRegistry,
  kinesisRegistryMap,
  registryLanes,
  getRegistryEntry,
  registryLane,
  publicShipInteractions,
  registryByLane,
} from "./spec"
export type {
  CssPropertySpec,
  MotionPresetSpec,
  PreviewKind,
  PropertyCategory,
  PropertyStatus,
  KinesisKind,
  KinesisStatus,
  RegistryEntry,
  RegistryLane,
  RegistryOwner,
} from "./spec"
