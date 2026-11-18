import { useEditor } from '../lib/store'
import { TOOLS } from '../lib/tools'
import { cn } from '../lib/utils'

export default function ToolRail() {
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)

  const groups = ['navigate', 'text', 'markup', 'draw', 'insert'] as const

  return (
    <aside className="z-20 flex w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-ink-200 bg-white py-2 scroll-thin dark:border-white/10 dark:bg-ink-900">
      {groups.map((group, gi) => (
        <div key={group} className="flex w-full flex-col items-center gap-1">
          {gi > 0 && <div className="my-1 h-px w-7 bg-ink-200 dark:bg-white/10" />}
          {TOOLS.filter((t) => t.group === group).map((definition) => {
            const Icon = definition.icon
            const active = tool === definition.id
            return (
              <div key={definition.id} className="group relative">
                <button
                  onClick={() => setTool(definition.id)}
                  aria-label={definition.label}
                  aria-pressed={active}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl transition-all',
                    active
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                      : 'text-ink-600 hover:bg-ink-200/80 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-white/10 dark:hover:text-white',
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </button>
                <span className="tooltip left-full top-1/2 z-50 ml-2 -translate-y-1/2">
                  {definition.label}
                  {definition.shortcut && (
                    <span className="ml-1.5 opacity-60">{definition.shortcut}</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      ))}
      <div className="mt-auto" />
    </aside>
  )
}
