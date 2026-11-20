'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Bold,
  Clock3,
  Eraser,
  GripVertical,
  Italic,
  Pause,
  Pencil,
  Play,
  Send,
  StickyNote,
  TextSelect,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppHeader } from '@/components/app-header'
import { AnnotationToolbar, DRAW_COLORS, HIGHLIGHT_COLORS, type ToolMode } from '@/components/exam/annotation-toolbar'
import { QuestionGroupCard } from '@/components/exam/question-group'
import { StudyNotesDrawer, type NoteAnchorPosition } from '@/components/exam/study-notes-drawer'
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
  rectTop: number
  pane: 'passage' | 'questions'
  passageId: string
  startOffset: number
  endOffset: number
  highlightIds: string[]
}
type NoteContext = { annotationId: string | null; passagePart: 1 | 2 | 3; pane: 'passage' | 'questions'; color: string }

type DrawStroke = {
  id: string
  color: string
  pane: 'passage' | 'questions'
  passageId: string
  points: { x: number; y: number }[]
}

type CanvasTextNote = {
  id: string
  pane: 'passage' | 'questions'
  passageId: string
  x: number
  y: number
  width: number
  height: number
  html: string
  plainText: string
  fontSize: number
  textColor: string
}

type LocalRect = {
  pane: 'passage' | 'questions'
  x: number
  y: number
  width: number
  height: number
}

// 1 cm at 96 DPI = 37.795px -> radius = 18.9px (~19px)
const ERASER_RADIUS_PX = 19

const NOTE_TEXT_COLORS = [
  { name: 'Đỏ', value: '#DC2626' },
  { name: 'Xám', value: '#64748B' },
  { name: 'Xanh lá', value: '#16A34A' },
  { name: 'Cam', value: '#EA580C' },
  { name: 'Xanh biển', value: '#0284C7' },
] as const

const NOTE_FONT_SIZES = [12, 14, 16, 18, 20, 24] as const

function densifyPoints(points: { x: number; y: number }[], step = 4) {
  if (points.length <= 1) return points
  const result: { x: number; y: number }[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const dist = Math.hypot(b.x - a.x, b.y - a.y)
    if (dist > step) {
      const steps = Math.ceil(dist / step)
      for (let s = 1; s < steps; s++) {
        const t = s / steps
        result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      }
    }
    result.push(b)
  }
  return result
}

function splitStrokeByPredicate(
  stroke: DrawStroke,
  shouldErasePoint: (p: { x: number; y: number }) => boolean,
): DrawStroke[] {
  const dense = densifyPoints(stroke.points)
  const segments: { x: number; y: number }[][] = []
  let current: { x: number; y: number }[] = []

  for (const pt of dense) {
    if (shouldErasePoint(pt)) {
      if (current.length > 0) {
        segments.push(current)
        current = []
      }
    } else {
      current.push(pt)
    }
  }
  if (current.length > 0) {
    segments.push(current)
  }

  return segments.map((pts, idx) => ({
    ...stroke,
    id: idx === 0 && segments.length === 1 ? stroke.id : `${stroke.id}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    points: pts,
  }))
}

function rectIntersectsCircle(rect: DOMRect, cx: number, cy: number, radius: number) {
  const closestX = Math.max(rect.left, Math.min(cx, rect.right))
  const closestY = Math.max(rect.top, Math.min(cy, rect.bottom))
  return Math.hypot(cx - closestX, cy - closestY) <= radius
}

function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top
}

function pointsToPath(points: { x: number; y: number }[]) {
  if (!points.length) return ''
  if (points.length === 1) {
    const p = points[0]
    return `M ${p.x} ${p.y} L ${p.x} ${p.y}`
  }
  return `M ${points[0].x} ${points[0].y} ${points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ')}`
}

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

function TransparentNoteBox({
  box,
  autoFocus,
  onChange,
  onDelete,
}: {
  box: CanvasTextNote
  autoFocus: boolean
  onChange: (id: string, patch: Partial<CanvasTextNote>) => void
  onDelete: (id: string) => void
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizingRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null)

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (box.html && el.innerHTML !== box.html) {
      el.innerHTML = sanitizeHtml(box.html)
    }
    if (autoFocus) {
      el.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyFormat = (command: string, value?: string) => {
    const el = editorRef.current
    if (!el) return
    el.focus()
    document.execCommand(command, false, value)
    onChange(box.id, {
      html: el.innerHTML,
      plainText: el.innerText,
      ...(command === 'foreColor' && value ? { textColor: value } : {}),
    })
  }

  const changeFontSize = (delta: -1 | 1) => {
    const currentIdx = NOTE_FONT_SIZES.indexOf(box.fontSize as (typeof NOTE_FONT_SIZES)[number])
    const baseIdx = currentIdx >= 0 ? currentIdx : 1
    const nextIdx = Math.max(0, Math.min(NOTE_FONT_SIZES.length - 1, baseIdx + delta))
    const nextSize = NOTE_FONT_SIZES[nextIdx]

    const sel = window.getSelection()
    const el = editorRef.current
    if (el && sel && sel.rangeCount > 0 && !sel.isCollapsed && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0)
      const span = document.createElement('span')
      span.style.fontSize = `${nextSize}px`
      try {
        range.surroundContents(span)
      } catch {
        const frag = range.extractContents()
        span.appendChild(frag)
        range.insertNode(span)
      }
      onChange(box.id, { html: el.innerHTML, plainText: el.innerText, fontSize: nextSize })
    } else {
      onChange(box.id, { fontSize: nextSize })
    }
  }

  return (
    <div
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      className="group pointer-events-auto absolute z-30 flex flex-col rounded-lg border border-transparent bg-transparent transition-colors hover:border-sky-300/80 focus-within:border-sky-400"
    >
      {/* Floating compact format & drag bar (no NOTE title) */}
      <div className="flex h-6 shrink-0 items-center justify-between gap-1 rounded-t-lg bg-white/90 px-1.5 opacity-0 shadow-xs backdrop-blur-xs transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <div
          title="Kéo để di chuyển"
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.stopPropagation()
            e.currentTarget.setPointerCapture(e.pointerId)
            draggingRef.current = {
              startX: e.clientX,
              startY: e.clientY,
              origX: box.x,
              origY: box.y,
            }
          }}
          onPointerMove={(e) => {
            const drag = draggingRef.current
            if (!drag) return
            onChange(box.id, {
              x: Math.max(0, drag.origX + (e.clientX - drag.startX)),
              y: Math.max(0, drag.origY + (e.clientY - drag.startY)),
            })
          }}
          onPointerUp={(e) => {
            if (draggingRef.current) {
              draggingRef.current = null
              try {
                e.currentTarget.releasePointerCapture(e.pointerId)
              } catch {
                // ignore
              }
            }
          }}
          className="flex cursor-grab items-center text-slate-400 hover:text-slate-700 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </div>

        {/* Font size down / up */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Giảm cỡ chữ"
            onMouseDown={(e) => {
              e.preventDefault()
              changeFontSize(-1)
            }}
            className="flex h-5 items-center rounded px-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100 hover:text-sky-700"
          >
            A-
          </button>
          <span className="text-[10px] tabular-nums text-slate-400">{box.fontSize}</span>
          <button
            type="button"
            title="Tăng cỡ chữ"
            onMouseDown={(e) => {
              e.preventDefault()
              changeFontSize(1)
            }}
            className="flex h-5 items-center rounded px-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100 hover:text-sky-700"
          >
            A+
          </button>
        </div>

        <span className="h-3.5 w-px bg-slate-200" />

        {/* Bold & Italic */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="In đậm (Bold)"
            onMouseDown={(e) => {
              e.preventDefault()
              applyFormat('bold')
            }}
            className="flex size-5 items-center justify-center rounded text-slate-600 hover:bg-slate-100 hover:text-sky-700"
          >
            <Bold className="size-3" />
          </button>
          <button
            type="button"
            title="In nghiêng (Italic)"
            onMouseDown={(e) => {
              e.preventDefault()
              applyFormat('italic')
            }}
            className="flex size-5 items-center justify-center rounded text-slate-600 hover:bg-slate-100 hover:text-sky-700"
          >
            <Italic className="size-3" />
          </button>
        </div>

        <span className="h-3.5 w-px bg-slate-200" />

        {/* 5 Text Colors: Đỏ, Xám, Xanh lá, Cam, Xanh biển */}
        <div className="flex items-center gap-1">
          {NOTE_TEXT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              title={c.name}
              aria-label={`Màu chữ ${c.name}`}
              onMouseDown={(e) => {
                e.preventDefault()
                applyFormat('foreColor', c.value)
              }}
              className={`size-3 rounded-full border border-slate-300 transition hover:scale-125 ${
                box.textColor === c.value ? 'ring-1 ring-slate-700 ring-offset-1' : ''
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>

        <button
          type="button"
          aria-label="Xóa khung note"
          title="Xóa khung note"
          onClick={() => onDelete(box.id)}
          className="ml-0.5 flex size-4 items-center justify-center rounded text-slate-500 hover:bg-rose-50 hover:text-rose-600"
        >
          <X className="size-3" />
        </button>
      </div>

      {/* Transparent editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Ghi chú trong suốt"
        data-placeholder="Nhập ghi chú..."
        style={{ fontSize: `${box.fontSize}px`, color: box.textColor }}
        onInput={(e) => {
          onChange(box.id, {
            html: e.currentTarget.innerHTML,
            plainText: e.currentTarget.innerText,
          })
        }}
        className="min-h-0 w-full flex-1 overflow-y-auto bg-transparent px-2 py-1 leading-snug outline-none empty:before:pointer-events-none empty:before:text-slate-400/80 empty:before:content-[attr(data-placeholder)]"
      />

      {/* Resize corner handle */}
      <div
        title="Kéo để đổi kích thước"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          resizingRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origW: box.width,
            origH: box.height,
          }
        }}
        onPointerMove={(e) => {
          const res = resizingRef.current
          if (!res) return
          onChange(box.id, {
            width: Math.max(180, res.origW + (e.clientX - res.startX)),
            height: Math.max(64, res.origH + (e.clientY - res.startY)),
          })
        }}
        onPointerUp={(e) => {
          if (resizingRef.current) {
            resizingRef.current = null
            try {
              e.currentTarget.releasePointerCapture(e.pointerId)
            } catch {
              // ignore
            }
          }
        }}
        className="absolute bottom-0 right-0 size-3.5 cursor-nwse-resize opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <span className="pointer-events-none absolute bottom-1 right-1 block size-1.5 border-b-2 border-r-2 border-sky-500/80" />
      </div>
    </div>
  )
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
  const initialSeconds = exam.timeLimitSeconds ?? (exam.passages.length === 1 ? 20 * 60 : 60 * 60)
  const [passageIndex, setPassageIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, UserAnswer>>({})
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds)
  const [elapsed, setElapsed] = useState(0)
  const [pauseReason, setPauseReason] = useState<PauseReason>(null)
  const [split, setSplit] = useState(60)
  const [submitting, setSubmitting] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [noteAnchor, setNoteAnchor] = useState<NoteAnchorPosition>(null)
  const [notes, setNotes] = useState<StudyNote[]>([])
  const [noteDraft, setNoteDraft] = useState('')
  const [quoteDraft, setQuoteDraft] = useState('')
  const [selectedColor, setSelectedColor] = useState<string>(HIGHLIGHT_COLORS[0].value)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [linkedNoteContext, setLinkedNoteContext] = useState<NoteContext | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [selection, setSelection] = useState<TextSelection | null>(null)
  const [toolMode, setToolMode] = useState<ToolMode>('select')
  const [drawColor, setDrawColor] = useState<string>(DRAW_COLORS[0].value)
  const [drawStrokes, setDrawStrokes] = useState<DrawStroke[]>([])

  // On-page drawn transparent Textbox Notes
  const [canvasTextNotes, setCanvasTextNotes] = useState<CanvasTextNote[]>([])
  const [drawingNoteRect, setDrawingNoteRect] = useState<LocalRect | null>(null)
  const [focusedNoteBoxId, setFocusedNoteBoxId] = useState<string | null>(null)
  const noteDrawStartRef = useRef<{ pane: 'passage' | 'questions'; x: number; y: number } | null>(null)

  // 1cm circular eraser + rectangle drag eraser state
  const [eraserClientPos, setEraserClientPos] = useState<{ x: number; y: number } | null>(null)
  const [eraserRect, setEraserRect] = useState<LocalRect | null>(null)
  const eraserDragStartRef = useRef<{ pane: 'passage' | 'questions'; x: number; y: number } | null>(null)

  const passageRef = useRef<HTMLDivElement>(null)
  const questionRef = useRef<HTMLDivElement>(null)
  const splitterRef = useRef<HTMLDivElement>(null)
  const pauseRef = useRef<PauseReason>(null)
  const submittedRef = useRef(false)
  const passageSvgRef = useRef<SVGSVGElement>(null)
  const questionSvgRef = useRef<SVGSVGElement>(null)
  const drawingStrokeRef = useRef<DrawStroke | null>(null)

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
  const rootForPane = useCallback((pane: TextSelection['pane']) => (pane === 'passage' ? passageRef.current : questionRef.current), [])

  const updateAnswer = useCallback((questionId: string, answer: UserAnswer) => {
    setAnswers((current) => ({ ...current, [questionId]: answer }))
  }, [])

  const submit = useCallback(async () => {
    if (submittedRef.current || submitting) return
    submittedRef.current = true
    setSubmitting(true)
    const boxStudyNotes: StudyNote[] = canvasTextNotes
      .filter((box) => box.plainText.trim().length > 0)
      .map((box) => {
        const passage = exam.passages.find((p) => p.id === box.passageId)
        return {
          id: `box-${box.id}`,
          quote: '',
          text: box.plainText.trim(),
          color: box.textColor,
          passage_part: passage?.passage_part,
          pane: box.pane,
        }
      })
    await onSubmit(answers, elapsed, [...notes, ...boxStudyNotes])
  }, [answers, canvasTextNotes, elapsed, exam.passages, notes, onSubmit, submitting])

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
        // Skip annotations that fail to apply
      }
    }
  }, [annotations, currentGroups, currentPassage.id, rootForPane])

  useEffect(() => {
    setSelection(null)
  }, [currentPassage.id])

  const answeredCount = useMemo(
    () => exam.questions.filter((question) => isAnswered(answers[getAnswerKey(question.id)])).length,
    [answers, exam.questions],
  )
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
      top: Math.max(8, rect.top - 42),
      left: Math.max(120, Math.min(window.innerWidth - 120, rect.left + rect.width / 2)),
      rectTop: rect.top,
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
    setNotes((current) =>
      current.map((note) =>
        selection.highlightIds.includes(note.annotation_id ?? '')
          ? { ...note, annotation_id: annotation.id, color }
          : note,
      ),
    )
    setSelectedColor(color)
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  const clearSelectedHighlights = () => {
    if (!selection?.highlightIds.length) return
    const root = rootForPane(selection.pane)
    selection.highlightIds.forEach((id) => removeHighlight(root, id))
    setAnnotations((current) => current.filter((item) => !selection.highlightIds.includes(item.id)))
    setNotes((current) => current.filter((note) => !selection.highlightIds.includes(note.annotation_id ?? '')))
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  const beginLinkedNote = () => {
    if (!selection) return
    const linkedAnnotation = annotations.find((item) => selection.highlightIds.includes(item.id))
    const annotationId = linkedAnnotation?.id ?? crypto.randomUUID()
    const color = linkedAnnotation?.color ?? selectedColor

    if (!linkedAnnotation) {
      setAnnotations((current) => [
        ...current,
        {
          id: annotationId,
          color,
          pane: selection.pane,
          passageId: selection.passageId,
          quote: selection.text,
          startOffset: selection.startOffset,
          endOffset: selection.endOffset,
        },
      ])
    }

    setNoteAnchor({ top: selection.rectTop, left: selection.left })
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
    setNoteAnchor(null)
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
      ...(linkedNoteContext
        ? {
            annotation_id: linkedNoteContext.annotationId ?? undefined,
            passage_part: linkedNoteContext.passagePart,
            pane: linkedNoteContext.pane,
          }
        : {}),
    }
    setNotes((current) =>
      editingNoteId ? current.map((item) => (item.id === editingNoteId ? note : item)) : [note, ...current],
    )
    setNoteDraft('')
    setQuoteDraft('')
    setEditingNoteId(null)
    setLinkedNoteContext(null)
    setNotesOpen(false)
  }

  const editNote = (note: StudyNote) => {
    setEditingNoteId(note.id)
    setLinkedNoteContext(
      note.passage_part && note.pane
        ? {
            annotationId: note.annotation_id ?? null,
            passagePart: note.passage_part,
            pane: note.pane,
            color: note.color ?? selectedColor,
          }
        : null,
    )
    setQuoteDraft(note.quote)
    setNoteDraft(note.text)
    setSelectedColor(note.color ?? HIGHLIGHT_COLORS[0].value)
  }

  const deleteNote = (noteId: string) => {
    const targetNote = notes.find((item) => item.id === noteId)
    if (targetNote?.annotation_id) {
      const ann = annotations.find((a) => a.id === targetNote.annotation_id)
      if (ann) removeHighlight(rootForPane(ann.pane), ann.id)
      setAnnotations((current) => current.filter((a) => a.id !== targetNote.annotation_id))
    }
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
        const offsetTop =
          target.offsetTop - container.offsetTop - containerRect.height / 2 + targetRect.height / 2
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
    if (
      hasUnanswered &&
      !window.confirm(`You have ${remaining} unanswered ${remaining === 1 ? 'question' : 'questions'}. Submit anyway?`)
    ) {
      return
    }
    void submit()
  }

  const passageStrokes = drawStrokes.filter((s) => s.pane === 'passage' && s.passageId === currentPassage.id)
  const questionStrokes = drawStrokes.filter((s) => s.pane === 'questions' && s.passageId === currentPassage.id)
  const passageTextNotes = canvasTextNotes.filter((n) => n.pane === 'passage' && n.passageId === currentPassage.id)
  const questionTextNotes = canvasTextNotes.filter((n) => n.pane === 'questions' && n.passageId === currentPassage.id)

  const handleToolChange = useCallback((mode: ToolMode) => {
    setToolMode((prev) => (prev === mode && mode !== 'select' ? 'select' : mode))
    setEraserClientPos(null)
    setEraserRect(null)
    setDrawingNoteRect(null)
    if (mode !== 'select') {
      setSelection(null)
      window.getSelection()?.removeAllRanges()
    }
  }, [])

  const getLocalPoint = (el: HTMLElement | SVGSVGElement, e: React.PointerEvent) => {
    const rect = el.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, rect }
  }

  // Freehand Draw handlers
  const handleDrawStart = (pane: 'passage' | 'questions') => (e: React.PointerEvent<SVGSVGElement>) => {
    if (toolMode !== 'draw') return
    e.currentTarget.setPointerCapture(e.pointerId)
    const { x, y } = getLocalPoint(e.currentTarget, e)
    const stroke: DrawStroke = {
      id: crypto.randomUUID(),
      color: drawColor,
      pane,
      passageId: currentPassage.id,
      points: [{ x, y }],
    }
    drawingStrokeRef.current = stroke
    setDrawStrokes((prev) => [...prev, stroke])
  }

  const handleDrawMove = () => (e: React.PointerEvent<SVGSVGElement>) => {
    if (toolMode !== 'draw' || !drawingStrokeRef.current) return
    const { x, y } = getLocalPoint(e.currentTarget, e)
    const strokeId = drawingStrokeRef.current.id
    setDrawStrokes((prev) => prev.map((s) => (s.id === strokeId ? { ...s, points: [...s.points, { x, y }] } : s)))
  }

  const handleDrawEnd = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drawingStrokeRef.current) drawingStrokeRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  // Note Textbox drawing handlers
  const handleNoteBoxDrawStart = (pane: 'passage' | 'questions') => (e: React.PointerEvent<HTMLDivElement>) => {
    if (toolMode !== 'note') return
    e.currentTarget.setPointerCapture(e.pointerId)
    const { x, y } = getLocalPoint(e.currentTarget, e)
    noteDrawStartRef.current = { pane, x, y }
    setDrawingNoteRect({ pane, x, y, width: 0, height: 0 })
  }

  const handleNoteBoxDrawMove = (pane: 'passage' | 'questions') => (e: React.PointerEvent<HTMLDivElement>) => {
    if (toolMode !== 'note' || !noteDrawStartRef.current || noteDrawStartRef.current.pane !== pane) return
    const { x, y } = getLocalPoint(e.currentTarget, e)
    const start = noteDrawStartRef.current
    setDrawingNoteRect({
      pane,
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    })
  }

  const handleNoteBoxDrawEnd = (pane: 'passage' | 'questions') => (e: React.PointerEvent<HTMLDivElement>) => {
    if (toolMode !== 'note' || !noteDrawStartRef.current || noteDrawStartRef.current.pane !== pane) return
    const { x, y, rect } = getLocalPoint(e.currentTarget, e)
    const start = noteDrawStartRef.current
    noteDrawStartRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }

    const rawX = Math.min(start.x, x)
    const rawY = Math.min(start.y, y)
    const rawW = Math.abs(x - start.x)
    const rawH = Math.abs(y - start.y)

    const width = rawW < 16 && rawH < 16 ? 250 : Math.max(200, rawW)
    const height = rawW < 16 && rawH < 16 ? 90 : Math.max(72, rawH)
    const clampedX = Math.max(8, Math.min(Math.max(8, rect.width - width - 8), rawX))
    const clampedY = Math.max(8, rawY)

    const newNoteBox: CanvasTextNote = {
      id: crypto.randomUUID(),
      pane,
      passageId: currentPassage.id,
      x: clampedX,
      y: clampedY,
      width,
      height,
      html: '',
      plainText: '',
      fontSize: 14,
      textColor: '#DC2626',
    }

    setCanvasTextNotes((prev) => [...prev, newNoteBox])
    setDrawingNoteRect(null)
    setFocusedNoteBoxId(newNoteBox.id)
    setToolMode('select')
  }

  const updateCanvasTextNote = useCallback((id: string, patch: Partial<CanvasTextNote>) => {
    setCanvasTextNotes((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const deleteCanvasTextNote = useCallback((id: string) => {
    setCanvasTextNotes((prev) => prev.filter((item) => item.id !== id))
  }, [])

  // Eraser logic: 1cm circular erasure + rectangular drag erasure
  const eraseAtCircle = useCallback(
    (pane: 'passage' | 'questions', clientX: number, clientY: number, containerRect: DOMRect) => {
      const lx = clientX - containerRect.left
      const ly = clientY - containerRect.top
      const R = ERASER_RADIUS_PX

      setDrawStrokes((prev) =>
        prev.flatMap((stroke) => {
          if (stroke.pane !== pane || stroke.passageId !== currentPassage.id) return [stroke]
          return splitStrokeByPredicate(stroke, (pt) => Math.hypot(pt.x - lx, pt.y - ly) <= R)
        }),
      )

      const root = rootForPane(pane)
      if (root) {
        const marks = root.querySelectorAll<HTMLElement>('[data-highlight-id]')
        const idsToRemove = new Set<string>()
        marks.forEach((mark) => {
          const id = mark.dataset.highlightId
          if (!id) return
          const clientRects = mark.getClientRects()
          for (let i = 0; i < clientRects.length; i++) {
            if (rectIntersectsCircle(clientRects[i], clientX, clientY, R)) {
              idsToRemove.add(id)
              break
            }
          }
        })
        if (idsToRemove.size > 0) {
          idsToRemove.forEach((id) => removeHighlight(root, id))
          setAnnotations((prev) => prev.filter((a) => !idsToRemove.has(a.id)))
          setNotes((prev) => prev.filter((n) => !idsToRemove.has(n.annotation_id ?? '')))
        }
      }

      setCanvasTextNotes((prev) =>
        prev.filter((box) => {
          if (box.pane !== pane || box.passageId !== currentPassage.id) return true
          const closestX = Math.max(box.x, Math.min(lx, box.x + box.width))
          const closestY = Math.max(box.y, Math.min(ly, box.y + box.height))
          return Math.hypot(lx - closestX, ly - closestY) > R
        }),
      )
    },
    [currentPassage.id, rootForPane],
  )

  const eraseInRect = useCallback(
    (pane: 'passage' | 'questions', localRect: LocalRect, containerRect: DOMRect) => {
      const minX = localRect.x
      const maxX = localRect.x + localRect.width
      const minY = localRect.y
      const maxY = localRect.y + localRect.height

      setDrawStrokes((prev) =>
        prev.flatMap((stroke) => {
          if (stroke.pane !== pane || stroke.passageId !== currentPassage.id) return [stroke]
          return splitStrokeByPredicate(stroke, (pt) => pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY)
        }),
      )

      const root = rootForPane(pane)
      if (root) {
        const selectionClientRect = {
          left: containerRect.left + minX,
          top: containerRect.top + minY,
          right: containerRect.left + maxX,
          bottom: containerRect.top + maxY,
        }
        const marks = root.querySelectorAll<HTMLElement>('[data-highlight-id]')
        const idsToRemove = new Set<string>()
        marks.forEach((mark) => {
          const id = mark.dataset.highlightId
          if (!id) return
          const clientRects = mark.getClientRects()
          for (let i = 0; i < clientRects.length; i++) {
            const r = clientRects[i]
            if (rectsOverlap(selectionClientRect, { left: r.left, top: r.top, right: r.right, bottom: r.bottom })) {
              idsToRemove.add(id)
              break
            }
          }
        })
        if (idsToRemove.size > 0) {
          idsToRemove.forEach((id) => removeHighlight(root, id))
          setAnnotations((prev) => prev.filter((a) => !idsToRemove.has(a.id)))
          setNotes((prev) => prev.filter((n) => !idsToRemove.has(n.annotation_id ?? '')))
        }
      }

      setCanvasTextNotes((prev) =>
        prev.filter((box) => {
          if (box.pane !== pane || box.passageId !== currentPassage.id) return true
          return !rectsOverlap(
            { left: minX, top: minY, right: maxX, bottom: maxY },
            { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height },
          )
        }),
      )
    },
    [currentPassage.id, rootForPane],
  )

  const handleEraserPointerDown = (pane: 'passage' | 'questions') => (e: React.PointerEvent<HTMLDivElement>) => {
    if (toolMode !== 'eraser') return
    e.currentTarget.setPointerCapture(e.pointerId)
    const { x, y, rect } = getLocalPoint(e.currentTarget, e)
    setEraserClientPos({ x: e.clientX, y: e.clientY })
    eraserDragStartRef.current = { pane, x, y }
    setEraserRect({ pane, x, y, width: 0, height: 0 })
    eraseAtCircle(pane, e.clientX, e.clientY, rect)
  }

  const handleEraserPointerMove = (pane: 'passage' | 'questions') => (e: React.PointerEvent<HTMLDivElement>) => {
    if (toolMode !== 'eraser') return
    setEraserClientPos({ x: e.clientX, y: e.clientY })
    const start = eraserDragStartRef.current
    if (!start || start.pane !== pane || e.buttons !== 1) return

    const { x, y, rect } = getLocalPoint(e.currentTarget, e)
    eraseAtCircle(pane, e.clientX, e.clientY, rect)

    const nextRect: LocalRect = {
      pane,
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    }
    setEraserRect(nextRect)
    if (nextRect.width >= 6 || nextRect.height >= 6) {
      eraseInRect(pane, nextRect, rect)
    }
  }

  const handleEraserPointerUp = (pane: 'passage' | 'questions') => (e: React.PointerEvent<HTMLDivElement>) => {
    if (toolMode !== 'eraser') return
    const start = eraserDragStartRef.current
    if (start && start.pane === pane) {
      const { x, y, rect } = getLocalPoint(e.currentTarget, e)
      const finalRect: LocalRect = {
        pane,
        x: Math.min(start.x, x),
        y: Math.min(start.y, y),
        width: Math.abs(x - start.x),
        height: Math.abs(y - start.y),
      }
      if (finalRect.width >= 6 || finalRect.height >= 6) {
        eraseInRect(pane, finalRect, rect)
      }
    }
    eraserDragStartRef.current = null
    setEraserRect(null)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const handlePaneClick = (e: React.MouseEvent) => {
    if (toolMode !== 'select') return
    const target = e.target as HTMLElement
    const mark = target.closest<HTMLElement>('[data-highlight-id]')
    if (!mark) return
    const highlightId = mark.dataset.highlightId
    if (!highlightId) return

    const linkedNote = notes.find((n) => n.annotation_id === highlightId)
    if (linkedNote) {
      const rect = mark.getBoundingClientRect()
      setNoteAnchor({ top: rect.top, left: rect.left + rect.width / 2 })
      editNote(linkedNote)
      setNotesOpen(true)
    }
  }

  const handleEraseAll = () => {
    for (const ann of annotations) {
      removeHighlight(rootForPane(ann.pane), ann.id)
    }
    setAnnotations([])
    setDrawStrokes([])
    setNotes([])
    setCanvasTextNotes([])
    setNoteDraft('')
    setQuoteDraft('')
    setEditingNoteId(null)
    setLinkedNoteContext(null)
    setNotesOpen(false)
    setSelection(null)
  }

  const hasAnyAnnotations =
    annotations.length > 0 || drawStrokes.length > 0 || notes.length > 0 || canvasTextNotes.length > 0

  return (
    <div className="flex h-dvh min-h-[620px] flex-col overflow-hidden bg-slate-50 text-slate-900">
      <AppHeader compact onHomeClick={onExit} />
      <div className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" className="size-9 shrink-0 rounded-lg text-slate-600" onClick={onExit} aria-label="Exit test">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">{exam.title}</p>
            <p className="text-xs text-slate-500">
              {exam.mode === 'test' ? 'IELTS Academic Reading' : 'Practice'} · {exam.questions.length}{' '}
              {exam.questions.length === 1 ? 'question' : 'questions'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Compact Draw / Eraser / Transparent Textbox Note tools */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 p-1">
            <button
              type="button"
              onClick={() => handleToolChange('draw')}
              aria-pressed={toolMode === 'draw'}
              title="Vẽ tự do"
              className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold transition ${
                toolMode === 'draw' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              <Pencil className="size-3.5" />
              <span className="hidden md:inline">Draw</span>
            </button>

            {toolMode === 'draw' && (
              <div className="flex items-center gap-1 px-1">
                {DRAW_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    aria-label={`Draw ${color.name}`}
                    title={color.name}
                    onClick={() => setDrawColor(color.value)}
                    className={`size-4 rounded-full border border-slate-300 transition hover:scale-110 ${
                      drawColor === color.value ? 'ring-2 ring-sky-600 ring-offset-1' : ''
                    }`}
                    style={{ backgroundColor: color.value }}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => handleToolChange('eraser')}
              aria-pressed={toolMode === 'eraser'}
              title="Cục tẩy tròn 1cm / Kéo hình chữ nhật để xóa"
              className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold transition ${
                toolMode === 'eraser' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              <Eraser className="size-3.5" />
              <span className="hidden md:inline">Eraser</span>
            </button>

            {toolMode === 'eraser' && hasAnyAnnotations && (
              <button
                type="button"
                onClick={handleEraseAll}
                title="Xóa tất cả ghi chú và nét vẽ"
                className="inline-flex h-7 items-center gap-1 rounded-md bg-rose-100 px-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-200"
              >
                <Trash2 className="size-3" /> All
              </button>
            )}

            <button
              type="button"
              onClick={() => handleToolChange('note')}
              aria-pressed={toolMode === 'note'}
              title="Vẽ khung Textbox Note trong suốt lên bài đọc/câu hỏi"
              className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold transition ${
                toolMode === 'note' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              <TextSelect className="size-3.5" />
              <span className="hidden md:inline">Textbox</span>
            </button>
          </div>

          <div
            className={`inline-flex min-w-[100px] items-center justify-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-sm font-bold tabular-nums ${
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

          <Button variant="outline" size="sm" onClick={startNewNote} aria-label="Open study notes" className="h-9 rounded-lg border-slate-200 px-2.5 sm:px-3">
            <StickyNote className="size-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Notes</span>
            <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-[10px]">{notes.length + canvasTextNotes.length}</span>
          </Button>

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
              {isPaused ? <Play className="size-4 sm:mr-1.5" /> : <Pause className="size-4 sm:mr-1.5" />}
              <span className="hidden sm:inline">{isPaused ? 'Resume' : 'Pause timer'}</span>
            </Button>
          )}

          <Button size="sm" onClick={handleSubmitClick} disabled={submitting} className="h-9 rounded-lg bg-sky-600 px-3 text-white hover:bg-sky-700 sm:px-4">
            <Send className="size-4 sm:mr-1.5" />
            <span className="hidden sm:inline">{submitting ? 'Submitting' : 'Submit'}</span>
          </Button>
        </div>
      </div>

      <div ref={splitterRef} className="exam-workspace relative grid min-h-0 w-full flex-1 overflow-hidden" style={{ gridTemplateColumns: `${split}fr 8px ${100 - split}fr` }}>
        {/* Left Pane: Reading Passage */}
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

          <div className="relative w-full px-8 py-6">
            <div
              ref={passageRef}
              className={`rich-content text-[15px] leading-[1.9] ${toolMode === 'select' ? 'selection:bg-yellow-200/80' : 'select-none'}`}
              onMouseUp={() => toolMode === 'select' && selectText('passage')}
              onKeyUp={() => toolMode === 'select' && selectText('passage')}
              onClick={handlePaneClick}
              dangerouslySetInnerHTML={{ __html: currentPassageHtml }}
            />
            {!currentPassage.content && (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Reading passage content is being updated.
              </p>
            )}

            {/* Freehand Draw SVG layer */}
            <svg
              ref={passageSvgRef}
              className={`absolute inset-0 h-full w-full ${
                toolMode === 'draw' ? 'pointer-events-auto z-20 cursor-crosshair touch-none' : 'pointer-events-none z-10'
              }`}
              onPointerDown={handleDrawStart('passage')}
              onPointerMove={handleDrawMove}
              onPointerUp={handleDrawEnd}
              onPointerCancel={handleDrawEnd}
            >
              {passageStrokes.map((stroke) => (
                <path
                  key={stroke.id}
                  d={pointsToPath(stroke.points)}
                  stroke={stroke.color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ))}
            </svg>

            {/* Note Textbox Draw Overlay */}
            {toolMode === 'note' && (
              <div
                className="pointer-events-auto absolute inset-0 z-20 cursor-crosshair touch-none"
                onPointerDown={handleNoteBoxDrawStart('passage')}
                onPointerMove={handleNoteBoxDrawMove('passage')}
                onPointerUp={handleNoteBoxDrawEnd('passage')}
                onPointerCancel={handleNoteBoxDrawEnd('passage')}
              >
                {drawingNoteRect?.pane === 'passage' && (
                  <div
                    style={{
                      left: drawingNoteRect.x,
                      top: drawingNoteRect.y,
                      width: drawingNoteRect.width,
                      height: drawingNoteRect.height,
                    }}
                    className="pointer-events-none absolute rounded-lg border-2 border-dashed border-sky-500 bg-sky-500/5"
                  />
                )}
              </div>
            )}

            {/* Eraser Overlay (1cm circle + drag rectangle) */}
            {toolMode === 'eraser' && (
              <div
                className="pointer-events-auto absolute inset-0 z-20 cursor-none touch-none"
                onPointerDown={handleEraserPointerDown('passage')}
                onPointerMove={handleEraserPointerMove('passage')}
                onPointerUp={handleEraserPointerUp('passage')}
                onPointerCancel={handleEraserPointerUp('passage')}
                onPointerLeave={() => {
                  if (!eraserDragStartRef.current) setEraserClientPos(null)
                }}
              >
                {eraserRect?.pane === 'passage' && (eraserRect.width >= 4 || eraserRect.height >= 4) && (
                  <div
                    style={{
                      left: eraserRect.x,
                      top: eraserRect.y,
                      width: eraserRect.width,
                      height: eraserRect.height,
                    }}
                    className="pointer-events-none absolute border-2 border-dashed border-rose-500 bg-rose-500/15"
                  />
                )}
              </div>
            )}

            {/* Drawn Transparent Textbox Notes on Passage */}
            {passageTextNotes.map((box) => (
              <TransparentNoteBox
                key={box.id}
                box={box}
                autoFocus={focusedNoteBoxId === box.id}
                onChange={updateCanvasTextNote}
                onDelete={deleteCanvasTextNote}
              />
            ))}
          </div>
        </section>

        {/* Splitter */}
        <div
          className="exam-divider group relative z-10 flex cursor-col-resize items-center justify-center bg-slate-100 outline-none transition hover:bg-sky-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
          role="separator"
          aria-label="Resize passage and questions panels"
          aria-orientation="vertical"
          aria-valuemin={40}
          aria-valuemax={75}
          aria-valuenow={Math.round(split)}
          tabIndex={0}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            updateSplit(event.clientX)
          }}
          onPointerMove={(event) => {
            if (event.buttons === 1) updateSplit(event.clientX)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') setSplit((value) => Math.max(40, value - 3))
            if (event.key === 'ArrowRight') setSplit((value) => Math.min(75, value + 3))
            if (event.key === 'Home') setSplit(40)
            if (event.key === 'End') setSplit(75)
          }}
        >
          <span className="h-10 w-1 rounded-full bg-slate-300 transition group-hover:bg-sky-400" />
        </div>

        {/* Right Pane: Questions */}
        <section ref={questionPaneRef} className="min-h-0 w-full overflow-y-auto bg-slate-50" aria-label="Questions">
          <div className="w-full px-2 py-3 sm:px-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Questions</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">Passage {currentPassage.passage_part}</p>
              </div>
              <span className="text-xs text-slate-500">
                {currentQuestions.filter((question) => isAnswered(answers[getAnswerKey(question.id)])).length}/{currentQuestions.length} answered
              </span>
            </div>

            <div className="relative w-full">
              <div
                ref={questionRef}
                className={`w-full space-y-3 ${toolMode === 'select' ? '' : 'select-none'}`}
                onMouseUp={() => toolMode === 'select' && selectText('questions')}
                onKeyUp={() => toolMode === 'select' && selectText('questions')}
                onClick={handlePaneClick}
              >
                {currentGroups.length ? (
                  currentGroups.map((group) => <QuestionGroupCard key={group.id} group={group} answers={answers} onAnswer={updateAnswer} />)
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                    No questions available for this passage yet.
                  </div>
                )}
              </div>

              {/* Freehand Draw SVG layer */}
              <svg
                ref={questionSvgRef}
                className={`absolute inset-0 h-full w-full ${
                  toolMode === 'draw' ? 'pointer-events-auto z-20 cursor-crosshair touch-none' : 'pointer-events-none z-10'
                }`}
                onPointerDown={handleDrawStart('questions')}
                onPointerMove={handleDrawMove}
                onPointerUp={handleDrawEnd}
                onPointerCancel={handleDrawEnd}
              >
                {questionStrokes.map((stroke) => (
                  <path
                    key={stroke.id}
                    d={pointsToPath(stroke.points)}
                    stroke={stroke.color}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ))}
              </svg>

              {/* Note Textbox Draw Overlay */}
              {toolMode === 'note' && (
                <div
                  className="pointer-events-auto absolute inset-0 z-20 cursor-crosshair touch-none"
                  onPointerDown={handleNoteBoxDrawStart('questions')}
                  onPointerMove={handleNoteBoxDrawMove('questions')}
                  onPointerUp={handleNoteBoxDrawEnd('questions')}
                  onPointerCancel={handleNoteBoxDrawEnd('questions')}
                >
                  {drawingNoteRect?.pane === 'questions' && (
                    <div
                      style={{
                        left: drawingNoteRect.x,
                        top: drawingNoteRect.y,
                        width: drawingNoteRect.width,
                        height: drawingNoteRect.height,
                      }}
                      className="pointer-events-none absolute rounded-lg border-2 border-dashed border-sky-500 bg-sky-500/5"
                    />
                  )}
                </div>
              )}

              {/* Eraser Overlay (1cm circle + drag rectangle) */}
              {toolMode === 'eraser' && (
                <div
                  className="pointer-events-auto absolute inset-0 z-20 cursor-none touch-none"
                  onPointerDown={handleEraserPointerDown('questions')}
                  onPointerMove={handleEraserPointerMove('questions')}
                  onPointerUp={handleEraserPointerUp('questions')}
                  onPointerCancel={handleEraserPointerUp('questions')}
                  onPointerLeave={() => {
                    if (!eraserDragStartRef.current) setEraserClientPos(null)
                  }}
                >
                  {eraserRect?.pane === 'questions' && (eraserRect.width >= 4 || eraserRect.height >= 4) && (
                    <div
                      style={{
                        left: eraserRect.x,
                        top: eraserRect.y,
                        width: eraserRect.width,
                        height: eraserRect.height,
                      }}
                      className="pointer-events-none absolute border-2 border-dashed border-rose-500 bg-rose-500/15"
                    />
                  )}
                </div>
              )}

              {/* Drawn Transparent Textbox Notes on Questions */}
              {questionTextNotes.map((box) => (
                <TransparentNoteBox
                  key={box.id}
                  box={box}
                  autoFocus={focusedNoteBoxId === box.id}
                  onChange={updateCanvasTextNote}
                  onDelete={deleteCanvasTextNote}
                />
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Visible 1cm diameter circular eraser indicator */}
      {toolMode === 'eraser' && eraserClientPos && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 rounded-full border-2 border-rose-500 bg-rose-500/15 shadow-xs"
          style={{
            width: '1cm',
            height: '1cm',
            left: eraserClientPos.x,
            top: eraserClientPos.y,
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}

      <footer className="z-20 shrink-0 border-t border-slate-200 bg-white px-3 py-1.5 sm:px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex shrink-0 items-center gap-1" role="tablist" aria-label="Select reading passage">
            {exam.passages.map((passage, index) => {
              const passageQuestions = exam.questions.filter((question) => question.passage_id === passage.id)
              const answered = passageQuestions.filter((question) => isAnswered(answers[getAnswerKey(question.id)])).length
              return (
                <button
                  key={passage.id}
                  type="button"
                  role="tab"
                  aria-selected={index === passageIndex}
                  onClick={() => setPassageIndex(index)}
                  className={`h-7 rounded-md px-2.5 text-[11px] font-bold tracking-wide transition ${
                    index === passageIndex ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  P{passage.passage_part}
                  <span className={`ml-1 font-medium ${index === passageIndex ? 'text-sky-100' : 'text-slate-400'}`}>
                    {answered}/{passageQuestions.length}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="h-5 w-px shrink-0 bg-slate-200" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Question navigation">
            {exam.questions.map((question, index) => {
              const answered = isAnswered(answers[getAnswerKey(question.id)])
              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => scrollToQuestion(getAnswerKey(question.id), question.passage_part)}
                  aria-label={`Go to question ${question.question_number}`}
                  aria-current={currentQuestions.some((item) => item.id === question.id) ? 'location' : undefined}
                  className={`flex size-6.5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition ${
                    answered
                      ? 'border-sky-600 bg-sky-600 text-white hover:bg-sky-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700'
                  }`}
                >
                  {question.question_number || index + 1}
                </button>
              )
            })}
          </div>
          <span className="hidden shrink-0 text-[11px] font-medium text-slate-500 sm:inline">
            {answeredCount}/{exam.questions.length} questions
          </span>
        </div>
      </footer>

      {/* Highlight bar: hidden until user selects text, then appears compactly above selection */}
      {selection && (
        <AnnotationToolbar
          position={{ top: selection.top, left: selection.left }}
          selectedColor={selectedColor}
          hasHighlight={selection.highlightIds.length > 0}
          onHighlight={applySelectedHighlight}
          onClear={clearSelectedHighlights}
          onNote={beginLinkedNote}
        />
      )}

      {pauseReason === 'auto' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-md" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="pause-title" className="w-full max-w-md rounded-2xl border border-white/70 bg-white/95 p-7 text-center shadow-2xl">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-sky-50 text-sky-700">
              <Pause className="size-6" />
            </div>
            <h2 id="pause-title" className="mt-4 text-xl font-bold text-slate-900">Test Paused</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The timer was automatically paused because you switched to another tab or application. Click resume to continue.
            </p>
            <Button onClick={() => setPauseReason(null)} className="mt-6 h-11 w-full rounded-lg bg-sky-600 text-white hover:bg-sky-700">
              <Play className="mr-2 size-4" /> Resume Test
            </Button>
          </div>
        </div>
      )}

      <StudyNotesDrawer
        open={notesOpen}
        anchorPosition={noteAnchor}
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
