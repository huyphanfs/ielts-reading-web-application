'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Clock3, Pause, Play, Send, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppHeader } from '@/components/app-header'
import { AnnotationToolbar, HIGHLIGHT_COLORS } from '@/components/exam/annotation-toolbar'
import { QuestionGroupCard } from '@/components/exam/question-group'
import { StudyNotesDrawer } from '@/components/exam/study-notes-drawer'
import { useAuth } from '@/components/auth-provider'
import { applyHighlight as applyAnnotation, getHighlightIdsInRange, getTextOffsets, removeHighlight } from '@/lib/text-annotations'
import { sanitizeHtml } from '@/lib/sanitize'
import type { HighlightRange } from '@/lib/text-annotations'
import type { ExamDefinition, StudyNote, UserAnswer } from '@/lib/types'

type PauseReason = 'auto' | 'manual' | null
type Annotation = HighlightRange & { pane: 'passage' | 'questions'; passageId: string; quote: string }
type TextSelection = {
  text: string
  top: number
  left: number
  pane: 'passage' | 'questions'
  passageId: string
  startOffset: number
  endOffset: number
  highlightIds: string[]
}
type NoteContext = { annotationId: string | null; passagePart: 1 | 2 | 3; pane: 'passage' | 'questions'; color: string }

function clock(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function isAnswered(answer: UserAnswer | undefined) {
  return Array.isArray(answer) ? answer.length > 0 : Boolean(answer?.trim())
}

export function ExamShell({
  exam,
  onExit,
  onSubmit,
}: {
  exam: ExamDefinition
  onExit: () => void
  onSubmit: (answers: Record<string, UserAnswer>, elapsed: number, notes: StudyNote[]) => Promise<void>
}) {
  const { profile } = useAuth()
  const [passageIndex, setPassageIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, UserAnswer>>({})
  const [secondsLeft, setSecondsLeft] = useState(3600)
  const [elapsed, setElapsed] = useState(0)
  const [pauseReason, setPauseReason] = useState<PauseReason>(null)
  const [split, setSplit] = useState(50)
  const [submitting, setSubmitting] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notes, setNotes] = useState<StudyNote[]>([])
  const [noteDraft, setNoteDraft] = useState('')
  const [quoteDraft, setQuoteDraft] = useState('')
  const [selectedColor, setSelectedColor] = useState<string>(HIGHLIGHT_COLORS[0].value)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [linkedNoteContext, setLinkedNoteContext] = useState<NoteContext | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [selection, setSelection] = useState<TextSelection | null>(null)
  const passageRef = useRef<HTMLDivElement>(null)
  const questionRef = useRef<HTMLDivElement>(null)
  const splitterRef = useRef<HTMLDivElement>(null)
  const pauseRef = useRef<PauseReason>(null)
  const submittedRef = useRef(false)

  const currentPassage = exam.passages[passageIndex]
  const isPaused = pauseReason !== null
  const currentQuestions = useMemo(
    () => exam.questions.filter((question) => question.passage_part === currentPassage.passage_part),
    [exam.questions, currentPassage.passage_part],
  )
  const currentGroups = useMemo(
    () => exam.groups.filter((group) => group.passage_id === currentPassage.id),
    [exam.groups, currentPassage.id],
  )
  const currentPassageHtml = sanitizeHtml(currentPassage.content)
  const rootForPane = useCallback((pane: TextSelection['pane']) => pane === 'passage' ? passageRef.current : questionRef.current, [])

  const updateAnswer = useCallback((questionId: string, answer: UserAnswer) => {
    setAnswers((current) => ({ ...current, [questionId]: answer }))
  }, [])

  const submit = useCallback(async () => {
    if (submittedRef.current || submitting) return
    submittedRef.current = true
    setSubmitting(true)
    await onSubmit(answers, elapsed, notes)
  }, [answers, elapsed, notes, onSubmit, submitting])

  useEffect(() => {
    pauseRef.current = pauseReason
  }, [pauseReason])

  useEffect(() => {
    if (isPaused || submittedRef.current) return
    const interval = window.setInterval(() => {
      setElapsed((value) => value + 1)
      if (exam.isTimed) setSecondsLeft((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(interval)
  }, [exam.isTimed, isPaused])

  useEffect(() => {
    if (exam.isTimed && secondsLeft === 0 && !submittedRef.current) void submit()
  }, [exam.isTimed, secondsLeft, submit])

  useEffect(() => {
    if (!exam.isTimed) return
    const pauseWhenAway = () => {
      if (document.visibilityState === 'hidden' && !pauseRef.current && !submittedRef.current) setPauseReason('auto')
    }
    const pauseOnBlur = () => {
      if (!pauseRef.current && !submittedRef.current) setPauseReason('auto')
    }
    document.addEventListener('visibilitychange', pauseWhenAway)
    window.addEventListener('blur', pauseOnBlur)
    return () => {
      document.removeEventListener('visibilitychange', pauseWhenAway)
      window.removeEventListener('blur', pauseOnBlur)
    }
  }, [exam.isTimed])

  useEffect(() => {
    if (passageIndex >= exam.passages.length) setPassageIndex(0)
  }, [exam.passages.length, passageIndex])

  useLayoutEffect(() => {
    for (const annotation of annotations) {
      if (annotation.passageId !== currentPassage.id) continue
      const root = rootForPane(annotation.pane)
      if (root) applyAnnotation(root, annotation)
    }
  }, [annotations, answers, currentGroups, currentPassage.id, rootForPane])

  useEffect(() => {
    setSelection(null)
  }, [currentPassage.id])

  const answeredCount = useMemo(() => exam.questions.filter((question) => isAnswered(answers[question.id])).length, [answers, exam.questions])
  const hasUnanswered = answeredCount < exam.questions.length

  const selectText = (pane: TextSelection['pane']) => {
    const currentSelection = window.getSelection()
    const root = rootForPane(pane)
    if (!currentSelection || currentSelection.isCollapsed || !root) {
      setSelection(null)
      return
    }

    const range = currentSelection.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) {
      setSelection(null)
      return
    }

    const offsets = getTextOffsets(root, range)
    const text = currentSelection.toString().trim()
    if (!offsets || !text) {
      setSelection(null)
      return
    }

    const rect = range.getBoundingClientRect()
    setSelection({
      text,
      top: Math.max(12, rect.top - 56),
      left: Math.max(170, Math.min(window.innerWidth - 170, rect.left + rect.width / 2)),
      pane,
      passageId: currentPassage.id,
      ...offsets,
      highlightIds: getHighlightIdsInRange(root, range),
    })
  }

  const applySelectedHighlight = (color: string) => {
    if (!selection) return
    const root = rootForPane(selection.pane)
    selection.highlightIds.forEach((id) => removeHighlight(root, id))
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      color,
      pane: selection.pane,
      passageId: selection.passageId,
      quote: selection.text,
      startOffset: selection.startOffset,
      endOffset: selection.endOffset,
    }
    setAnnotations((current) => [...current.filter((item) => !selection.highlightIds.includes(item.id)), annotation])
    setNotes((current) => current.map((note) => selection.highlightIds.includes(note.annotation_id ?? '')
      ? { ...note, annotation_id: annotation.id, color }
      : note))
    setSelectedColor(color)
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  const clearSelectedHighlights = () => {
    if (!selection?.highlightIds.length) return
    const root = rootForPane(selection.pane)
    selection.highlightIds.forEach((id) => removeHighlight(root, id))
    setAnnotations((current) => current.filter((item) => !selection.highlightIds.includes(item.id)))
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  const beginNote = () => {
    if (!selection) return
    const linkedAnnotation = annotations.find((item) => selection.highlightIds.includes(item.id))
    const annotationId = linkedAnnotation?.id ?? crypto.randomUUID()
    const color = linkedAnnotation?.color ?? selectedColor

    if (!linkedAnnotation) {
      setAnnotations((current) => [...current, {
        id: annotationId,
        color,
        pane: selection.pane,
        passageId: selection.passageId,
        quote: selection.text,
        startOffset: selection.startOffset,
        endOffset: selection.endOffset,
      }])
    }

    setLinkedNoteContext({ annotationId, passagePart: currentPassage.passage_part, pane: selection.pane, color })
    setSelectedColor(color)
    setQuoteDraft(selection.text)
    setNoteDraft('')
    setEditingNoteId(null)
    setNotesOpen(true)
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  const startNewNote = () => {
    setLinkedNoteContext(null)
    setQuoteDraft('')
    setNoteDraft('')
    setEditingNoteId(null)
    setNotesOpen(true)
  }

  const saveNote = () => {
    if (!noteDraft.trim() && !quoteDraft.trim()) return
    const note: StudyNote = {
      id: editingNoteId ?? crypto.randomUUID(),
      quote: quoteDraft.trim(),
      text: noteDraft.trim(),
      color: linkedNoteContext?.color ?? selectedColor,
      ...(linkedNoteContext ? {
        annotation_id: linkedNoteContext.annotationId ?? undefined,
        passage_part: linkedNoteContext.passagePart,
        pane: linkedNoteContext.pane,
      } : {}),
    }
    setNotes((current) => editingNoteId
      ? current.map((item) => item.id === editingNoteId ? note : item)
      : [note, ...current])
    setNoteDraft('')
    setQuoteDraft('')
    setEditingNoteId(null)
    setLinkedNoteContext(null)
    setNotesOpen(false)
  }

  const editNote = (note: StudyNote) => {
    setEditingNoteId(note.id)
    setLinkedNoteContext(note.passage_part && note.pane ? {
      annotationId: note.annotation_id ?? null,
      passagePart: note.passage_part,
      pane: note.pane,
      color: note.color ?? selectedColor,
    } : null)
    setQuoteDraft(note.quote)
    setNoteDraft(note.text)
    setSelectedColor(note.color ?? HIGHLIGHT_COLORS[0].value)
  }

  const deleteNote = (noteId: string) => {
    setNotes((current) => current.filter((item) => item.id !== noteId))
    if (editingNoteId === noteId) {
      setEditingNoteId(null)
      setLinkedNoteContext(null)
      setQuoteDraft('')
      setNoteDraft('')
    }
  }

  const updateSplit = (clientX: number) => {
    const bounds = splitterRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width === 0) return
    setSplit(Math.max(30, Math.min(70, ((clientX - bounds.left) / bounds.width) * 100)))
  }

  const scrollToQuestion = (questionId: string, passagePart: number) => {
    const index = exam.passages.findIndex((passage) => passage.passage_part === passagePart)
    if (index >= 0 && index !== passageIndex) {
      setPassageIndex(index)
      window.setTimeout(() => document.getElementById(`question-${questionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
    } else {
      document.getElementById(`question-${questionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const handleSubmitClick = () => {
    if (hasUnanswered && !window.confirm(`Bạn còn ${exam.questions.length - answeredCount} câu chưa trả lời. Vẫn nộp bài?`)) return
    void submit()
  }

  const resumeText = pauseReason === 'auto'
    ? 'Thời gian đã tự động tạm dừng do bạn chuyển sang tab hoặc ứng dụng khác. Nhấn tiếp tục để làm bài.'
    : 'Bài thi đang tạm dừng. Nhấn tiếp tục khi bạn sẵn sàng.'

  return (
    <div className="flex h-dvh min-h-[620px] flex-col overflow-hidden bg-slate-50 text-slate-900">
      <AppHeader compact />
      <div className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" className="size-9 shrink-0 rounded-lg text-slate-600" onClick={onExit} aria-label="Thoát bài thi"><ArrowLeft className="size-4" /></Button>
          <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{exam.title}</p><p className="text-xs text-slate-500">{exam.mode === 'test' ? 'IELTS Academic Reading' : 'Luyện tập'} · {exam.questions.length} câu</p></div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={`inline-flex min-w-[104px] items-center justify-center gap-2 rounded-lg border px-3 py-2 font-mono text-sm font-bold tabular-nums ${exam.isTimed && secondsLeft < 300 ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-slate-200 bg-slate-50 text-slate-800'}`} aria-live="polite">
            <Clock3 className="size-4" /> {exam.isTimed ? clock(secondsLeft) : clock(elapsed)}
          </div>
          <Button variant="outline" size="sm" onClick={startNewNote} aria-label="Mở ghi chú học tập" className="h-9 rounded-lg border-slate-200 px-2.5 sm:px-3"><StickyNote className="size-4 sm:mr-2" /><span className="hidden sm:inline">Ghi chú</span><span className="ml-1 rounded-full bg-slate-100 px-1.5 text-[10px]">{notes.length}</span></Button>
          {profile?.role === 'admin' && <Button variant="outline" size="sm" onClick={() => setPauseReason(isPaused ? null : 'manual')} className="h-9 rounded-lg border-slate-200 px-2.5 sm:px-3">{isPaused ? <Play className="size-4 sm:mr-2" /> : <Pause className="size-4 sm:mr-2" />}<span className="hidden sm:inline">{isPaused ? 'Tiếp tục' : 'Tạm dừng'}</span></Button>}
          <Button size="sm" onClick={handleSubmitClick} disabled={submitting} className="h-9 rounded-lg bg-sky-600 px-3 text-white hover:bg-sky-700 sm:px-4"><Send className="size-4 sm:mr-2" /><span className="hidden sm:inline">{submitting ? 'Đang nộp' : 'Nộp bài'}</span></Button>
        </div>
      </div>

      <div ref={splitterRef} className="exam-workspace relative grid min-h-0 flex-1 overflow-hidden" style={{ gridTemplateColumns: `${split}fr 8px ${100 - split}fr` }}>
        <section className="min-h-0 overflow-y-auto bg-white" aria-label={`Bài đọc Passage ${currentPassage.passage_part}`}>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-3 backdrop-blur sm:px-7">
            <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-600">Passage {currentPassage.passage_part}</p><h1 className="mt-1 text-lg font-bold text-slate-900">{currentPassage.title}</h1></div>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{currentQuestions.length} câu</span>
          </div>
          <div className="mx-auto max-w-[740px] px-5 py-6 sm:px-8 sm:py-8">
            <div
              ref={passageRef}
              className="rich-content text-[15px] leading-[1.9] selection:bg-yellow-200/80"
              onMouseUp={() => selectText('passage')}
              onKeyUp={() => selectText('passage')}
              dangerouslySetInnerHTML={{ __html: currentPassageHtml }}
            />
            {!currentPassage.content && <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">Bài đọc đang được cập nhật.</p>}
          </div>
        </section>

        <div
          className="exam-divider group relative z-10 flex cursor-col-resize items-center justify-center bg-slate-100 outline-none transition hover:bg-sky-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
          role="separator"
          aria-label="Điều chỉnh độ rộng bài đọc và câu hỏi"
          aria-orientation="vertical"
          aria-valuemin={30}
          aria-valuemax={70}
          aria-valuenow={Math.round(split)}
          tabIndex={0}
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updateSplit(event.clientX) }}
          onPointerMove={(event) => { if (event.buttons === 1) updateSplit(event.clientX) }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') setSplit((value) => Math.max(30, value - 3))
            if (event.key === 'ArrowRight') setSplit((value) => Math.min(70, value + 3))
            if (event.key === 'Home') setSplit(30)
            if (event.key === 'End') setSplit(70)
          }}
        >
          <span className="h-10 w-1 rounded-full bg-slate-300 transition group-hover:bg-sky-400" />
        </div>

        <section className="min-h-0 overflow-y-auto bg-slate-50" aria-label="Câu hỏi">
          <div className="mx-auto max-w-[760px] px-4 py-5 sm:px-6 sm:py-6">
            <div className="mb-4 flex items-center justify-between px-1">
              <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Câu hỏi</p><p className="mt-1 text-sm font-semibold text-slate-800">Passage {currentPassage.passage_part}</p></div>
              <span className="text-xs text-slate-500">{currentQuestions.filter((question) => isAnswered(answers[question.id])).length}/{currentQuestions.length} đã trả lời</span>
            </div>
            <div ref={questionRef} className="space-y-4" onMouseUp={() => selectText('questions')} onKeyUp={() => selectText('questions')}>
              {currentGroups.length ? currentGroups.map((group) => (
                <QuestionGroupCard key={group.id} group={group} answers={answers} onAnswer={updateAnswer} />
              )) : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Chưa có câu hỏi cho passage này.</div>}
            </div>
          </div>
        </section>
      </div>

      <footer className="z-20 shrink-0 border-t border-slate-200 bg-white px-3 py-2.5 sm:px-5">
        <div className="flex items-center gap-4 overflow-x-auto">
          <div className="flex shrink-0 items-center gap-1.5" role="tablist" aria-label="Chọn bài đọc">
            {exam.passages.map((passage, index) => {
              const passageQuestions = exam.questions.filter((question) => question.passage_id === passage.id)
              const answered = passageQuestions.filter((question) => isAnswered(answers[question.id])).length
              return <button key={passage.id} type="button" role="tab" aria-selected={index === passageIndex} onClick={() => setPassageIndex(index)} className={`rounded-lg px-3 py-2 text-[11px] font-bold tracking-wide transition sm:text-xs ${index === passageIndex ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                P{passage.passage_part}<span className={`ml-1.5 font-medium ${index === passageIndex ? 'text-sky-100' : 'text-slate-400'}`}>{answered}/{passageQuestions.length}</span>
              </button>
            })}
          </div>
          <div className="h-7 w-px shrink-0 bg-slate-200" aria-hidden="true" />
          <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto py-0.5" aria-label="Điều hướng câu hỏi">
            {exam.questions.map((question, index) => {
              const answered = isAnswered(answers[question.id])
              return <button
                key={question.id}
                type="button"
                onClick={() => scrollToQuestion(question.id, question.passage_part)}
                aria-label={`Đi đến câu ${question.question_number}`}
                aria-current={currentQuestions.some((item) => item.id === question.id) ? 'location' : undefined}
                className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition ${answered ? 'border-sky-600 bg-sky-600 text-white hover:bg-sky-700' : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700'}`}
              >{question.question_number || index + 1}</button>
            })}
          </div>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 sm:text-[11px]"><span>{answeredCount} / {exam.questions.length} câu đã trả lời</span><span className="hidden sm:inline">Bôi đen văn bản ở bài đọc hoặc câu hỏi để tô sáng và ghi chú</span></div>
      </footer>

      {selection && <AnnotationToolbar
        position={selection}
        selectedColor={selectedColor}
        hasHighlight={selection.highlightIds.length > 0}
        onHighlight={applySelectedHighlight}
        onClear={clearSelectedHighlights}
        onNote={beginNote}
      />}

      {isPaused && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-md" role="presentation">
        <div role="dialog" aria-modal="true" aria-labelledby="pause-title" className="w-full max-w-md rounded-2xl border border-white/70 bg-white/95 p-7 text-center shadow-2xl">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-sky-50 text-sky-700"><Pause className="size-6" /></div>
          <h2 id="pause-title" className="mt-4 text-xl font-bold text-slate-900">Bài thi đang tạm dừng</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{resumeText}</p>
          <Button onClick={() => setPauseReason(null)} className="mt-6 h-11 w-full rounded-lg bg-sky-600 text-white hover:bg-sky-700"><Play className="mr-2 size-4" /> Tiếp tục làm bài</Button>
        </div>
      </div>}

      <StudyNotesDrawer
        open={notesOpen}
        notes={notes}
        quoteDraft={quoteDraft}
        noteDraft={noteDraft}
        editingNoteId={editingNoteId}
        onClose={() => setNotesOpen(false)}
        onQuoteChange={setQuoteDraft}
        onTextChange={setNoteDraft}
        onSave={saveNote}
        onCreate={startNewNote}
        onEdit={editNote}
        onDelete={deleteNote}
      />
    </div>
  )
}
