/**
 * Generates the bundled sample document (public/sample.pdf) so the editor can
 * be tried out without hunting for a PDF first.
 *
 * Run with:  npm run sample
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'

async function main() {
  const doc = await PDFDocument.create()
  doc.setTitle('PDF Editor sample')
  doc.setAuthor('PDF Editor')
  doc.setSubject('A document to try the editor with')
  doc.setKeywords(['sample', 'demo', 'pdf editor'])

  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const ink = rgb(0.07, 0.09, 0.15)
  const accent = rgb(0.31, 0.27, 0.9)

  /* ---- page 1 --------------------------------------------------- */
  const page1 = doc.addPage([595, 842])
  const { width, height } = page1.getSize()
  page1.drawRectangle({
    x: 0,
    y: height - 120,
    width,
    height: 120,
    color: accent,
  })
  page1.drawText('The Adventures of a PDF', {
    x: 56,
    y: height - 76,
    size: 28,
    font: bold,
    color: rgb(1, 1, 1),
  })
  page1.drawText('A sample document for the PDF Editor', {
    x: 56,
    y: height - 100,
    size: 12,
    font: regular,
    color: rgb(0.9, 0.92, 1),
  })

  const paragraphs = [
    'This document was generated so you can explore every feature of the editor ' +
      'without hunting for a file first. Try highlighting this sentence, drawing ' +
      'a rectangle around the paragraph, or stamping the page with APPROVED.',
    'Annotations are stored in PDF user space, which means they stay exactly ' +
      'where you put them when the page is rotated or when the file is exported ' +
      'and reopened in another viewer.',
    'Use the toolbar at the top to search for a word, change the zoom, switch ' +
      'between light and dark mode, or download the edited result. Everything ' +
      'runs locally in your browser — nothing is uploaded.',
  ]

  let y = height - 170
  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ')
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (regular.widthOfTextAtSize(candidate, 11) > width - 112) {
        page1.drawText(line, { x: 56, y, size: 11, font: regular, color: ink })
        y -= 16
        line = word
      } else {
        line = candidate
      }
    }
    if (line) {
      page1.drawText(line, { x: 56, y, size: 11, font: regular, color: ink })
      y -= 16
    }
    y -= 14
  }

  page1.drawRectangle({
    x: 56,
    y: y - 10,
    width: width - 112,
    height: 1,
    color: rgb(0.8, 0.82, 0.88),
  })

  y -= 46
  page1.drawText('A small table', { x: 56, y, size: 14, font: bold, color: ink })
  y -= 24
  const rows = [
    ['Feature', 'Where to find it'],
    ['Highlight & underline', 'Left tool rail, third group'],
    ['Shapes & freehand', 'Left tool rail, fourth group'],
    ['Images & signatures', 'Left tool rail, fifth group'],
  ]
  rows.forEach((row, index) => {
    const font = index === 0 ? bold : regular
    page1.drawText(row[0], { x: 56, y, size: 11, font, color: ink })
    page1.drawText(row[1], { x: 240, y, size: 11, font, color: ink })
    page1.drawRectangle({
      x: 56,
      y: y - 6,
      width: width - 112,
      height: 1,
      color: rgb(0.88, 0.9, 0.94),
    })
    y -= 22
  })

  /* ---- page 2 --------------------------------------------------- */
  const page2 = doc.addPage([595, 842])
  page2.drawText('Page two — shapes and colour', {
    x: 56,
    y: 760,
    size: 20,
    font: bold,
    color: ink,
  })
  page2.drawText(
    'This page has some vector artwork to scribble on. It also has a few words ' +
      'you can search for: pineapple, lighthouse and typewriter.',
    { x: 56, y: 726, size: 11, font: regular, color: ink, maxWidth: 480, lineHeight: 16 },
  )

  page2.drawCircle({ x: 160, y: 560, size: 70, color: rgb(0.95, 0.85, 0.4) })
  page2.drawEllipse({
    x: 340,
    y: 560,
    xScale: 110,
    yScale: 60,
    color: rgb(0.35, 0.7, 0.95),
  })
  page2.drawRectangle({
    x: 80,
    y: 330,
    width: 180,
    height: 110,
    borderColor: rgb(0.85, 0.2, 0.35),
    borderWidth: 4,
    rotate: degrees(12),
  })
  page2.drawLine({
    start: { x: 320, y: 330 },
    end: { x: 520, y: 450 },
    thickness: 6,
    color: rgb(0.15, 0.7, 0.45),
  })
  page2.drawText('Scribble here  --->', { x: 320, y: 300, size: 12, font: regular, color: ink })

  /* ---- page 3, deliberately rotated ----------------------------- */
  const page3 = doc.addPage([595, 842])
  page3.setRotation(degrees(90))
  page3.drawText('This page is rotated 90°', {
    x: 60,
    y: 760,
    size: 20,
    font: bold,
    color: ink,
  })
  page3.drawText(
    'Rotations come from the document itself, so the editor has to respect them ' +
      'when it draws. Use the rotate buttons in the sidebar to add your own.',
    { x: 60, y: 726, size: 11, font: regular, color: ink, maxWidth: 460, lineHeight: 16 },
  )

  /* ---- a form field --------------------------------------------- */
  const form = doc.getForm()
  const name = form.createTextField('fullName')
  name.setText('')
  name.addToPage(page2, { x: 56, y: 180, width: 220, height: 26 })

  const flavour = form.createDropdown('favourite')
  flavour.addOptions(['Highlight', 'Draw', 'Stamp', 'Signature'])
  flavour.select('Highlight')
  flavour.addToPage(page2, { x: 300, y: 180, width: 180, height: 26 })

  const agree = form.createCheckBox('agreed')
  agree.addToPage(page2, { x: 56, y: 130, width: 18, height: 18 })

  const bytes = await doc.save({ useObjectStreams: true })
  const target = resolve(process.cwd(), 'public/sample.pdf')
  writeFileSync(target, bytes)
  console.log(`Wrote ${target} (${bytes.length} bytes, ${doc.getPageCount()} pages)`)
}

void main()
