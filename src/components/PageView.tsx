import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import { useEditor } from '../lib/store'
import { finalRotation, uid } from '../lib/pdf'
import { getTextGeometry } from '../lib/textCache'
import { getImage, onImageLoaded } from '../lib/imageCache'
import {
  annotationBounds,
  canvasToUser,
  hitTest,
  renderOverlay,
  revisionOf,
  userToCanvas,
  type DraftShape,
  type ViewportLike,
} from '../lib/overlay'
import { makeViewport } from '../lib/viewport'
import { markupRects } from '../lib/textGeometry'
import { normalizeRect, simplifyPoints } from '../lib/geometry'
import { getFont } from '../lib/fonts'
import type { TextItemGeometry } from '../lib/textGeometry'
import type {
  Annotation,
  MarkupKind,
  PageModel,
  Point,
  Rect,
  ToolStyle,
} from '../types'

/** State of the inline text editor. */
interface EditingState {
  id: string
  value: string
  /** What the annotation held before editing started, restored by Esc. */
  initial: string
}

export interface PendingInsert {
  kind: 'image' | 'signature' | 'stamp'
  src?: string
  width?: number
  height?: number
  label?: string
  color?: string
}

type DragMode =
  | { type: 'none' }
  | { type: 'move'; id: string; start: Point; origin: Annotation }
  | { type: 'resize'; id: string; handle: HandleId; start: Point; origin: Annotation }
  | { type: 'rotate'; id: string; origin: Annotation; centre: Point }
  | { type: 'draw'; kind: 'pen'; points: Point[] }
  | {
      type: 'shape'
      kind: 'rect' | 'ellipse' | 'line' | 'arrow'
      start: Point
      current: Point
    }
  | { type: 'markup'; kind: MarkupKind; start: Point; current: Point }
  | { type: 'pan'; clientX: number; clientY: number; scrollLeft: number; scrollTop: number }
  | { type: 'erase' }

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

interface PageViewProps {
  page: PageModel
  index: number
  scale: number
  pending: PendingInsert | null
  onPlaced: () => void
}

export default function PageView({ page, index, scale, pending, onPlaced }: PageViewProps) {
  const pdfjsDocs = useEditor((s) => s.pdfjsDocs)
  const tool = useEditor((s) => s.tool)
  const style = useEditor((s) => s.style)
  const selection = useEditor((s) => s.selection)
  const annotations = useEditor((s) => s.annotations)
  const searchMatches = useEditor((s) => s.searchMatches)
  const searchIndex = useEditor((s) => s.searchIndex)
  const activePageId = useEditor((s) => s.activePageId)

  const setActivePage = useEditor((s) => s.setActivePage)
  const setSelection = useEditor((s) => s.setSelection)
  const addAnnotation = useEditor((s) => s.addAnnotation)
  const patchAnnotation = useEditor((s) => s.patchAnnotation)
  const removeAnnotation = useEditor((s) => s.removeAnnotation)
  const beginHistory = useEditor((s) => s.beginHistory)
  const showToast = useEditor((s) => s.showToast)

  const pageAnnotations = useMemo(
    () => annotations.filter((a) => a.pageId === page.id),
    [annotations, page.id],
  )

  const doc = pdfjsDocs[page.sourceId]
  const [pdfPage, setPdfPage] = useState<PDFPageProxy | null>(null)
  const [textItems, setTextItems] = useState<TextItemGeometry[]>([])
  const [draft, setDraft] = useState<DraftShape | null>(null)
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [imageTick, setImageTick] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragMode>({ type: 'none' })
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)
  const draftRef = useRef<DraftShape | null>(null)

  const updateDraft = useCallback((next: DraftShape | null) => {
    draftRef.current = next
    setDraft(next)
  }, [])

  const rotation = finalRotation(page)
  const dpr = typeof window === 'undefined' ? 1 : Math.min(2.5, window.devicePixelRatio || 1)

  const viewport = useMemo<ViewportLike>(() => {
    if (pdfPage) return pdfPage.getViewport({ scale, rotation })
    return makeViewport([0, 0, page.width, page.height], scale, rotation)
  }, [pdfPage, page.width, page.height, scale, rotation])

  /* ---- load the pdf.js page ------------------------------------- */
  useEffect(() => {
    let cancelled = false
    if (!doc || page.blank) {
      setPdfPage(null)
      return
    }
    doc
      .getPage(page.sourceIndex + 1)
      .then((loaded) => {
        if (!cancelled) setPdfPage(loaded)
      })
      .catch(() => {
        if (!cancelled) setPdfPage(null)
      })
    return () => {
      cancelled = true
    }
  }, [doc, page.blank, page.sourceIndex])

  /* ---- text geometry (markup + search) -------------------------- */
  useEffect(() => {
    let cancelled = false
    if (!pdfPage || page.blank) {
      setTextItems([])
      return
    }
    void getTextGeometry(page.sourceId, page.sourceIndex, pdfPage).then((entry) => {
      if (!cancelled) setTextItems(entry.items)
    })
    return () => {
      cancelled = true
    }
  }, [pdfPage, page.blank, page.sourceId, page.sourceIndex])

  /* ---- images --------------------------------------------------- */
  useEffect(() => {
    // Repaint once an annotation image finishes decoding.
    const unsubscribe = onImageLoaded(() => setImageTick((n) => n + 1))
    return () => {
      unsubscribe()
    }
  }, [])

  const searchRects = useMemo(() => {
    if (!searchMatches.length) return undefined
    const list: { id: string; rect: Rect; active: boolean }[] = []
    searchMatches.forEach((match, i) => {
      if (match.pageId !== page.id) return
      list.push({ id: `${page.id}:${i}`, rect: match.rect, active: i === searchIndex })
    })
    return list.length ? list : undefined
  }, [searchMatches, searchIndex, page.id])

  /* ---- render the page ------------------------------------------ */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = Math.max(1, Math.floor(viewport.width))
    const height = Math.max(1, Math.floor(viewport.height))
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!pdfPage) return

    renderTaskRef.current?.cancel()
    const task = pdfPage.render({
      canvasContext: ctx,
      viewport: pdfPage.getViewport({ scale, rotation }),
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    }) as unknown as { promise: Promise<void>; cancel: () => void }
    renderTaskRef.current = task
    task.promise.catch(() => {
      /* cancelled or failed */
    })
    return () => {
      task.cancel()
    }
  }, [pdfPage, viewport.width, viewport.height, scale, rotation, dpr])

  /**
   * A cheap fingerprint of everything the overlay depends on.  Annotations
   * are compared by object identity (see `annotationRevision`) so editing one
   * page does not force every other page to repaint.
   */
  const overlayKey = useMemo(() => {
    let key = `${Math.round(viewport.width)}x${Math.round(viewport.height)}|${rotation}|${
      selection ?? '-'
    }|${draft ? revisionOf(draft) : '-'}|${imageTick}`
    for (const annotation of pageAnnotations) key += `,${revisionOf(annotation)}`
    if (searchRects) for (const entry of searchRects) key += `,${entry.id}:${entry.active ? 1 : 0}`
    return key
  }, [viewport, rotation, selection, draft, pageAnnotations, searchRects, imageTick])

  /* ---- render the annotation overlay ---------------------------- */
  useEffect(() => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = Math.max(1, Math.floor(viewport.width))
    const height = Math.max(1, Math.floor(viewport.height))
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    renderOverlay(ctx, {
      viewport,
      annotations: pageAnnotations,
      selectedId: selection,
      pageRotation: rotation,
      dpr,
      resolveImage: getImage,
      draft,
      searchRects,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, overlayKey, dpr])

  /* ---- pointer helpers ------------------------------------------ */
  const toUser = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const rect = overlayRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      return canvasToUser(viewport, event.clientX - rect.left, event.clientY - rect.top)
    },
    [viewport],
  )

  const tolerance = useCallback(() => 6 / viewport.scale, [viewport])

  /* ---- pointer handlers ----------------------------------------- */
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    setActivePage(page.id)
    const point = toUser(event)

    // Placing a pending image / signature / stamp.
    if (pending) {
      placePending(pending, point, style)
      onPlaced()
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)

    if (tool === 'hand') {
      const scroller = wrapperRef.current?.closest<HTMLElement>('[data-scroll-container]')
      dragRef.current = {
        type: 'pan',
        clientX: event.clientX,
        clientY: event.clientY,
        scrollLeft: scroller?.scrollLeft ?? 0,
        scrollTop: scroller?.scrollTop ?? 0,
      }
      return
    }

    if (tool === 'select') {
      const hit = hitTest(pageAnnotations, point, tolerance())
      if (hit) {
        setSelection(hit.id)
        beginHistory()
        dragRef.current = { type: 'move', id: hit.id, start: point, origin: hit }
      } else {
        setSelection(null)
      }
      return
    }

    if (tool === 'eraser') {
      dragRef.current = { type: 'erase' }
      eraseAt(point)
      return
    }

    if (tool === 'text') {
      const annotation: Annotation = {
        id: uid('ann'),
        pageId: page.id,
        kind: 'text',
        x: point.x,
        y: point.y,
        text: '',
        fontSize: style.fontSize,
        font: style.font,
        align: style.align,
        color: style.color,
        angle: 0,
        opacity: style.opacity,
        createdAt: Date.now(),
      }
      addAnnotation(annotation)
      setSelection(annotation.id)
      setEditing({ id: annotation.id, value: '', initial: '' })
      return
    }

    if (tool === 'pen') {
      dragRef.current = { type: 'draw', kind: 'pen', points: [point] }
      updateDraft({
        kind: 'draw',
        points: [point],
        color: style.color,
        strokeWidth: style.strokeWidth,
      })
      return
    }

    if (tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'arrow') {
      dragRef.current = { type: 'shape', kind: tool, start: point, current: point }
      return
    }

    if (tool === 'highlight' || tool === 'underline' || tool === 'strikeout') {
      dragRef.current = { type: 'markup', kind: tool, start: point, current: point }
      return
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag.type === 'none') return
    const point = toUser(event)

    switch (drag.type) {
      case 'move': {
        const dx = point.x - drag.start.x
        const dy = point.y - drag.start.y
        patchAnnotation(drag.id, translateAnnotation(drag.origin, dx, dy))
        break
      }
      case 'resize': {
        patchAnnotation(drag.id, resizeAnnotation(drag.origin, drag.handle, point, event.shiftKey))
        break
      }
      case 'rotate': {
        const angle = Math.round(Math.atan2(point.y - drag.centre.y, point.x - drag.centre.x) * (180 / Math.PI))
        if (drag.origin.kind === 'text' || drag.origin.kind === 'stamp') {
          patchAnnotation(drag.id, { angle: ((angle % 360) + 360) % 360 } as Partial<Annotation>)
        }
        break
      }
      case 'draw': {
        drag.points.push(point)
        updateDraft({
          kind: 'draw',
          points: [...drag.points],
          color: style.color,
          strokeWidth: style.strokeWidth,
        })
        break
      }
      case 'shape': {
        drag.current = point
        updateDraft({
          kind: drag.kind,
          rect: normalizeRect(drag.start.x, drag.start.y, point.x, point.y),
          color: style.color,
          strokeWidth: style.strokeWidth,
          filled: style.filled,
          fillColor: style.fillColor,
        })
        break
      }
      case 'markup': {
        drag.current = point
        updateDraft({
          kind: 'markup',
          rect: normalizeRect(drag.start.x, drag.start.y, point.x, point.y),
          color: style.color,
          strokeWidth: style.strokeWidth,
        })
        break
      }
      case 'pan': {
        const scroller = wrapperRef.current?.closest<HTMLElement>('[data-scroll-container]')
        if (!scroller) break
        scroller.scrollLeft = drag.scrollLeft - (event.clientX - drag.clientX)
        scroller.scrollTop = drag.scrollTop - (event.clientY - drag.clientY)
        break
      }
      case 'erase': {
        eraseAt(point)
        break
      }
    }
  }

  const finishDrag = () => {
    const drag = dragRef.current
    dragRef.current = { type: 'none' }
    if (drag.type === 'draw') {
      updateDraft(null)
      const points = simplifyPoints(drag.points, 0.5 / scale)
      if (points.length >= 1) {
        addAnnotation({
          id: uid('ann'),
          pageId: page.id,
          kind: 'draw',
          points,
          color: style.color,
          strokeWidth: style.strokeWidth,
          opacity: style.opacity,
          createdAt: Date.now(),
        })
      }
      return
    }

    if (drag.type === 'shape') {
      updateDraft(null)
      const rect = normalizeRect(drag.start.x, drag.start.y, drag.current.x, drag.current.y)
      if (Math.abs(rect.width) > 1.5 || Math.abs(rect.height) > 1.5) {
        const base = {
          id: uid('ann'),
          pageId: page.id,
          opacity: style.opacity,
          createdAt: Date.now(),
          color: style.color,
          strokeWidth: style.strokeWidth,
        }
        if (drag.kind === 'rect') {
          addAnnotation({
            ...base,
            kind: 'rect',
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            filled: style.filled,
            fillColor: style.fillColor,
            radius: 0,
          } as Annotation)
        } else if (drag.kind === 'ellipse') {
          addAnnotation({
            ...base,
            kind: 'ellipse',
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            filled: style.filled,
            fillColor: style.fillColor,
          } as Annotation)
        } else {
          addAnnotation({
            ...base,
            kind: drag.kind,
            x1: drag.start.x,
            y1: drag.start.y,
            x2: drag.current.x,
            y2: drag.current.y,
          } as Annotation)
        }
      }
      return
    }

    if (drag.type === 'markup') {
      updateDraft(null)
      const region = normalizeRect(drag.start.x, drag.start.y, drag.current.x, drag.current.y)
      const rects = markupRects(textItems, drag.kind, region)
      if (rects.length) {
        addAnnotation({
          id: uid('ann'),
          pageId: page.id,
          kind: drag.kind,
          rects,
          color: style.color,
          strokeWidth: Math.max(1, style.strokeWidth * 0.6),
          opacity: style.opacity,
          createdAt: Date.now(),
        } as Annotation)
      } else {
        showToast(
          textItems.length
            ? 'No text in that area — drag across the words you want to mark.'
            : 'This page has no selectable text yet.',
          'info',
        )
      }
      return
    }

    updateDraft(null)
  }

  function eraseAt(point: Point) {
    const hit = hitTest(pageAnnotations, point, tolerance() + 2 / scale)
    if (hit) removeAnnotation(hit.id)
  }

  function placePending(insert: PendingInsert, point: Point, toolStyle: ToolStyle) {
    if (insert.kind === 'stamp') {
      const size = toolStyle.fontSize * 1.6
      const label = insert.label ?? 'APPROVED'
      const boxWidth = label.length * size * 0.62 + size * 0.8
      const boxHeight = size * 1.5
      addAnnotation({
        id: uid('ann'),
        pageId: page.id,
        kind: 'stamp',
        x: point.x - boxWidth / 2,
        y: point.y - boxHeight / 2,
        size,
        label,
        color: insert.color ?? toolStyle.color,
        angle: 0,
        boxWidth,
        boxHeight,
        opacity: toolStyle.opacity,
        createdAt: Date.now(),
      } as Annotation)
      return
    }

    if (!insert.src || !insert.width || !insert.height) return
    const maxWidth = Math.min(page.width * 0.6, 320)
    const ratio = insert.height / insert.width
    const width = Math.min(maxWidth, insert.width)
    const height = width * ratio
    addAnnotation({
      id: uid('ann'),
      pageId: page.id,
      kind: 'image',
      x: point.x - width / 2,
      y: point.y - height / 2,
      width,
      height,
      src: insert.src,
      opacity: toolStyle.opacity,
      createdAt: Date.now(),
    } as Annotation)
  }

  /* ---- selection chrome ----------------------------------------- */
  const selected = pageAnnotations.find((a) => a.id === selection) ?? null
  const selectionBox = useMemo(() => {
    if (!selected) return null
    const bounds = annotationBounds(selected)
    if (!bounds) return null
    const corners: Point[] = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x, y: bounds.y + bounds.height },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    ].map((p) => {
      const [x, y] = userToCanvas(viewport, p.x, p.y)
      return { x, y }
    })
    const xs = corners.map((c) => c.x)
    const ys = corners.map((c) => c.y)
    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      width: Math.abs(Math.max(...xs) - Math.min(...xs)),
      height: Math.abs(Math.max(...ys) - Math.min(...ys)),
    }
  }, [selected, viewport])

  const startResize = (handle: HandleId) => (event: React.PointerEvent) => {
    event.stopPropagation()
    if (!selected) return
    wrapperRef.current?.setPointerCapture(event.pointerId)
    beginHistory()
    const bounds = annotationBounds(selected)
    if (!bounds) return
    dragRef.current = {
      type: 'resize',
      id: selected.id,
      handle,
      start: toUser(event),
      origin: selected,
    }
  }

  const startRotate = (event: React.PointerEvent) => {
    event.stopPropagation()
    if (!selected) return
    const bounds = annotationBounds(selected)
    if (!bounds) return
    wrapperRef.current?.setPointerCapture(event.pointerId)
    beginHistory()
    dragRef.current = {
      type: 'rotate',
      id: selected.id,
      origin: selected,
      centre: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    }
  }

  const editable = selected?.kind === 'text' ? selected : null
  const editingState = editing && editable && editing.id === editable.id ? editing : null

  const cursor =
    tool === 'hand'
      ? 'grab'
      : pending
        ? 'copy'
        : tool === 'text'
          ? 'text'
          : tool === 'eraser'
            ? 'cell'
            : tool === 'select'
              ? 'default'
              : 'crosshair'

  return (
    <div className="relative select-none" data-page-id={page.id}>
      <div
        ref={wrapperRef}
        className="pdf-page-shadow relative overflow-hidden rounded-none bg-white"
        style={{ width: viewport.width, height: viewport.height, cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onDoubleClick={(event) => {
          event.preventDefault()
          const hit = hitTest(pageAnnotations, toUser(event), tolerance())
          if (hit?.kind !== 'text') return
          setSelection(hit.id)
          beginHistory()
          setEditing({ id: hit.id, value: hit.text, initial: hit.text })
        }}
      >
        <canvas ref={canvasRef} className="block bg-white" />
        <canvas ref={overlayRef} className="pointer-events-none absolute left-0 top-0" />

        {selectionBox && selected && (
          <div
            className="pointer-events-none absolute border border-indigo-500"
            style={selectionBox}
          >
            {HANDLES.map((handle) => (
              <div
                key={handle}
                onPointerDown={startResize(handle)}
                className="pointer-events-auto absolute h-2.5 w-2.5 rounded-sm border border-indigo-600 bg-white"
                style={{
                  left: `${HANDLE_POS[handle][0] * 100}%`,
                  top: `${HANDLE_POS[handle][1] * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: HANDLE_CURSOR[handle],
                }}
              />
            ))}
            {(selected.kind === 'text' || selected.kind === 'stamp') && (
              <div
                onPointerDown={startRotate}
                className="pointer-events-auto absolute -top-6 left-1/2 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full border border-indigo-600 bg-white text-[9px] text-indigo-600"
                style={{ cursor: 'grab' }}
                title="Drag to rotate"
              >
                ⟳
              </div>
            )}
          </div>
        )}

        {editable && editingState && (
          <TextEditor
            annotation={editable}
            viewport={viewport}
            value={editingState.value}
            onChange={(value) => {
              setEditing({ ...editingState, value })
              // Write through so the text appears on the page as you type.
              patchAnnotation(editable.id, { text: value })
            }}
            onClose={(commit) => {
              const current = editingState
              setEditing(null)
              if (!commit) {
                // Esc restores whatever the box held before editing began.
                if (current.initial) patchAnnotation(current.id, { text: current.initial })
                else removeAnnotation(current.id)
                return
              }
              // Text was already written while typing; discard an empty box
              // instead of leaving invisible clutter on the page.
              if (!current.value.trim()) removeAnnotation(current.id)
            }}
          />
        )}
      </div>

      <div className="pointer-events-none absolute -left-8 top-0 text-[11px] font-medium tabular-nums text-ink-400 dark:text-ink-500">
        {index + 1}
      </div>
      {activePageId === page.id && (
        <div className="pointer-events-none absolute inset-0 ring-2 ring-indigo-500/40" />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Handles
 * ------------------------------------------------------------------ */

const HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_POS: Record<HandleId, [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
}
const HANDLE_CURSOR: Record<HandleId, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
}

/* ------------------------------------------------------------------ *
 * Geometry mutations
 * ------------------------------------------------------------------ */

function translateAnnotation(annotation: Annotation, dx: number, dy: number): Partial<Annotation> {
  switch (annotation.kind) {
    case 'rect':
    case 'ellipse':
    case 'image':
      return { x: annotation.x + dx, y: annotation.y + dy } as Partial<Annotation>
    case 'line':
    case 'arrow':
      return {
        x1: annotation.x1 + dx,
        y1: annotation.y1 + dy,
        x2: annotation.x2 + dx,
        y2: annotation.y2 + dy,
      } as Partial<Annotation>
    case 'draw':
      return {
        points: annotation.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      } as Partial<Annotation>
    case 'highlight':
    case 'underline':
    case 'strikeout':
      return {
        rects: annotation.rects.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })),
      } as Partial<Annotation>
    case 'text':
      return { x: annotation.x + dx, y: annotation.y + dy } as Partial<Annotation>
    case 'stamp':
      return { x: annotation.x + dx, y: annotation.y + dy } as Partial<Annotation>
    default:
      return {}
  }
}

function resizeAnnotation(
  annotation: Annotation,
  handle: HandleId,
  point: Point,
  keepAspect: boolean,
): Partial<Annotation> {
  const bounds = annotationBounds(annotation)
  if (!bounds) return {}

  const east = handle.includes('e')
  const west = handle.includes('w')
  const north = handle.includes('n')
  const south = handle.includes('s')

  let x0 = bounds.x
  let y0 = bounds.y
  let x1 = bounds.x + bounds.width
  let y1 = bounds.y + bounds.height

  if (east) x1 = point.x
  if (west) x0 = point.x
  if (north) y1 = point.y
  if (south) y0 = point.y

  let width = Math.abs(x1 - x0)
  let height = Math.abs(y1 - y0)
  const minX = Math.min(x0, x1)
  const minY = Math.min(y0, y1)

  if (keepAspect && bounds.width > 0 && bounds.height > 0) {
    const ratio = bounds.width / bounds.height
    if (Math.abs(width / ratio) > Math.abs(height)) height = Math.abs(width / ratio)
    else width = Math.abs(height * ratio)
  }

  const sx = bounds.width > 0 ? width / bounds.width : 1
  const sy = bounds.height > 0 ? height / bounds.height : 1

  switch (annotation.kind) {
    case 'rect':
    case 'image':
      return { x: minX, y: minY, width, height } as Partial<Annotation>
    case 'ellipse':
      return { x: minX, y: minY, width, height } as Partial<Annotation>
    case 'stamp': {
      const size = Math.max(4, annotation.size * Math.max(sx, sy))
      const boxWidth = annotation.boxWidth * sx
      const boxHeight = annotation.boxHeight * sy
      return {
        x: minX,
        y: minY,
        size,
        boxWidth,
        boxHeight,
      } as Partial<Annotation>
    }
    case 'text': {
      const size = Math.max(4, annotation.fontSize * sy)
      return { x: minX, y: minY + size * 0.2, fontSize: size } as Partial<Annotation>
    }
    case 'line':
    case 'arrow':
      return {
        x1: bounds.x + (annotation.x1 - bounds.x) * sx,
        y1: bounds.y + (annotation.y1 - bounds.y) * sy,
        x2: bounds.x + (annotation.x2 - bounds.x) * sx,
        y2: bounds.y + (annotation.y2 - bounds.y) * sy,
      } as Partial<Annotation>
    case 'draw':
      return {
        points: annotation.points.map((p) => ({
          x: bounds.x + (p.x - bounds.x) * sx,
          y: bounds.y + (p.y - bounds.y) * sy,
        })),
      } as Partial<Annotation>
    case 'highlight':
    case 'underline':
    case 'strikeout': {
      const target = { x: minX, y: minY, width, height }
      return {
        rects: annotation.rects.map((r) => ({
          x: target.x + (r.x - bounds.x) * sx,
          y: target.y + (r.y - bounds.y) * sy,
          width: r.width * sx,
          height: r.height * sy,
        })),
      } as Partial<Annotation>
    }
    default:
      return {}
  }
}

/* ------------------------------------------------------------------ *
 * Inline text editor
 * ------------------------------------------------------------------ */

function TextEditor({
  annotation,
  viewport,
  value,
  onChange,
  onClose,
}: {
  annotation: Extract<Annotation, { kind: 'text' }>
  viewport: ViewportLike
  value: string
  onChange: (value: string) => void
  onClose: (commit: boolean) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const def = getFont(annotation.font)
  const [px, py] = userToCanvas(viewport, annotation.x, annotation.y)
  const size = annotation.fontSize * viewport.scale
  const width = Math.max(220, size * 9)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  // Grow with the content so long paragraphs stay comfortable to edit.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value, size])

  return (
    <div className="absolute z-20" style={{ left: px, top: py - size * 1.2 }}>
      <textarea
        ref={ref}
        className="text-editor-input"
        style={{
          width,
          minHeight: Math.max(30, size * 1.5),
          fontFamily: def.css,
          fontSize: size,
          fontWeight: def.weight,
          fontStyle: def.style,
          color: annotation.color,
          textAlign: annotation.align,
          lineHeight: 1.25,
        }}
        value={value}
        placeholder="Type here…"
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onClose(true)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') {
            e.preventDefault()
            onClose(false)
            return
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            onClose(true)
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <div className="mt-1 w-fit whitespace-nowrap rounded bg-ink-900/90 px-1.5 py-0.5 text-[10px] font-medium text-white shadow dark:bg-white/90 dark:text-ink-900">
        {value.trim() ? 'Click away to finish' : 'Click away to cancel'} · Esc to discard
      </div>
    </div>
  )
}
