import type { PDFJSPage } from './pdf'
import { itemGeometry, type TextItemGeometry } from './textGeometry'

interface RawItem {
  str: string
  width: number
  height: number
  transform: number[]
  fontName: string
}

interface CacheEntry {
  items: TextItemGeometry[]
}

const textCache = new Map<string, CacheEntry>()
const pending = new Map<string, Promise<CacheEntry>>()

export function cacheKey(sourceId: string, sourceIndex: number) {
  return `${sourceId}:${sourceIndex}`
}

/** Returns the text geometry of a page, caching the result. */
export async function getTextGeometry(
  sourceId: string,
  sourceIndex: number,
  page: PDFJSPage,
): Promise<CacheEntry> {
  const key = cacheKey(sourceId, sourceIndex)
  const cached = textCache.get(key)
  if (cached) return cached

  const existing = pending.get(key)
  if (existing) return existing

  const promise = (async () => {
    const content = await page.getTextContent()
    const items: TextItemGeometry[] = (content.items as unknown[])
      .filter((i): i is RawItem => !!i && typeof (i as RawItem).str === 'string')
      .map((i) =>
        itemGeometry({
          str: i.str,
          width: i.width,
          height: i.height,
          transform: i.transform,
          fontName: i.fontName ?? '',
        }),
      )
    const entry: CacheEntry = { items }
    textCache.set(key, entry)
    pending.delete(key)
    return entry
  })()

  pending.set(key, promise)
  return promise
}

export function invalidateTextCache(sourceId?: string) {
  if (!sourceId) {
    textCache.clear()
    return
  }
  for (const key of Array.from(textCache.keys())) {
    if (key.startsWith(`${sourceId}:`)) textCache.delete(key)
  }
}
