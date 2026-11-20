'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BookmarkPlus, Eraser, GripVertical, Pencil, Plus, Type, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DRAW_COLORS } from '@/components/exam/annotation-toolbar'
import type { StudyNote } from '@/lib/types'

export type NoteAnchorPosition = { top: number; left: number } | null

export function StudyNotesDrawer({
  open,
  anchorPosition,
  notes,
  quoteDraft,
  noteDraft,
  editingNoteId,
  onClose,
  onQuoteChange,
  onTextChange,
  onSave,
  onCreate,
  onEdit,
  onDelete,
}: {
  open: boolean
  anchorPosition: NoteAnchorPosition
  notes: StudyNote[]
  quoteDraft: string
  noteDraft: string
  editingNoteId: string | null
  onClose: () => void
  onQuoteChange: (value: string) => void
  onTextChange: (value: string) => void
  onSave: () => void
  onCreate: () => void
  onEdit: (note: StudyNote) => void
  onDelete: (noteId: string) => void
}) {
  const [position, setPosition] = useState({ x: 60, y: 80 })
  const [noteInputMode, setNoteInputMode] = useState<'text' | 'draw'>('text')
  const [sketchColor, setSketchColor] = useState<string>(DRAW_COLORS[0].value)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: position.x, origY: position.y }
    headerRef.current?.setPointerCapture(e.pointerId)
  }, [position.x, position.y])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const newX = Math.max(8, Math.min(window.innerWidth - 380, dragRef.current.origX + dx))
    const newY = Math.max(8, Math.min(window.innerHeight - 100, dragRef.current.origY + dy))
    setPosition({ x: newX, y: newY })
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null
    headerRef.current?.releasePointerCapture(e.pointerId)
  }, [])

  useEffect(() => {
    if (!open) return
    const panelWidth = 360
    const estimatedHeight = 380
    if (anchorPosition) {
      const centeredX = anchorPosition.left - panelWidth / 2
      const x = Math.max(12, Math.min(window.innerWidth - panelWidth - 12, centeredX))
      // Đặt ngay phía trên (above) đoạn text được chọn; nếu sát mép trên quá thì đặt ngay bên dưới
      const aboveY = anchorPosition.top - estimatedHeight - 12
      const y = aboveY >= 12
        ? aboveY
        : Math.min(window.innerHeight - estimatedHeight - 12, Math.max(12, anchorPosition.top + 32))
      setPosition({ x, y })
    } else {
      const x = Math.min(window.innerWidth - panelWidth - 16, window.innerWidth - 400)
      setPosition({ x: Math.max(16, x), y: 80 })
    }
  }, [open, anchorPosition])

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const startSketch = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    e.currentTarget.setPointerCapture(e.pointerId)
    isDrawingRef.current = true
    const { x, y } = getCanvasCoords(e)
    ctx.strokeStyle = sketchColor
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const moveSketch = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getCanvasCoords(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const endSketch = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = false
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  const clearSketch = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  if (!open) return null

  return (
    <div
      className="fixed z-50 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
      style={{ left: position.x, top: position.y, width: 360, maxHeight: 'calc(100vh - 24px)' }}
      role="dialog"
      aria-modal="false"
      aria-labelledby="notes-title"
    >
      <div
        ref={headerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="flex cursor-grab touch-none select-none items-center justify-between rounded-t-2xl border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <GripVertical className="size-4 text-slate-400" />
          <div>
            <h2 id="notes-title" className="text-sm font-bold text-slate-900">Study Notes</h2>
            <p className="text-[11px] text-slate-500">Kéo thả để di chuyển vị trí</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close notes" className="size-7">
          <X className="size-4" />
        </Button>
      </div>

      <div className="border-b border-slate-100 p-3.5">
        <label htmlFor="note-quote" className="text-xs font-semibold text-slate-600">Selected excerpt (above)</label>
        <textarea id="note-quote" value={quoteDraft} onChange={(event) => onQuoteChange(event.target.value)} rows={2} placeholder="Select text in the passage or type an excerpt..." className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-50" />

        <div className="mt-2.5 flex items-center justify-between">
          <label htmlFor="note-text" className="text-xs font-semibold text-slate-600">Your note</label>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setNoteInputMode('text')}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${noteInputMode === 'text' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'}`}
            >
              <Type className="size-3" /> Text
            </button>
            <button
              type="button"
              onClick={() => setNoteInputMode('draw')}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${noteInputMode === 'draw' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'}`}
            >
              <Pencil className="size-3" /> Draw
            </button>
          </div>
        </div>

        {noteInputMode === 'text' ? (
          <textarea id="note-text" value={noteDraft} onChange={(event) => onTextChange(event.target.value)} rows={3} placeholder="New vocabulary, key ideas, or points to review..." className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-50" />
        ) : (
          <div className="mt-1.5 space-y-1.5">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
              <div className="flex items-center gap-1.5">
                {DRAW_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    aria-label={`Sketch ${color.name}`}
                    onClick={() => setSketchColor(color.value)}
                    className={`size-4 rounded-full border border-slate-300 ${sketchColor === color.value ? 'ring-2 ring-sky-600 ring-offset-1' : ''}`}
                    style={{ backgroundColor: color.value }}
                  />
                ))}
              </div>
              <button type="button" onClick={clearSketch} className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-rose-600">
                <Eraser className="size-3" /> Clear pad
              </button>
            </div>
            <canvas
              ref={canvasRef}
              width={328}
              height={96}
              onPointerDown={startSketch}
              onPointerMove={moveSketch}
              onPointerUp={endSketch}
              onPointerCancel={endSketch}
              className="h-24 w-full cursor-crosshair touch-none rounded-lg border border-slate-200 bg-amber-50/30"
            />
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button onClick={onSave} disabled={!noteDraft.trim() && !quoteDraft.trim()} className="h-8 rounded-lg bg-sky-600 text-xs text-white hover:bg-sky-700"><BookmarkPlus className="mr-1.5 size-3.5" />{editingNoteId ? 'Update' : 'Save Note'}</Button>
          {editingNoteId && <Button variant="outline" onClick={onCreate} className="h-8 rounded-lg text-xs"><Plus className="mr-1 size-3.5" />New</Button>}
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3.5">
        <div className="flex items-center justify-between"><h3 className="text-xs font-bold text-slate-800">Saved in this session</h3><span className="text-[11px] text-slate-500">{notes.length} {notes.length === 1 ? 'note' : 'notes'}</span></div>
        {notes.length ? notes.map((note) => <article key={note.id} className="rounded-xl border border-slate-200 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {note.quote && <blockquote className="border-l-2 border-sky-300 pl-2.5 text-xs italic text-slate-600">{note.quote}</blockquote>}
              {note.text && <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-slate-800">{note.text}</p>}
              {note.passage_part && <p className="mt-1 text-[10px] font-medium text-slate-400">Passage {note.passage_part}{note.pane === 'questions' ? ' · Questions' : note.pane === 'passage' ? ' · Reading' : ''}</p>}
            </div>
            {note.color && <span className="size-2.5 shrink-0 rounded-full border border-slate-200" style={{ backgroundColor: note.color }} aria-label="Highlight color" />}
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <button type="button" onClick={() => onEdit(note)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:text-sky-800"><Pencil className="size-2.5" />Edit</button>
            <button type="button" onClick={() => onDelete(note.id)} className="text-[11px] font-medium text-rose-600 hover:text-rose-700">Delete</button>
          </div>
        </article>) : <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-500">No notes yet. Highlight text in the passage or questions to get started.</div>}
      </div>
    </div>
  )
}
