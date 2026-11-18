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
}

export const TOOLS: ToolDefinition[] = [
  { id: 'select', label: 'Select', icon: MousePointer2, shortcut: 'V', group: 'navigate' },
  { id: 'hand', label: 'Pan', icon: Hand, shortcut: 'H', group: 'navigate', cursor: 'grab' },
  { id: 'text', label: 'Text box', icon: Type, shortcut: 'T', group: 'text', cursor: 'text' },
  { id: 'highlight', label: 'Highlight', icon: Highlighter, shortcut: 'H', group: 'markup', cursor: 'crosshair' },
  { id: 'underline', label: 'Underline', icon: Underline, shortcut: 'U', group: 'markup', cursor: 'crosshair' },
  { id: 'strikeout', label: 'Strike out', icon: Strikethrough, shortcut: 'S', group: 'markup', cursor: 'crosshair' },
  { id: 'pen', label: 'Draw', icon: PenTool, shortcut: 'P', group: 'draw', cursor: 'crosshair' },
  { id: 'eraser', label: 'Erase', icon: Eraser, shortcut: 'E', group: 'draw', cursor: 'cell' },
  { id: 'rect', label: 'Rectangle', icon: Square, shortcut: 'R', group: 'draw', cursor: 'crosshair' },
  { id: 'ellipse', label: 'Ellipse', icon: Circle, shortcut: 'O', group: 'draw', cursor: 'crosshair' },
  { id: 'line', label: 'Line', icon: Minus, shortcut: 'L', group: 'draw', cursor: 'crosshair' },
  { id: 'arrow', label: 'Arrow', icon: MoveUpRight, shortcut: 'A', group: 'draw', cursor: 'crosshair' },
  { id: 'image', label: 'Image', icon: ImageIcon, group: 'insert', cursor: 'copy' },
  { id: 'signature', label: 'Signature', icon: PenLine, group: 'insert', cursor: 'copy' },
  { id: 'stamp', label: 'Stamp', icon: Stamp, group: 'insert', cursor: 'copy' },
]

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.id, t]))

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
