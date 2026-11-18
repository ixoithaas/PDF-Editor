import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, X } from 'lucide-react'
import { useEditor } from './lib/store'
import Toolbar from './components/Toolbar'
import ToolRail from './components/ToolRail'
import Sidebar from './components/Sidebar'
import Viewer from './components/Viewer'
import PropertiesPanel from './components/PropertiesPanel'
import StatusBar from './components/StatusBar'
import Dialogs from './components/Dialogs'
import Toast from './components/Toast'
import Welcome from './components/Welcome'
import DropOverlay from './components/DropOverlay'

export default function App() {
  const pages = useEditor((s) => s.pages)
  const theme = useEditor((s) => s.theme)
  const toast = useEditor((s) => s.toast)
  const dismissToast = useEditor((s) => s.dismissToast)
  const loading = useEditor((s) => s.loading)
  const loadingProgress = useEditor((s) => s.loadingProgress)
  const error = useEditor((s) => s.error)
  const showToast = useEditor((s) => s.showToast)

  const [dragActive, setDragActive] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Give narrow screens a workable default layout.
  useEffect(() => {
    const state = useEditor.getState()
    if (typeof window === 'undefined') return
    if (window.innerWidth < 1024 && state.leftPanel !== 'none') state.setLeftPanelMode('none')
    if (window.innerWidth < 1280 && state.rightPanelOpen) state.toggleRightPanel()
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(dismissToast, 4200)
    return () => clearTimeout(timer)
  }, [toast, dismissToast])

  const hasDocument = pages.length > 0

  const onDrop = useCallback(async (files: FileList | null) => {
    if (!files || !files.length) return
    const pdfs = Array.from(files).filter(
      (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
    )
    if (!pdfs.length) return
    const { openFiles } = useEditor.getState()
    await openFiles(pdfs)
  }, [])

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) setDragActive(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault()
    }
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragActive(false)
    }
    const onDropEvent = (e: DragEvent) => {
      e.preventDefault()
      setDragActive(false)
      void onDrop(e.dataTransfer?.files ?? null)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDropEvent)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDropEvent)
    }
  }, [onDrop])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-100">
      <Toolbar />

      {error && (
        <div className="flex items-center gap-3 border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            className="rounded p-0.5 opacity-70 hover:opacity-100"
            onClick={() => showToast('Reload the page to try again.', 'info')}
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {hasDocument ? (
        <div className="flex min-h-0 flex-1">
          <ToolRail />
          <Sidebar />
          <Viewer />
          <PropertiesPanel />
        </div>
      ) : (
        <Welcome />
      )}
      <StatusBar />
      <Dialogs />
      <Toast />
      {dragActive && <DropOverlay />}
      {loading && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-ink-950/70 backdrop-blur">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/25 border-t-white" />
          <p className="text-sm font-medium text-white">Opening your document…</p>
          {loadingProgress > 0 && (
            <div className="h-1.5 w-56 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-[width]"
                style={{ width: `${Math.round(loadingProgress * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
