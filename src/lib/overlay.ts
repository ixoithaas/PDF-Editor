import type { Annotation, Point, Rect } from '../types'
import { getFont } from './fonts'
import { degToRad } from './geometry'
import type { ViewportLike } from './viewport'

/**
 * PDF.js' viewport transform maps *absolute* PDF user space (viewBox
 * coordinates, y up) onto canvas pixels (y down) and applies the page
 * rotation, so annotations are drawn using their stored geometry directly.
 */
export type { ViewportLike } from './viewport'

export interface OverlayOptions {
  viewport: ViewportLike
  annotations: Annotation[]
  /** Final page rotation in degrees, used to keep text and stamps upright. */
  pageRotation?: number
  selectedId?: string | null
  dpr?: number
  /** Resolves an annotation image source to a decoded image. */
  resolveImage?: (src: string) => HTMLImageElement | null
  /** Preview of the shape the user is currently dragging. */
  draft?: DraftShape | null
  /** Search results to highlight on this page. */
  searchRects?: { id: string; rect: Rect; active: boolean }[]
}

export interface DraftShape {
  kind: 'rect' | 'ellipse' | 'line' | 'arrow' | 'draw' | 'markup'
  rect?: Rect
  points?: Point[]
  color: string
  strokeWidth: number
  filled?: boolean
  fillColor?: string
}

const SELECT_COLOR = '#6366f1'

/** Converts an absolute user-space point into canvas pixels. */
export function userToCanvas(
  viewport: ViewportLike,
  x: number,
  y: number,
): [number, number] {
  const [vx, vy] = viewport.convertToViewportPoint(x, y)
  return [vx, vy]
}

/** Converts canvas pixels into absolute user space. */
export function canvasToUser(
  viewport: ViewportLike,
  cx: number,
  cy: number,
): Point {
  const [px, py] = viewport.convertToPdfPoint(cx, cy)
  return { x: px, y: py }
}

/** Resets to the device-pixel base transform. */
function resetTransform(ctx: CanvasRenderingContext2D, dpr = 1) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/** Multiplies the current transform by the page viewport transform. */
function applyViewport(ctx: CanvasRenderingContext2D, viewport: ViewportLike) {
  const t = viewport.transform
  ctx.transform(t[0], t[1], t[2], t[3], t[4], t[5])
}

export function renderOverlay(ctx: CanvasRenderingContext2D, options: OverlayOptions) {
  const { viewport, annotations, selectedId, dpr = 1 } = options
  resetTransform(ctx, dpr)
  ctx.clearRect(0, 0, viewport.width, viewport.height)

  for (const annotation of annotations) {
    const selected = annotation.id === selectedId
    ctx.save()
    resetTransform(ctx, dpr)
    switch (annotation.kind) {
      case 'rect':
        drawRect(ctx, viewport, annotation, selected)
        break
      case 'ellipse':
        drawEllipse(ctx, viewport, annotation, selected)
        break
      case 'line':
        drawLine(ctx, viewport, annotation, selected)
        break
      case 'arrow':
        drawArrow(ctx, viewport, annotation, selected)
        break
      case 'draw':
        drawPolyline(ctx, viewport, annotation, selected)
        break
      case 'highlight':
        drawMarkup(ctx, viewport, annotation, selected, 'highlight')
        break
      case 'underline':
        drawMarkup(ctx, viewport, annotation, selected, 'underline')
        break
      case 'strikeout':
        drawMarkup(ctx, viewport, annotation, selected, 'strikeout')
        break
      case 'image':
        drawImage(ctx, viewport, annotation, selected, options.resolveImage)
        break
      case 'text':
        drawText(ctx, viewport, annotation, selected, options.pageRotation ?? 0, dpr)
        break
      case 'stamp':
        drawStamp(ctx, viewport, annotation, selected, options.pageRotation ?? 0, dpr)
        break
    }
    ctx.restore()
  }

  ctx.save()
  if (options.draft) drawDraft(ctx, viewport, options.draft)
  ctx.restore()

  ctx.save()
  if (options.searchRects?.length) drawSearchRects(ctx, viewport, options.searchRects)
  ctx.restore()
}

/* ------------------------------------------------------------------ *
 * Shapes (drawn in user space so they rotate with the page)
 * ------------------------------------------------------------------ */

function strokeSelection(ctx: CanvasRenderingContext2D, selected: boolean) {
  if (!selected) return
  ctx.globalAlpha = 1
  ctx.strokeStyle = SELECT_COLOR
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 3])
  ctx.stroke()
  ctx.setLineDash([])
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportLike,
  annotation: Extract<Annotation, { kind: 'rect' }>,
  selected: boolean,
) {
  applyViewport(ctx, viewport)
  ctx.beginPath()
  ctx.rect(annotation.x, annotation.y, annotation.width, annotation.height)
  if (annotation.filled) {
    ctx.fillStyle = annotation.fillColor
    ctx.globalAlpha = annotation.opacity
    ctx.fill()
  }
  ctx.globalAlpha = annotation.opacity
  ctx.strokeStyle = annotation.color
  ctx.lineWidth = annotation.strokeWidth
  ctx.stroke()
  strokeSelection(ctx, selected)
}

function drawEllipse(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportLike,
  annotation: Extract<Annotation, { kind: 'ellipse' }>,
  selected: boolean,
) {
  applyViewport(ctx, viewport)
  const cx = annotation.x + annotation.width / 2
  const cy = annotation.y + annotation.height / 2
  ctx.beginPath()
  ctx.ellipse(
    cx,
    cy,
    Math.abs(annotation.width / 2),
    Math.abs(annotation.height / 2),
    0,
    0,
    Math.PI * 2,
  )
  if (annotation.filled) {
    ctx.fillStyle = annotation.fillColor
    ctx.globalAlpha = annotation.opacity
    ctx.fill()
  }
  ctx.globalAlpha = annotation.opacity
  ctx.strokeStyle = annotation.color
  ctx.lineWidth = annotation.strokeWidth
  ctx.stroke()
  strokeSelection(ctx, selected)
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportLike,
  annotation: Extract<Annotation, { kind: 'line' | 'arrow' }>,
  selected: boolean,
) {
  applyViewport(ctx, viewport)
  ctx.beginPath()
  ctx.moveTo(annotation.x1, annotation.y1)
  ctx.lineTo(annotation.x2, annotation.y2)
  ctx.globalAlpha = annotation.opacity
  ctx.strokeStyle = annotation.color
  ctx.lineWidth = annotation.strokeWidth
  ctx.lineCap = 'round'
  ctx.stroke()
  strokeSelection(ctx, selected)
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportLike,
  annotation: Extract<Annotation, { kind: 'line' | 'arrow' }>,
  selected: boolean,
) {
  applyViewport(ctx, viewport)
  const { x1, y1, x2, y2 } = annotation
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const head = Math.min(len * 0.4, Math.max(7, annotation.strokeWidth * 4))
  const angle = Math.atan2(dy, dx)
  const spread = Math.PI / 7
  const back = head * 0.9

  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.globalAlpha = annotation.opacity
  ctx.strokeStyle = annotation.color
  ctx.lineWidth = annotation.strokeWidth
  ctx.lineCap = 'round'
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - back * Math.cos(angle - spread), y2 - back * Math.sin(angle - spread))
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - back * Math.cos(angle + spread), y2 - back * Math.sin(angle + spread))
  ctx.stroke()
  strokeSelection(ctx, selected)
}

function drawPolyline(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportLike,
  annotation: Extract<Annotation, { kind: 'draw' }>,
  selected: boolean,
) {
  if (!annotation.points.length) return
  applyViewport(ctx, viewport)
  ctx.beginPath()
  ctx.moveTo(annotation.points[0].x, annotation.points[0].y)
  for (let i = 1; i < annotation.points.length; i++) {
    ctx.lineTo(annotation.points[i].x, annotation.points[i].y)
  }
  ctx.globalAlpha = annotation.opacity
  ctx.strokeStyle = annotation.color
  ctx.lineWidth = annotation.strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()
  strokeSelection(ctx, selected)
}

function drawMarkup(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportLike,
  annotation: Extract<Annotation, { kind: 'highlight' | 'underline' | 'strikeout' }>,
  selected: boolean,
  kind: 'highlight' | 'underline' | 'strikeout',
) {
  applyViewport(ctx, viewport)
  ctx.strokeStyle = annotation.color
  ctx.fillStyle = annotation.color
  ctx.lineCap = 'butt'

  for (const rect of annotation.rects) {
    if (kind === 'highlight') {
      ctx.globalAlpha = annotation.opacity * 0.45
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
    } else if (kind === 'underline') {
      ctx.globalAlpha = annotation.opacity
      ctx.lineWidth = Math.max(0.7, annotation.strokeWidth)
      ctx.beginPath()
      ctx.moveTo(rect.x, rect.y)
      ctx.lineTo(rect.x + rect.width, rect.y)
      ctx.stroke()
    } else {
      ctx.globalAlpha = annotation.opacity
      ctx.lineWidth = Math.max(0.7, annotation.strokeWidth)
      const y = rect.y + rect.height * 0.32
      ctx.beginPath()
      ctx.moveTo(rect.x, y)
      ctx.lineTo(rect.x + rect.width, y)
      ctx.stroke()
    }
  }

  if (selected) {
    ctx.globalAlpha = 1
    ctx.strokeStyle = SELECT_COLOR
    ctx.lineWidth = 1.2
    ctx.setLineDash([4, 3])
    for (const rect of annotation.rects) {
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
    }
    ctx.setLineDash([])
  }
}

function drawImage(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportLike,
  annotation: Extract<Annotation, { kind: 'image' }>,
  selected: boolean,
  resolveImage?: (src: string) => HTMLImageElement | null,
) {
  const img = resolveImage?.(annotation.src)
  if (!img || !img.complete || !img.naturalWidth) return
  applyViewport(ctx, viewport)
  ctx.save()
  // The image is anchored at its bottom-left in user space; flip it so that
  // the page's Y flip does not mirror the picture.
  ctx.translate(annotation.x, annotation.y + annotation.height)
  ctx.scale(1, -1)
  ctx.globalAlpha = annotation.opacity
  ctx.drawImage(img, 0, 0, annotation.width, annotation.height)
  ctx.restore()

  if (selected) {
    ctx.save()
    ctx.globalAlpha = 1
    ctx.strokeStyle = SELECT_COLOR
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.strokeRect(annotation.x, annotation.y, annotation.width, annotation.height)
    ctx.setLineDash([])
    ctx.restore()
  }
}

/* ------------------------------------------------------------------ *
 * Text & stamps (kept upright regardless of page rotation)
 * ------------------------------------------------------------------ */

function drawText(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportLike,
  annotation: Extract<Annotation, { kind: 'text' }>,
  selected: boolean,
  pageRotation: number,
  dpr: number,
) {
  const def = getFont(annotation.font)
  const size = annotation.fontSize
  const angle = ((annotation.angle % 360) + 360) % 360
  const theta = degToRad(pageRotation - angle)
  const lineHeight = size * 1.25
  const lines = annotation.text.split(/\r\n|\r|\n/)

  resetTransform(ctx, dpr)
  ctx.font = `${def.style} ${def.weight} ${size * viewport.scale}px ${def.css}`
  ctx.textAlign = annotation.align
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = annotation.color
  ctx.globalAlpha = annotation.opacity

  const rad = degToRad(angle)
  const downX = Math.sin(rad)
  const downY = -Math.cos(rad)
  let cursorX = annotation.x
  let cursorY = annotation.y

  for (const line of lines) {
    const [px, py] = userToCanvas(viewport, cursorX, cursorY)
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(theta)
    ctx.fillText(line, 0, 0)
    if (selected) {
      const width = ctx.measureText(line).width
      ctx.globalAlpha = 1
      ctx.strokeStyle = SELECT_COLOR
      ctx.lineWidth = 1.2
      ctx.setLineDash([4, 3])
      const align =
        annotation.align === 'center' ? -width / 2 : annotation.align === 'right' ? -width : 0
      ctx.strokeRect(align, -size * viewport.scale * 0.85, width, size * viewport.scale * 1.05)
      ctx.setLineDash([])
    }
    ctx.restore()
    cursorX += lineHeight * downX
    cursorY += lineHeight * downY
  }
}

function drawStamp(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportLike,
  annotation: Extract<Annotation, { kind: 'stamp' }>,
  selected: boolean,
  pageRotation: number,
  dpr: number,
) {
  const angle = ((annotation.angle % 360) + 360) % 360
  const theta = degToRad(pageRotation - angle)
  const scale = viewport.scale
  const [px, py] = userToCanvas(viewport, annotation.x, annotation.y)

  resetTransform(ctx, dpr)
  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(theta)
  ctx.globalAlpha = annotation.opacity
  ctx.strokeStyle = annotation.color
  ctx.lineWidth = Math.max(1, annotation.size * 0.09) * scale
  ctx.strokeRect(
    0,
    -annotation.boxHeight * scale,
    annotation.boxWidth * scale,
    annotation.boxHeight * scale,
  )

  ctx.font = `700 ${annotation.size * scale}px ${getFont('helvetica-bold').css}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = annotation.color
  const textWidth = ctx.measureText(annotation.label).width
  ctx.fillText(
    annotation.label,
    (annotation.boxWidth * scale - textWidth) / 2,
    -annotation.boxHeight * scale + annotation.size * scale * 0.62,
  )

  if (selected) {
    ctx.globalAlpha = 1
    ctx.strokeStyle = SELECT_COLOR
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.strokeRect(
      0,
      -annotation.boxHeight * scale,
      annotation.boxWidth * scale,
      annotation.boxHeight * scale,
    )
    ctx.setLineDash([])
  }
  ctx.restore()
}

/* ------------------------------------------------------------------ *
 * Draft preview
 * ------------------------------------------------------------------ */

function drawDraft(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportLike,
  draft: DraftShape,
) {
  applyViewport(ctx, viewport)
  ctx.globalAlpha = 0.75
  ctx.strokeStyle = draft.color
  ctx.lineWidth = draft.strokeWidth
  ctx.lineCap = 'round'

  if (draft.kind === 'draw' && draft.points?.length) {
    ctx.beginPath()
    ctx.moveTo(draft.points[0].x, draft.points[0].y)
    for (let i = 1; i < draft.points.length; i++) {
      ctx.lineTo(draft.points[i].x, draft.points[i].y)
    }
    ctx.stroke()
    return
  }

  if (!draft.rect) return
  const { x, y, width, height } = draft.rect

  if (draft.kind === 'rect') {
    if (draft.filled) {
      ctx.fillStyle = draft.fillColor ?? draft.color
      ctx.fillRect(x, y, width, height)
    }
    ctx.strokeRect(x, y, width, height)
  } else if (draft.kind === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(
      x + width / 2,
      y + height / 2,
      Math.abs(width / 2),
      Math.abs(height / 2),
      0,
      0,
      Math.PI * 2,
    )
    ctx.stroke()
  } else if (draft.kind === 'line' || draft.kind === 'arrow') {
    ctx.beginPath()
    ctx.moveTo(x, y + height)
    ctx.lineTo(x + width, y)
    ctx.stroke()
  } else {
    ctx.setLineDash([4, 3])
    ctx.strokeRect(x, y, width, height)
    ctx.setLineDash([])
  }
}

/* ------------------------------------------------------------------ *
 * Search highlights
 * ------------------------------------------------------------------ */

function drawSearchRects(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportLike,
  rects: { id: string; rect: Rect; active: boolean }[],
) {
  applyViewport(ctx, viewport)
  for (const entry of rects) {
    const pad = 1
    ctx.beginPath()
    ctx.rect(
      entry.rect.x - pad,
      entry.rect.y - pad,
      entry.rect.width + pad * 2,
      entry.rect.height + pad * 2,
    )
    ctx.fillStyle = entry.active ? 'rgba(249, 115, 22, 0.45)' : 'rgba(250, 204, 21, 0.4)'
    ctx.fill()
    ctx.strokeStyle = entry.active ? 'rgba(234, 88, 12, 0.9)' : 'rgba(202, 138, 4, 0.8)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

/* ------------------------------------------------------------------ *
 * Redraw bookkeeping
 * ------------------------------------------------------------------ */

const revisions = new WeakMap<object, number>()
let revisionCounter = 0

/**
 * Every mutation in the editor produces a new object, so a monotonic revision
 * per object identity lets a page skip redrawing when none of *its*
 * annotations changed — important for long documents, where every page
 * subscribes to the shared annotation list.
 */
export function revisionOf(value: object): number {
  let revision = revisions.get(value)
  if (revision === undefined) {
    revision = ++revisionCounter
    revisions.set(value, revision)
  }
  return revision
}

/* ------------------------------------------------------------------ *
 * Hit testing
 * ------------------------------------------------------------------ */

export function annotationBounds(annotation: Annotation): Rect | null {
  switch (annotation.kind) {
    case 'rect':
    case 'ellipse':
    case 'image':
      return {
        x: annotation.x,
        y: annotation.y,
        width: annotation.width,
        height: annotation.height,
      }
    case 'line':
    case 'arrow':
      return {
        x: Math.min(annotation.x1, annotation.x2),
        y: Math.min(annotation.y1, annotation.y2),
        width: Math.abs(annotation.x2 - annotation.x1),
        height: Math.abs(annotation.y2 - annotation.y1),
      }
    case 'draw': {
      if (!annotation.points.length) return null
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const p of annotation.points) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    }
    case 'highlight':
    case 'underline':
    case 'strikeout': {
      if (!annotation.rects.length) return null
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const r of annotation.rects) {
        minX = Math.min(minX, r.x)
        minY = Math.min(minY, r.y)
        maxX = Math.max(maxX, r.x + r.width)
        maxY = Math.max(maxY, r.y + r.height)
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    }
    case 'text': {
      const size = annotation.fontSize
      const width = size * Math.max(1, longestLine(annotation.text)) * 0.6
      return {
        x: annotation.x,
        y: annotation.y - size * 0.2,
        width,
        height: size * 1.25 * Math.max(1, annotation.text.split('\n').length),
      }
    }
    case 'stamp':
      return {
        x: annotation.x,
        y: annotation.y,
        width: annotation.boxWidth,
        height: annotation.boxHeight,
      }
    default:
      return null
  }
}

function longestLine(text: string): number {
  return text.split(/\r\n|\r|\n/).reduce((max, line) => Math.max(max, line.length), 1)
}

export function hitTest(
  annotations: Annotation[],
  point: Point,
  tolerance: number,
): Annotation | null {
  // Topmost first.
  for (let i = annotations.length - 1; i >= 0; i--) {
    const annotation = annotations[i]
    if (hitAnnotation(annotation, point, tolerance)) return annotation
  }
  return null
}

function hitAnnotation(annotation: Annotation, point: Point, tolerance: number): boolean {
  switch (annotation.kind) {
    case 'rect':
    case 'image':
      return (
        point.x >= annotation.x - tolerance &&
        point.x <= annotation.x + annotation.width + tolerance &&
        point.y >= annotation.y - tolerance &&
        point.y <= annotation.y + annotation.height + tolerance
      )
    case 'ellipse': {
      const cx = annotation.x + annotation.width / 2
      const cy = annotation.y + annotation.height / 2
      const rx = Math.max(annotation.width / 2, tolerance)
      const ry = Math.max(annotation.height / 2, tolerance)
      const dx = (point.x - cx) / rx
      const dy = (point.y - cy) / ry
      return dx * dx + dy * dy <= 1.15
    }
    case 'line':
    case 'arrow':
      return (
        distanceToSegment(point, { x: annotation.x1, y: annotation.y1 }, { x: annotation.x2, y: annotation.y2 }) <=
        Math.max(tolerance, annotation.strokeWidth / 2 + 1)
      )
    case 'draw':
      return distanceToPolyline(point, annotation.points) <= Math.max(tolerance, annotation.strokeWidth)
    case 'highlight':
    case 'underline':
    case 'strikeout':
      return annotation.rects.some(
        (r) =>
          point.x >= r.x - tolerance &&
          point.x <= r.x + r.width + tolerance &&
          point.y >= r.y - tolerance &&
          point.y <= r.y + r.height + tolerance,
      )
    case 'text': {
      const bounds = annotationBounds(annotation)
      if (!bounds) return false
      return (
        point.x >= bounds.x - tolerance &&
        point.x <= bounds.x + bounds.width + tolerance &&
        point.y >= bounds.y - tolerance &&
        point.y <= bounds.y + bounds.height + tolerance
      )
    }
    case 'stamp':
      return (
        point.x >= annotation.x - tolerance &&
        point.x <= annotation.x + annotation.boxWidth + tolerance &&
        point.y >= annotation.y - tolerance &&
        point.y <= annotation.y + annotation.boxHeight + tolerance
      )
    default:
      return false
  }
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (!lenSq) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function distanceToPolyline(p: Point, points: Point[]): number {
  if (points.length === 1) return Math.hypot(p.x - points[0].x, p.y - points[0].y)
  let best = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    best = Math.min(best, distanceToSegment(p, points[i], points[i + 1]))
  }
  return best
}
