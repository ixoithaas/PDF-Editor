import {
  PDFBool,
  PDFDocument,
  PDFDict,
  PDFName,
  PDFPage,
  PDFRef,
  StandardFonts,
  degrees,
  rgb,
  LineCapStyle,
  type Color,
} from 'pdf-lib'
import type {
  Annotation,
  DocumentMeta,
  PageModel,
  Rect,
  SourceDoc,
  FormField,
} from '../types'
import { FontRegistry, sanitizeText } from './fonts'
import { encryptDocument } from './encryptPdf'
import { finalRotation } from './rotation'

export interface ExportOptions {
  sources: SourceDoc[]
  /** The source document that provides the base for the output file. */
  primarySourceId: string
  pages: PageModel[]
  annotations: Annotation[]
  formValues: Record<string, string>
  /** Printed-cell fields inferred from a non-interactive form. */
  detectedFields?: FormField[]
  meta?: Partial<DocumentMeta>
  /** Flatten interactive form fields into page content. */
  flattenForm?: boolean
  userPassword?: string
  ownerPassword?: string
  permissions?: number
}

export interface ExportResult {
  bytes: Uint8Array
  warnings: string[]
}

/* ------------------------------------------------------------------ *
 * Colour helpers
 * ------------------------------------------------------------------ */

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = (hex || '#000000').replace('#', '').trim()
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6)
  const int = parseInt(full, 16)
  if (Number.isNaN(int)) return { r: 0, g: 0, b: 0 }
  return {
    r: ((int >> 16) & 255) / 255,
    g: ((int >> 8) & 255) / 255,
    b: (int & 255) / 255,
  }
}

function color(hex: string): Color {
  const { r, g, b } = hexToRgb(hex)
  return rgb(r, g, b)
}

/* ------------------------------------------------------------------ *
 * Main entry point
 * ------------------------------------------------------------------ */

export async function exportPdf(options: ExportOptions): Promise<ExportResult> {
  const warnings: string[] = []
  const primary = options.sources.find((s) => s.id === options.primarySourceId)
  if (!primary) throw new Error('The source document is no longer available.')

  const doc = await PDFDocument.load(primary.bytes.slice(), {
    ignoreEncryption: true,
    updateMetadata: false,
  })

  const sourcePages = doc.getPages()
  const extraDocs = new Map<string, PDFDocument>()
  for (const source of options.sources) {
    if (source.id === primary.id) continue
    try {
      extraDocs.set(
        source.id,
        await PDFDocument.load(source.bytes.slice(), {
          ignoreEncryption: true,
          updateMetadata: false,
        }),
      )
    } catch {
      warnings.push(`"${source.name}" could not be re-opened for export.`)
    }
  }

  /* ---- 1. Build the target page list ---------------------------- */
  const usage = new Map<string, number>()
  const targetPages: PDFPage[] = []

  for (const model of options.pages) {
    if (model.blank) {
      const blank = PDFPage.create(doc)
      blank.setSize(model.width, model.height)
      targetPages.push(blank)
      continue
    }

    const isPrimary = model.sourceId === primary.id
    const key = `${model.sourceId}:${model.sourceIndex}`
    const seen = usage.get(key) ?? 0
    usage.set(key, seen + 1)

    if (isPrimary && seen === 0) {
      const source = sourcePages[model.sourceIndex]
      if (!source) {
        warnings.push(`Page ${model.sourceIndex + 1} could not be found and was skipped.`)
        continue
      }
      targetPages.push(source)
      continue
    }

    try {
      let copied: PDFPage[]
      if (isPrimary) {
        ;[copied] = [await doc.copyPages(doc, [model.sourceIndex])]
      } else {
        const other = extraDocs.get(model.sourceId)
        if (!other) continue
        ;[copied] = [await doc.copyPages(other, [model.sourceIndex])]
      }
      fixPageReferences(copied[0])
      targetPages.push(copied[0])
    } catch {
      warnings.push(`Page ${model.sourceIndex + 1} could not be copied.`)
    }
  }

  /* ---- 2. Re-order / delete pages in the page tree --------------- */
  while (doc.getPageCount() > 0) doc.removePage(0)
  targetPages.forEach((page) => {
    doc.addPage(page)
  })

  /* ---- 3. Rotations --------------------------------------------- */
  options.pages.forEach((model, index) => {
    const page = doc.getPage(index)
    if (!page) return
    try {
      page.setRotation(degrees(finalRotation(model)))
    } catch {
      /* ignore */
    }
  })

  /* ---- 4. Form fields ------------------------------------------- */
  try {
    await applyFormValues(doc, options.formValues, warnings)
    if (options.flattenForm) {
      doc.getForm().flatten()
    }
  } catch (err) {
    warnings.push(`Some form fields could not be updated: ${(err as Error).message}`)
  }

  /* ---- 5. Annotations ------------------------------------------- */
  const fonts = new FontRegistry(doc)
  const annotationsByPage = new Map<string, Annotation[]>()
  for (const annotation of options.annotations) {
    const list = annotationsByPage.get(annotation.pageId) ?? []
    list.push(annotation)
    annotationsByPage.set(annotation.pageId, list)
  }

  for (const [index, model] of options.pages.entries()) {
    const page = doc.getPage(index)
    if (!page) continue
    const list = annotationsByPage.get(model.id)
    if (!list?.length) continue
    for (const annotation of list) {
      try {
        await drawAnnotation(page, annotation, fonts)
      } catch (err) {
        warnings.push(
          `An annotation could not be drawn (${annotation.kind}): ${(err as Error).message}`,
        )
      }
    }
  }

  /* ---- 6. Values typed into detected printed-cell fields -------- */
  if (options.detectedFields?.length) {
    const font = await doc.embedFont(StandardFonts.Helvetica)
    for (const [index, model] of options.pages.entries()) {
      const page = doc.getPage(index)
      if (!page) continue
      for (const field of options.detectedFields) {
        if (field.pageId !== model.id) continue
        const value = options.formValues[field.name]?.trim()
        if (!value) continue
        const inset = Math.max(1.5, Math.min(4, field.rect.height * 0.12))
        const maxSize = Math.max(5, Math.min(12, (field.rect.height - inset * 2) * 0.72))
        let size = maxSize
        while (size > 4 && font.widthOfTextAtSize(value, size) > field.rect.width - inset * 2) {
          size -= 0.25
        }
        page.drawText(value, {
          x: field.rect.x + inset,
          y: field.rect.y + Math.max(inset, (field.rect.height - size) / 2),
          size,
          font,
          color: rgb(0.08, 0.1, 0.14),
          maxWidth: Math.max(1, field.rect.width - inset * 2),
        })
      }
    }
  }

  /* ---- 7. Metadata ---------------------------------------------- */
  const meta = options.meta
  if (meta) {
    if (meta.title !== undefined) doc.setTitle(meta.title)
    if (meta.author !== undefined) doc.setAuthor(meta.author)
    if (meta.subject !== undefined) doc.setSubject(meta.subject)
    if (meta.keywords !== undefined)
      doc.setKeywords(
        meta.keywords
          .split(/[,;]/)
          .map((k) => k.trim())
          .filter(Boolean),
      )
    if (meta.creator !== undefined) doc.setCreator(meta.creator)
    if (meta.producer !== undefined) doc.setProducer(meta.producer)
  }

  /* ---- 7. Encryption (RC4 128, /V 2 /R 3) ------------------------ */
  const encrypted = Boolean(options.userPassword || options.ownerPassword)
  if (encrypted) {
    try {
      encryptDocument(doc, {
        userPassword: options.userPassword ?? '',
        ownerPassword: options.ownerPassword ?? options.userPassword ?? '',
        permissions: options.permissions ?? -1,
      })
    } catch (err) {
      warnings.push(`The document could not be encrypted: ${(err as Error).message}`)
    }
  }

  /* ---- 8. Save --------------------------------------------------- */
  const bytes = await doc.save({
    // Object streams would encrypt their contents twice, so plain objects
    // are used whenever the document is protected.
    useObjectStreams: !encrypted,
    addDefaultPage: false,
    // Appearances are refreshed explicitly above; doing it again here would
    // read back encrypted strings and produce garbage.
    updateFieldAppearances: false,
  })

  return { bytes, warnings }
}

/**
 * Widget annotations copied from another page keep a stale `/P` entry that
 * points at an orphan page object.  Re-point them at the real page.
 */
function fixPageReferences(page: PDFPage) {
  try {
    const annots = page.node.Annots()
    if (!annots) return
    const orphans: PDFRef[] = []
    for (let i = 0; i < annots.size(); i++) {
      const entry = annots.get(i)
      if (!(entry instanceof PDFRef)) continue
      const dict = page.doc.context.lookup(entry)
      if (!(dict instanceof PDFDict)) continue
      const p = dict.get(PDFName.of('P'))
      if (p instanceof PDFRef && p !== page.ref) {
        orphans.push(p)
        dict.set(PDFName.of('P'), page.ref)
      }
    }
    orphans.forEach((ref) => {
      try {
        page.doc.context.delete(ref)
      } catch {
        /* ignore */
      }
    })
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 * Form values
 * ------------------------------------------------------------------ */

async function applyFormValues(
  doc: PDFDocument,
  values: Record<string, string>,
  warnings: string[],
) {
  const entries = Object.entries(values ?? {}).filter(
    ([, v]) => v !== undefined && v !== null,
  )
  if (!entries.length) return

  const form = doc.getForm()
  const fields = form.getFields()

  for (const [name, value] of entries) {
    const field = fields.find((f) => f.getName() === name)
    if (!field) continue
    try {
      const anyField = field as unknown as Record<string, unknown>
      if (typeof anyField.setText === 'function') {
        ;(anyField.setText as (v: string) => void)(value)
      } else if (typeof anyField.check === 'function') {
        const checked = value === 'On' || value === 'true' || value === 'Yes'
        if (checked) (anyField.check as () => void)()
        else (anyField.uncheck as () => void)()
      } else if (typeof anyField.select === 'function') {
        ;(anyField.select as (v: string) => void)(value)
      }
    } catch (err) {
      warnings.push(`Field "${name}" could not be updated: ${(err as Error).message}`)
    }
  }

  try {
    const helvetica = await doc.embedFont(StandardFonts.Helvetica)
    form.updateFieldAppearances(helvetica)
    // Ask viewers to rebuild appearances so every renderer shows the values.
    form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True)
  } catch {
    /* appearances are best-effort */
  }
}

/* ------------------------------------------------------------------ *
 * Annotation rendering
 * ------------------------------------------------------------------ */

async function drawAnnotation(
  page: PDFPage,
  annotation: Annotation,
  fonts: FontRegistry,
): Promise<void> {
  switch (annotation.kind) {
    case 'text':
      await drawText(page, annotation, fonts)
      break
    case 'draw':
      drawPolyline(
        page,
        annotation.points,
        annotation.color,
        annotation.strokeWidth,
        annotation.opacity,
      )
      break
    case 'rect':
      page.drawRectangle({
        x: annotation.x,
        y: annotation.y,
        width: annotation.width,
        height: annotation.height,
        color: color(annotation.filled ? annotation.fillColor : annotation.color),
        opacity: annotation.filled ? annotation.opacity : 0,
        borderColor: color(annotation.color),
        borderWidth: annotation.strokeWidth,
        borderOpacity: annotation.opacity,
      })
      break
    case 'ellipse':
      page.drawEllipse({
        x: annotation.x + annotation.width / 2,
        y: annotation.y + annotation.height / 2,
        xScale: annotation.width / 2,
        yScale: annotation.height / 2,
        color: color(annotation.filled ? annotation.fillColor : annotation.color),
        opacity: annotation.filled ? annotation.opacity : 0,
        borderColor: color(annotation.color),
        borderWidth: annotation.strokeWidth,
        borderOpacity: annotation.opacity,
      })
      break
    case 'line':
      page.drawLine({
        start: { x: annotation.x1, y: annotation.y1 },
        end: { x: annotation.x2, y: annotation.y2 },
        thickness: annotation.strokeWidth,
        color: color(annotation.color),
        opacity: annotation.opacity,
        lineCap: LineCapStyle.Round,
      })
      break
    case 'arrow':
      drawArrow(page, annotation)
      break
    case 'image':
      await drawImage(page, annotation)
      break
    case 'highlight':
      for (const rect of annotation.rects) {
        page.drawRectangle({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          color: color(annotation.color),
          opacity: annotation.opacity * 0.45,
        })
      }
      break
    case 'underline':
      for (const rect of annotation.rects) {
        page.drawLine({
          start: { x: rect.x, y: rect.y },
          end: { x: rect.x + rect.width, y: rect.y },
          thickness: Math.max(0.7, annotation.strokeWidth),
          color: color(annotation.color),
          opacity: annotation.opacity,
        })
      }
      break
    case 'strikeout':
      for (const rect of annotation.rects) {
        page.drawLine({
          start: { x: rect.x, y: rect.y + rect.height * 0.32 },
          end: { x: rect.x + rect.width, y: rect.y + rect.height * 0.32 },
          thickness: Math.max(0.7, annotation.strokeWidth),
          color: color(annotation.color),
          opacity: annotation.opacity,
        })
      }
      break
    case 'stamp':
      await drawStamp(page, annotation, fonts)
      break
  }
}

async function drawText(
  page: PDFPage,
  annotation: Extract<Annotation, { kind: 'text' }>,
  fonts: FontRegistry,
) {
  const { font } = await fonts.getEncodable(annotation.font, annotation.text)
  const text = sanitizeText(font, annotation.text)
  if (!text.trim()) return

  const size = annotation.fontSize
  const angle = annotation.angle
  const rad = (angle * Math.PI) / 180
  const lineHeight = size * 1.25

  const lines = text.split(/\r\n|\r|\n/)
  // The "next line" direction in user space for a baseline rotated by `angle`.
  const downX = Math.sin(rad)
  const downY = -Math.cos(rad)

  let cursorY = annotation.y
  let cursorX = annotation.x

  for (const line of lines) {
    const width = font.widthOfTextAtSize(line, size)
    let x = cursorX
    if (annotation.align === 'center') x = cursorX - width / 2
    else if (annotation.align === 'right') x = cursorX - width

    page.drawText(line, {
      x,
      y: cursorY,
      size,
      font,
      color: color(annotation.color),
      rotate: degrees(angle),
      opacity: annotation.opacity,
    })

    cursorX += lineHeight * downX
    cursorY += lineHeight * downY
  }
}

function drawPolyline(
  page: PDFPage,
  points: { x: number; y: number }[],
  stroke: string,
  thickness: number,
  opacity: number,
) {
  if (points.length === 0) return
  if (points.length === 1) {
    const p = points[0]
    page.drawCircle({
      x: p.x,
      y: p.y,
      size: Math.max(0.3, thickness / 2),
      color: color(stroke),
      opacity,
    })
    return
  }
  for (let i = 0; i < points.length - 1; i++) {
    page.drawLine({
      start: { x: points[i].x, y: points[i].y },
      end: { x: points[i + 1].x, y: points[i + 1].y },
      thickness,
      color: color(stroke),
      opacity,
      lineCap: LineCapStyle.Round,
    })
  }
}

function drawArrow(page: PDFPage, annotation: Extract<Annotation, { kind: 'line' | 'arrow' }>) {
  const { x1, y1, x2, y2 } = annotation
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const head = Math.min(len * 0.4, Math.max(7, annotation.strokeWidth * 4))
  const angle = Math.atan2(dy, dx)
  const spread = Math.PI / 7

  page.drawLine({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    thickness: annotation.strokeWidth,
    color: color(annotation.color),
    opacity: annotation.opacity,
    lineCap: LineCapStyle.Round,
  })

  const back = head * 0.9
  const left = {
    x: x2 - back * Math.cos(angle - spread),
    y: y2 - back * Math.sin(angle - spread),
  }
  const right = {
    x: x2 - back * Math.cos(angle + spread),
    y: y2 - back * Math.sin(angle + spread),
  }

  page.drawLine({
    start: left,
    end: { x: x2, y: y2 },
    thickness: annotation.strokeWidth,
    color: color(annotation.color),
    opacity: annotation.opacity,
    lineCap: LineCapStyle.Round,
  })
  page.drawLine({
    start: right,
    end: { x: x2, y: y2 },
    thickness: annotation.strokeWidth,
    color: color(annotation.color),
    opacity: annotation.opacity,
    lineCap: LineCapStyle.Round,
  })
}

async function drawImage(
  page: PDFPage,
  annotation: Extract<Annotation, { kind: 'image' }>,
) {
  const bytes = dataUrlToBytes(annotation.src)
  if (!bytes) return
  const isPng = annotation.src.startsWith('data:image/png')
  const image = isPng
    ? await page.doc.embedPng(bytes)
    : await page.doc.embedJpg(bytes)
  page.drawImage(image, {
    x: annotation.x,
    y: annotation.y,
    width: annotation.width,
    height: annotation.height,
    opacity: annotation.opacity,
  })
}

async function drawStamp(
  page: PDFPage,
  annotation: Extract<Annotation, { kind: 'stamp' }>,
  fonts: FontRegistry,
) {
  const size = annotation.size
  const { font } = await fonts.getEncodable('helvetica-bold', annotation.label)
  const text = sanitizeText(font, annotation.label)
  const textWidth = font.widthOfTextAtSize(text, size)
  const angle = degrees(annotation.angle)

  page.drawRectangle({
    x: annotation.x,
    y: annotation.y,
    width: annotation.boxWidth,
    height: annotation.boxHeight,
    rotate: angle,
    color: color(annotation.color),
    opacity: 0,
    borderColor: color(annotation.color),
    borderWidth: Math.max(1, size * 0.09),
    borderOpacity: annotation.opacity,
  })

  page.drawText(text, {
    x: annotation.x + (annotation.boxWidth - textWidth) / 2,
    y: annotation.y + annotation.boxHeight * 0.3,
    size,
    font,
    rotate: angle,
    color: color(annotation.color),
    opacity: annotation.opacity,
  })
}

export function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  try {
    const comma = dataUrl.indexOf(',')
    if (comma < 0) return null
    const meta = dataUrl.slice(0, comma)
    const payload = dataUrl.slice(comma + 1)
    if (meta.includes(';base64')) {
      const binary = atob(payload)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return bytes
    }
    return new TextEncoder().encode(decodeURIComponent(payload))
  } catch {
    return null
  }
}

/** Utility used by the UI to compute a rectangle's centre. */
export function rectCenter(rect: Rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}
