import type { MarkupKind, Rect, TextMatch } from '../types'

export interface TextItemGeometry {
  /** Raw text of the item. */
  str: string
  /** Baseline origin in absolute user space. */
  x: number
  y: number
  /** Advance width in user space units. */
  width: number
  /** Font height in user space units. */
  height: number
  /** Unit direction of the baseline. */
  dirX: number
  dirY: number
  /** Unit direction of the glyph "up". */
  upX: number
  upY: number
  fontName: string
}

interface RawTextItem {
  str: string
  width: number
  height: number
  transform: number[]
  fontName: string
  dir?: string
}

/** Converts a PDF.js text item into user-space geometry. */
export function itemGeometry(item: RawTextItem): TextItemGeometry {
  const t = item.transform
  const advLen = Math.hypot(t[0], t[1]) || 1
  const upLen = Math.hypot(t[2], t[3]) || 1
  return {
    str: item.str,
    x: t[4],
    y: t[5],
    width: item.width,
    height: item.height || upLen,
    dirX: t[0] / advLen,
    dirY: t[1] / advLen,
    upX: t[2] / upLen,
    upY: t[3] / upLen,
    fontName: item.fontName,
  }
}

/** Axis aligned bounding box of a text item in user space. */
export function itemBounds(item: TextItemGeometry): Rect {
  const endX = item.x + item.dirX * item.width
  const endY = item.y + item.dirY * item.width
  const topX = item.x + item.upX * item.height
  const topY = item.y + item.upY * item.height
  const xs = [item.x, endX, topX, endX + item.upX * item.height]
  const ys = [item.y, endY, topY, endY + item.upY * item.height]
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

/**
 * Computes the rectangles that a markup annotation should cover for every text
 * item that intersects `region`.
 */
export function markupRects(
  items: TextItemGeometry[],
  kind: MarkupKind,
  region: Rect,
): Rect[] {
  const rects: Rect[] = []
  for (const item of items) {
    if (!item.str.trim()) continue
    const bounds = itemBounds(item)
    if (!intersects(bounds, region)) continue

    const h = item.height || 10
    if (kind === 'highlight') {
      const top = item.y + item.upY * h * 0.82
      const bottom = item.y - item.upY * h * 0.06
      rects.push({
        x: Math.min(bounds.x, bounds.x + bounds.width),
        y: Math.min(top, bottom),
        width: bounds.width,
        height: Math.abs(top - bottom),
      })
    } else if (kind === 'underline') {
      const y = item.y - item.upY * h * 0.08
      rects.push({
        x: bounds.x,
        y: Math.min(y, item.y),
        width: bounds.width,
        height: Math.abs(item.y - y),
      })
    } else {
      const top = item.y + item.upY * h * 0.34
      const bottom = item.y + item.upY * h * 0.2
      rects.push({
        x: bounds.x,
        y: Math.min(top, bottom),
        width: bounds.width,
        height: Math.abs(top - bottom),
      })
    }
  }
  return mergeRects(rects)
}

/** Merges rectangles that sit on (roughly) the same line. */
function mergeRects(rects: Rect[]): Rect[] {
  if (rects.length <= 1) return rects
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x)
  const out: Rect[] = []
  for (const rect of sorted) {
    const last = out[out.length - 1]
    if (
      last &&
      Math.abs(last.y - rect.y) < Math.max(2, last.height * 0.4) &&
      rect.x - (last.x + last.width) < Math.max(3, last.height * 0.6)
    ) {
      const right = Math.max(last.x + last.width, rect.x + rect.width)
      const bottom = Math.max(last.y + last.height, rect.y + rect.height)
      last.x = Math.min(last.x, rect.x)
      last.y = Math.min(last.y, rect.y)
      last.width = right - last.x
      last.height = bottom - last.y
    } else {
      out.push({ ...rect })
    }
  }
  return out
}

/** Finds occurrences of `query` inside the text items of a page. */
export function searchItems(
  items: TextItemGeometry[],
  query: string,
  pageId: string,
  pageIndex: number,
): TextMatch[] {
  const needle = query.trim()
  if (!needle) return []
  const lowerNeedle = needle.toLowerCase()
  const matches: TextMatch[] = []

  for (const item of items) {
    const haystack = item.str.toLowerCase()
    let from = 0
    for (;;) {
      const index = haystack.indexOf(lowerNeedle, from)
      if (index < 0) break
      const ratio = item.width > 0 ? item.width / Math.max(1, item.str.length) : 0
      matches.push({
        pageId,
        pageIndex,
        text: item.str,
        offset: index,
        length: needle.length,
        rect: {
          x: item.x + item.dirX * ratio * index,
          y: item.y,
          width: ratio * needle.length,
          height: item.height,
        },
      })
      from = index + Math.max(1, lowerNeedle.length)
      if (matches.length > 500) break
    }
  }
  return matches
}

/** The plain text of a page, useful for the "copy text" helper. */
export function pagePlainText(items: TextItemGeometry[]): string {
  return items.map((i) => i.str).join('')
}
