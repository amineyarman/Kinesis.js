export type PropertyStatus = "stable" | "experimental" | "deprecated" | "candidate"
export type PropertyCategory =
  | "context"
  | "depth"
  | "parallax"
  | "tilt"
  | "magnetic"
  | "repel"
  | "attract"
  | "scroll"
  | "rotate"
  | "path"
  | "physics"
  | "audio"
  | "field"
  | "orbit"
  | "relationship"
  | "group"
export type PreviewKind =
  | "source"
  | "motion"
  | "parallax"
  | "tilt"
  | "magnetic"
  | "force"
  | "scroll"
  | "depth"
  | "intensity"
  | "audio"
  | "none"

export interface CssPropertySpec {
  name: string
  title: string
  description: string
  syntax: string
  values: string
  defaultValue: string
  inherits: boolean
  category: PropertyCategory
  status: PropertyStatus
  since: string
  preview: PreviewKind
  longhands?: string[]
  shorthandOf?: string
  related: string[]
  concepts: string[]
}

export interface MotionPresetSpec {
  name: string
  label: string
  stiffness: number
  damping: number
  mass: number
}
