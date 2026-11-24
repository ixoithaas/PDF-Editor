import type { FormField, PageModel, Rect } from '../types'
import type { PDFJSProxy } from './pdf'
import { finalRotation, uid } from './pdf'

/**
 * Detects small, outlined character cells on rendered PDF pages. This is
 * intentionally geometry-only: document pixels stay in the browser and no OCR
 * or remote service is used. Adjacent cells on the same line become one field.
 */
export async function detectCharacterFields(
  pages: PageModel[],
  docs: Record<string, PDFJSProxy>,
): Promise<FormField[]> {
  const results: FormField[] = []
  let fieldNumber = 0

  for (const page of pages) {
    const doc = docs[page.sourceId]
    if (!doc || page.blank) continue
    try {
      const pdfPage = await doc.getPage(page.sourceIndex + 1)
      const base = pdfPage.getViewport({ scale: 1, rotation: finalRotation(page) })
      // 1.5x is sufficient for thin printed rules without creating huge canvases.
      const scale = Math.min(1.5, 1800 / Math.max(base.width, base.height))
      const viewport = pdfPage.getViewport({ scale, rotation: finalRotation(page) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) continue
      await pdfPage.render({ canvasContext: ctx, viewport }).promise
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const boxes = findBoxComponents(data, canvas.width, canvas.height)
      const rows = mergeRows(boxes)

      for (const row of rows) {
        const [x0, y0, x1, y1] = row
        const a = viewport.convertToPdfPoint(x0, y1)
        const b = viewport.convertToPdfPoint(x1, y0)
        const rect: Rect = {
          x: Math.min(a[0], b[0]),
          y: Math.min(a[1], b[1]),
          width: Math.abs(b[0] - a[0]),
          height: Math.abs(b[1] - a[1]),
        }
        if (rect.width < 12 || rect.height < 8) continue
        fieldNumber += 1
        const name = `__detected_box_${uid('field')}`
        results.push({
          id: name,
          name: `Detected field ${fieldNumber}`,
          type: 'text',
          value: '',
          readOnly: false,
          required: false,
          pageId: page.id,
          rect,
          detected: true,
        })
      }
    } catch {
      // Continue scanning other pages if one page is damaged or unsupported.
    }
  }
  return results
}

/** Find connected, closed, dark rectangular outlines in a rendered page. */
function findBoxComponents(data: Uint8ClampedArray, width: number, height: number) {
  const pixelCount = width * height
  const ink = new Uint8Array(pixelCount)
  const bright = new Uint8Array(pixelCount)
  for (let i = 0; i < pixelCount; i++) {
    const p = i * 4
    const luminance = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114
    if (luminance < 150 && data[p + 3] > 100) ink[i] = 1
    // Some forms use white character cells on a lightly tinted background
    // rather than a dark printed outline. Treat those cells as islands too.
    if (luminance > 245 && data[p + 3] > 100) bright[i] = 1
  }

  const seen = new Uint8Array(pixelCount)
  const queue = new Int32Array(pixelCount)
  const components: [number, number, number, number][] = []
  for (let start = 0; start < pixelCount; start++) {
    if (!ink[start] || seen[start]) continue
    let head = 0
    let tail = 0
    queue[tail++] = start
    seen[start] = 1
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    let count = 0
    while (head < tail) {
      const index = queue[head++]
      const x = index % width
      const y = Math.floor(index / width)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      count++
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const next = ny * width + nx
          if (ink[next] && !seen[next]) {
            seen[next] = 1
            queue[tail++] = next
          }
        }
      }
    }
    const boxWidth = maxX - minX + 1
    const boxHeight = maxY - minY + 1
    if (boxWidth < 9 || boxHeight < 9 || boxWidth > 110 || boxHeight > 90) continue
    if (boxWidth / boxHeight < 0.45 || boxWidth / boxHeight > 2.4) continue
    // Text glyphs are dense; a rectangle has long, mostly continuous edges.
    if (!hasDarkEdge(ink, width, height, minX, minY, maxX, maxY)) continue
    if (count > boxWidth * boxHeight * 0.35) continue
    components.push([minX, minY, maxX + 1, maxY + 1])
  }

  // Also capture filled white cells whose gutters provide the rectangle edge.
  const brightSeen = new Uint8Array(pixelCount)
  for (let start = 0; start < pixelCount; start++) {
    if (!bright[start] || brightSeen[start]) continue
    let head = 0
    let tail = 0
    queue[tail++] = start
    brightSeen[start] = 1
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    while (head < tail) {
      const index = queue[head++]
      const x = index % width
      const y = Math.floor(index / width)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const next = ny * width + nx
          if (bright[next] && !brightSeen[next]) {
            brightSeen[next] = 1
            queue[tail++] = next
          }
        }
      }
    }
    const boxWidth = maxX - minX + 1
    const boxHeight = maxY - minY + 1
    if (boxWidth < 9 || boxHeight < 9 || boxWidth > 110 || boxHeight > 90) continue
    if (boxWidth / boxHeight < 0.45 || boxWidth / boxHeight > 2.4) continue
    if (!hasBrightEdges(bright, width, height, minX, minY, maxX, maxY)) continue
    components.push([minX, minY, maxX + 1, maxY + 1])
  }
  return components
}

function hasBrightEdges(
  mask: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const edgeCoverage = (vertical: boolean, fixed: number) => {
    const length = vertical ? y1 - y0 + 1 : x1 - x0 + 1
    let hits = 0
    for (let n = 0; n < length; n++) {
      const x = vertical ? fixed : x0 + n
      const y = vertical ? y0 + n : fixed
      if (x >= 0 && x < width && y >= 0 && y < height && mask[y * width + x]) hits++
    }
    return hits / length
  }
  return (
    edgeCoverage(false, y0) > 0.65 &&
    edgeCoverage(false, y1) > 0.65 &&
    edgeCoverage(true, x0) > 0.65 &&
    edgeCoverage(true, x1) > 0.65
  )
}

function hasDarkEdge(
  ink: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const bw = x1 - x0 + 1
  const bh = y1 - y0 + 1
  const edgeCount = (x: number, y: number, vertical: boolean) => {
    let hits = 0
    const length = vertical ? bh : bw
    for (let n = 0; n < length; n++) {
      const px = vertical ? x : x0 + n
      const py = vertical ? y0 + n : y
      let found = false
      for (let offset = -1; offset <= 1; offset++) {
        const xx = vertical ? px + offset : px
        const yy = vertical ? py : py + offset
        if (xx >= 0 && xx < width && yy >= 0 && yy < height && ink[yy * width + xx]) {
          found = true
          break
        }
      }
      if (found) hits++
    }
    return hits / length
  }
  return (
    edgeCount(x0, y0, false) > 0.48 &&
    edgeCount(x0, y1, false) > 0.48 &&
    edgeCount(x0, y0, true) > 0.48 &&
    edgeCount(x1, y0, true) > 0.48
  )
}

/** Merge character cells that share a baseline into larger typeable fields. */
function mergeRows(boxes: [number, number, number, number][]) {
  const sorted = [...boxes].sort((a, b) => (a[1] + a[3]) / 2 - (b[1] + b[3]) / 2 || a[0] - b[0])
  const rows: [number, number, number, number][][] = []
  for (const box of sorted) {
    const cy = (box[1] + box[3]) / 2
    const row = rows.find((candidate) => {
      const top = Math.min(...candidate.map((item) => item[1]))
      const bottom = Math.max(...candidate.map((item) => item[3]))
      const center = (top + bottom) / 2
      const typicalHeight = (bottom - top)
      return Math.abs(center - cy) <= Math.max(3, Math.min(box[3] - box[1], typicalHeight) * 0.34)
    })
    if (row) row.push(box)
    else rows.push([box])
  }

  const merged: [number, number, number, number][] = []
  for (const row of rows) {
    row.sort((a, b) => a[0] - b[0])
    let current = [...row[0]] as [number, number, number, number]
    for (let i = 1; i < row.length; i++) {
      const next = row[i]
      const height = Math.max(current[3] - current[1], next[3] - next[1])
      if (next[0] - current[2] <= height * 0.55) {
        current = [current[0], Math.min(current[1], next[1]), next[2], Math.max(current[3], next[3])]
      } else {
        merged.push(current)
        current = [...next]
      }
    }
    merged.push(current)
  }
  return merged.sort((a, b) => a[1] - b[1] || a[0] - b[0])
}
