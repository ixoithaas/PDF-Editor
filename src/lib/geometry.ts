import type { Point, Rect } from '../types'

export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

export const round = (v: number, precision = 2) => {
  const f = 10 ** precision
  return Math.round(v * f) / f
}

export const degToRad = (d: number) => (d * Math.PI) / 180
export const radToDeg = (r: number) => (r * 180) / Math.PI

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}

export function rectContains(outer: Rect, inner: Rect, tolerance = 0.5): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  )
}

export function pointInRect(p: Point, r: Rect, tolerance = 0): boolean {
  return (
    p.x >= r.x - tolerance &&
    p.y >= r.y - tolerance &&
    p.x <= r.x + r.width + tolerance &&
    p.y <= r.y + r.height + tolerance
  )
}

/** Squared distance from a point to a segment. */
export function distToSegmentSq(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = clamp(t, 0, 1)
  const cx = a.x + t * dx
  const cy = a.y + t * dy
  return (p.x - cx) ** 2 + (p.y - cy) ** 2
}

/** Distance from a point to a poly-line. */
export function distToPolyline(p: Point, pts: Point[]): number {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    best = Math.min(best, distToSegmentSq(p, pts[i], pts[i + 1]))
  }
  if (pts.length === 1) {
    best = (p.x - pts[0].x) ** 2 + (p.y - pts[0].y) ** 2
  }
  return Math.sqrt(best)
}

/** Ramer–Douglas–Peucker simplification of a poly-line. */
export function simplifyPoints(points: Point[], tolerance = 0.6): Point[] {
  if (points.length < 3) return points
  const sqTolerance = tolerance * tolerance

  const sqSegDist = (p: Point, a: Point, b: Point) => {
    let x = a.x
    let y = a.y
    let dx = b.x - x
    let dy = b.y - y
    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy)
      if (t > 1) {
        x = b.x
        y = b.y
      } else if (t > 0) {
        x += dx * t
        y += dy * t
      }
    }
    dx = p.x - x
    dy = p.y - y
    return dx * dx + dy * dy
  }

  const step = (first: number, last: number, simplified: Point[]) => {
    let maxSqDist = sqTolerance
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const sqDist = sqSegDist(points[i], points[first], points[last])
      if (sqDist > maxSqDist) {
        index = i
        maxSqDist = sqDist
      }
    }
    if (index !== -1) {
      if (index - first > 1) step(first, index, simplified)
      simplified.push(points[index])
      if (last - index > 1) step(index, last, simplified)
    }
  }

  const simplified: Point[] = [points[0]]
  step(0, points.length - 1, simplified)
  simplified.push(points[points.length - 1])
  return simplified
}

/** Axis aligned bounding box of a set of points. */
export function boundingBox(points: Point[]): Rect {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Rotate a point around a centre by `deg` degrees (CCW in maths axes). */
export function rotatePoint(p: Point, centre: Point, deg: number): Point {
  if (deg === 0) return { ...p }
  const a = degToRad(deg)
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const dx = p.x - centre.x
  const dy = p.y - centre.y
  return {
    x: centre.x + dx * cos - dy * sin,
    y: centre.y + dx * sin + dy * cos,
  }
}

/** Scale a rect around a fixed point (used for zoom-independent handles). */
export function scaleRect(r: Rect, factor: number, origin: Point): Rect {
  return {
    x: origin.x + (r.x - origin.x) * factor,
    y: origin.y + (r.y - origin.y) * factor,
    width: r.width * factor,
    height: r.height * factor,
  }
}
