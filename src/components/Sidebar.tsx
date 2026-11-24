import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  RotateCw,
  RotateCcw,
  Copy,
  Trash2,
  GripVertical,
  FilePlus2,
  Scissors,
  Layers,
  FileInput,
  ScanSearch,
  FileText,
  type LucideIcon,
} from 'lucide-react'
import { useEditor } from '../lib/store'
import { cn } from '../lib/utils'
import type { Annotation, PageModel } from '../types'
import { finalRotation } from '../lib/pdf'
import { ANNOTATION_LABELS } from '../lib/annotationMeta'

/* ------------------------------------------------------------------ *
 * Thumbnail rendering
 * ------------------------------------------------------------------ */

const thumbCache = new Map<string, string>()

function useThumbnail(page: PageModel, width = 132) {
  const rotation = finalRotation(page)
  const key = `${page.id}:${rotation}`
  const [src, setSrc] = useState<string | null>(() => thumbCache.get(key) ?? null)
  const sources = useEditor((s) => s.sources)
  const pdfjsDocs = useEditor((s) => s.pdfjsDocs)

  useEffect(() => {
    let cancelled = false
    const cached = thumbCache.get(key)
    if (cached) {
      setSrc(cached)
      return
    }
    const doc = pdfjsDocs[page.sourceId]
    if (!doc || page.blank) {
      setSrc(null)
      return
    }
    const run = async () => {
      try {
        const pdfPage = await doc.getPage(page.sourceIndex + 1)
        const base = pdfPage.getViewport({ scale: 1, rotation })
        const viewport = pdfPage.getViewport({ scale: width / base.width, rotation })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const context = canvas.getContext('2d')
        if (!context) return
        await pdfPage.render({ canvasContext: context, viewport }).promise
        const url = canvas.toDataURL('image/jpeg', 0.72)
        thumbCache.set(key, url)
        if (!cancelled) setSrc(url)
      } catch {
        if (!cancelled) setSrc(null)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [page, key, rotation, sources, pdfjsDocs, width])

  return src
}

/* ------------------------------------------------------------------ *
 * Sidebar
 * ------------------------------------------------------------------ */

const TABS: { id: 'pages' | 'annotations' | 'forms'; label: string; icon: LucideIcon }[] = [
  { id: 'pages', label: 'Pages', icon: FileText },
  { id: 'annotations', label: 'Marks', icon: Layers },
  { id: 'forms', label: 'Fields', icon: FileInput },
]

export default function Sidebar() {
  const leftPanel = useEditor((s) => s.leftPanel)
  const setLeftPanelMode = useEditor((s) => s.setLeftPanelMode)
  const annotationCount = useEditor((s) => s.annotations.length)
  const formCount = useEditor((s) => s.formFields.length)

  if (leftPanel === 'none') return null

  return (
    <aside className="z-10 flex w-52 shrink-0 flex-col border-r border-ink-200 bg-white xl:w-64 dark:border-white/10 dark:bg-ink-900">
      <div className="flex shrink-0 items-center gap-0.5 border-b border-ink-200 p-1 dark:border-white/10">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = leftPanel === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setLeftPanelMode(tab.id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-medium transition',
                active
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                  : 'text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-white/5',
              )}
              title={tab.label}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{tab.label}</span>
              {tab.id === 'annotations' && annotationCount > 0 && (
                <span className="tabular-nums opacity-60">{annotationCount}</span>
              )}
              {tab.id === 'forms' && formCount > 0 && (
                <span className="tabular-nums opacity-60">{formCount}</span>
              )}
            </button>
          )
        })}
      </div>

      {leftPanel === 'pages' && <PageThumbnails />}
      {leftPanel === 'annotations' && <AnnotationList />}
      {leftPanel === 'forms' && <FormList />}
    </aside>
  )
}

/* ------------------------------------------------------------------ *
 * Page thumbnails
 * ------------------------------------------------------------------ */

function PageThumbnails() {
  const pages = useEditor((s) => s.pages)
  const activePageId = useEditor((s) => s.activePageId)
  const setActivePage = useEditor((s) => s.setActivePage)
  const movePage = useEditor((s) => s.movePage)
  const rotatePage = useEditor((s) => s.rotatePage)
  const deletePage = useEditor((s) => s.deletePage)
  const duplicatePage = useEditor((s) => s.duplicatePage)
  const insertBlankPage = useEditor((s) => s.insertBlankPage)
  const extractPages = useEditor((s) => s.extractPages)

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const onDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null)
      setOverIndex(null)
      return
    }
    movePage(dragIndex, targetIndex)
    setDragIndex(null)
    setOverIndex(null)
  }

  const scrollToPage = useCallback((id: string) => {
    const el = document.querySelector(`[data-page-id="${id}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  useEffect(() => {
    if (activePageId) scrollToPage(activePageId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
          {pages.length} page{pages.length === 1 ? '' : 's'}
        </h2>
        <div className="flex items-center gap-0.5">
          <button
            className="icon-btn !h-7 !w-7"
            title="Insert blank page"
            onClick={() => insertBlankPage(activePageId)}
          >
            <FilePlus2 className="h-4 w-4" />
          </button>
          <button
            className="icon-btn !h-7 !w-7"
            title="Extract all pages"
            onClick={() => void extractPages(pages.map((p) => p.id))}
          >
            <Scissors className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 scroll-thin">
        {pages.map((page, index) => (
          <ThumbnailItem
            key={page.id}
            page={page}
            index={index}
            active={page.id === activePageId}
            dragging={dragIndex === index}
            over={overIndex === index}
            onDragStart={() => setDragIndex(index)}
            onDragOver={() => setOverIndex(index)}
            onDrop={() => onDrop(index)}
            onDragEnd={() => {
              setDragIndex(null)
              setOverIndex(null)
            }}
            onSelect={() => {
              setActivePage(page.id)
              scrollToPage(page.id)
            }}
            onRotate={() => rotatePage(page.id, 90)}
            onRotateBack={() => rotatePage(page.id, -90)}
            onDuplicate={() => duplicatePage(page.id)}
            onDelete={() => deletePage(page.id)}
          />
        ))}
      </div>
    </div>
  )
}

interface ThumbnailItemProps {
  page: PageModel
  index: number
  active: boolean
  dragging: boolean
  over: boolean
  onDragStart: () => void
  onDragOver: () => void
  onDrop: () => void
  onDragEnd: () => void
  onSelect: () => void
  onRotate: () => void
  onRotateBack: () => void
  onDuplicate: () => void
  onDelete: () => void
}

function ThumbnailItem({
  page,
  index,
  active,
  dragging,
  over,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onSelect,
  onRotate,
  onRotateBack,
  onDuplicate,
  onDelete,
}: ThumbnailItemProps) {
  const src = useThumbnail(page)
  const rotation = finalRotation(page)

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOver()
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={cn(
        'group relative cursor-pointer rounded-lg border p-1.5 transition',
        dragging && 'dragging-page',
        over && 'drop-target',
        active
          ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10'
          : 'border-transparent hover:border-ink-300 hover:bg-ink-100/60 dark:hover:border-white/15 dark:hover:bg-white/5',
      )}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-ink-300 opacity-0 transition group-hover:opacity-100 dark:text-ink-600" />
        <div className="relative mx-auto w-full overflow-hidden rounded-md bg-white shadow-sm dark:bg-white">
          {src ? (
            <img src={src} alt={`Page ${index + 1}`} className="block w-full" />
          ) : (
            <div
              className="flex w-full items-center justify-center bg-ink-100 text-ink-400 dark:bg-white/5"
              style={{ aspectRatio: `${page.width} / ${page.height}` }}
            >
              <span className="text-[10px]">{index + 1}</span>
            </div>
          )}
          {rotation !== 0 && (
            <span className="absolute right-1 top-1 rounded bg-ink-900/75 px-1 text-[10px] font-medium text-white">
              {rotation}°
            </span>
          )}
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between px-0.5">
        <span className="text-[11px] font-medium text-ink-600 dark:text-ink-400">
          {index + 1}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <button
            className="icon-btn !h-6 !w-6"
            title="Rotate left"
            onClick={(e) => {
              e.stopPropagation()
              onRotateBack()
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            className="icon-btn !h-6 !w-6"
            title="Rotate right"
            onClick={(e) => {
              e.stopPropagation()
              onRotate()
            }}
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <button
            className="icon-btn !h-6 !w-6"
            title="Duplicate page"
            onClick={(e) => {
              e.stopPropagation()
              onDuplicate()
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            className="icon-btn !h-6 !w-6 hover:!bg-rose-500/15 hover:!text-rose-600"
            title="Delete page"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Annotation list
 * ------------------------------------------------------------------ */

function AnnotationList() {
  const annotations = useEditor((s) => s.annotations)
  const pages = useEditor((s) => s.pages)
  const selection = useEditor((s) => s.selection)
  const setSelection = useEditor((s) => s.setSelection)
  const removeAnnotation = useEditor((s) => s.removeAnnotation)
  const clearAnnotations = useEditor((s) => s.clearAnnotations)
  const setActivePage = useEditor((s) => s.setActivePage)

  const grouped = useMemo(() => {
    return pages
      .map((page) => ({
        page,
        items: annotations.filter((a) => a.pageId === page.id),
      }))
      .filter((g) => g.items.length > 0)
  }, [pages, annotations])

  if (!annotations.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Layers className="h-8 w-8 text-ink-300 dark:text-ink-600" />
        <p className="text-sm font-medium">No annotations yet</p>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Pick a tool from the left rail and draw on the page.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
          Annotations ({annotations.length})
        </h2>
        <button
          className="text-xs font-medium text-rose-600 hover:underline dark:text-rose-400"
          onClick={() => clearAnnotations()}
        >
          Clear all
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 scroll-thin">
        {grouped.map(({ page, items }) => (
          <div key={page.id} className="mb-3">
            <div className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-500">
              Page {pages.indexOf(page) + 1}
            </div>
            {items.map((annotation) => (
              <div
                key={annotation.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelection(annotation.id)
                  setActivePage(page.id)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelection(annotation.id)
                    setActivePage(page.id)
                  }
                }}
                className={cn(
                  'group flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition',
                  selection === annotation.id
                    ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200'
                    : 'hover:bg-ink-100 dark:hover:bg-white/5',
                )}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: annotationColor(annotation) }}
                />
                <span className="flex-1 truncate">
                  {ANNOTATION_LABELS[annotation.kind] ?? annotation.kind}
                  {annotation.kind === 'text' && ` — ${annotation.text.slice(0, 28)}`}
                </span>
                <button
                  className="shrink-0 rounded p-0.5 opacity-0 transition hover:bg-rose-500/15 group-hover:opacity-100"
                  title="Delete annotation"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeAnnotation(annotation.id)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function annotationColor(annotation: Annotation): string {
  if (annotation.kind === 'image') return '#6366f1'
  return annotation.color ?? '#f59e0b'
}

/* ------------------------------------------------------------------ *
 * Form fields
 * ------------------------------------------------------------------ */

function FormList() {
  const formFields = useEditor((s) => s.formFields)
  const formValues = useEditor((s) => s.formValues)
  const setFormValue = useEditor((s) => s.setFormValue)
  const pages = useEditor((s) => s.pages)
  const setActivePage = useEditor((s) => s.setActivePage)

  if (!formFields.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <FileInput className="h-8 w-8 text-ink-300 dark:text-ink-600" />
        <p className="text-sm font-medium">No form fields</p>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          No interactive fields found. You can scan printed character boxes and type into them here.
        </p>
        <button
          className="btn-primary mt-2"
          onClick={() => void useEditor.getState().detectFormBoxes()}
        >
          <ScanSearch className="h-4 w-4" />
          Detect boxes
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
          Form fields ({formFields.length})
        </h2>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 scroll-thin">
        {formFields.map((field) => {
          const pageIndex = pages.findIndex((p) => p.id === field.pageId)
          return (
            <div key={field.id} className="rounded-lg border border-ink-200 p-2.5 dark:border-white/10">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="truncate text-xs font-medium" title={field.name}>
                  {field.name}
                </label>
                {field.detected && (
                  <span className="chip shrink-0 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                    printed boxes
                  </span>
                )}
                {pageIndex >= 0 && (
                  <button
                    className="text-[10px] text-indigo-500 hover:underline"
                    onClick={() => setActivePage(field.pageId)}
                  >
                    p. {pageIndex + 1}
                  </button>
                )}
              </div>
              {field.type === 'checkbox' ? (
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={formValues[field.name] === 'On'}
                    onChange={(e) =>
                      setFormValue(field.name, e.target.checked ? 'On' : 'Off')
                    }
                  />
                  {formValues[field.name] === 'On' ? 'Checked' : 'Unchecked'}
                </label>
              ) : field.type === 'dropdown' || field.type === 'option' ? (
                <select
                  className="input !py-1 text-xs"
                  value={formValues[field.name] ?? ''}
                  onChange={(e) => setFormValue(field.name, e.target.value)}
                >
                  <option value="">—</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : field.type === 'signature' ? (
                <p className="text-[11px] text-ink-500">Signature field — sign on the page.</p>
              ) : (
                <input
                  className="input !py-1 text-xs"
                  value={formValues[field.name] ?? ''}
                  onChange={(e) => setFormValue(field.name, e.target.value)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
