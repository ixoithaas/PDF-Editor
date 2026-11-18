import { useEffect, useRef, useState } from 'react'
import { Eraser, Type, Check, X, PenLine } from 'lucide-react'
import { getFont } from '../lib/fonts'
import { FONTS } from '../lib/fonts'

export default function SignaturePad({
  color,
  onCancel,
  onDone,
}: {
  color: string
  onCancel: () => void
  onDone: (src: string, width: number, height: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const [mode, setMode] = useState<'draw' | 'type'>('draw')
  const [text, setText] = useState('')
  const [fontId, setFontId] = useState('lora-italic')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [mode])

  const pointFrom = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    canvas.setPointerCapture(event.pointerId)
    drawingRef.current = true
    const ctx = canvas.getContext('2d')!
    const p = pointFrom(event)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3
    ctx.strokeStyle = color
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const p = pointFrom(event)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  const onPointerUp = () => {
    drawingRef.current = false
  }

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const renderTyped = (): string | null => {
    if (!text.trim()) return null
    const width = 600
    const height = 180
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.clearRect(0, 0, width, height)
    const def = getFont(fontId)
    ctx.fillStyle = color
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    let size = 96
    ctx.font = `${def.style} ${def.weight} ${size}px ${def.css}`
    while (ctx.measureText(text).width > width - 40 && size > 16) {
      size -= 2
      ctx.font = `${def.style} ${def.weight} ${size}px ${def.css}`
    }
    ctx.fillText(text, width / 2, height / 2)
    return canvas.toDataURL('image/png')
  }

  /** Trims the drawn canvas to the ink bounds and returns a PNG. */
  const exportDrawn = (): { src: string; width: number; height: number } | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    let ink = false
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3]
        const r = data[(y * width + x) * 4]
        if (alpha > 8 && r < 250) {
          ink = true
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (!ink) return null

    const pad = 6
    minX = Math.max(0, minX - pad)
    minY = Math.max(0, minY - pad)
    maxX = Math.min(width - 1, maxX + pad)
    maxY = Math.min(height - 1, maxY + pad)

    const out = document.createElement('canvas')
    out.width = maxX - minX + 1
    out.height = maxY - minY + 1
    const outCtx = out.getContext('2d')
    if (!outCtx) return null
    outCtx.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height)
    return { src: out.toDataURL('image/png'), width: out.width, height: out.height }
  }

  const submit = () => {
    if (mode === 'type') {
      const src = renderTyped()
      if (!src) return
      onDone(src, 600, 180)
      return
    }
    const result = exportDrawn()
    if (!result) return
    onDone(result.src, result.width, result.height)
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl dark:border-white/10 dark:bg-ink-900">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-white/10">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <PenLine className="h-4 w-4" />
            Add a signature
          </h3>
          <button className="icon-btn !h-7 !w-7" onClick={onCancel} title="Cancel">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-ink-200 px-4 py-2 dark:border-white/10">
          <button
            className={mode === 'draw' ? 'btn-soft !py-1' : 'btn-ghost !py-1'}
            onClick={() => setMode('draw')}
          >
            <PenLine className="h-3.5 w-3.5" />
            Draw
          </button>
          <button
            className={mode === 'type' ? 'btn-soft !py-1' : 'btn-ghost !py-1'}
            onClick={() => setMode('type')}
          >
            <Type className="h-3.5 w-3.5" />
            Type
          </button>
        </div>

        <div className="p-4">
          {mode === 'draw' ? (
            <>
              <canvas
                ref={canvasRef}
                width={600}
                height={180}
                className="w-full cursor-crosshair rounded-lg border border-ink-300 bg-white dark:border-white/15"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-ink-500 dark:text-ink-400">
                  Sign with your mouse, trackpad or finger.
                </span>
                <button className="btn-outline !py-1" onClick={clear}>
                  <Eraser className="h-3.5 w-3.5" />
                  Clear
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                className="input"
                placeholder="Type your name"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="mt-2 flex items-center gap-2">
                <select
                  className="input !w-auto"
                  value={fontId}
                  onChange={(e) => setFontId(e.target.value)}
                >
                  {FONTS.map((font) => (
                    <option key={font.id} value={font.id}>
                      {font.label}
                    </option>
                  ))}
                </select>
                <div
                  className="flex h-16 flex-1 items-center justify-center rounded-lg border border-dashed border-ink-300 text-2xl dark:border-white/15"
                  style={{
                    color,
                    fontFamily: getFont(fontId).css,
                    fontStyle: getFont(fontId).style,
                    fontWeight: getFont(fontId).weight,
                  }}
                >
                  {text || 'Your signature'}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-ink-200 px-4 py-3 dark:border-white/10">
          <button className="btn-outline" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit}>
            <Check className="h-4 w-4" />
            Use signature
          </button>
        </div>
      </div>
    </div>
  )
}
