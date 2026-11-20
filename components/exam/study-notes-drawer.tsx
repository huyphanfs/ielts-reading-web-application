'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BookmarkPlus, GripVertical, Pencil, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { StudyNote } from '@/lib/types'

export function StudyNotesDrawer({
  open,
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
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const headerRef = useRef<HTMLDivElement>(null)

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
    if (open) {
      const x = Math.min(window.innerWidth - 380, window.innerWidth - 400)
      setPosition({ x: Math.max(16, x), y: 80 })
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed z-50 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
      style={{ left: position.x, top: position.y, width: 360, maxHeight: 'calc(100vh - 100px)' }}
      role="dialog"
      aria-modal="false"
      aria-labelledby="notes-title"
    >
      <div
        ref={headerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="flex cursor-grab touch-none select-none items-center justify-between rounded-t-2xl border-b border-slate-200 px-4 py-3 active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <GripVertical className="size-4 text-slate-400" />
          <div>
            <h2 id="notes-title" className="text-sm font-bold text-slate-900">Study Notes</h2>
            <p className="text-[11px] text-slate-500">Drag to move anywhere</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close notes" className="size-7">
          <X className="size-4" />
        </Button>
      </div>
      <div className="border-b border-slate-100 p-4">
        <label htmlFor="note-quote" className="text-xs font-semibold text-slate-600">Selected excerpt</label>
        <textarea id="note-quote" value={quoteDraft} onChange={(event) => onQuoteChange(event.target.value)} rows={2} placeholder="Select text in the passage or type an excerpt..." className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-50" />
        <label htmlFor="note-text" className="mt-2.5 block text-xs font-semibold text-slate-600">Your note</label>
        <textarea id="note-text" value={noteDraft} onChange={(event) => onTextChange(event.target.value)} rows={3} placeholder="New vocabulary, key ideas, or points to review..." className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-50" />
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button onClick={onSave} disabled={!noteDraft.trim() && !quoteDraft.trim()} className="h-8 rounded-lg bg-sky-600 text-xs text-white hover:bg-sky-700"><BookmarkPlus className="mr-1.5 size-3.5" />{editingNoteId ? 'Update' : 'Save Note'}</Button>
          {editingNoteId && <Button variant="outline" onClick={onCreate} className="h-8 rounded-lg text-xs"><Plus className="mr-1 size-3.5" />New</Button>}
        </div>
      </div>
      <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
        <div className="flex items-center justify-between"><h3 className="text-xs font-bold text-slate-800">Saved in this session</h3><span className="text-[11px] text-slate-500">{notes.length} {notes.length === 1 ? 'note' : 'notes'}</span></div>
        {notes.length ? notes.map((note) => <article key={note.id} className="rounded-xl border border-slate-200 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {note.quote && <blockquote className="border-l-2 border-sky-300 pl-2.5 text-xs italic text-slate-600">{note.quote}</blockquote>}
              {note.text && <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-slate-800">{note.text}</p>}
              {note.passage_part && <p className="mt-1.5 text-[10px] font-medium text-slate-400">Passage {note.passage_part}{note.pane === 'questions' ? ' · Questions' : note.pane === 'passage' ? ' · Reading' : ''}</p>}
            </div>
            {note.color && <span className="size-2.5 shrink-0 rounded-full border border-slate-200" style={{ backgroundColor: note.color }} aria-label="Highlight color" />}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={() => onEdit(note)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:text-sky-800"><Pencil className="size-2.5" />Edit</button>
            <button type="button" onClick={() => onDelete(note.id)} className="text-[11px] font-medium text-rose-600 hover:text-rose-700">Delete</button>
          </div>
        </article>) : <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">No notes yet. Highlight text in the passage or questions to get started.</div>}
      </div>
      <div className="border-t border-slate-100 px-4 py-2.5 text-[10px] leading-4 text-slate-500">Notes are attached to your test results when you submit.</div>
    </div>
  )
}
