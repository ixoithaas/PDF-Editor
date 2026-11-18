import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useEditor } from '../lib/store'
import { cn } from '../lib/utils'

export default function Toast() {
  const toast = useEditor((s) => s.toast)
  const dismiss = useEditor((s) => s.dismissToast)

  if (!toast) return null

  const Icon = toast.tone === 'error' ? AlertCircle : toast.tone === 'success' ? CheckCircle2 : Info

  return (
    <div className="pointer-events-none fixed bottom-12 left-1/2 z-[60] -translate-x-1/2">
      <div
        className={cn(
          'pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm shadow-xl animate-scale-in',
          toast.tone === 'error'
            ? 'bg-rose-600 text-white'
            : toast.tone === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-ink-900 text-white dark:bg-white dark:text-ink-900',
        )}
        role="status"
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{toast.message}</span>
        <button
          className="rounded p-0.5 opacity-70 transition hover:opacity-100"
          onClick={dismiss}
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
