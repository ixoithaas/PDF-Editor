import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronUp,
  ChevronDown,
  ImagePlus,
  PenLine,
  X,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  CaseSensitive,
} from 'lucide-react'
import { useEditor } from '../lib/store'
import PageView, { type PendingInsert } from './PageView'
import { STAMP_PRESETS, TOOL_MAP } from '../lib/tools'
import { finalRotation } from '../lib/pdf'
import { readImageFile, normalizeImage } from '../lib/utils'
import { cn } from '../lib/utils'
import SignaturePad from './SignaturePad'

const PAGE_GAP = 24
const PAGE_PADDING_Y = 24
const PAGE_PADDING_X = 56

export default function Viewer() {
  const pages = useEditor((s) => s.pages)
  const zoom = useEditor((s) => s.zoom)
  const zoomMode = useEditor((s) => s.zoomMode)
  const tool = useEditor((s) => s.tool)
  const style = useEditor((s) => s.style)
  const activePageId = useEditor((s) => s.activePageId)
  const searchOpen = useEditor((s) => s.searchOpen)
  const busy = useEditor((s) => s.busy)
  const loading = useEditor((s) => s.loading)

  const setZoom = useEditor((s) => s.setZoom)
  const setActivePage = useEditor((s) => s.setActivePage)
  const setSelection = useEditor((s) => s.setSelection)
  const removeSelected = useEditor((s) => s.removeSelected)
  const setTool = useEditor((s) => s.setTool)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const saveAs = useEditor((s) => s.saveAs)
  const setSearchOpen = useEditor((s) => s.setSearchOpen)
  const setShowShortcuts = useEditor((s) => s.setShowShortcuts)
  const openFiles = useEditor((s) => s.openFiles)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [pending, setPending] = useState<PendingInsert | null>(null)
  const [signatureOpen, setSignatureOpen] = useState(false)

  /* ---- track the scroll container size -------------------------- */
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setSize({ width: rect.width, height: rect.height })
    })
    observer.observe(element)
    setSize({ width: element.clientWidth, height: element.clientHeight })
    return () => observer.disconnect()
  }, [])

  /* ---- page dimensions (after rotation) ------------------------- */
  const pageSizes = useMemo(
    () =>
      pages.map((page) => {
        const rotation = finalRotation(page)
        return rotation % 180 === 0
          ? { width: page.width, height: page.height }
          : { width: page.height, height: page.width }
      }),
    [pages],
  )

  const maxWidth = useMemo(
    () => pageSizes.reduce((max, p) => Math.max(max, p.width), 1),
    [pageSizes],
  )
  const maxHeight = useMemo(
    () => pageSizes.reduce((max, p) => Math.max(max, p.height), 1),
    [pageSizes],
  )

  /* ---- fit width / fit page ------------------------------------- */
  useEffect(() => {
    if (zoomMode === 'custom' || !size.width || !maxWidth) return
    const available = size.width - PAGE_PADDING_X * 2
    const fitWidth = available / maxWidth
    const fitPage = Math.min(fitWidth, (size.height - PAGE_GAP * 2) / maxHeight)
    const next = zoomMode === 'width' ? fitWidth : Math.max(0.1, fitPage)
    if (Math.abs(next - zoom) > 0.0005) setZoom(Number(next.toFixed(4)), zoomMode)
  }, [zoomMode, size.width, size.height, maxWidth, maxHeight, zoom, setZoom])

  /* ---- ctrl/⌘ + wheel zoom (needs a non-passive listener) ------- */
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const state = useEditor.getState()
      const factor = event.deltaY > 0 ? 0.92 : 1.08
      state.setZoom(Math.min(10, Math.max(0.1, state.zoom * factor)))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  /* ---- scroll spy ------------------------------------------------ */
  const scrollToPage = useCallback((index: number) => {
    const element = scrollRef.current
    if (!element) return
    const target = element.children[0]?.children[index] as HTMLElement | undefined
    if (!target) return
    element.scrollTo({ top: target.offsetTop - PAGE_GAP / 2, behavior: 'smooth' })
  }, [])

  const syncActivePage = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    const centre = element.scrollTop + element.clientHeight / 2
    let bestIndex = 0
    let bestDistance = Infinity
    const list = element.children[0]?.children ?? []
    for (let i = 0; i < list.length; i++) {
      const node = list[i] as HTMLElement
      const top = node.offsetTop
      const bottom = top + node.offsetHeight
      const distance = Math.abs((top + bottom) / 2 - centre)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = i
      }
    }
    const page = useEditor.getState().pages[bestIndex]
    if (page && page.id !== useEditor.getState().activePageId) setActivePage(page.id)
  }, [setActivePage])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(syncActivePage)
    }
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      element.removeEventListener('scroll', onScroll)
    }
  }, [syncActivePage])

  const activeIndex = useMemo(
    () => Math.max(0, pages.findIndex((p) => p.id === activePageId)),
    [pages, activePageId],
  )

  /* ---- keyboard shortcuts --------------------------------------- */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      const mod = event.ctrlKey || event.metaKey
      const key = event.key

      if (mod) {
        switch (key.toLowerCase()) {
          case 'o':
            event.preventDefault()
            document.querySelector<HTMLInputElement>('#open-file-input')?.click()
            return
          case 's':
            event.preventDefault()
            void saveAs()
            return
          case 'z':
            event.preventDefault()
            if (event.shiftKey) redo()
            else undo()
            return
          case 'y':
            event.preventDefault()
            redo()
            return
          case 'f':
            event.preventDefault()
            setSearchOpen(true)
            return
          case '=':
          case '+':
            event.preventDefault()
            useEditor.getState().zoomIn()
            return
          case '-':
            event.preventDefault()
            useEditor.getState().zoomOut()
            return
          case '0':
            event.preventDefault()
            useEditor.getState().setZoomMode('width')
            return
          case 'd':
            event.preventDefault()
            useEditor.getState().duplicatePage(useEditor.getState().activePageId!)
            return
          default:
            return
        }
      }

      if (key === 'Escape') {
        if (useEditor.getState().searchOpen) setSearchOpen(false)
        else {
          setSelection(null)
          setPending(null)
        }
        return
      }

      if (key === 'Delete' || key === 'Backspace') {
        if (useEditor.getState().selection) {
          event.preventDefault()
          removeSelected()
        }
        return
      }

      if (key === 'PageDown' || key === 'ArrowDown') {
        if (key === 'PageDown' || event.altKey) {
          event.preventDefault()
          scrollToPage(Math.min(pages.length - 1, activeIndex + 1))
        }
        return
      }
      if (key === 'PageUp' || key === 'ArrowUp') {
        if (key === 'PageUp' || event.altKey) {
          event.preventDefault()
          scrollToPage(Math.max(0, activeIndex - 1))
        }
        return
      }

      if (key === '?') {
        event.preventDefault()
        setShowShortcuts(true)
        return
      }

      // Single letter tool shortcuts.
      const definition = Array.from(TOOL_MAP.values()).find(
        (t) => t.shortcut && t.shortcut.toLowerCase() === key.toLowerCase(),
      )
      if (definition) {
        event.preventDefault()
        setTool(definition.id)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    activeIndex,
    pages.length,
    redo,
    removeSelected,
    saveAs,
    scrollToPage,
    setSearchOpen,
    setSelection,
    setShowShortcuts,
    setTool,
    undo,
  ])

  /* ---- pending image / signature -------------------------------- */
  const onPickImage = async (file: File | undefined) => {
    if (!file) return
    try {
      const image = await readImageFile(file)
      const normalized = await normalizeImage(image.src)
      setPending({ kind: 'image', src: normalized.src, width: normalized.width, height: normalized.height })
    } catch {
      useEditor.getState().showToast('That image could not be read.', 'error')
    }
  }

  useEffect(() => {
    if (tool !== 'image' && tool !== 'signature' && tool !== 'stamp') setPending(null)
  }, [tool])

  const showInsertBar = tool === 'image' || tool === 'signature' || tool === 'stamp'
  const activeTool = TOOL_MAP.get(tool)

  return (
    <main className="relative flex min-w-0 flex-1 flex-col bg-ink-100 dark:bg-ink-950">
      <input
        id="open-file-input"
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) void openFiles(files)
          e.target.value = ''
        }}
      />
      <input
        id="merge-file-input"
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) void useEditor.getState().mergeFiles(files)
          e.target.value = ''
        }}
      />

      {showInsertBar && (
        <InsertBar
          tool={tool}
          pending={pending}
          color={style.color}
          onPickImage={(file) => void onPickImage(file)}
          onSignature={() => setSignatureOpen(true)}
          onStamp={(preset) =>
            setPending((current) =>
              current?.kind === 'stamp' && current.label === preset.label
                ? null
                : { kind: 'stamp', label: preset.label, color: preset.color },
            )
          }
          onClear={() => setPending(null)}
        />
      )}

      {activeTool && tool !== 'select' && !showInsertBar && (
        <div className="flex items-center gap-2 border-b border-ink-200 bg-indigo-50/80 px-3 py-1.5 text-xs dark:border-white/10 dark:bg-indigo-500/10">
          <activeTool.icon className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-300" />
          <span className="font-semibold text-indigo-900 dark:text-indigo-100">
            {activeTool.label}
          </span>
          <span className="text-indigo-800/80 dark:text-indigo-200/80">{activeTool.hint}</span>
          <button
            className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-indigo-700 hover:bg-indigo-500/10 dark:text-indigo-300"
            onClick={() => setTool('select')}
          >
            Done
          </button>
        </div>
      )}

      {searchOpen && <SearchBar onClose={() => setSearchOpen(false)} />}

      <div
        ref={scrollRef}
        data-scroll-container
        className="relative min-h-0 flex-1 overflow-auto scroll-thin"
      >
        <div
          className="mx-auto flex w-fit flex-col items-center"
          style={{ gap: PAGE_GAP, padding: `${PAGE_PADDING_Y}px ${PAGE_PADDING_X}px` }}
        >
          {pages.map((page, index) => (
            <PageView
              key={page.id}
              page={page}
              index={index}
              scale={zoom}
              pending={pending}
              onPlaced={() => setPending(null)}
            />
          ))}
        </div>
      </div>

      {/* Page navigator */}
      {pages.length > 1 && (
        <div className="pointer-events-auto absolute bottom-4 right-4 flex items-center gap-1 rounded-full border border-ink-200 bg-white/95 px-1 py-1 shadow-lg backdrop-blur dark:border-white/10 dark:bg-ink-900/95">
          <button
            className="icon-btn !h-7 !w-7"
            title="Previous page"
            onClick={() => scrollToPage(Math.max(0, activeIndex - 1))}
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <span className="min-w-[4.5rem] text-center text-xs font-medium tabular-nums">
            {activeIndex + 1} / {pages.length}
          </span>
          <button
            className="icon-btn !h-7 !w-7"
            title="Next page"
            onClick={() => scrollToPage(Math.min(pages.length - 1, activeIndex + 1))}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}

      {(busy || loading) && (
        <div className="absolute inset-x-0 top-3 flex justify-center">
          <div className="flex items-center gap-2 rounded-full bg-ink-900/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {busy ?? 'Loading document…'}
          </div>
        </div>
      )}

      {signatureOpen && (
        <SignaturePad
          color={style.color}
          onCancel={() => setSignatureOpen(false)}
          onDone={(src, width, height) => {
            setSignatureOpen(false)
            setPending({ kind: 'signature', src, width, height })
          }}
        />
      )}
    </main>
  )
}

/* ------------------------------------------------------------------ *
 * Insert bar
 * ------------------------------------------------------------------ */

function InsertBar({
  tool,
  pending,
  color,
  onPickImage,
  onSignature,
  onStamp,
  onClear,
}: {
  tool: 'image' | 'signature' | 'stamp'
  pending: PendingInsert | null
  color: string
  onPickImage: (file?: File) => void
  onSignature: () => void
  onStamp: (preset: { label: string; color: string }) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 bg-white/95 px-3 py-2 text-xs dark:border-white/10 dark:bg-ink-900/95">
      {tool === 'image' && (
        <>
          <button className="btn-primary !py-1" onClick={() => inputRef.current?.click()}>
            <ImagePlus className="h-3.5 w-3.5" />
            Choose image
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onPickImage(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </>
      )}

      {tool === 'signature' && (
        <button className="btn-primary !py-1" onClick={onSignature}>
          <PenLine className="h-3.5 w-3.5" />
          Create signature
        </button>
      )}

      {tool === 'stamp' && (
        <div className="flex flex-wrap items-center gap-1.5">
          {STAMP_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => onStamp(preset)}
              className={cn(
                'rounded-md border px-2 py-0.5 text-[11px] font-bold tracking-wide transition',
                pending?.kind === 'stamp' && pending.label === preset.label
                  ? 'ring-2 ring-indigo-500'
                  : 'hover:bg-ink-100 dark:hover:bg-white/10',
              )}
              style={{ color: preset.color, borderColor: preset.color }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      <span className="ml-auto flex items-center gap-2 text-ink-500 dark:text-ink-400">
        {pending ? (
          <>
            <span className="font-medium text-indigo-600 dark:text-indigo-300">
              Click on the page to place it
            </span>
            <button className="btn-ghost !py-0.5" onClick={onClear}>
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </>
        ) : (
          <>Pick an item above, then click the page</>
        )}
      </span>
      <span
        className="h-4 w-4 rounded border border-ink-300 dark:border-white/20"
        style={{ backgroundColor: color }}
        title="Current colour"
      />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Search bar
 * ------------------------------------------------------------------ */

function SearchBar({ onClose }: { onClose: () => void }) {
  const query = useEditor((s) => s.searchQuery)
  const matches = useEditor((s) => s.searchMatches)
  const index = useEditor((s) => s.searchIndex)
  const searching = useEditor((s) => s.searching)
  const runSearch = useEditor((s) => s.runSearch)
  const nextMatch = useEditor((s) => s.nextMatch)
  const prevMatch = useEditor((s) => s.prevMatch)
  const setSearchQuery = useEditor((s) => s.setSearchQuery)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => void runSearch(query), 220)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  return (
    <div className="flex items-center gap-1.5 border-b border-ink-200 bg-white/95 px-3 py-2 dark:border-white/10 dark:bg-ink-900/95">
      <Search className="h-4 w-4 text-ink-400" />
      <input
        ref={inputRef}
        className="input !w-64 !py-1"
        placeholder="Search the document…"
        value={query}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (e.shiftKey) prevMatch()
            else nextMatch()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
      />
      <span className="flex items-center gap-1 text-xs text-ink-500 dark:text-ink-400">
        <span title="Case insensitive">
          <CaseSensitive className="h-3.5 w-3.5" />
        </span>
        {searching ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <span className="tabular-nums">
            {matches.length ? `${index + 1} of ${matches.length}` : query ? 'no results' : ''}
          </span>
        )}
      </span>
      <div className="ml-1 flex items-center">
        <button className="icon-btn !h-7 !w-7" onClick={prevMatch} title="Previous match">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button className="icon-btn !h-7 !w-7" onClick={nextMatch} title="Next match">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <button className="icon-btn !h-7 !w-7" onClick={onClose} title="Close search">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
