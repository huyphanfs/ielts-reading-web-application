'use client'

import { Eraser, StickyNote } from 'lucide-react'

export const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#FEF08A' },
  { name: 'Blue', value: '#BAE6FD' },
  { name: 'Green', value: '#BBF7D0' },
  { name: 'Pink', value: '#FBCFE8' },
  { name: 'Gray', value: '#E2E8F0' },
] as const

export const DRAW_COLORS = [
  { name: 'Red', value: '#DC2626' },
  { name: 'Dark Green', value: '#15803D' },
  { name: 'Orange', value: '#EA580C' },
] as const

export type ToolMode = 'select' | 'draw' | 'eraser' | 'note'

export function AnnotationToolbar({
  position,
  selectedColor,
  hasHighlight,
  onHighlight,
  onClear,
  onNote,
}: {
  position: { top: number; left: number }
  selectedColor: string
  hasHighlight: boolean
  onHighlight: (color: string) => void
  onClear: () => void
  onNote: () => void
}) {
  return (
    <div
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-2 py-1 shadow-lg backdrop-blur-xs"
      style={{ top: position.top, left: position.left }}
      role="toolbar"
      aria-label="Highlight and note tools"
    >
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color.value}
          type="button"
          onClick={() => onHighlight(color.value)}
          aria-label={`Highlight ${color.name}`}
          title={`Highlight ${color.name}`}
          aria-pressed={selectedColor === color.value}
          className={`size-5 shrink-0 rounded-full border border-slate-300 transition hover:scale-110 ${
            selectedColor === color.value ? 'ring-2 ring-sky-600 ring-offset-1' : ''
          }`}
          style={{ backgroundColor: color.value }}
        />
      ))}

      {hasHighlight && (
        <>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200" aria-hidden="true" />
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Remove selected highlight"
            title="Clear highlight"
          >
            <Eraser className="size-3" /> Clear
          </button>
        </>
      )}

      <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200" aria-hidden="true" />
      <button
        type="button"
        onClick={onNote}
        aria-label="Add note for selected text"
        title="Add note"
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-sky-50 px-2 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100"
      >
        <StickyNote className="size-3" /> Note
      </button>
    </div>
  )
}
