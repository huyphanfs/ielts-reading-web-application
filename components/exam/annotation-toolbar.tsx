'use client'

import { Eraser, StickyNote } from 'lucide-react'

export const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#FEF08A' },
  { name: 'Blue', value: '#BAE6FD' },
  { name: 'Green', value: '#BBF7D0' },
  { name: 'Pink', value: '#FBCFE8' },
  { name: 'Gray', value: '#E2E8F0' },
] as const

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
  return <div
    className="fixed z-40 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
    style={{ top: position.top, left: position.left }}
    role="toolbar"
    aria-label="Highlight and note tools"
  >
    {HIGHLIGHT_COLORS.map((color) => <button
      key={color.value}
      type="button"
      onClick={() => onHighlight(color.value)}
      aria-label={`Highlight ${color.name}`}
      title={`Highlight ${color.name}`}
      aria-pressed={selectedColor === color.value}
      className={`size-6 shrink-0 rounded-full border border-slate-300 transition hover:scale-110 ${selectedColor === color.value ? 'ring-2 ring-sky-600 ring-offset-2' : ''}`}
      style={{ backgroundColor: color.value }}
    />)}
    <span className="mx-1 h-6 w-px shrink-0 bg-slate-200" aria-hidden="true" />
    <button
      type="button"
      onClick={onClear}
      disabled={!hasHighlight}
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
      aria-label="Remove selected highlight"
      title="Clear highlight"
    ><Eraser className="size-3.5" /> Clear</button>
    <button
      type="button"
      onClick={onNote}
      aria-label="Add note for selected text"
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-sky-50 px-2.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
    ><StickyNote className="size-3.5" /> Note</button>
  </div>
}
