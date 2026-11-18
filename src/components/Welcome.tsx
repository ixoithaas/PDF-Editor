import { useRef, useState } from 'react'
import {
  FileUp,
  ShieldCheck,
  Sparkles,
  Layers,
  PenLine,
  Search,
  Split,
  FileText,
  ArrowRight,
  Sparkle,
} from 'lucide-react'
import { useEditor } from '../lib/store'

const FEATURES = [
  {
    icon: PenLine,
    title: 'Annotate everything',
    body: 'Highlight, underline, strike out, draw, add shapes, images, text and stamps.',
  },
  {
    icon: Layers,
    title: 'Rearrange pages',
    body: 'Reorder, rotate, duplicate, delete, merge and split documents in seconds.',
  },
  {
    icon: FileText,
    title: 'Fill real forms',
    body: 'Fill in interactive AcroForm fields and export them as a flattened PDF.',
  },
  {
    icon: Search,
    title: 'Search and inspect',
    body: 'Full-text search, metadata editing and document properties at your fingertips.',
  },
]

export default function Welcome() {
  const openFiles = useEditor((s) => s.openFiles)
  const inputRef = useRef<HTMLInputElement>(null)
  const [hover, setHover] = useState(false)
  const [sampleBusy, setSampleBusy] = useState(false)

  const openSample = async () => {
    setSampleBusy(true)
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}sample.pdf`)
      if (!response.ok) throw new Error('The sample document is unavailable.')
      const blob = await response.blob()
      const file = new File([blob], 'sample.pdf', { type: 'application/pdf' })
      await openFiles([file])
    } catch {
      useEditor.getState().showToast('The sample document could not be loaded.', 'error')
    } finally {
      setSampleBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60rem 30rem at 20% -10%, rgba(99,102,241,0.16), transparent 60%), radial-gradient(50rem 26rem at 90% 110%, rgba(14,165,233,0.14), transparent 60%)',
        }}
      />
      <div className="relative w-full max-w-5xl">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-500/30">
            <FileUp className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            A complete PDF editor,
            <span className="bg-gradient-to-r from-indigo-500 to-sky-500 bg-clip-text text-transparent">
              {' '}
              in your browser
            </span>
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-ink-600 dark:text-ink-400">
            Open, edit, annotate, sign and export PDFs without uploading a single
            byte to a server. Everything happens locally in your browser.
          </p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setHover(true)
          }}
          onDragLeave={() => setHover(false)}
          onDrop={(e) => {
            e.preventDefault()
            setHover(false)
            const files = Array.from(e.dataTransfer.files).filter(
              (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
            )
            if (files.length) void openFiles(files)
          }}
          className={`mx-auto flex max-w-2xl flex-col items-center rounded-2xl border-2 border-dashed p-10 text-center transition ${
            hover
              ? 'border-indigo-500 bg-indigo-500/5'
              : 'border-ink-300 bg-white/60 dark:border-white/15 dark:bg-white/[0.03]'
          }`}
        >
          <Sparkles className="mb-3 h-7 w-7 text-indigo-500" />
          <p className="text-sm font-medium">Drop your PDF files here</p>
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            Drop several files to merge them into one document
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button className="btn-primary" onClick={() => inputRef.current?.click()}>
              <FileUp className="h-4 w-4" />
              Choose PDF files
            </button>
            <button className="btn-outline" onClick={() => void openSample()} disabled={sampleBusy}>
              <Sparkle className={`h-4 w-4 ${sampleBusy ? 'animate-pulse' : ''}`} />
              {sampleBusy ? 'Loading sample…' : 'Open the sample PDF'}
            </button>
          </div>
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
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-ink-200 bg-white/70 p-4 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/[0.04]"
            >
              <feature.icon className="mb-3 h-5 w-5 text-indigo-500" />
              <h3 className="text-sm font-semibold">{feature.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-600 dark:text-ink-400">
                {feature.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-ink-500 dark:text-ink-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            100% client side — files never leave your device
          </span>
          <span className="flex items-center gap-1.5">
            <Split className="h-4 w-4 text-sky-500" />
            Merge, split & extract pages
          </span>
          <span className="flex items-center gap-1.5">
            <ArrowRight className="h-4 w-4 text-indigo-500" />
            Export a standards compliant PDF
          </span>
        </div>
      </div>
    </div>
  )
}
