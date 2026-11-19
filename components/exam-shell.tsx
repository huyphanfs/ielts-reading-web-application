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

function getAnswerKey(questionId: string) {
  return questionId.includes('__sub_') ? questionId.split('__sub_')[0] : questionId
}

function isAnswered(answer: UserAnswer | undefined) {
  if (answer === undefined || answer === null) return false
  if (Array.isArray(answer)) return answer.some((item) => typeof item === 'string' && item.trim().length > 0)
  return typeof answer === 'string' && answer.trim().length > 0
}

function countWords(html: string) {
  const plainText = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/[\u2013\u2014]/g, ' ')
    .trim()
  if (!plainText) return 0
  return plainText.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length
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
  const isAdmin = profile?.role === 'admin'
  const [passageIndex, setPassageIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, UserAnswer>>({})
  const [secondsLeft, setSecondsLeft] = useState(3600)
  const [elapsed, setElapsed] = useState(0)
  const [pauseReason, setPauseReason] = useState<PauseReason>(null)
  const [split, setSplit] = useState(60)
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
  const passageWordCount = useMemo(() => countWords(currentPassageHtml), [currentPassageHtml])
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
    if (!exam.isTimed || isAdmin) return
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
  }, [exam.isTimed, isAdmin])

  useEffect(() => {
    if (passageIndex >= exam.passages.length) setPassageIndex(0)
  }, [exam.passages.length, passageIndex])

  useLayoutEffect(() => {
    for (const annotation of annotations) {
      if (annotation.passageId !== currentPassage.id) continue
      const root = rootForPane(annotation.pane)
      if (!root) continue
      try {
        applyAnnotation(root, annotation)
      } catch {
        // Skip annotations that fail to apply (e.g. DOM changed during render)
      }
    }
  }, [annotations, currentGroups, currentPassage.id, rootForPane])

  useEffect(() => {
    setSelection(null)
  }, [currentPassage.id])

  const answeredCount = useMemo(() => exam.questions.filter((question) => isAnswered(answers[getAnswerKey(question.id)])).length, [answers, exam.questions])
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
    setSplit(Math.max(40, Math.min(75, ((clientX - bounds.left) / bounds.width) * 100)))
  }

  const questionPaneRef = useRef<HTMLElement>(null)

  const scrollToQuestion = (questionId: string, passagePart: number) => {
    const index = exam.passages.findIndex((passage) => passage.passage_part === passagePart)
    const doScroll = () => {
      const target = document.getElementById(`question-${questionId}`)
      const container = questionPaneRef.current
      if (target && container) {
        const targetRect = target.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        const offsetTop = target.offsetTop - container.offsetTop - (containerRect.height / 2) + (targetRect.height / 2)
        container.scrollTo({ top: Math.max(0, offsetTop), behavior: 'smooth' })
      }
    }
    if (index >= 0 && index !== passageIndex) {
      setPassageIndex(index)
      window.setTimeout(doScroll, 100)
    } else {
      doScroll()
    }
  }

  const handleSubmitClick = () => {
    const remaining = exam.questions.length - answeredCount
    if (hasUnanswered && !window.confirm(`You have ${remaining} unanswered ${remaining === 1 ? 'question' : 'questions'}. Submit anyway?`)) return
    void submit()
  }

  return (
    <div className="flex h-dvh min-h-[620px] flex-col overflow-hidden bg-slate-50 text-slate-900">
      <AppHeader compact />
      <div className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" className="size-9 shrink-0 rounded-lg text-slate-600" onClick={onExit} aria-label="Exit test"><ArrowLeft className="size-4" /></Button>
          <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{exam.title}</p><p className="text-xs text-slate-500">{exam.mode === 'test' ? 'IELTS Academic Reading' : 'Practice'} · {exam.questions.length} {exam.questions.length === 1 ? 'question' : 'questions'}</p></div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className={`inline-flex min-w-[104px] items-center justify-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-sm font-bold tabular-nums ${
              isPaused
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : exam.isTimed && secondsLeft < 300
                  ? 'border-orange-200 bg-orange-50 text-orange-700'
                  : 'border-slate-200 bg-slate-50 text-slate-800'
            }`}
            aria-live="polite"
            title={isPaused ? 'Timer paused' : undefined}
          >
            <Clock3 className="size-4" /> {exam.isTimed ? clock(secondsLeft) : clock(elapsed)}
          </div>
          <Button variant="outline" size="sm" onClick={startNewNote} aria-label="Open study notes" className="h-9 rounded-lg border-slate-200 px-2.5 sm:px-3"><StickyNote className="size-4 sm:mr-2" /><span className="hidden sm:inline">Notes</span><span className="ml-1 rounded-full bg-slate-100 px-1.5 text-[10px]">{notes.length}</span></Button>
          {isAdmin && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPauseReason(isPaused ? null : 'manual')}
              aria-label={isPaused ? 'Resume timer' : 'Pause timer'}
              className={`h-9 rounded-lg px-2.5 sm:px-3 ${
                isPaused
                  ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {isPaused ? <Play className="size-4 sm:mr-2" /> : <Pause className="size-4 sm:mr-2" />}
              <span className="hidden sm:inline">{isPaused ? 'Resume' : 'Pause timer'}</span>
            </Button>
          )}
          <Button size="sm" onClick={handleSubmitClick} disabled={submitting} className="h-9 rounded-lg bg-sky-600 px-3 text-white hover:bg-sky-700 sm:px-4"><Send className="size-4 sm:mr-2" /><span className="hidden sm:inline">{submitting ? 'Submitting' : 'Submit'}</span></Button>
        </div>
      </div>

      <div ref={splitterRef} className="exam-workspace relative grid min-h-0 w-full flex-1 overflow-hidden" style={{ gridTemplateColumns: `${split}fr 8px ${100 - split}fr` }}>
        <section className="min-h-0 w-full overflow-y-auto bg-white" aria-label={`Reading Passage ${currentPassage.passage_part}`}>
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-8 py-3 backdrop-blur">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-600">Passage {currentPassage.passage_part}</p>
              <h1 className="mt-1 text-lg font-bold text-slate-900">{currentPassage.title}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {passageWordCount} {passageWordCount === 1 ? 'word' : 'words'}
              </span>
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {currentQuestions.length} {currentQuestions.length === 1 ? 'question' : 'questions'}
              </span>
            </div>
          </div>
          <div className="w-full px-8 py-6">
            <div
              ref={passageRef}
              className="rich-content text-[15px] leading-[1.9] selection:bg-yellow-200/80"
              onMouseUp={() => selectText('passage')}
              onKeyUp={() => selectText('passage')}
              dangerouslySetInnerHTML={{ __html: currentPassageHtml }}
            />
            {!currentPassage.content && <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">Reading passage content is being updated.</p>}
          </div>
        </section>

        <div
          className="exam-divider group relative z-10 flex cursor-col-resize items-center justify-center bg-slate-100 outline-none transition hover:bg-sky-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
          role="separator"
          aria-label="Resize passage and questions panels"
          aria-orientation="vertical"
          aria-valuemin={40}
          aria-valuemax={75}
          aria-valuenow={Math.round(split)}
          tabIndex={0}
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updateSplit(event.clientX) }}
          onPointerMove={(event) => { if (event.buttons === 1) updateSplit(event.clientX) }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') setSplit((value) => Math.max(40, value - 3))
            if (event.key === 'ArrowRight') setSplit((value) => Math.min(75, value + 3))
            if (event.key === 'Home') setSplit(40)
            if (event.key === 'End') setSplit(75)
          }}
        >
          <span className="h-10 w-1 rounded-full bg-slate-300 transition group-hover:bg-sky-400" />
        </div>

        <section ref={questionPaneRef} className="min-h-0 w-full overflow-y-auto bg-slate-50" aria-label="Questions">
          <div className="w-full px-2 py-3 sm:px-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Questions</p><p className="mt-0.5 text-sm font-semibold text-slate-800">Passage {currentPassage.passage_part}</p></div>
              <span className="text-xs text-slate-500">{currentQuestions.filter((question) => isAnswered(answers[getAnswerKey(question.id)])).length}/{currentQuestions.length} answered</span>
            </div>
            <div ref={questionRef} className="w-full space-y-3" onMouseUp={() => selectText('questions')} onKeyUp={() => selectText('questions')}>
              {currentGroups.length ? currentGroups.map((group) => (
                <QuestionGroupCard key={group.id} group={group} answers={answers} onAnswer={updateAnswer} />
              )) : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No questions available for this passage yet.</div>}
            </div>
          </div>
        </section>
      </div>

      <footer className="z-20 shrink-0 border-t border-slate-200 bg-white px-3 py-1.5 sm:px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex shrink-0 items-center gap-1" role="tablist" aria-label="Select reading passage">
            {exam.passages.map((passage, index) => {
              const passageQuestions = exam.questions.filter((question) => question.passage_id === passage.id)
              const answered = passageQuestions.filter((question) => isAnswered(answers[getAnswerKey(question.id)])).length
              return <button key={passage.id} type="button" role="tab" aria-selected={index === passageIndex} onClick={() => setPassageIndex(index)} className={`h-7 rounded-md px-2.5 text-[11px] font-bold tracking-wide transition ${index === passageIndex ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                P{passage.passage_part}<span className={`ml-1 font-medium ${index === passageIndex ? 'text-sky-100' : 'text-slate-400'}`}>{answered}/{passageQuestions.length}</span>
              </button>
            })}
          </div>
          <div className="h-5 w-px shrink-0 bg-slate-200" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Question navigation">
            {exam.questions.map((question, index) => {
              const answered = isAnswered(answers[getAnswerKey(question.id)])
              return <button
                key={question.id}
                type="button"
                onClick={() => scrollToQuestion(getAnswerKey(question.id), question.passage_part)}
                aria-label={`Go to question ${question.question_number}`}
                aria-current={currentQuestions.some((item) => item.id === question.id) ? 'location' : undefined}
                className={`flex size-6.5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition ${answered ? 'border-sky-600 bg-sky-600 text-white hover:bg-sky-700' : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700'}`}
              >{question.question_number || index + 1}</button>
            })}
          </div>
          <span className="hidden shrink-0 text-[11px] font-medium text-slate-500 sm:inline">{answeredCount}/{exam.questions.length} questions</span>
        </div>
      </footer>

      {selection && <AnnotationToolbar
        position={selection}
        selectedColor={selectedColor}
        hasHighlight={selection.highlightIds.length > 0}
        onHighlight={applySelectedHighlight}
        onClear={clearSelectedHighlights}
        onNote={beginNote}
      />}

      {pauseReason === 'auto' && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-md" role="presentation">
        <div role="dialog" aria-modal="true" aria-labelledby="pause-title" className="w-full max-w-md rounded-2xl border border-white/70 bg-white/95 p-7 text-center shadow-2xl">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-sky-50 text-sky-700"><Pause className="size-6" /></div>
          <h2 id="pause-title" className="mt-4 text-xl font-bold text-slate-900">Test Paused</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">The timer was automatically paused because you switched to another tab or application. Click resume to continue.</p>
          <Button onClick={() => setPauseReason(null)} className="mt-6 h-11 w-full rounded-lg bg-sky-600 text-white hover:bg-sky-700"><Play className="mr-2 size-4" /> Resume Test</Button>
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
