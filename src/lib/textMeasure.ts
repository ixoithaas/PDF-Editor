import type { FontDefinition } from './fonts'

/**
 * Measure the width of the widest line of `text` rendered with the given
 * font. Uses a shared offscreen canvas in the browser; falls back to a
 * conservative estimate when there is no DOM (e.g. the Node self-tests),
 * so callers always get a usable number.
 */
let measureCtx: CanvasRenderingContext2D | null = null

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null
  try {
    if (!measureCtx) {
      const canvas = document.createElement('canvas')
      measureCtx = canvas.getContext('2d')
    }
    return measureCtx
  } catch {
    return null
  }
}

export function measureTextWidth(
  def: Pick<FontDefinition, 'css' | 'weight' | 'style'>,
  size: number,
  text: string,
): number {
  const lines = text.split(/\r\n|\r|\n/)
  const widest = lines.reduce((max, line) => Math.max(max, line.length), 1)
  const ctx = getMeasureCtx()
  if (ctx) {
    ctx.font = `${def.style} ${def.weight} ${size}px ${def.css}`
    let width = 0
    for (const line of lines) {
      width = Math.max(width, ctx.measureText(line.length ? line : ' ').width)
    }
    if (width > 0) return width
  }
  // Fallback: average glyph width ≈ 0.55 em (the previous 0.6 estimate
  // over-measured, which made the selection box wider than the text).
  return size * widest * 0.55
}
