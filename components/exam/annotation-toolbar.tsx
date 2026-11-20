'use client'

import { Eraser, Highlighter, StickyNote, Pencil, Trash2 } from 'lucide-react'

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
  hasAnyAnnotations,
  toolMode,
  drawColor,
  onHighlight,
  onClear,
  onEraseAll,
  onNote,
  onToolChange,
  onDrawColorChange,
}: {
  position: { top: number; left: number }
  selectedColor: string
  hasHighlight: boolean
  hasAnyAnnotations: boolean
  toolMode: ToolMode
  drawColor: string
  onHighlight: (color: string) => void
  onClear: () => void
  onEraseAll: () => void
  onNote: () => void
  onToolChange: (mode: ToolMode) => void
  onDrawColorChange: (color: string) => void
}) {
  return (
    <div
      className="fixed z-40 flex max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
      style={{ top: position.top, left: position.left }}
      role="toolbar"
      aria-label="Highlight, draw, and note tools"
    >
      {/* Tool mode toggles */}
      <button
        type="button"
        onClick={() => onToolChange('select')}
        aria-pressed={toolMode === 'select'}
        title="Select / Highlight mode"
        className={`flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition ${
          toolMode === 'select' ? 'bg-sky-100 text-sky-700' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        <Highlighter className="size-3.5" /> Highlight
      </button>

      <button
        type="button"
        onClick={() => onToolChange('draw')}
        aria-pressed={toolMode === 'draw'}
        title="Freehand draw"
        className={`flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition ${
          toolMode === 'draw' ? 'bg-sky-100 text-sky-700' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        <Pencil className="size-3.5" /> Draw
      </button>

      <button
        type="button"
        onClick={() => onToolChange('eraser')}
        aria-pressed={toolMode === 'eraser'}
        title="Tẩy tròn 1cm (bấm tới đâu xóa tới đó) hoặc kéo hình chữ nhật để xóa"
        className={`flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition ${
          toolMode === 'eraser' ? 'bg-rose-100 text-rose-700' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        <Eraser className="size-3.5" /> Eraser
      </button>

      <span className="mx-1 h-6 w-px shrink-0 bg-slate-200" aria-hidden="true" />

      {/* Highlight color swatches (shown in select mode) */}
      {toolMode === 'select' &&
        HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            onClick={() => onHighlight(color.value)}
            aria-label={`Highlight ${color.name}`}
            title={`Highlight ${color.name}`}
            aria-pressed={selectedColor === color.value}
            className={`size-6 shrink-0 rounded-full border border-slate-300 transition hover:scale-110 ${
              selectedColor === color.value ? 'ring-2 ring-sky-600 ring-offset-2' : ''
            }`}
            style={{ backgroundColor: color.value }}
          />
        ))}

      {/* Draw color swatches (shown in draw mode: Red, Dark Green, Orange) */}
      {toolMode === 'draw' &&
        DRAW_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            onClick={() => onDrawColorChange(color.value)}
            aria-label={`Draw with ${color.name}`}
            title={`Draw ${color.name}`}
            aria-pressed={drawColor === color.value}
            className={`size-6 shrink-0 rounded-full border border-slate-300 transition hover:scale-110 ${
              drawColor === color.value ? 'ring-2 ring-sky-600 ring-offset-2' : ''
            }`}
            style={{ backgroundColor: color.value }}
          />
        ))}

      {/* Eraser actions (shown in eraser mode) */}
      {toolMode === 'eraser' && (
        <>
          <span className="px-1.5 text-[11px] font-medium text-rose-600">
            Bấm xóa 1cm / Kéo khung để xóa
          </span>
          <button
            type="button"
            onClick={onEraseAll}
            disabled={!hasAnyAnnotations}
            title="Erase all highlights, drawings, and notes"
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="size-3.5" /> Erase All
          </button>
        </>
      )}

      {/* Note mode helper */}
      {toolMode === 'note' && (
        <span className="px-1.5 text-[11px] font-medium text-sky-700">
          Kéo thả chuột để vẽ khung Note
        </span>
      )}

      {/* Clear highlight button (shown in select mode) */}
      {toolMode === 'select' && (
        <>
          <span className="mx-1 h-6 w-px shrink-0 bg-slate-200" aria-hidden="true" />
          <button
            type="button"
            onClick={onClear}
            disabled={!hasHighlight}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Remove selected highlight"
            title="Clear highlight"
          >
            <Eraser className="size-3.5" /> Clear
          </button>
        </>
      )}

      {/* Note button (always accessible in select or note mode) */}
      {(toolMode === 'select' || toolMode === 'note') && (
        <>
          <span className="mx-1 h-6 w-px shrink-0 bg-slate-200" aria-hidden="true" />
          <button
            type="button"
            onClick={onNote}
            aria-pressed={toolMode === 'note'}
            aria-label="Draw note textbox or add note"
            title="Vẽ khung Textbox Note lên bài đọc/câu hỏi"
            className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition ${
              toolMode === 'note'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
            }`}
          >
            <StickyNote className="size-3.5" /> Note
          </button>
        </>
      )}
    </div>
  )
}
