'use client'

import { BookmarkPlus, Pencil, Plus, X } from 'lucide-react'
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
  if (!open) return null

  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/35" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside role="dialog" aria-modal="true" aria-labelledby="notes-title" className="flex h-full w-full max-w-[440px] flex-col bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div><h2 id="notes-title" className="font-bold text-slate-900">Study Notes</h2><p className="mt-0.5 text-xs text-slate-500">Capture ideas and vocabulary while reading</p></div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close notes"><X className="size-4" /></Button>
      </div>
      <div className="border-b border-slate-100 p-5">
        <label htmlFor="note-quote" className="text-xs font-semibold text-slate-600">Selected excerpt</label>
        <textarea id="note-quote" value={quoteDraft} onChange={(event) => onQuoteChange(event.target.value)} rows={2} placeholder="Select text in the passage or type an excerpt..." className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-50" />
        <label htmlFor="note-text" className="mt-3 block text-xs font-semibold text-slate-600">Your note</label>
        <textarea id="note-text" value={noteDraft} onChange={(event) => onTextChange(event.target.value)} rows={3} placeholder="New vocabulary, key ideas, or points to review..." className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-50" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={onSave} disabled={!noteDraft.trim() && !quoteDraft.trim()} className="h-9 rounded-lg bg-sky-600 text-white hover:bg-sky-700"><BookmarkPlus className="mr-2 size-4" />{editingNoteId ? 'Update Note' : 'Save Note'}</Button>
          {editingNoteId && <Button variant="outline" onClick={onCreate} className="h-9 rounded-lg"><Plus className="mr-1.5 size-4" />New Note</Button>}
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-800">Saved in this session</h3><span className="text-xs text-slate-500">{notes.length} {notes.length === 1 ? 'note' : 'notes'}</span></div>
        {notes.length ? notes.map((note) => <article key={note.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {note.quote && <blockquote className="border-l-2 border-sky-300 pl-3 text-sm italic text-slate-600">{note.quote}</blockquote>}
              {note.text && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{note.text}</p>}
              {note.passage_part && <p className="mt-2 text-[11px] font-medium text-slate-400">Passage {note.passage_part}{note.pane === 'questions' ? ' · Questions' : note.pane === 'passage' ? ' · Reading' : ''}</p>}
            </div>
            {note.color && <span className="size-3 shrink-0 rounded-full border border-slate-200" style={{ backgroundColor: note.color }} aria-label="Highlight color" />}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={() => onEdit(note)} className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800"><Pencil className="size-3" />Edit</button>
            <button type="button" onClick={() => onDelete(note.id)} className="text-xs font-medium text-rose-600 hover:text-rose-700">Delete</button>
          </div>
        </article>) : <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">No notes yet. Highlight text in the passage or questions to get started.</div>}
      </div>
      <div className="border-t border-slate-100 px-5 py-3 text-xs leading-5 text-slate-500">Notes are attached to your test results when you submit.</div>
    </aside>
  </div>
}
