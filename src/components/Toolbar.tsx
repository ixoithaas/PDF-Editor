import { useEffect, useRef, useState } from 'react'
import {
  Undo2,
  Redo2,
  Search,
  ZoomOut,
  ZoomIn,
  PanelLeft,
  PanelRight,
  Sun,
  Moon,
  Printer,
  Download,
  FileUp,
  Keyboard,
  ChevronDown,
  Maximize,
  FileText,
  Lock,
  Merge,
  Scissors,
  Info,
  ScanSearch,
} from 'lucide-react'
import { useEditor } from '../lib/store'
import { cn } from '../lib/utils'

function Dropdown({
  trigger,
  children,
  align = 'right',
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode
  children: (close: () => void) => React.ReactNode
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          className={cn(
            'absolute z-50 mt-2 min-w-[15rem] animate-scale-in overflow-hidden rounded-xl border border-ink-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-ink-900',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export default function Toolbar() {
  const fileName = useEditor((s) => s.fileName)
  const pages = useEditor((s) => s.pages)
  const zoom = useEditor((s) => s.zoom)
  const zoomMode = useEditor((s) => s.zoomMode)
  const theme = useEditor((s) => s.theme)
  const dirty = useEditor((s) => s.dirty)
  const leftPanel = useEditor((s) => s.leftPanel)
  const rightPanelOpen = useEditor((s) => s.rightPanelOpen)
  const searchOpen = useEditor((s) => s.searchOpen)

  const openFiles = useEditor((s) => s.openFiles)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const zoomIn = useEditor((s) => s.zoomIn)
  const zoomOut = useEditor((s) => s.zoomOut)
  const setZoom = useEditor((s) => s.setZoom)
  const setZoomMode = useEditor((s) => s.setZoomMode)
  const setSearchOpen = useEditor((s) => s.setSearchOpen)
  const toggleRightPanel = useEditor((s) => s.toggleRightPanel)
  const toggleTheme = useEditor((s) => s.toggleTheme)
  const print = useEditor((s) => s.print)
  const saveAs = useEditor((s) => s.saveAs)
  const setShowShortcuts = useEditor((s) => s.setShowShortcuts)

  const inputRef = useRef<HTMLInputElement>(null)
  const hasDoc = pages.length > 0

  return (
    <header className="z-30 flex h-14 shrink-0 items-center gap-1 border-b border-ink-200 bg-white/90 px-2 backdrop-blur dark:border-white/10 dark:bg-ink-900/90">
      {/* Brand */}
      <div className="mr-1 flex items-center gap-2 pl-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 text-white">
          <FileText className="h-4.5 w-4.5" />
        </div>
        <span className="hidden text-sm font-semibold tracking-tight sm:inline">
          PDF Editor
        </span>
      </div>

      <div className="mx-1 hidden h-6 w-px bg-ink-200 sm:block dark:bg-white/10" />

      {/* File actions */}
      <button className="btn-soft" onClick={() => inputRef.current?.click()} title="Open PDF (Ctrl+O)">
        <FileUp className="h-4 w-4" />
        <span className="hidden md:inline">Open</span>
      </button>
      <input
        ref={inputRef}
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

      {hasDoc && (
        <button
          className="btn-soft"
          onClick={() => void useEditor.getState().detectFormBoxes()}
          title="Detect printed character boxes in this PDF"
        >
          <ScanSearch className="h-4 w-4" />
          <span className="hidden lg:inline">Detect boxes</span>
        </button>
      )}

      <div className="mx-1 h-6 w-px bg-ink-200 dark:bg-white/10" />

      <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        <Undo2 className="h-4 w-4" />
      </button>
      <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
        <Redo2 className="h-4 w-4" />
      </button>

      {/* Document title */}
      {hasDoc && (
        <div className="ml-2 hidden min-w-0 flex-1 items-center gap-2 md:flex">
          <span className="truncate text-sm font-medium text-ink-700 dark:text-ink-200">
            {fileName}
          </span>
          {dirty && (
            <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              unsaved
            </span>
          )}
          <span className="chip bg-ink-100 text-ink-500 dark:bg-white/10 dark:text-ink-400">
            {pages.length} page{pages.length === 1 ? '' : 's'}
          </span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-1">
        {/* Zoom */}
        {hasDoc && (
          <div className="hidden items-center gap-0.5 rounded-lg border border-ink-200 p-0.5 md:flex dark:border-white/10">
            <button className="icon-btn !h-7 !w-7" onClick={zoomOut} title="Zoom out (Ctrl+-)">
              <ZoomOut className="h-4 w-4" />
            </button>
            <Dropdown
              align="right"
              trigger={({ toggle }) => (
                <button
                  className="min-w-[3.6rem] rounded px-1 py-0.5 text-xs font-medium tabular-nums hover:bg-ink-100 dark:hover:bg-white/10"
                  onClick={toggle}
                  title="Zoom presets"
                >
                  {Math.round(zoom * 100)}%
                </button>
              )}
            >
              {(close) => (
                <>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2, 3].map((value) => (
                    <MenuItem
                      key={value}
                      label={`${Math.round(value * 100)}%`}
                      onClick={() => {
                        close()
                        setZoom(value)
                      }}
                    />
                  ))}
                  <div className="my-1 h-px bg-ink-200 dark:bg-white/10" />
                  <MenuItem
                    label="Fit width"
                    hint={zoomMode === 'width' ? '✓' : undefined}
                    onClick={() => {
                      close()
                      setZoomMode('width')
                    }}
                  />
                  <MenuItem
                    label="Fit page"
                    hint={zoomMode === 'page' ? '✓' : undefined}
                    onClick={() => {
                      close()
                      setZoomMode('page')
                    }}
                  />
                </>
              )}
            </Dropdown>
            <button className="icon-btn !h-7 !w-7" onClick={zoomIn} title="Zoom in (Ctrl+=)">
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              className="icon-btn !h-7 !w-7"
              onClick={() => setZoomMode('width')}
              title="Fit width"
            >
              <Maximize className="h-4 w-4" />
            </button>
          </div>
        )}

        <button
          className={cn('icon-btn', searchOpen && 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300')}
          onClick={() => setSearchOpen(!searchOpen)}
          title="Search (Ctrl+F)"
        >
          <Search className="h-4 w-4" />
        </button>

        <button
          className={cn('icon-btn', leftPanel !== 'none' && 'bg-ink-200/70 dark:bg-white/10')}
          onClick={() => useEditor.getState().setLeftPanelMode(leftPanel === 'none' ? 'pages' : 'none')}
          title="Toggle sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <button
          className={cn('icon-btn', rightPanelOpen && 'bg-ink-200/70 dark:bg-white/10')}
          onClick={toggleRightPanel}
          title="Toggle properties panel"
        >
          <PanelRight className="h-4 w-4" />
        </button>

        <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <button
          className="icon-btn"
          onClick={() => setShowShortcuts(true)}
          title="Keyboard shortcuts (?)"
        >
          <Keyboard className="h-4 w-4" />
        </button>

        {hasDoc && (
          <>
            <button className="icon-btn" onClick={print} title="Print">
              <Printer className="h-4 w-4" />
            </button>

            <Dropdown
              trigger={({ toggle }) => (
                <button className="btn-primary ml-1" onClick={toggle}>
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Export</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem
                    icon={Download}
                    label="Download PDF"
                    hint="Ctrl+S"
                    onClick={() => {
                      close()
                      void saveAs()
                    }}
                  />
                  <MenuItem
                    icon={FileText}
                    label="Export options…"
                    onClick={() => {
                      close()
                      useEditor.getState().setShowExportOptions(true)
                    }}
                  />
                  <div className="my-1 h-px bg-ink-200 dark:bg-white/10" />
                  <MenuItem
                    icon={Merge}
                    label="Merge another document"
                    onClick={() => {
                      close()
                      document.getElementById('merge-file-input')?.click()
                    }}
                  />
                  <MenuItem
                    icon={Lock}
                    label="Encrypt with password…"
                    onClick={() => {
                      close()
                      useEditor.getState().setShowEncryption(true)
                    }}
                  />
                  <div className="my-1 h-px bg-ink-200 dark:bg-white/10" />
                  <MenuItem
                    icon={Scissors}
                    label="Extract pages…"
                    hint="Creates a new file"
                    onClick={() => {
                      close()
                      useEditor.getState().setShowSplit(true)
                    }}
                  />
                  <MenuItem
                    icon={Info}
                    label="Document properties…"
                    onClick={() => {
                      close()
                      useEditor.getState().setShowMetadata(true)
                    }}
                  />
                </>
              )}
            </Dropdown>
          </>
        )}
      </div>
    </header>
  )
}

export function MenuItem({
  icon: Icon,
  label,
  hint,
  onClick,
  danger,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  hint?: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
        danger
          ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10'
          : 'hover:bg-ink-100 dark:hover:bg-white/10',
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 opacity-70" />}
      <span className="flex-1">{label}</span>
      {hint && (
        <span className="text-xs text-ink-400 dark:text-ink-500">{hint}</span>
      )}
    </button>
  )
}
