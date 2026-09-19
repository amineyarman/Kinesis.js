export type AdmissionVerdict = "hold" | "ship" | "fold" | "recipe"

export interface AdmissionGates {
  a: boolean
  b: boolean
  c: boolean
  d: boolean
  e: boolean
  f: boolean
}

export interface AdmissionRecord {
  id: string
  title: string
  verdict: AdmissionVerdict
  gates: AdmissionGates
  note: string
}

const item = (entry: AdmissionRecord): AdmissionRecord => entry

export const admissionRecords: AdmissionRecord[] = [
  item({
    id: "tether",
    title: "Tether",
    verdict: "hold",
    gates: { a: true, b: true, c: true, d: true, e: false, f: true },
    note: "A slack leash is a real constraint. Follow already chases. Not enough distinct uses to promote.",
  }),
  item({
    id: "orbit",
    title: "Orbit",
    verdict: "hold",
    gates: { a: true, b: true, c: true, d: true, e: false, f: true },
    note: "--k-orbit is clearer than an authored circle, but Path already walks a curve. Time mode must not keep the page awake under reduced motion.",
  }),
  item({
    id: "chain",
    title: "Chain",
    verdict: "hold",
    gates: { a: true, b: true, c: true, d: true, e: false, f: true },
    note: "Neighbor spacing is new. The cap holds. One cursor-string demo is not product evidence.",
  }),
  item({
    id: "orientation",
    title: "Orientation",
    verdict: "hold",
    gates: { a: true, b: true, c: true, d: true, e: false, f: true },
    note: "A source, not an instrument. Permission must stay a user gesture. Pointer remains the default.",
  }),
  item({
    id: "audio",
    title: "Audio",
    verdict: "hold",
    gates: { a: true, b: true, c: true, d: true, e: false, f: true },
    note: "A source, not a visualizer effect. CSS cannot create the media node.",
  }),
  item({
    id: "video",
    title: "Video",
    verdict: "hold",
    gates: { a: true, b: true, c: true, d: true, e: false, f: true },
    note: "Playback progress is a source. Paused media must stay silent.",
  }),
  item({
    id: "press",
    title: "Press",
    verdict: "hold",
    gates: { a: true, b: true, c: true, d: true, e: false, f: true },
    note: "Temporal down state is real. Compress and glow stay recipes. No public slot until repeated demand.",
  }),
  item({
    id: "hold",
    title: "Hold",
    verdict: "hold",
    gates: { a: true, b: true, c: true, d: true, e: false, f: true },
    note: "Progress toward a threshold is real. Charge is a recipe on hold.progress.",
  }),
]

export const admissionRecordMap = Object.fromEntries(
  admissionRecords.map((entry) => [entry.id, entry]),
) as Record<string, AdmissionRecord>

export function getAdmissionRecord(id: string): AdmissionRecord | undefined {
  return admissionRecordMap[id]
}

export function admissionReady(record: AdmissionRecord): boolean {
  return record.gates.a && record.gates.b && record.gates.c && record.gates.d && record.gates.e && record.gates.f
}
