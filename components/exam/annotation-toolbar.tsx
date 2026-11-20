'use client'

import { Eraser, Pen, Trash2, Type, X } from 'lucide-react'

export const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#FEF08A' },
  { name: 'Blue', value: '#BAE6FD' },
  { name: 'Green', value: '#BBF7D0' },
  { name: 'Pink', value: '#FBCFE8' },
  { name: 'Gray', value: '#E2E8F0' },
] as const

export const DRAW_COLORS = [
  { name: 'Red', value: '#DC2626' },
  { name: 'Dark Blue', value: '#1D4ED8' },
  { name: 'Dark Green', value: '#15803D' },
  { name: 'Orange', value: '#EA580C' },
] as const

export type ToolMode = 'select' | 'draw' | 'text' | 'eraser'

export function AnnotationToolbar({
  position,
  selectedColor,
  hasSelection,
  hasHighlight,
  toolMode,
  drawColor,
  hasAnyAnnotations,
  onHighlight,
  onClearHighlight,
  onToolChange,
  onDrawColorChange,
  onEraseAll,
  onClose,
}: {
  position: { top: number; left: number }
  selectedColor: string
  hasSelection: boolean
  hasHighlight: boolean
  toolMode: ToolMode
  drawColor: string
  hasAnyAnnotations: boolean
  onHighlight: (color: string) => void
  onClearHighlight: () => void
  onToolChange: (mode: ToolMode) => void
  onDrawColorChange: (color: string) => void
  onEraseAll: () => void
  onClose: () => void
}) {
  return (
    <div
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-2.5 py-1.5 shadow-lg backdrop-blur-xs"
      style={{ top: position.top, left: position.left }}
      role="toolbar"
      aria-label="Highlight and annotation tools"
    >
      {/* 5 màu Highlight */}
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color.value}
          type="button"
          onClick={() => onHighlight(color.value)}
          disabled={!hasSelection}
          aria-label={`Highlight ${color.name}`}
          title={hasSelection ? `Highlight ${color.name}` : 'Bôi đen chữ để Highlight'}
          aria-pressed={selectedColor === color.value}
          className={`size-5 shrink-0 rounded-full border border-slate-300 transition ${
            hasSelection ? 'cursor-pointer hover:scale-110' : 'cursor-default opacity-60'
          } ${selectedColor === color.value && hasSelection ? 'ring-2 ring-sky-600 ring-offset-1' : ''}`}
          style={{ backgroundColor: color.value }}
        />
      ))}

      {hasSelection && hasHighlight && (
        <button
          type="button"
          onClick={onClearHighlight}
          aria-label="Remove selected highlight"
          title="Xóa highlight đang chọn"
          className="ml-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-rose-600"
        >
          <X className="size-3.5" />
        </button>
      )}

      <span className="mx-1 h-4 w-px shrink-0 bg-slate-200" aria-hidden="true" />

      {/* Icon Draw (Pen) */}
      <button
        type="button"
        onClick={() => onToolChange('draw')}
        aria-label="Draw"
        title="Draw (Vẽ tự do)"
        aria-pressed={toolMode === 'draw'}
        className={`flex size-7 shrink-0 items-center justify-center rounded-full transition ${
          toolMode === 'draw'
            ? 'bg-sky-600 text-white shadow-xs'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
      >
        <Pen className="size-3.5" />
      </button>

      {/* Bảng màu bút khi đang bật Draw */}
      {toolMode === 'draw' && (
        <div className="flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5">
          {DRAW_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              aria-label={`Pen ${color.name}`}
              title={color.name}
              onClick={() => onDrawColorChange(color.value)}
              className={`size-3.5 rounded-full border border-white transition hover:scale-110 ${
                drawColor === color.value ? 'ring-2 ring-sky-600 ring-offset-1' : ''
              }`}
              style={{ backgroundColor: color.value }}
            />
          ))}
        </div>
      )}

      {/* Icon Add Text */}
      <button
        type="button"
        onClick={() => onToolChange('text')}
        aria-label="Add Text"
        title="Add Text (Chèn chữ)"
        aria-pressed={toolMode === 'text'}
        className={`flex size-7 shrink-0 items-center justify-center rounded-full transition ${
          toolMode === 'text'
            ? 'bg-sky-600 text-white shadow-xs'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
      >
        <Type className="size-3.5" />
      </button>

      {/* Icon Erase (vòng tròn bán kính 0.75 cm) */}
      <button
        type="button"
        onClick={() => onToolChange('eraser')}
        aria-label="Erase"
        title="Erase (Cục tẩy tròn bán kính 0.75 cm)"
        aria-pressed={toolMode === 'eraser'}
        className={`flex size-7 shrink-0 items-center justify-center rounded-full transition ${
          toolMode === 'eraser'
            ? 'bg-rose-600 text-white shadow-xs'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
      >
        <Eraser className="size-3.5" />
      </button>

      {/* Nút xóa tất cả khi đang dùng cục tẩy */}
      {toolMode === 'eraser' && hasAnyAnnotations && (
        <button
          type="button"
          onClick={onEraseAll}
          aria-label="Xóa tất cả"
          title="Xóa tất cả highlight, chữ viết và nét vẽ"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 transition hover:bg-rose-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}

      {/* Nút thoát chế độ Draw / Add Text / Erase */}
      {toolMode !== 'select' && (
        <>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200" aria-hidden="true" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Thoát công cụ"
            title="Hoàn tất (Esc)"
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="size-3.5" />
          </button>
        </>
      )}
    </div>
  )
}
