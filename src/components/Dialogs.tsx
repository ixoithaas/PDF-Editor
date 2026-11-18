import { useEffect, useMemo, useState } from 'react'
import {
  X,
  Lock,
  Info,
  Download,
  Keyboard,
  Scissors,
  Loader2,
  FileText,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useEditor } from '../lib/store'
import { downloadBytes } from '../lib/utils'

/* ------------------------------------------------------------------ *
 * Shell
 * ------------------------------------------------------------------ */

function Modal({
  title,
  icon: Icon,
  onClose,
  children,
  footer,
  width = 'max-w-lg',
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  width?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[65] flex items-start justify-center overflow-y-auto bg-ink-950/60 p-4 pt-[8vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`w-full ${width} animate-scale-in overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl dark:border-white/10 dark:bg-ink-900`}
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-white/10">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="h-4 w-4" />
            {title}
          </h2>
          <button className="icon-btn !h-7 !w-7" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto p-4 scroll-thin">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-ink-200 px-4 py-3 dark:border-white/10">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Root
 * ------------------------------------------------------------------ */

export default function Dialogs() {
  const passwordPrompt = useEditor((s) => s.passwordPrompt)
  const showMetadata = useEditor((s) => s.showMetadata)
  const showExportOptions = useEditor((s) => s.showExportOptions)
  const showEncryption = useEditor((s) => s.showEncryption)
  const showSplit = useEditor((s) => s.showSplit)
  const showShortcuts = useEditor((s) => s.showShortcuts)

  return (
    <>
      {passwordPrompt.open && <PasswordDialog />}
      {showMetadata && <MetadataDialog />}
      {showExportOptions && <ExportOptionsDialog />}
      {showEncryption && <EncryptionDialog />}
      {showSplit && <SplitDialog />}
      {showShortcuts && <ShortcutsDialog />}
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Password
 * ------------------------------------------------------------------ */

function PasswordDialog() {
  const prompt = useEditor((s) => s.passwordPrompt)
  const close = useEditor((s) => s.closePasswordPrompt)
  const openFile = useEditor((s) => s.openFile)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => setValue(''), [prompt.open, prompt.pending])

  const submit = async () => {
    if (!prompt.pending || !value) return
    setBusy(true)
    await openFile(prompt.pending, value)
    setBusy(false)
  }

  return (
    <Modal title="Protected document" icon={Lock} onClose={close} width="max-w-sm">
      <p className="text-sm text-ink-600 dark:text-ink-300">
        {prompt.incorrect
          ? 'That password is incorrect. Try again.'
          : 'This PDF is encrypted. Enter the password to open it.'}
      </p>
      <input
        className="input mt-3"
        type="password"
        autoFocus
        placeholder="Password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
        }}
      />
      <p className="mt-2 text-xs text-ink-500">
        {prompt.pending?.name} — the password is only kept in memory for this
        session.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-outline" onClick={close}>
          Cancel
        </button>
        <button className="btn-primary" onClick={() => void submit()} disabled={!value || busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Unlock
        </button>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ *
 * Metadata
 * ------------------------------------------------------------------ */

function MetadataDialog() {
  const meta = useEditor((s) => s.meta)
  const updateMeta = useEditor((s) => s.updateMeta)
  const close = useEditor((s) => s.setShowMetadata)
  const [draft, setDraft] = useState({ ...meta })

  const fields = [
    { key: 'title', label: 'Title' },
    { key: 'author', label: 'Author' },
    { key: 'subject', label: 'Subject' },
    { key: 'keywords', label: 'Keywords' },
    { key: 'creator', label: 'Creator' },
    { key: 'producer', label: 'Producer' },
  ] as const

  return (
    <Modal
      title="Document properties"
      icon={Info}
      onClose={() => close(false)}
      footer={
        <>
          <button className="btn-outline" onClick={() => close(false)}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              updateMeta(draft)
              close(false)
            }}
          >
            Save properties
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {fields.map((field) => (
          <label key={field.key} className="block">
            <span className="label">{field.label}</span>
            <input
              className="input"
              value={draft[field.key] ?? ''}
              onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-500">
        These values are written into the exported PDF's information dictionary.
      </p>
    </Modal>
  )
}

/* ------------------------------------------------------------------ *
 * Export options
 * ------------------------------------------------------------------ */

function ExportOptionsDialog() {
  const close = useEditor((s) => s.setShowExportOptions)
  const exportDocument = useEditor((s) => s.exportDocument)
  const fileName = useEditor((s) => s.fileName)
  const [flatten, setFlatten] = useState(true)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    const bytes = await exportDocument({
      flattenForm: flatten,
      userPassword: password || undefined,
      ownerPassword: password || undefined,
    })
    setBusy(false)
    if (bytes) {
      const base = fileName.replace(/\.pdf$/i, '') || 'document'
      downloadBytes(bytes, password ? `${base}-protected.pdf` : `${base}-edited.pdf`)
      close(false)
    }
  }

  return (
    <Modal
      title="Export options"
      icon={Download}
      onClose={() => close(false)}
      footer={
        <>
          <button className="btn-outline" onClick={() => close(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export PDF
          </button>
        </>
      }
    >
      <label className="mb-4 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={flatten}
          onChange={(e) => setFlatten(e.target.checked)}
        />
        <span>
          Flatten form fields
          <span className="block text-xs text-ink-500">
            Form values are burned into the page so they show up everywhere.
          </span>
        </span>
      </label>

      <label className="block">
        <span className="label">Password protection (optional)</span>
        <input
          className="input"
          type="password"
          placeholder="Leave empty for no protection"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <p className="mt-2 text-xs text-ink-500">
        Documents are protected with 128&#8209;bit RC4 encryption (PDF 1.4 /R 3).
        Keep the password safe — it cannot be recovered.
      </p>
    </Modal>
  )
}

/* ------------------------------------------------------------------ *
 * Encryption
 * ------------------------------------------------------------------ */

function EncryptionDialog() {
  const close = useEditor((s) => s.setShowEncryption)
  const exportDocument = useEditor((s) => s.exportDocument)
  const fileName = useEditor((s) => s.fileName)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  const mismatch = confirm.length > 0 && password !== confirm
  const ready = password.length > 0 && !mismatch

  const save = async () => {
    if (!ready) return
    setBusy(true)
    const bytes = await exportDocument({
      userPassword: password,
      ownerPassword: password,
      flattenForm: true,
    })
    setBusy(false)
    if (bytes) {
      const base = fileName.replace(/\.pdf$/i, '') || 'document'
      downloadBytes(bytes, `${base}-protected.pdf`)
      close(false)
    }
  }

  return (
    <Modal
      title="Encrypt with password"
      icon={Lock}
      onClose={() => close(false)}
      footer={
        <>
          <button className="btn-outline" onClick={() => close(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => void save()} disabled={!ready || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Save protected PDF
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="label">Password</span>
          <div className="relative">
            <input
              className="input pr-10"
              type={show ? 'text' : 'password'}
              value={password}
              autoFocus
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400"
              onClick={() => setShow((v) => !v)}
              title={show ? 'Hide' : 'Show'}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>
        <label className="block">
          <span className="label">Confirm password</span>
          <input
            className="input"
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {mismatch && <p className="text-xs text-rose-600">The passwords do not match.</p>}
      </div>
      <p className="mt-3 text-xs text-ink-500">
        The exported file uses 128&#8209;bit RC4 encryption. Viewers will ask for
        this password before showing the document.
      </p>
    </Modal>
  )
}

/* ------------------------------------------------------------------ *
 * Split / extract
 * ------------------------------------------------------------------ */

function SplitDialog() {
  const close = useEditor((s) => s.setShowSplit)
  const pages = useEditor((s) => s.pages)
  const extractPages = useEditor((s) => s.extractPages)
  const [start, setStart] = useState(1)
  const [end, setEnd] = useState(1)
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    setEnd(pages.length)
  }, [pages.length])

  const range = useMemo(() => {
    const from = Math.max(1, Math.min(start, pages.length))
    const to = Math.min(pages.length, Math.max(end, from))
    return pages.slice(from - 1, to)
  }, [pages, start, end])

  const run = async () => {
    const ids = selected.length ? selected : range.map((p) => p.id)
    if (!ids.length) return
    await extractPages(ids)
    close(false)
  }

  return (
    <Modal
      title="Extract pages"
      icon={Scissors}
      onClose={() => close(false)}
      footer={
        <>
          <button className="btn-outline" onClick={() => close(false)}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => void run()}
            disabled={!range.length && !selected.length}
          >
            <Scissors className="h-4 w-4" />
            Extract to a new PDF
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">First page</span>
          <input
            type="number"
            className="input"
            min={1}
            max={pages.length}
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="label">Last page</span>
          <input
            type="number"
            className="input"
            min={1}
            max={pages.length}
            value={end}
            onChange={(e) => setEnd(Number(e.target.value))}
          />
        </label>
      </div>
      <p className="mt-3 text-xs text-ink-500">
        {range.length} of {pages.length} pages selected. The extracted document is
        downloaded as a new file; your current document is untouched.
      </p>

      <div className="mt-4 flex flex-wrap gap-1">
        {pages.map((page, index) => {
          const active = selected.includes(page.id)
          return (
            <button
              key={page.id}
              onClick={() =>
                setSelected((current) =>
                  current.includes(page.id)
                    ? current.filter((id) => id !== page.id)
                    : [...current, page.id],
                )
              }
              className={`h-8 w-8 rounded-md border text-xs font-medium transition ${
                active
                  ? 'border-indigo-500 bg-indigo-500 text-white'
                  : 'border-ink-300 hover:bg-ink-100 dark:border-white/15 dark:hover:bg-white/5'
              }`}
            >
              {index + 1}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-ink-500">
        Or click individual pages above to extract exactly those.
      </p>
    </Modal>
  )
}

/* ------------------------------------------------------------------ *
 * Shortcuts
 * ------------------------------------------------------------------ */

const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: 'File',
    items: [
      ['Ctrl / ⌘ + O', 'Open PDF files'],
      ['Ctrl / ⌘ + S', 'Download the edited PDF'],
      ['Ctrl / ⌘ + Z', 'Undo'],
      ['Ctrl / ⌘ + Shift + Z', 'Redo'],
    ],
  },
  {
    group: 'View',
    items: [
      ['Ctrl / ⌘ + F', 'Search the document'],
      ['Ctrl / ⌘ + +', 'Zoom in'],
      ['Ctrl / ⌘ + -', 'Zoom out'],
      ['Ctrl / ⌘ + 0', 'Fit width'],
      ['Page Up / Down', 'Previous / next page'],
    ],
  },
  {
    group: 'Tools',
    items: [
      ['V', 'Select & move'],
      ['H', 'Pan'],
      ['T', 'Text box'],
      ['M', 'Highlight'],
      ['U', 'Underline'],
      ['S', 'Strike out'],
      ['P', 'Freehand draw'],
      ['E', 'Eraser'],
      ['R', 'Rectangle'],
      ['O', 'Ellipse'],
      ['L', 'Line'],
      ['A', 'Arrow'],
      ['I', 'Image'],
      ['G', 'Signature'],
      ['B', 'Stamp'],
    ],
  },
  {
    group: 'Editing',
    items: [
      ['Delete / Backspace', 'Remove the selected annotation'],
      ['Ctrl / ⌘ + D', 'Duplicate the current page'],
      ['Escape', 'Deselect / close search'],
      ['?', 'Show this dialog'],
    ],
  },
]

function ShortcutsDialog() {
  const close = useEditor((s) => s.setShowShortcuts)

  return (
    <Modal
      title="Keyboard shortcuts"
      icon={Keyboard}
      onClose={() => close(false)}
      width="max-w-2xl"
      footer={
        <button className="btn-primary" onClick={() => close(false)}>
          Got it
        </button>
      }
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {SHORTCUTS.map((section) => (
          <div key={section.group}>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
              <FileText className="h-3 w-3" />
              {section.group}
            </h3>
            <dl className="space-y-1">
              {section.items.map(([keys, label]) => (
                <div key={keys} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-ink-600 dark:text-ink-300">{label}</dt>
                  <dd>
                    <kbd className="rounded-md border border-ink-300 bg-ink-50 px-1.5 py-0.5 font-sans text-[11px] dark:border-white/20 dark:bg-white/5">
                      {keys}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Modal>
  )
}
