import { StandardFonts, type PDFFont, type PDFDocument } from 'pdf-lib'

export interface FontDefinition {
  id: string
  label: string
  /** CSS font-family list used for on-canvas preview. */
  css: string
  /** How the font is embedded into the exported PDF. */
  kind: 'standard' | 'custom'
  /** pdf-lib StandardFonts key. */
  standard?: StandardFonts
  /** Runtime URL of the woff2 asset in `public/`, base-prefixed. */
  file?: string
  /** Runtime URL of an extended-charset fallback asset, base-prefixed. */
  fallbackFile?: string
  weight: number
  style: 'normal' | 'italic'
}

const HELVETICA_CSS = '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif'
const TIMES_CSS = '"Times New Roman", Times, "Liberation Serif", serif'
const COURIER_CSS = '"Courier New", Courier, "Liberation Mono", monospace'
const ROBOTO_CSS = '"PDFRoboto", Roboto, "Helvetica Neue", Arial, sans-serif'
const LORA_CSS = '"PDFLora", Lora, Georgia, "Times New Roman", serif'

/**
 * Runtime URL of a file under `public/`.
 *
 * These paths are handed to `fetch()` when a font is embedded, so unlike the
 * URLs in index.html and index.css the bundler cannot rewrite them — they have
 * to be prefixed with Vite's base, which is `/<repo>/` on GitHub Pages.
 */
function publicAsset(path: string): string {
  // `import.meta.env` only exists inside Vite; the optional chain keeps this
  // module importable from plain Node (the self-test bundle).
  const base = import.meta.env?.BASE_URL || '/'
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`
}

/** URL of a bundled font file in `public/fonts/`. */
const fontFile = (name: string) => publicAsset(`fonts/${name}`)

export const FONTS: FontDefinition[] = [
  { id: 'helvetica', label: 'Helvetica', css: HELVETICA_CSS, kind: 'standard', standard: StandardFonts.Helvetica, weight: 400, style: 'normal' },
  { id: 'helvetica-bold', label: 'Helvetica Bold', css: HELVETICA_CSS, kind: 'standard', standard: StandardFonts.HelveticaBold, weight: 700, style: 'normal' },
  { id: 'times', label: 'Times New Roman', css: TIMES_CSS, kind: 'standard', standard: StandardFonts.TimesRoman, weight: 400, style: 'normal' },
  { id: 'times-bold', label: 'Times New Roman Bold', css: TIMES_CSS, kind: 'standard', standard: StandardFonts.TimesRomanBold, weight: 700, style: 'normal' },
  { id: 'courier', label: 'Courier New', css: COURIER_CSS, kind: 'standard', standard: StandardFonts.Courier, weight: 400, style: 'normal' },
  { id: 'courier-bold', label: 'Courier New Bold', css: COURIER_CSS, kind: 'standard', standard: StandardFonts.CourierBold, weight: 700, style: 'normal' },
  { id: 'roboto', label: 'Roboto', css: ROBOTO_CSS, kind: 'custom', file: fontFile('roboto-latin-400-normal.woff2'), fallbackFile: fontFile('roboto-latin-ext-400-normal.woff2'), weight: 400, style: 'normal' },
  { id: 'roboto-bold', label: 'Roboto Bold', css: ROBOTO_CSS, kind: 'custom', file: fontFile('roboto-latin-700-normal.woff2'), fallbackFile: fontFile('roboto-latin-ext-700-normal.woff2'), weight: 700, style: 'normal' },
  { id: 'roboto-italic', label: 'Roboto Italic', css: ROBOTO_CSS, kind: 'custom', file: fontFile('roboto-latin-400-italic.woff2'), weight: 400, style: 'italic' },
  { id: 'roboto-bolditalic', label: 'Roboto Bold Italic', css: ROBOTO_CSS, kind: 'custom', file: fontFile('roboto-latin-700-italic.woff2'), weight: 700, style: 'italic' },
  { id: 'lora', label: 'Lora', css: LORA_CSS, kind: 'custom', file: fontFile('lora-latin-400-normal.woff2'), fallbackFile: fontFile('lora-latin-ext-400-normal.woff2'), weight: 400, style: 'normal' },
  { id: 'lora-bold', label: 'Lora Bold', css: LORA_CSS, kind: 'custom', file: fontFile('lora-latin-700-normal.woff2'), weight: 700, style: 'normal' },
  { id: 'lora-italic', label: 'Lora Italic', css: LORA_CSS, kind: 'custom', file: fontFile('lora-latin-400-italic.woff2'), weight: 400, style: 'italic' },
]

const FONT_MAP = new Map(FONTS.map((f) => [f.id, f]))

export function getFont(id: string): FontDefinition {
  return FONT_MAP.get(id) ?? FONTS[0]
}

export function fontCss(id: string, size: number, weight?: number, style?: 'normal' | 'italic'): string {
  const def = getFont(id)
  return `${style ?? def.style} ${weight ?? def.weight} ${size}px ${def.css}`
}

/* ------------------------------------------------------------------ *
 * Embedding
 * ------------------------------------------------------------------ */

const assetCache = new Map<string, ArrayBuffer>()

async function loadAsset(url: string): Promise<ArrayBuffer> {
  const cached = assetCache.get(url)
  if (cached) return cached
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Unable to load font asset: ${url}`)
  const buf = await res.arrayBuffer()
  assetCache.set(url, buf)
  return buf
}

let fontkitPromise: Promise<unknown> | null = null
async function ensureFontkit() {
  if (!fontkitPromise) {
    fontkitPromise = import('@pdf-lib/fontkit').then((m) => m.default ?? m)
  }
  return fontkitPromise
}

/**
 * Embeds fonts into an output document, caching the result per document so
 * repeated text annotations do not re-embed the same font.
 */
export class FontRegistry {
  private cache = new Map<string, PDFFont>()
  private extCache = new Map<string, PDFFont | null>()
  private standardCache = new Map<StandardFonts, PDFFont>()
  private fontkitReady = false

  constructor(private readonly doc: PDFDocument) {}

  private async registerFontkit() {
    if (this.fontkitReady) return
    const fontkit = await ensureFontkit()
    this.doc.registerFontkit(fontkit as never)
    this.fontkitReady = true
  }

  async get(id: string): Promise<PDFFont> {
    const cached = this.cache.get(id)
    if (cached) return cached

    const def = getFont(id)
    let font: PDFFont
    if (def.kind === 'standard') {
      const key = def.standard!
      const std = this.standardCache.get(key)
      font = std ?? (await this.doc.embedFont(key))
      this.standardCache.set(key, font)
    } else {
      await this.registerFontkit()
      const bytes = await loadAsset(def.file!)
      font = await this.doc.embedFont(bytes, { subset: true })
    }
    this.cache.set(id, font)
    return font
  }

  /** Extended charset variant of a custom font, if the base font exists. */
  private async getExtended(id: string): Promise<PDFFont | null> {
    if (this.extCache.has(id)) return this.extCache.get(id) ?? null
    const def = getFont(id)
    let font: PDFFont | null = null
    if (def.kind === 'custom' && def.fallbackFile) {
      try {
        await this.registerFontkit()
        const bytes = await loadAsset(def.fallbackFile)
        font = await this.doc.embedFont(bytes, { subset: true })
      } catch {
        font = null
      }
    }
    this.extCache.set(id, font)
    return font
  }

  /**
   * Returns a font able to encode `text`.  Falls back to the extended
   * charset variant, then to Helvetica, so that exporting never explodes
   * because of an exotic glyph.
   */
  async getEncodable(id: string, text: string): Promise<{ font: PDFFont; fallback: boolean }> {
    const primary = await this.get(id)
    if (canEncode(primary, text)) return { font: primary, fallback: false }

    const ext = await this.getExtended(id)
    if (ext && canEncode(ext, text)) return { font: ext, fallback: true }

    const helv = await this.get('helvetica')
    if (canEncode(helv, text)) return { font: helv, fallback: true }

    return { font: helv, fallback: true }
  }
}

export function canEncode(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text)
    return true
  } catch {
    return false
  }
}

/** Removes characters a font cannot represent, replacing them with "?". */
export function sanitizeText(font: PDFFont, text: string): string {
  let out = ''
  for (const ch of text) {
    try {
      font.encodeText(ch)
      out += ch
    } catch {
      out += '?'
    }
  }
  return out
}
