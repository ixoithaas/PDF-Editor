const cache = new Map<string, HTMLImageElement>()

/** Loads an image once and keeps it around so overlays can draw it. */
export function getImage(src: string): HTMLImageElement | null {
  const cached = cache.get(src)
  if (cached) return cached.complete && cached.naturalWidth ? cached : null

  const image = new Image()
  image.decoding = 'async'
  image.onload = () => {
    cache.set(src, image)
    notify(src)
  }
  image.onerror = () => {
    cache.delete(src)
  }
  image.src = src
  cache.set(src, image)
  return null
}

const listeners = new Set<(src: string) => void>()

export function onImageLoaded(listener: (src: string) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(src: string) {
  listeners.forEach((listener) => listener(src))
}

/** Loads every image used by the annotations so overlays stay in sync. */
export function preloadImages(sources: Iterable<string>) {
  for (const src of sources) getImage(src)
}
