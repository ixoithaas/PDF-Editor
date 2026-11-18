import { useState } from 'react'
import { useEditor } from '../lib/store'
import { TOOLS } from '../lib/tools'
import { cn } from '../lib/utils'
import type { ToolId } from '../types'

interface HoverState {
  id: ToolId
  /** Viewport coordinates of the vertical centre of the hovered button. */
  top: number
  /** Viewport coordinate just to the right of the rail. */
  left: number
}

export default function ToolRail() {
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const [hovered, setHovered] = useState<HoverState | null>(null)

  /**
   * The tooltip is rendered with `position: fixed` in viewport coordinates
   * rather than `absolute` inside the rail.  The rail scrolls vertically, and
   * an element with `overflow-y: auto` also clips horizontally — an
   * absolutely positioned tooltip would be cut off by the 3.5rem rail.
   */
  const show = (id: ToolId) => (event: React.SyntheticEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setHovered({ id, top: rect.top + rect.height / 2, left: rect.right + 10 })
  }
  const hide = () => setHovered(null)

  const groups = ['navigate', 'text', 'markup', 'draw', 'insert'] as const
  const hoveredTool = hovered ? TOOLS.find((t) => t.id === hovered.id) : null

  return (
    <>
      <aside className="z-20 flex w-14 shrink-0 flex-col border-r border-ink-200 bg-white dark:border-white/10 dark:bg-ink-900">
        <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-2 scroll-thin">
          {groups.map((group, gi) => (
            <div key={group} className="flex w-full flex-col items-center gap-1">
              {gi > 0 && <div className="my-1 h-px w-7 bg-ink-200 dark:bg-white/10" />}
              {TOOLS.filter((t) => t.group === group).map((definition) => {
                const Icon = definition.icon
                const active = tool === definition.id
                return (
                  <button
                    key={definition.id}
                    onClick={() => setTool(definition.id)}
                    onMouseEnter={show(definition.id)}
                    onMouseLeave={hide}
                    onFocus={show(definition.id)}
                    onBlur={hide}
                    aria-label={definition.label}
                    aria-pressed={active}
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all',
                      active
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                        : 'text-ink-600 hover:bg-ink-200/80 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-white/10 dark:hover:text-white',
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </aside>

      {hoveredTool && hovered && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[70] w-56 -translate-y-1/2 animate-scale-in rounded-lg bg-ink-900 px-2.5 py-2 text-white shadow-xl dark:bg-white dark:text-ink-900"
          style={{ left: hovered.left, top: hovered.top }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">{hoveredTool.label}</span>
            {hoveredTool.shortcut && (
              <kbd className="ml-auto rounded border border-white/25 px-1 py-px font-sans text-[10px] font-medium opacity-80 dark:border-black/20">
                {hoveredTool.shortcut}
              </kbd>
            )}
          </div>
          <p className="mt-1 text-[11px] font-normal leading-snug opacity-75">
            {hoveredTool.hint}
          </p>
        </div>
      )}
    </>
  )
}
