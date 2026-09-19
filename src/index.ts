export { initKinesis, createKinesis, getKinesis } from "./runtime"
export type {
  KinesisApp,
  KinesisScope,
  CreateKinesisOptions,
  MotionHandle,
  PointerSignals,
  OrientationSignals,
  ProximitySignals,
  ViewSignals,
  PressSignals,
  HoldSignals,
  TapSignals,
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
export { constrainDrag, parseDrag, resolveDragAxis } from "./drag"
export { holdProgress, decayImpulse, resolveRelease, HOLD_DEFAULT } from "./press"
export type { GestureRelease } from "./press"
export type { DragBox } from "./drag"
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
  responseChannels,
  responseChannelMap,
  getResponseChannel,
  admissionRecords,
  admissionRecordMap,
  getAdmissionRecord,
  admissionReady,
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
  ResponseChannel,
  ResponseCost,
  ResponseDomain,
  AdmissionRecord,
  AdmissionGates,
  AdmissionVerdict,
} from "./spec"
export { parseColor, lerpColor, serializeColor, composeFilter, rgbToOklab } from "./color"
export type { Color } from "./color"
