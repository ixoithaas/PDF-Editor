import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument, PDFRef } from 'pdf-lib'
import type { FormField, PageModel, Rect } from '../types'

/** Minimal shape of a pdf-lib widget annotation used by the editor. */
interface PDFWidgetLike {
  getRectangle(): Rect
  P(): unknown
}

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export { finalRotation, displayRotation } from './rotation'

export type PDFJSProxy = pdfjs.PDFDocumentProxy
export type PDFJSPage = pdfjs.PDFPageProxy

export interface LoadedPdf {
  pdfjsDoc: PDFJSProxy
  pdfLibDoc: PDFDocument
  pages: PageModel[]
  formFields: FormField[]
  /** True when the source document was encrypted. */
  wasEncrypted: boolean
}

let idCounter = 0
export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`

export class PasswordRequiredError extends Error {
  constructor(public readonly incorrect: boolean) {
    super(
      incorrect
        ? 'That password is incorrect.'
        : 'This PDF is password protected. Please enter the password to continue.',
    )
    this.name = 'PasswordRequiredError'
  }
}

export interface LoadOptions {
  password?: string
  onProgress?: (loaded: number, total: number) => void
}

export async function loadPdf(bytes: Uint8Array, options: LoadOptions = {}): Promise<LoadedPdf> {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    password: options.password,
    isEvalSupported: false,
    useSystemFonts: true,
  })

  if (options.onProgress) {
    task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      options.onProgress!(loaded, total)
    }
  }

  let pdfjsDoc: PDFJSProxy
  try {
    pdfjsDoc = await task.promise
  } catch (err) {
    const e = err as { name?: string; code?: number }
    if (e?.name === 'PasswordException') {
      // 1 = NEED_PASSWORD, 2 = INCORRECT_PASSWORD
      throw new PasswordRequiredError(e.code === 2)
    }
    throw err
  }

  let pdfLibDoc: PDFDocument
  try {
    pdfLibDoc = await PDFDocument.load(bytes.slice(), {
      ignoreEncryption: true,
      updateMetadata: false,
    })
  } catch (err) {
    throw new Error(`The PDF could not be parsed: ${(err as Error).message}`)
  }

  const sourceId = uid('src')
  const pages: PageModel[] = []
  for (let i = 0; i < pdfjsDoc.numPages; i++) {
    const jsPage = await pdfjsDoc.getPage(i + 1)
    const libPage = pdfLibDoc.getPage(i)
    const mediaBox = libPage.getMediaBox()
    const intrinsic = (((jsPage.rotate % 360) + 360) % 360) as 0 | 90 | 180 | 270
    pages.push({
      id: uid('page'),
      sourceId,
      sourceIndex: i,
      rotation: 0,
      origin: [mediaBox.x, mediaBox.y],
      width: mediaBox.width,
      height: mediaBox.height,
      intrinsicRotation: intrinsic,
    })
  }

  const formFields = await collectFormFields(pdfLibDoc, pages)

  return { pdfjsDoc, pdfLibDoc, pages, formFields, wasEncrypted: pdfLibDoc.isEncrypted }
}

export async function collectFormFields(
  doc: PDFDocument,
  pages: PageModel[],
): Promise<FormField[]> {
  const fields: FormField[] = []
  let form: ReturnType<PDFDocument['getForm']>
  try {
    form = doc.getForm()
  } catch {
    return fields
  }
  if (!form) return fields

  let libFields: ReturnType<typeof form.getFields>
  try {
    libFields = form.getFields()
  } catch {
    return fields
  }

  // Map a page reference to its index inside the document.
  const pageIndexByRef = new Map<string, number>()
  doc.getPages().forEach((page, index) => {
    pageIndexByRef.set(page.ref.toString(), index)
  })

  for (const field of libFields) {
    const name = field.getName()
    const widgets = safeWidgets(field)
    let rect = { x: 0, y: 0, width: 0, height: 0 }
    if (widgets.length) {
      const r = widgets[0].getRectangle()
      rect = { x: r.x, y: r.y, width: r.width, height: r.height }
    }

    const pageRef = widgets[0]?.P()
    const pageIndex = pageRef ? (pageIndexByRef.get(pageRef.toString()) ?? 0) : 0
    const pageModel = pages[Math.min(pageIndex, Math.max(0, pages.length - 1))]

    const entry: FormField = {
      id: uid('field'),
      name,
      type: mapFieldType(field),
      value: readFieldValue(field),
      readOnly: false,
      required: false,
      pageId: pageModel?.id ?? '',
      rect,
    }
    const options = readFieldOptions(field)
    if (options) entry.options = options
    fields.push(entry)
  }

  return fields
}

function safeWidgets(field: unknown): PDFWidgetLike[] {
  try {
    const acro = (field as { acroField?: { getWidgets(): PDFWidgetLike[] } }).acroField
    return acro?.getWidgets() ?? []
  } catch {
    return []
  }
}

function mapFieldType(field: unknown): FormField['type'] {
  const type = (field as { constructor?: { name?: string } })?.constructor?.name ?? ''
  switch (type) {
    case 'PDFFormTextField':
      return 'text'
    case 'PDFFormCheckBox':
      return 'checkbox'
    case 'PDFFormRadioGroup':
      return 'radio'
    case 'PDFFormDropdown':
      return 'dropdown'
    case 'PDFFormOptionList':
      return 'option'
    case 'PDFFormSignature':
      return 'signature'
    default:
      return 'text'
  }
}

function readFieldValue(field: unknown): string {
  const f = field as Record<string, unknown>
  try {
    if (typeof f.getText === 'function') return (f.getText as () => string)()
    if (typeof f.isChecked === 'function')
      return (f.isChecked as () => boolean)() ? 'On' : 'Off'
    if (typeof f.getSelected === 'function') {
      const selected = (f.getSelected as () => string[])()
      return selected?.join(', ') ?? ''
    }
    if (typeof f.getValue === 'function') return String((f.getValue as () => unknown)())
  } catch {
    /* ignore */
  }
  return ''
}

function readFieldOptions(field: unknown): string[] | undefined {
  const f = field as Record<string, unknown>
  try {
    if (typeof f.getOptions === 'function') {
      const opts = (f.getOptions as () => string[])()
      if (Array.isArray(opts) && opts.length) return opts
    }
  } catch {
    /* ignore */
  }
  return undefined
}

/** The subset of PDF.js' text item the editor relies on. */
export interface PDFTextItem {
  str: string
  width: number
  height: number
  transform: number[]
  fontName: string
  dir?: string
}

/** Extract the plain text items of a page (used by search + the text layer). */
export async function getPageTextItems(page: PDFJSPage): Promise<PDFTextItem[]> {
  const content = await page.getTextContent()
  return (content.items as unknown[])
    .filter((item): item is PDFTextItem => !!item && typeof (item as PDFTextItem).str === 'string')
    .map((item) => ({
      str: item.str,
      width: item.width,
      height: item.height,
      transform: item.transform,
      fontName: item.fontName ?? '',
      dir: 'dir' in item ? String(item.dir) : undefined,
    }))
}

export { PDFRef }
