import {
  MousePointer2,
  Hand,
  Type,
  Highlighter,
  Underline,
  Strikethrough,
  PenTool,
  Eraser,
  Square,
  Circle,
  Minus,
  MoveUpRight,
  Image as ImageIcon,
  PenLine,
  Stamp,
  type LucideIcon,
} from 'lucide-react'
import type { ToolId } from '../types'

export interface ToolDefinition {
  id: ToolId
  label: string
  icon: LucideIcon
  shortcut?: string
  group: 'navigate' | 'text' | 'markup' | 'draw' | 'insert'
  /** Cursor to show while the tool is active. */
  cursor?: string
  /** One-line instruction shown in the tooltip and the active-tool hint bar. */
  hint: string
}

/**
 * Shortcuts must stay unique: the global key handler resolves them with a
 * `find()` over this list, so a duplicate silently makes the later tool
 * unreachable.
 */
export const TOOLS: ToolDefinition[] = [
  { id: 'select', label: 'Select', icon: MousePointer2, shortcut: 'V', group: 'navigate', hint: 'Click an annotation to select it, then drag to move it or use the handles to resize.' },
  { id: 'hand', label: 'Pan', icon: Hand, shortcut: 'H', group: 'navigate', cursor: 'grab', hint: 'Drag the page to scroll around.' },
  { id: 'text', label: 'Text box', icon: Type, shortcut: 'T', group: 'text', cursor: 'text', hint: 'Click where the text should start, type, then click away to finish.' },
  { id: 'highlight', label: 'Highlight', icon: Highlighter, shortcut: 'M', group: 'markup', cursor: 'crosshair', hint: 'Drag across the words you want to highlight.' },
  { id: 'underline', label: 'Underline', icon: Underline, shortcut: 'U', group: 'markup', cursor: 'crosshair', hint: 'Drag across the words you want to underline.' },
  { id: 'strikeout', label: 'Strike out', icon: Strikethrough, shortcut: 'S', group: 'markup', cursor: 'crosshair', hint: 'Drag across the words you want to strike out.' },
  { id: 'pen', label: 'Draw', icon: PenTool, shortcut: 'P', group: 'draw', cursor: 'crosshair', hint: 'Drag to draw freehand.' },
  { id: 'eraser', label: 'Erase', icon: Eraser, shortcut: 'E', group: 'draw', cursor: 'cell', hint: 'Click or drag over annotations to delete them.' },
  { id: 'rect', label: 'Rectangle', icon: Square, shortcut: 'R', group: 'draw', cursor: 'crosshair', hint: 'Drag to draw a rectangle.' },
  { id: 'ellipse', label: 'Ellipse', icon: Circle, shortcut: 'O', group: 'draw', cursor: 'crosshair', hint: 'Drag to draw an ellipse.' },
  { id: 'line', label: 'Line', icon: Minus, shortcut: 'L', group: 'draw', cursor: 'crosshair', hint: 'Drag to draw a line.' },
  { id: 'arrow', label: 'Arrow', icon: MoveUpRight, shortcut: 'A', group: 'draw', cursor: 'crosshair', hint: 'Drag to draw an arrow.' },
  { id: 'image', label: 'Image', icon: ImageIcon, shortcut: 'I', group: 'insert', cursor: 'copy', hint: 'Choose an image in the bar above, then click the page to place it.' },
  { id: 'signature', label: 'Signature', icon: PenLine, shortcut: 'G', group: 'insert', cursor: 'copy', hint: 'Draw or type a signature, then click the page to place it.' },
  { id: 'stamp', label: 'Stamp', icon: Stamp, shortcut: 'B', group: 'insert', cursor: 'copy', hint: 'Pick a stamp in the bar above, then click the page to place it.' },
]

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.id, t]))

export function toolDefinition(id: ToolId): ToolDefinition | undefined {
  return TOOL_MAP.get(id)
}

export const STAMP_PRESETS = [
  { label: 'APPROVED', color: '#16a34a' },
  { label: 'DRAFT', color: '#64748b' },
  { label: 'CONFIDENTIAL', color: '#dc2626' },
  { label: 'PAID', color: '#2563eb' },
  { label: 'REJECTED', color: '#dc2626' },
  { label: 'FINAL', color: '#7c3aed' },
  { label: 'SAMPLE', color: '#0891b2' },
  { label: 'COPY', color: '#ea580c' },
]

export const COLOR_PRESETS = [
  '#e11d48',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#111827',
  '#ffffff',
]
