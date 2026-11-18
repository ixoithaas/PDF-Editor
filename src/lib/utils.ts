import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function downloadBytes(bytes: Uint8Array, filename: string, type = 'application/pdf') {
  const blob = new Blob([bytes as BlobPart], { type })
  downloadBlob(blob, filename)
}

/** Reads an image file and returns a data URL plus its natural size. */
export function readImageFile(
  file: File,
): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the image file.'))
    reader.onload = () => {
      const src = String(reader.result)
      const img = new Image()
      img.onload = () => resolve({ src, width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error('That file is not a supported image.'))
      img.src = src
    }
    reader.readAsDataURL(file)
  })
}

/** Converts any browser-supported image into a PNG/JPEG data URL. */
export async function normalizeImage(src: string): Promise<{ src: string; width: number; height: number }> {
  if (src.startsWith('data:image/png') || src.startsWith('data:image/jpeg')) {
    const img = await loadImage(src)
    return { src, width: img.naturalWidth, height: img.naturalHeight }
  }
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available.')
  ctx.drawImage(img, 0, 0)
  return {
    src: canvas.toDataURL('image/png'),
    width: img.naturalWidth,
    height: img.naturalHeight,
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode the image.'))
    img.src = src
  })
}
