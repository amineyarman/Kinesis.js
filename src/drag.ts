import { clamp } from "./core"

export const DRAG_THRESHOLD = 6

export interface DragBox {
  left: number
  top: number
  width: number
  height: number
}

export function parseDrag(value: string): string {
  return value === "x" || value === "y" || value === "both" ? value : ""
}

export function resolveDragAxis(drag: string, axis: string): string {
  if (drag === "x" || drag === "y") return drag
  if (drag !== "both") return ""
  return axis === "x" || axis === "y" ? axis : "both"
}

export function constrainDrag(
  x: number,
  y: number,
  rest: DragBox,
  bounds: DragBox | null,
  snap: number,
  axis: string,
): { x: number; y: number } {
  let nextX = axis === "y" ? 0 : x
  let nextY = axis === "x" ? 0 : y
  if (bounds && bounds.width > 0 && bounds.height > 0) {
    const minX = bounds.left - rest.left
    const maxX = bounds.left + bounds.width - (rest.left + rest.width)
    const minY = bounds.top - rest.top
    const maxY = bounds.top + bounds.height - (rest.top + rest.height)
    if (axis !== "y") nextX = minX <= maxX ? clamp(nextX, minX, maxX) : 0
    if (axis !== "x") nextY = minY <= maxY ? clamp(nextY, minY, maxY) : 0
  }
  if (snap > 0) {
    if (axis !== "y") nextX = Math.round(nextX / snap) * snap
    if (axis !== "x") nextY = Math.round(nextY / snap) * snap
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      const minX = bounds.left - rest.left
      const maxX = bounds.left + bounds.width - (rest.left + rest.width)
      const minY = bounds.top - rest.top
      const maxY = bounds.top + bounds.height - (rest.top + rest.height)
      if (axis !== "y" && minX <= maxX) nextX = clamp(nextX, minX, maxX)
      if (axis !== "x" && minY <= maxY) nextY = clamp(nextY, minY, maxY)
    }
  }
  return { x: nextX, y: nextY }
}
