import { useEffect, useState } from 'react'
import { FileText, Clock, Save, Layers, AlertCircle } from 'lucide-react'
import { useEditor } from '../lib/store'
import { formatBytes } from '../lib/utils'

export default function StatusBar() {
  const fileName = useEditor((s) => s.fileName)
  const pages = useEditor((s) => s.pages)
  const sources = useEditor((s) => s.sources)
  const annotations = useEditor((s) => s.annotations)
  const zoom = useEditor((s) => s.zoom)
  const dirty = useEditor((s) => s.dirty)
  const savedAt = useEditor((s) => s.savedAt)
  const error = useEditor((s) => s.error)
  const busy = useEditor((s) => s.busy)

  const [, tick] = useState(0)
  useEffect(() => {
    if (!savedAt) return
    const timer = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(timer)
  }, [savedAt])

  const bytes = sources.reduce((total, source) => total + source.bytes.length, 0)

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-ink-200 bg-white px-3 text-[11px] text-ink-500 dark:border-white/10 dark:bg-ink-900 dark:text-ink-400">
      {pages.length > 0 ? (
        <>
          <span className="flex items-center gap-1.5 truncate">
            <FileText className="h-3 w-3 shrink-0" />
            <span className="truncate font-medium text-ink-700 dark:text-ink-200">
              {fileName}
            </span>
          </span>
          <span className="hidden sm:inline">{pages.length} pages</span>
          {sources.length > 1 && <span className="hidden sm:inline">{sources.length} sources</span>}
          <span className="hidden md:inline">{annotations.length} annotations</span>
          {bytes > 0 && <span className="hidden md:inline">{formatBytes(bytes)}</span>}
          <span className="hidden md:inline">{Math.round(zoom * 100)}%</span>
        </>
      ) : (
        <span className="flex items-center gap-1.5">
          <Layers className="h-3 w-3" />
          No document open
        </span>
      )}

      <div className="ml-auto flex items-center gap-3">
        {error && (
          <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
            <AlertCircle className="h-3 w-3" />
            {error}
          </span>
        )}
        {busy && <span>{busy}</span>}
        {savedAt && (
          <span className="hidden items-center gap-1 sm:flex">
            {dirty ? (
              <>
                <Save className="h-3 w-3" />
                Unsaved changes
              </>
            ) : (
              <>
                <Clock className="h-3 w-3" />
                Saved {formatTime(savedAt)}
              </>
            )}
          </span>
        )}
      </div>
    </footer>
  )
}

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}
