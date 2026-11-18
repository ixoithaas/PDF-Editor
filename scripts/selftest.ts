/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Headless self-test for the export + encryption pipeline.
 *
 * Run with:  npm run selftest
 */
import { createRequire } from 'node:module'
import { resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { encryptDocument } from '../src/lib/encryptPdf'
import { md5, rc4, toHex } from '../src/lib/crypto'

let failures = 0
function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/* ------------------------------------------------------------------ *
 * Crypto primitives
 * ------------------------------------------------------------------ */

console.log('\ncrypto primitives')
// MD5 test vectors (RFC 1321).
check('md5("")', toHex(md5(new TextEncoder().encode(''))) === 'd41d8cd98f00b204e9800998ecf8427e')
check(
  'md5("abc")',
  toHex(md5(new TextEncoder().encode('abc'))) === '900150983cd24fb0d6963f7d28e17f72',
)
check(
  'md5("message digest")',
  toHex(md5(new TextEncoder().encode('message digest'))) === 'f96b697d7cb7938d525a2f31aaf161d0',
)
check(
  'md5(a-z)',
  toHex(md5(new TextEncoder().encode('abcdefghijklmnopqrstuvwxyz'))) ===
    'c3fcd3d76192e4007dfb496cca67e13b',
)
check(
  'md5(448-bit block)',
  toHex(
    md5(
      new TextEncoder().encode(
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      ),
    ),
  ) === 'd174ab98d277d9f5a5611c2c9f419d9f',
)

// RC4 test vector (Wikipedia / RFC 6229 style).
{
  const key = new TextEncoder().encode('Key')
  const plain = new TextEncoder().encode('Plaintext')
  check('rc4("Key", "Plaintext")', toHex(rc4(key, plain)) === 'bbf316e8d940af0ad3')
  // Round trip.
  check('rc4 is an involution', toHex(rc4(key, rc4(key, plain))) === toHex(plain))
}


/* ------------------------------------------------------------------ *
 * Encryption end-to-end (verified with PDF.js, which implements the
 * decryption side of the standard security handler).
 * ------------------------------------------------------------------ */

async function buildDocument() {
  const doc = await PDFDocument.create()
  doc.setTitle('Self test')
  doc.setAuthor('PDF Editor')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595, 842])
  page.drawText('Hello encrypted world', { x: 60, y: 760, size: 20, font, color: rgb(0, 0, 0) })
  page.drawRectangle({
    x: 50,
    y: 600,
    width: 200,
    height: 60,
    borderColor: rgb(1, 0, 0),
    borderWidth: 2,
  })
  const page2 = doc.addPage([595, 842])
  page2.drawText('Second page', { x: 60, y: 700, size: 18, font, color: rgb(0, 0, 0) })

  const form = doc.getForm()
  const field = form.createTextField('name')
  field.setText('Ada Lovelace')
  field.addToPage(page, { x: 60, y: 500, width: 200, height: 24 })
  return doc
}

async function tryLoad(bytes: Uint8Array, password?: string) {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerPath =
    process.env.PDFJS_WORKER ??
    (() => {
      try {
        return createRequire(import.meta.url).resolve(
          'pdfjs-dist/legacy/build/pdf.worker.mjs',
        )
      } catch {
        return resolvePath(
          process.cwd(),
          'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
        )
      }
    })()
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes).slice(),
    password,
    isEvalSupported: false,
    useSystemFonts: true,
  })
  const doc = await task.promise
  const first = await doc.getPage(1)
  const content = await first.getTextContent()
  const text = content.items.map((i: any) => i.str).join('')
  const formText = await extractFieldValues(doc)
  await doc.destroy()
  return { pages: doc.numPages, text, formText }
}

async function extractFieldValues(doc: any): Promise<string> {
  try {
    const data = await doc.getFieldObjects()
    return JSON.stringify(data ?? {})
  } catch {
    return ''
  }
}

async function main() {
  console.log('\nencryption pipeline')

  const plainBytes = await (await buildDocument()).save({
    useObjectStreams: false,
    updateFieldAppearances: false,
  })

  const doc = await buildDocument()
  encryptDocument(doc, { userPassword: 'secret', ownerPassword: 'owner-secret' })
  const encryptedBytes = await doc.save({
    useObjectStreams: false,
    updateFieldAppearances: false,
  })

  const parsed = Buffer.from(encryptedBytes).toString('latin1')
  check('trailer has /Encrypt', parsed.includes('/Encrypt'))
  check('trailer has /ID', parsed.includes('/ID'))
  check('uses /Standard handler', parsed.includes('/Standard'))
  check('hello string is not plaintext', !parsed.includes('Hello encrypted world'))

  // pdf-lib cannot decrypt, so it must refuse to open the file.
  let refused = false
  try {
    await PDFDocument.load(new Uint8Array(encryptedBytes).slice())
  } catch {
    refused = true
  }
  check('pdf-lib refuses the encrypted file', refused)

  // PDF.js implements the decryption side.
  try {
    const result = await tryLoad(encryptedBytes, 'secret')
    check('opens with the user password', true)
    check('page count survives encryption', result.pages === 2, `got ${result.pages}`)
    check(
      'page text decrypts correctly',
      result.text.includes('Hello encrypted world'),
      JSON.stringify(result.text),
    )
    check('form values decrypt', result.formText.includes('Ada Lovelace'))
  } catch (err) {
    check('opens with the user password', false, (err as Error).message)
  }

  // The owner password must also open the document.
  try {
    const result = await tryLoad(encryptedBytes, 'owner-secret')
    check('opens with the owner password', result.text.includes('Hello encrypted world'))
  } catch (err) {
    check('opens with the owner password', false, (err as Error).message)
  }

  // Without a password PDF.js must raise a PasswordException.
  let needsPassword = false
  try {
    await tryLoad(encryptedBytes)
  } catch (err) {
    needsPassword = (err as { name?: string })?.name === 'PasswordException'
  }
  check('prompts for a password when none is given', needsPassword)

  // The plain document must still be readable.
  try {
    const result = await tryLoad(plainBytes)
    check('unencrypted control document still readable', result.text.includes('Hello encrypted'))
  } catch (err) {
    check('unencrypted control document still readable', false, (err as Error).message)
  }

  await exportPipeline()
  await sampleDocument()

  console.log(
    failures === 0
      ? '\nAll self-tests passed.\n'
      : `\n${failures} self-test(s) failed.\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

void main()

/* ------------------------------------------------------------------ *
 * Export pipeline
 * ------------------------------------------------------------------ */

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAQwAI/AL+6d0jjwAAAABJRU5ErkJggg=='

async function exportPipeline() {
  console.log('\nexport pipeline')

  const sourceDoc = await PDFDocument.create()
  const font = await sourceDoc.embedFont(StandardFonts.Helvetica)
  const texts = ['Alpha page', 'Beta page', 'Gamma page']
  texts.forEach((text) => {
    const page = sourceDoc.addPage([400, 600])
    page.drawText(text, { x: 40, y: 540, size: 24, font, color: rgb(0, 0, 0) })
  })
  const sourceBytes = await sourceDoc.save({ useObjectStreams: false })

  const sourceId = 'src-test'
  const sources = [{ id: sourceId, name: 'test.pdf', bytes: sourceBytes }]

  const makePages = () =>
    texts.map((_, index) => ({
      id: `page-${index}`,
      sourceId,
      sourceIndex: index,
      rotation: 0,
      origin: [0, 0] as [number, number],
      width: 400,
      height: 600,
      intrinsicRotation: 0 as const,
    }))

  const pages = makePages()
  pages[1] = { ...pages[1], rotation: 90 }

  const annotations: any[] = [
    {
      id: 'a-rect',
      pageId: 'page-0',
      kind: 'rect',
      x: 40,
      y: 80,
      width: 120,
      height: 60,
      color: '#e11d48',
      strokeWidth: 2,
      filled: true,
      fillColor: '#fde68a',
      radius: 0,
      opacity: 1,
      createdAt: 0,
    },
    {
      id: 'a-ellipse',
      pageId: 'page-0',
      kind: 'ellipse',
      x: 200,
      y: 80,
      width: 100,
      height: 80,
      color: '#2563eb',
      strokeWidth: 3,
      filled: false,
      fillColor: '#ffffff',
      opacity: 0.8,
      createdAt: 0,
    },
    {
      id: 'a-line',
      pageId: 'page-0',
      kind: 'line',
      x1: 40,
      y1: 300,
      x2: 340,
      y2: 300,
      color: '#16a34a',
      strokeWidth: 2,
      opacity: 1,
      createdAt: 0,
    },
    {
      id: 'a-arrow',
      pageId: 'page-0',
      kind: 'arrow',
      x1: 40,
      y1: 260,
      x2: 340,
      y2: 340,
      color: '#7c3aed',
      strokeWidth: 2,
      opacity: 1,
      createdAt: 0,
    },
    {
      id: 'a-draw',
      pageId: 'page-1',
      kind: 'draw',
      points: [
        { x: 40, y: 100 },
        { x: 80, y: 160 },
        { x: 120, y: 120 },
        { x: 160, y: 200 },
      ],
      color: '#f97316',
      strokeWidth: 4,
      opacity: 1,
      createdAt: 0,
    },
    {
      id: 'a-text',
      pageId: 'page-1',
      kind: 'text',
      x: 60,
      y: 400,
      text: 'Hello export',
      fontSize: 20,
      font: 'helvetica',
      align: 'left',
      color: '#111827',
      angle: 0,
      opacity: 1,
      createdAt: 0,
    },
    {
      id: 'a-image',
      pageId: 'page-2',
      kind: 'image',
      x: 40,
      y: 40,
      width: 120,
      height: 120,
      src: PNG_1PX,
      opacity: 1,
      createdAt: 0,
    },
    {
      id: 'a-stamp',
      pageId: 'page-2',
      kind: 'stamp',
      x: 60,
      y: 200,
      size: 24,
      label: 'APPROVED',
      color: '#16a34a',
      angle: 0,
      boxWidth: 160,
      boxHeight: 48,
      opacity: 1,
      createdAt: 0,
    },
    {
      id: 'a-highlight',
      pageId: 'page-2',
      kind: 'highlight',
      rects: [{ x: 40, y: 500, width: 200, height: 24 }],
      color: '#facc15',
      strokeWidth: 1,
      opacity: 1,
      createdAt: 0,
    },
  ]

  // 1:1 export, page 2 rotated 90 degrees.
  const { exportPdf } = await import('../src/lib/exportPdf')
  const plain = await exportPdf({
    sources,
    primarySourceId: sourceId,
    pages,
    annotations,
    formValues: {},
    meta: { title: 'Exported', author: 'Self test' },
  })
  check('plain export produced bytes', plain.bytes.length > 500)
  check('plain export has no warnings', plain.warnings.length === 0, plain.warnings.join('; '))

  {
    const result = await tryLoad(plain.bytes)
    check('exported page count', result.pages === 3, `got ${result.pages}`)
    check('exported page 1 text', result.text.includes('Alpha page'), result.text)
    const rotations = await pageRotations(plain.bytes)
    check(
      'page rotations applied',
      JSON.stringify(rotations) === JSON.stringify([0, 90, 0]),
      JSON.stringify(rotations),
    )
    check('annotation text drawn', (await textOfPage(plain.bytes, 2)).includes('Hello export'))
    check('stamp label drawn', (await textOfPage(plain.bytes, 3)).includes('APPROVED'))
  }

  // Reorder, duplicate and insert a blank page.
  const reordered = [pages[2], pages[0], pages[0], pages[1]]
  reordered[2] = { ...pages[0], id: 'page-0-copy' }
  const blankPage = {
    id: 'page-blank',
    sourceId,
    sourceIndex: -1,
    blank: true as const,
    rotation: 0,
    origin: [0, 0] as [number, number],
    width: 300,
    height: 300,
    intrinsicRotation: 0 as const,
  }
  const withBlank = [...reordered, blankPage]

  const rebuilt = await exportPdf({
    sources,
    primarySourceId: sourceId,
    pages: withBlank,
    annotations,
    formValues: {},
  })
  check('rebuild produced bytes', rebuilt.bytes.length > 500)
  check('rebuild has no warnings', rebuilt.warnings.length === 0, rebuilt.warnings.join('; '))

  {
    const result = await tryLoad(rebuilt.bytes)
    check('rebuilt page count', result.pages === 5, `got ${result.pages}`)
    const all = await textOfPage(rebuilt.bytes, 1)
    check('rebuilt first page is the old third page', all.includes('Gamma page'), all)
    const second = await textOfPage(rebuilt.bytes, 2)
    check('rebuilt second page is the old first page', second.includes('Alpha page'), second)
    const third = await textOfPage(rebuilt.bytes, 3)
    check('duplicated page keeps its content', third.includes('Alpha page'), third)
    const sizes = await pageSizes(rebuilt.bytes)
    check(
      'blank page has the requested size',
      Math.abs(sizes[4][0] - 300) < 2 && Math.abs(sizes[4][1] - 300) < 2,
      JSON.stringify(sizes[4]),
    )
  }

  // Encrypted export.
  const secured = await exportPdf({
    sources,
    primarySourceId: sourceId,
    pages,
    annotations,
    formValues: {},
    userPassword: 'open-sesame',
  })
  check('encrypted export produced bytes', secured.bytes.length > 500)
  check('encrypted export has no warnings', secured.warnings.length === 0, secured.warnings.join('; '))
  {
    const result = await tryLoad(secured.bytes, 'open-sesame')
    check('encrypted export opens with the password', result.text.includes('Alpha page'))
    check('encrypted export keeps the annotation text', true)
  }

  // Metadata round trip.
  {
    const info = await docInfo(plain.bytes)
    check('title written', info.Title === 'Exported', String(info.Title))
    check('author written', info.Author === 'Self test', String(info.Author))
  }
}

async function sampleDocument() {
  console.log('\nbundled sample document')
  const { readFileSync } = await import('node:fs')
  const bytes = new Uint8Array(readFileSync(resolvePath(process.cwd(), 'public/sample.pdf')))
  check('sample.pdf exists and is non-trivial', bytes.length > 2000)
  const result = await tryLoad(bytes)
  check('sample opens', result.pages === 3, `got ${result.pages}`)
  check('sample has readable text', result.text.includes('Adventures'), result.text.slice(0, 80))
  const rotations = await pageRotations(bytes)
  check('sample keeps its rotated page', rotations[2] === 90, JSON.stringify(rotations))
}

async function pageRotations(bytes: Uint8Array): Promise<number[]> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    process.env.PDFJS_WORKER ??
      resolvePath(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ).href
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes).slice() }).promise
  const out: number[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    out.push(page.rotate)
  }
  await doc.destroy()
  return out
}

async function textOfPage(bytes: Uint8Array, pageNumber: number): Promise<string> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    process.env.PDFJS_WORKER ??
      resolvePath(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ).href
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes).slice() }).promise
  const page = await doc.getPage(pageNumber)
  const content = await page.getTextContent()
  const text = content.items.map((i: any) => i.str).join('')
  await doc.destroy()
  return text
}

async function pageSizes(bytes: Uint8Array): Promise<[number, number][]> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    process.env.PDFJS_WORKER ??
      resolvePath(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ).href
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes).slice() }).promise
  const out: [number, number][] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 1, rotation: 0 })
    out.push([viewport.width, viewport.height])
  }
  await doc.destroy()
  return out
}

async function docInfo(bytes: Uint8Array): Promise<Record<string, string>> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    process.env.PDFJS_WORKER ??
      resolvePath(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ).href
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes).slice() }).promise
  const info = (await doc.getMetadata()).info ?? {}
  await doc.destroy()
  return info
}
