import { FileUp } from 'lucide-react'

export default function DropOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-indigo-950/40 p-8 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-white/70 bg-white/10 px-16 py-14 text-center text-white">
        <FileUp className="h-12 w-12" />
        <div>
          <p className="text-xl font-semibold">Drop to open your PDF</p>
          <p className="mt-1 text-sm text-white/80">
            Drop several files to merge them into one document.
          </p>
        </div>
      </div>
    </div>
  )
}
