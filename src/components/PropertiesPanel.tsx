import { useMemo } from 'react'
import {
  RotateCw,
  RotateCcw,
  Trash2,
  Copy,
  Layers,
  Palette,
  Type,
  FileText,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowLeftRight,
  ArrowUpDown,
} from 'lucide-react'
import { useEditor } from '../lib/store'
import { COLOR_PRESETS, STAMP_PRESETS } from '../lib/tools'
import { FONTS } from '../lib/fonts'
import { ANNOTATION_LABELS } from '../lib/annotationMeta'
import { cn } from '../lib/utils'
import { finalRotation, uid } from '../lib/pdf'
import type { Annotation, TextAlign } from '../types'

const STROKE_WIDTHS = [0.5, 1, 2, 3, 5, 8]

export default function PropertiesPanel() {
  const open = useEditor((s) => s.rightPanelOpen)
  const annotations = useEditor((s) => s.annotations)
  const selection = useEditor((s) => s.selection)
  const pages = useEditor((s) => s.pages)
  const activePageId = useEditor((s) => s.activePageId)
  const tool = useEditor((s) => s.tool)

  const selected = useMemo(
    () => annotations.find((a) => a.id === selection) ?? null,
    [annotations, selection],
  )

  const page = useMemo(
    () => pages.find((p) => p.id === activePageId) ?? pages[0] ?? null,
    [pages, activePageId],
  )

  if (!open) return null

  return (
    <aside className="z-10 flex w-60 shrink-0 flex-col overflow-y-auto border-l border-ink-200 bg-white scroll-thin xl:w-72 dark:border-white/10 dark:bg-ink-900">
      {selected ? (
        <AnnotationProperties annotation={selected} />
      ) : (
        <ToolProperties tool={tool} />
      )}

      {!selected && page && <PageProperties pageId={page.id} />}

      <div className="mt-auto border-t border-ink-200 p-3 text-[11px] leading-relaxed text-ink-500 dark:border-white/10 dark:text-ink-400">
        <div className="mb-1 flex items-center gap-1.5 font-semibold uppercase tracking-wide">
          <Layers className="h-3 w-3" />
          Tips
        </div>
        Pick a tool from the left rail, then drag on the page. Select an
        annotation to move, resize or rotate it. Press <Kbd>Delete</Kbd> to
        remove it and <Kbd>?</Kbd> for all shortcuts.
      </div>
    </aside>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-ink-300 px-1 font-sans text-[10px] dark:border-white/20">
      {children}
    </kbd>
  )
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-ink-200 p-3 dark:border-white/10">
      <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h3>
      {children}
    </div>
  )
}

function ColorSwatches({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {COLOR_PRESETS.map((preset) => (
        <button
          key={preset}
          onClick={() => onChange(preset)}
          title={preset}
          className={cn(
            'h-6 w-6 rounded-md border transition',
            value.toLowerCase() === preset.toLowerCase()
              ? 'border-indigo-500 ring-2 ring-indigo-500/40'
              : 'border-ink-300 hover:scale-110 dark:border-white/20',
          )}
          style={{ backgroundColor: preset }}
        />
      ))}
      <input
        type="color"
        className="ml-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title="Custom colour"
      />
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="mb-2 block">
      <span className="mb-1 flex items-center justify-between text-[11px] font-medium text-ink-600 dark:text-ink-300">
        {label}
        <span className="tabular-nums text-ink-400">
          {Math.round(value * 100) / 100}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

/* ------------------------------------------------------------------ *
 * Tool defaults
 * ------------------------------------------------------------------ */

function ToolProperties({ tool }: { tool: string }) {
  const style = useEditor((s) => s.style)
  const setStyle = useEditor((s) => s.setStyle)

  const showStroke = ['pen', 'rect', 'ellipse', 'line', 'arrow', 'highlight', 'underline', 'strikeout'].includes(tool)
  const showFill = ['rect', 'ellipse'].includes(tool)
  const showText = tool === 'text' || tool === 'stamp'

  return (
    <>
      <Section icon={Palette} title="Appearance">
        <ColorSwatches value={style.color} onChange={(color) => setStyle({ color })} />

        {showFill && (
          <div className="mt-3">
            <label className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-ink-600 dark:text-ink-300">
              <input
                type="checkbox"
                checked={style.filled}
                onChange={(e) => setStyle({ filled: e.target.checked })}
              />
              Fill shape
            </label>
            {style.filled && (
              <ColorSwatches
                value={style.fillColor}
                onChange={(fillColor) => setStyle({ fillColor })}
              />
            )}
          </div>
        )}

        {showStroke && (
          <div className="mt-3">
            <span className="mb-1.5 block text-[11px] font-medium text-ink-600 dark:text-ink-300">
              Stroke width
            </span>
            <div className="flex flex-wrap gap-1">
              {STROKE_WIDTHS.map((width) => (
                <button
                  key={width}
                  onClick={() => setStyle({ strokeWidth: width })}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-md border transition',
                    Math.abs(style.strokeWidth - width) < 0.01
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15'
                      : 'border-ink-300 hover:bg-ink-100 dark:border-white/15 dark:hover:bg-white/5',
                  )}
                  title={`${width} pt`}
                >
                  <span
                    className="w-4 rounded-full"
                    style={{
                      height: Math.min(6, Math.max(1, width)),
                      backgroundColor: style.color,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3">
          <Slider
            label="Opacity"
            value={style.opacity}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(opacity) => setStyle({ opacity })}
          />
        </div>
      </Section>

      {showText && (
        <Section icon={Type} title="Text">
          <label className="mb-2 block">
            <span className="label">Font</span>
            <select
              className="input !py-1 text-xs"
              value={style.font}
              onChange={(e) => setStyle({ font: e.target.value as never })}
            >
              {FONTS.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>

          <Slider
            label="Size"
            value={style.fontSize}
            min={6}
            max={72}
            step={1}
            suffix=" pt"
            onChange={(fontSize) => setStyle({ fontSize })}
          />

          <div className="mt-2 flex items-center gap-1">
            {(
              [
                { id: 'left', icon: AlignLeft },
                { id: 'center', icon: AlignCenter },
                { id: 'right', icon: AlignRight },
              ] as { id: TextAlign; icon: React.ComponentType<{ className?: string }> }[]
            ).map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setStyle({ align: id })}
                className={cn(
                  'icon-btn !h-8 !w-8',
                  style.align === id && 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
                )}
                title={`Align ${id}`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </Section>
      )}

      {tool === 'stamp' && (
        <Section icon={FileText} title="Stamp presets">
          <div className="flex flex-wrap gap-1.5">
            {STAMP_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => setStyle({ color: preset.color })}
                className="rounded-md border px-2 py-0.5 text-[11px] font-bold tracking-wide transition hover:bg-ink-100 dark:hover:bg-white/10"
                style={{ color: preset.color, borderColor: preset.color }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-500">
            Choose a preset above, then click the page to place it.
          </p>
        </Section>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Selected annotation
 * ------------------------------------------------------------------ */

function AnnotationProperties({ annotation }: { annotation: Annotation }) {
  const updateAnnotation = useEditor((s) => s.updateAnnotation)
  const removeAnnotation = useEditor((s) => s.removeAnnotation)
  const beginHistory = useEditor((s) => s.beginHistory)
  const patchAnnotation = useEditor((s) => s.patchAnnotation)
  const setStyle = useEditor((s) => s.setStyle)

  const live = (patch: Partial<Annotation>) => {
    beginHistory()
    patchAnnotation(annotation.id, patch)
  }

  const hasColor = annotation.kind !== 'image'
  const hasStroke = ['draw', 'rect', 'ellipse', 'line', 'arrow'].includes(annotation.kind)

  return (
    <>
      <Section icon={Layers} title={ANNOTATION_LABELS[annotation.kind] ?? 'Annotation'}>
        {hasColor && (
          <ColorSwatches
            value={annotation.color}
            onChange={(color) => {
              setStyle({ color })
              updateAnnotation(annotation.id, { color } as Partial<Annotation>)
            }}
          />
        )}

        {hasStroke && (
          <div className="mt-3">
            <Slider
              label="Stroke width"
              value={(annotation as { strokeWidth: number }).strokeWidth}
              min={0.5}
              max={12}
              step={0.5}
              suffix=" pt"
              onChange={(strokeWidth) => {
                setStyle({ strokeWidth })
                updateAnnotation(annotation.id, { strokeWidth } as Partial<Annotation>)
              }}
            />
          </div>
        )}

        <Slider
          label="Opacity"
          value={annotation.opacity}
          min={0.1}
          max={1}
          step={0.05}
          onChange={(opacity) => live({ opacity })}
        />

        {annotation.kind === 'rect' || annotation.kind === 'ellipse' ? (
          <div className="mt-3">
            <label className="mb-1.5 flex items-center gap-2 text-[11px] font-medium">
              <input
                type="checkbox"
                checked={annotation.filled}
                onChange={(e) => updateAnnotation(annotation.id, { filled: e.target.checked } as Partial<Annotation>)}
              />
              Filled
            </label>
            {annotation.filled && (
              <ColorSwatches
                value={annotation.fillColor}
                onChange={(fillColor) =>
                  updateAnnotation(annotation.id, { fillColor } as Partial<Annotation>)
                }
              />
            )}
          </div>
        ) : null}

        {annotation.kind === 'text' && (
          <div className="mt-3 space-y-2">
            <label className="block">
              <span className="label">Font</span>
              <select
                className="input !py-1 text-xs"
                value={annotation.font}
                onChange={(e) => {
                  setStyle({ font: e.target.value as never })
                  updateAnnotation(annotation.id, { font: e.target.value as never })
                }}
              >
                {FONTS.map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.label}
                  </option>
                ))}
              </select>
            </label>
            <Slider
              label="Size"
              value={annotation.fontSize}
              min={6}
              max={96}
              step={1}
              suffix=" pt"
              onChange={(fontSize) => {
                setStyle({ fontSize })
                updateAnnotation(annotation.id, { fontSize })
              }}
            />
            <Slider
              label="Rotation"
              value={annotation.angle}
              min={0}
              max={359}
              step={1}
              suffix="°"
              onChange={(angle) => updateAnnotation(annotation.id, { angle })}
            />
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'left', icon: AlignLeft },
                  { id: 'center', icon: AlignCenter },
                  { id: 'right', icon: AlignRight },
                ] as { id: TextAlign; icon: React.ComponentType<{ className?: string }> }[]
              ).map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => updateAnnotation(annotation.id, { align: id })}
                  className={cn(
                    'icon-btn !h-8 !w-8',
                    annotation.align === id && 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
                  )}
                  title={`Align ${id}`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
            <textarea
              className="input min-h-[5rem] resize-y text-xs"
              value={annotation.text}
              onChange={(e) => updateAnnotation(annotation.id, { text: e.target.value })}
            />
          </div>
        )}

        {annotation.kind === 'stamp' && (
          <div className="mt-3 space-y-2">
            <input
              className="input !py-1 text-xs"
              value={annotation.label}
              onChange={(e) => updateAnnotation(annotation.id, { label: e.target.value })}
            />
            <Slider
              label="Size"
              value={annotation.size}
              min={6}
              max={96}
              step={1}
              suffix=" pt"
              onChange={(size) => updateAnnotation(annotation.id, { size })}
            />
            <Slider
              label="Rotation"
              value={annotation.angle}
              min={0}
              max={359}
              step={1}
              suffix="°"
              onChange={(angle) => updateAnnotation(annotation.id, { angle })}
            />
          </div>
        )}

        {annotation.kind === 'image' && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <NumberField
              label="Width"
              value={Math.round(annotation.width)}
              onChange={(width) => updateAnnotation(annotation.id, { width })}
            />
            <NumberField
              label="Height"
              value={Math.round(annotation.height)}
              onChange={(height) => updateAnnotation(annotation.id, { height })}
            />
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button
            className="btn-outline flex-1 !py-1"
            onClick={() => {
              const offset: Partial<Annotation> =
                'x' in annotation ? { x: annotation.x + 12, y: annotation.y - 12 } : {}
              useEditor.getState().addAnnotation({
                ...annotation,
                id: uid('ann'),
                ...offset,
              } as Annotation)
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </button>
          <button
            className="btn-danger !py-1"
            onClick={() => removeAnnotation(annotation.id)}
            title="Delete (Del)"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </Section>
    </>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        type="number"
        className="input !py-1 text-xs"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </label>
  )
}

/* ------------------------------------------------------------------ *
 * Page properties
 * ------------------------------------------------------------------ */

function PageProperties({ pageId }: { pageId: string }) {
  const page = useEditor((s) => s.pages.find((p) => p.id === pageId))
  const rotatePage = useEditor((s) => s.rotatePage)
  const setPageRotation = useEditor((s) => s.setPageRotation)
  const duplicatePage = useEditor((s) => s.duplicatePage)
  const deletePage = useEditor((s) => s.deletePage)
  const extractPages = useEditor((s) => s.extractPages)
  const sources = useEditor((s) => s.sources)

  if (!page) return null
  const source = sources.find((s) => s.id === page.sourceId)
  const rotation = finalRotation(page)

  return (
    <Section icon={FileText} title="Page">
      <dl className="space-y-1 text-[11px]">
        <Row label="Size" value={`${Math.round(page.width)} × ${Math.round(page.height)} pt`} />
        <Row label="Rotation" value={`${rotation}°`} />
        <Row label="Source" value={page.blank ? 'Inserted blank page' : source?.name ?? '—'} />
      </dl>

      <div className="mt-3 flex items-center gap-1">
        <button className="icon-btn" onClick={() => rotatePage(pageId, -90)} title="Rotate left">
          <RotateCcw className="h-4 w-4" />
        </button>
        <button className="icon-btn" onClick={() => rotatePage(pageId, 90)} title="Rotate right">
          <RotateCw className="h-4 w-4" />
        </button>
        <select
          className="input !w-auto !py-1 text-xs"
          value={rotation}
          onChange={(e) => setPageRotation(pageId, Number(e.target.value))}
        >
          {[0, 90, 180, 270].map((value) => (
            <option key={value} value={value}>
              {value}°
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex gap-2">
        <button className="btn-outline flex-1 !py-1" onClick={() => duplicatePage(pageId)}>
          <Copy className="h-3.5 w-3.5" />
          Duplicate
        </button>
        <button className="btn-outline flex-1 !py-1" onClick={() => void extractPages([pageId])}>
          <ArrowLeftRight className="h-3.5 w-3.5" />
          Extract
        </button>
        <button
          className="btn-danger !py-1"
          onClick={() => deletePage(pageId)}
          title="Delete page"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-500">
        <ArrowUpDown className="h-3 w-3" />
        Drag pages in the sidebar to reorder them.
      </div>
    </Section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-ink-500 dark:text-ink-400">{label}</dt>
      <dd className="truncate font-medium" title={value}>
        {value}
      </dd>
    </div>
  )
}
