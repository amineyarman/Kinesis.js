export interface EdgeSample {
  left: number
  right: number
  top: number
  bottom: number
  nearest: number
  nx: number
  ny: number
  progress: number
}

export function createEdgeSample(): EdgeSample {
  return {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    nearest: 0,
    nx: 0,
    ny: 0,
    progress: 0,
  }
}

export function computeEdge(
  x: number,
  y: number,
  boxLeft: number,
  boxTop: number,
  boxW: number,
  boxH: number,
  radius: number,
  into: EdgeSample = createEdgeSample(),
): EdgeSample {
  into.left = x - boxLeft
  into.right = boxLeft + boxW - x
  into.top = y - boxTop
  into.bottom = boxTop + boxH - y
  let nearest = into.left
  into.nx = 1
  into.ny = 0
  if (into.right < nearest) {
    nearest = into.right
    into.nx = -1
    into.ny = 0
  }
  if (into.top < nearest) {
    nearest = into.top
    into.nx = 0
    into.ny = 1
  }
  if (into.bottom < nearest) {
    nearest = into.bottom
    into.nx = 0
    into.ny = -1
  }
  into.nearest = nearest
  into.progress = radius <= 0 ? 0 : nearest >= radius ? 0 : nearest <= 0 ? 1 : 1 - nearest / radius
  return into
}
