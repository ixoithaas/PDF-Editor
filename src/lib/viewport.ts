import type { Point } from '../types'

/**
 * A tiny, dependency free stand-in for PDF.js' `PageViewport`.
 *
 * It reproduces the exact same maths so that blank (source-less) pages and
 * source pages can be treated identically by the rendering code.
 *
 * The transform maps *absolute* PDF user space (viewBox coordinates, y up)
 * to canvas pixels (y down) and applies the page rotation.
 */
export interface ViewportLike {
  width: number
  height: number
  scale: number
  rotation: number
  transform: number[]
  convertToViewportPoint(x: number, y: number): number[]
  convertToPdfPoint(x: number, y: number): number[]
}

export function makeViewport(
  viewBox: readonly [number, number, number, number],
  scale: number,
  rotation: number,
): ViewportLike {
  const rot = ((rotation % 360) + 360) % 360
  const centerX = (viewBox[2] + viewBox[0]) / 2
  const centerY = (viewBox[3] + viewBox[1]) / 2

  let a = 1
  let b = 0
  let c = 0
  let d = -1
  if (rot === 90) {
    a = 0
    b = 1
    c = 1
    d = 0
  } else if (rot === 180) {
    a = -1
    b = 0
    c = 0
    d = 1
  } else if (rot === 270) {
    a = 0
    b = -1
    c = -1
    d = 0
  }

  let offsetCanvasX: number
  let offsetCanvasY: number
  let width: number
  let height: number
  if (a === 0) {
    offsetCanvasX = Math.abs(centerY - viewBox[1]) * scale
    offsetCanvasY = Math.abs(centerX - viewBox[0]) * scale
    width = (viewBox[3] - viewBox[1]) * scale
    height = (viewBox[2] - viewBox[0]) * scale
  } else {
    offsetCanvasX = Math.abs(centerX - viewBox[0]) * scale
    offsetCanvasY = Math.abs(centerY - viewBox[1]) * scale
    width = (viewBox[2] - viewBox[0]) * scale
    height = (viewBox[3] - viewBox[1]) * scale
  }

  const t: number[] = [
    a * scale,
    b * scale,
    c * scale,
    d * scale,
    offsetCanvasX - a * scale * centerX - c * scale * centerY,
    offsetCanvasY - b * scale * centerX - d * scale * centerY,
  ]

  return {
    width,
    height,
    scale,
    rotation: rot,
    transform: t,
    convertToViewportPoint(x: number, y: number) {
      return [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]]
    },
    convertToPdfPoint(x: number, y: number) {
      // Invert the 2x2 rotation/scale matrix (it is always orthogonal).
      const det = t[0] * t[3] - t[1] * t[2] || 1
      const dx = x - t[4]
      const dy = y - t[5]
      return [(t[3] * dx - t[2] * dy) / det, (t[0] * dy - t[1] * dx) / det]
    },
  }
}

export function viewportToUserPoint(viewport: ViewportLike, p: Point): Point {
  const [x, y] = viewport.convertToPdfPoint(p.x, p.y)
  return { x, y }
}
