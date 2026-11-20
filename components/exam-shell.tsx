'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  Clock3,
  GripVertical,
  Pause,
  Pen,
  Play,
  Send,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppHeader } from '@/components/app-header'
import { AnnotationToolbar, DRAW_COLORS, HIGHLIGHT_COLORS, type ToolMode } from '@/components/exam/annotation-toolbar'
import { QuestionGroupCard } from '@/components/exam/question-group'
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

type DrawStroke = {
  id: string
  color: string
  pane: 'passage' | 'questions'
  passageId: string
  points: { x: number; y: number }[]
}

type EdgeTextBox = {
  id: string
  pane: 'passage' | 'questions'
  passageId: string
  x: number
  y: number
  width: number
  text: string
  fontSize: number
  letterSpacing: number
  textColor: string
}

// 0.75 cm at 96 DPI = (0.75 * 96) / 2.54 = 28.35 px radius (1.5 cm diameter)
const ERASER_RADIUS_PX = (0.75 * 96) / 2.54

const EDGE_TEXT_COLORS = [
  { name: 'Đỏ', value: '#DC2626' },
  { name: 'Xanh dương', value: '#0284C7' },
  { name: 'Xanh lá', value: '#16A34A' },
  { name: 'Cam', value: '#EA580C' },
  { name: 'Đen', value: '#0F172A' },
] as const

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

function EdgeStyleTextBox({
  box,
  isSelected,
  onSelect,
  onChange,
  onDelete,
}: {
  box: EdgeTextBox
  isSelected: boolean
  onSelect: (id: string) => void
  onChange: (id: string, patch: Partial<EdgeTextBox>) => void
  onDelete: (id: string) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const draggingRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizingRef = useRef<{ startX: number; origW: number } | null>(null)
  const [colorMenuOpen, setColorMenuOpen] = useState(false)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(36, el.scrollHeight)}px`
  }, [box.text, box.width, box.fontSize, box.letterSpacing])

  useEffect(() => {
    if (isSelected) {
      textareaRef.current?.focus()
    } else {
      setColorMenuOpen(false)
    }
  }, [isSelected])

  return (
    <div
      data-edge-textbox-id={box.id}
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
        onSelect(box.id)
      }}
      onMouseUp={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      className="pointer-events-auto absolute z-30 select-none"
    >
      <div
        className={`relative flex items-stretch transition-colors ${
          isSelected
            ? 'rounded-[3px] border-2 border-dashed border-[#0078D4] bg-white/85 shadow-xs'
            : 'border-2 border-transparent bg-transparent hover:border-dashed hover:border-sky-300'
        }`}
      >
        {isSelected && (
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
            className="flex w-4 shrink-0 cursor-grab items-center justify-center bg-[#0078D4] text-white active:cursor-grabbing"
          >
            <GripVertical className="size-3" />
          </div>
        )}

        <textarea
          ref={textareaRef}
          rows={1}
          aria-label="Add text"
          placeholder="Start typing here..."
          value={box.text}
          onFocus={() => onSelect(box.id)}
          onChange={(e) => onChange(box.id, { text: e.target.value })}
          style={{
            fontSize: `${box.fontSize}px`,
            letterSpacing: `${box.letterSpacing}px`,
            color: box.textColor,
          }}
          className="min-h-[36px] w-full flex-1 resize-none overflow-hidden bg-transparent px-2.5 py-1.5 font-sans leading-snug outline-none placeholder:text-slate-400"
        />

        {isSelected && (
          <div
            title="Kéo để thay đổi chiều rộng"
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.stopPropagation()
              e.currentTarget.setPointerCapture(e.pointerId)
              resizingRef.current = {
                startX: e.clientX,
                origW: box.width,
              }
            }}
            onPointerMove={(e) => {
              const res = resizingRef.current
              if (!res) return
              onChange(box.id, {
                width: Math.max(140, res.origW + (e.clientX - res.startX)),
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
            className="absolute -right-2 top-1/2 size-3.5 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-[#0078D4] bg-white shadow-xs"
          />
        )}
      </div>

      {isSelected && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="relative mt-1.5 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-lg"
        >
          <div className="relative">
            <button
              type="button"
              title="Màu chữ"
              onClick={() => setColorMenuOpen((prev) => !prev)}
              className="flex h-7 items-center gap-1 rounded px-1.5 text-slate-700 hover:bg-slate-100"
            >
              <span className="flex flex-col items-center leading-none">
                <span className="text-[11px] font-bold">A</span>
                <span
                  className="mt-0.5 h-1 w-3.5 rounded-xs border border-slate-300"
                  style={{ backgroundColor: box.textColor }}
                />
              </span>
              <ChevronDown className="size-3 text-slate-500" />
            </button>

            {colorMenuOpen && (
              <div className="absolute left-0 top-full z-40 mt-1 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                {EDGE_TEXT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.name}
                    aria-label={c.name}
                    onClick={() => {
                      onChange(box.id, { textColor: c.value })
                      setColorMenuOpen(false)
                    }}
                    className={`size-5 rounded-full border border-slate-300 transition hover:scale-110 ${
                      box.textColor === c.value ? 'ring-2 ring-[#0078D4] ring-offset-1' : ''
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            )}
          </div>

          <span className="h-4 w-px bg-slate-200" />

          <button
            type="button"
            title="Tăng cỡ chữ"
            onClick={() => onChange(box.id, { fontSize: Math.min(32, box.fontSize + 2) })}
            className="flex h-7 items-center rounded px-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            A<sup className="text-[9px] font-bold">^</sup>
          </button>

          <button
            type="button"
            title="Giảm cỡ chữ"
            onClick={() => onChange(box.id, { fontSize: Math.max(11, box.fontSize - 2) })}
            className="flex h-7 items-center rounded px-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            A<sup className="text-[9px] font-bold">v</sup>
          </button>

          <span className="h-4 w-px bg-slate-200" />

          <button
            type="button"
            title="Tăng khoảng cách chữ"
            onClick={() => onChange(box.id, { letterSpacing: Math.min(8, Number((box.letterSpacing + 0.5).toFixed(1))) })}
            className="flex h-7 flex-col items-center justify-center rounded px-1.5 text-[10px] font-semibold leading-none text-slate-700 hover:bg-slate-100"
          >
            <span>AV</span>
            <span className="text-[9px] leading-none">↔</span>
          </button>

          <button
            type="button"
            title="Giảm khoảng cách chữ"
            onClick={() => onChange(box.id, { letterSpacing: Math.max(0, Number((box.letterSpacing - 0.5).toFixed(1))) })}
            className="flex h-7 flex-col items-center justify-center rounded px-1.5 text-[10px] font-semibold leading-none text-slate-700 hover:bg-slate-100"
          >
            <span>AV</span>
            <span className="text-[9px] leading-none">→←</span>
          </button>

          <span className="h-4 w-px bg-slate-200" />

          <button
            type="button"
            title="Xóa"
            aria-label="Xóa hộp văn bản"
            onClick={() => onDelete(box.id)}
            className="flex size-7 items-center justify-center rounded text-slate-600 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
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
  const [selectedColor, setSelectedColor] = useState<string>(HIGHLIGHT_COLORS[0].value)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [selection, setSelection] = useState<TextSelection | null>(null)
  const [toolMode, setToolMode] = useState<ToolMode>('select')
  const [pinnedToolbarPos, setPinnedToolbarPos] = useState<{ top: number; left: number } | null>(null)
  const [drawColor, setDrawColor] = useState<string>(DRAW_COLORS[0].value)
  const [drawStrokes, setDrawStrokes] = useState<DrawStroke[]>([])

  // Edge-style Add Text boxes
  const [edgeTextBoxes, setEdgeTextBoxes] = useState<EdgeTextBox[]>([])
  const [selectedTextBoxId, setSelectedTextBoxId] = useState<string | null>(null)

  // 0.75cm radius circular eraser state
  const [eraserClientPos, setEraserClientPos] = useState<{ x: number; y: number } | null>(null)
  const isErasingRef = useRef(false)

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
    await onSubmit(answers, elapsed, [])
  }, [answers, elapsed, onSubmit, submitting])

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
    setSelectedTextBoxId(null)
  }, [currentPassage.id])

  // Press Escape to exit Draw / Add Text / Erase mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && toolMode !== 'select') {
        setToolMode('select')
        setPinnedToolbarPos(null)
        setEraserClientPos(null)
        isErasingRef.current = false
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toolMode])

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
      top: Math.max(64, rect.top - 46),
      left: Math.max(160, Math.min(window.innerWidth - 160, rect.left + rect.width / 2)),
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
  const passageTextBoxes = edgeTextBoxes.filter((n) => n.pane === 'passage' && n.passageId === currentPassage.id)
  const questionTextBoxes = edgeTextBoxes.filter((n) => n.pane === 'questions' && n.passageId === currentPassage.id)

  const handleToolChange = useCallback(
    (mode: ToolMode) => {
      setToolMode((prev) => {
        const nextMode = prev === mode && mode !== 'select' ? 'select' : mode
        if (nextMode === 'select') {
          setPinnedToolbarPos(null)
        } else {
          setPinnedToolbarPos((currentPinned) =>
            selection
              ? { top: selection.top, left: selection.left }
              : currentPinned ?? { top: 108, left: Math.round(window.innerWidth / 2) },
          )
          setSelection(null)
          window.getSelection()?.removeAllRanges()
        }
        return nextMode
      })
      setEraserClientPos(null)
      isErasingRef.current = false
      setSelectedTextBoxId(null)
    },
    [selection],
  )

  const closeActiveTool = useCallback(() => {
    setToolMode('select')
    setPinnedToolbarPos(null)
    setEraserClientPos(null)
    isErasingRef.current = false
    setSelection(null)
  }, [])

  const getLocalPoint = (el: HTMLElement | SVGSVGElement, e: React.PointerEvent) => {
    const rect = el.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, rect }
  }

  // Freehand Draw handlers (fixed continuous stroke drawing)
  const handleDrawStart = (pane: 'passage' | 'questions') => (e: React.PointerEvent<SVGSVGElement>) => {
    if (toolMode !== 'draw' || e.button !== 0) return
    e.preventDefault()
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

  const handleDrawMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (toolMode !== 'draw' || !drawingStrokeRef.current) return
    const { x, y } = getLocalPoint(e.currentTarget, e)
    const strokeId = drawingStrokeRef.current.id
    setDrawStrokes((prev) =>
      prev.map((s) => (s.id === strokeId ? { ...s, points: [...s.points, { x, y }] } : s)),
    )
  }

  const handleDrawEnd = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drawingStrokeRef.current) drawingStrokeRef.current = null
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      // ignore
    }
  }

  // Edge Add Text placement handler
  const handleAddTextClick = (pane: 'passage' | 'questions') => (e: React.PointerEvent<HTMLDivElement>) => {
    if (toolMode !== 'text') return
    e.stopPropagation()
    const { x, y, rect } = getLocalPoint(e.currentTarget, e)
    const defaultWidth = 220
    const clampedX = Math.max(8, Math.min(Math.max(8, rect.width - defaultWidth - 16), x))
    const clampedY = Math.max(8, y - 14)

    const newBox: EdgeTextBox = {
      id: crypto.randomUUID(),
      pane,
      passageId: currentPassage.id,
      x: clampedX,
      y: clampedY,
      width: defaultWidth,
      text: '',
      fontSize: 15,
      letterSpacing: 0,
      textColor: '#DC2626',
    }

    setEdgeTextBoxes((prev) => [...prev, newBox])
    setSelectedTextBoxId(newBox.id)
    setToolMode('select')
    setPinnedToolbarPos(null)
  }

  const updateEdgeTextBox = useCallback((id: string, patch: Partial<EdgeTextBox>) => {
    setEdgeTextBoxes((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const deleteEdgeTextBox = useCallback((id: string) => {
    setEdgeTextBoxes((prev) => prev.filter((item) => item.id !== id))
    setSelectedTextBoxId((prev) => (prev === id ? null : prev))
  }, [])

  // Eraser: 0.75cm radius circle erases strokes, text boxes, and highlights on sweep
  const eraseAtCircle = useCallback(
    (pane: 'passage' | 'questions', clientX: number, clientY: number, containerRect: DOMRect) => {
      const lx = clientX - containerRect.left
      const ly = clientY - containerRect.top
      const R = ERASER_RADIUS_PX

      // 1. Erase intersecting freehand Draw strokes
      setDrawStrokes((prev) =>
        prev.flatMap((stroke) => {
          if (stroke.pane !== pane || stroke.passageId !== currentPassage.id) return [stroke]
          return splitStrokeByPredicate(stroke, (pt) => Math.hypot(pt.x - lx, pt.y - ly) <= R)
        }),
      )

      // 2. Erase intersecting Highlights
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
        }
      }

      // 3. Erase intersecting Add Text boxes
      setEdgeTextBoxes((prev) =>
        prev.filter((box) => {
          if (box.pane !== pane || box.passageId !== currentPassage.id) return true
          const approxHeight = Math.max(40, box.fontSize * 2.2)
          const closestX = Math.max(box.x, Math.min(lx, box.x + box.width))
          const closestY = Math.max(box.y, Math.min(ly, box.y + approxHeight))
          return Math.hypot(lx - closestX, ly - closestY) > R
        }),
      )
    },
    [currentPassage.id, rootForPane],
  )

  const handleEraserPointerDown = (pane: 'passage' | 'questions') => (e: React.PointerEvent<HTMLDivElement>) => {
    if (toolMode !== 'eraser') return
    e.currentTarget.setPointerCapture(e.pointerId)
    isErasingRef.current = true
    setEraserClientPos({ x: e.clientX, y: e.clientY })
    const { rect } = getLocalPoint(e.currentTarget, e)
    eraseAtCircle(pane, e.clientX, e.clientY, rect)
  }

  const handleEraserPointerMove = (pane: 'passage' | 'questions') => (e: React.PointerEvent<HTMLDivElement>) => {
    if (toolMode !== 'eraser') return
    setEraserClientPos({ x: e.clientX, y: e.clientY })
    if (!isErasingRef.current && e.buttons !== 1) return
    const { rect } = getLocalPoint(e.currentTarget, e)
    eraseAtCircle(pane, e.clientX, e.clientY, rect)
  }

  const handleEraserPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (toolMode !== 'eraser') return
    isErasingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const handleEraseAll = () => {
    for (const ann of annotations) {
      removeHighlight(rootForPane(ann.pane), ann.id)
    }
    setAnnotations([])
    setDrawStrokes([])
    setEdgeTextBoxes([])
    setSelectedTextBoxId(null)
    setSelection(null)
  }

  const hasAnyAnnotations =
    annotations.length > 0 || drawStrokes.length > 0 || edgeTextBoxes.length > 0

  const toolbarPosition = selection
    ? { top: selection.top, left: selection.left }
    : pinnedToolbarPos

  return (
    <div
      onPointerDown={() => setSelectedTextBoxId(null)}
      className="flex h-dvh min-h-[620px] flex-col overflow-hidden bg-slate-50 text-slate-900"
    >
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
          {/* Nút icon gọn mở nhanh thanh Highlight / Draw / Add Text / Erase */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              if (toolbarPosition) {
                closeActiveTool()
              } else {
                setPinnedToolbarPos({ top: 108, left: Math.round(window.innerWidth / 2) })
              }
            }}
            aria-label="Công cụ Highlight, Draw, Add Text, Erase"
            title="Highlight · Draw · Add Text · Erase"
            className={`size-9 rounded-lg ${
              toolbarPosition
                ? 'border-sky-300 bg-sky-50 text-sky-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Pen className="size-4" />
          </Button>

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

            {/* Add Text Click Overlay */}
            {toolMode === 'text' && (
              <div
                className="pointer-events-auto absolute inset-0 z-20 cursor-text touch-none"
                onPointerDown={handleAddTextClick('passage')}
              />
            )}

            {/* Eraser Overlay (0.75cm radius circle sweep) */}
            {toolMode === 'eraser' && (
              <div
                className="pointer-events-auto absolute inset-0 z-20 cursor-none touch-none"
                onPointerDown={handleEraserPointerDown('passage')}
                onPointerMove={handleEraserPointerMove('passage')}
                onPointerUp={handleEraserPointerUp}
                onPointerCancel={handleEraserPointerUp}
                onPointerLeave={() => {
                  isErasingRef.current = false
                  setEraserClientPos(null)
                }}
              />
            )}

            {/* Edge-style Text Boxes on Passage */}
            {passageTextBoxes.map((box) => (
              <EdgeStyleTextBox
                key={box.id}
                box={box}
                isSelected={selectedTextBoxId === box.id}
                onSelect={setSelectedTextBoxId}
                onChange={updateEdgeTextBox}
                onDelete={deleteEdgeTextBox}
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

              {/* Add Text Click Overlay */}
              {toolMode === 'text' && (
                <div
                  className="pointer-events-auto absolute inset-0 z-20 cursor-text touch-none"
                  onPointerDown={handleAddTextClick('questions')}
                />
              )}

              {/* Eraser Overlay (0.75cm radius circle sweep) */}
              {toolMode === 'eraser' && (
                <div
                  className="pointer-events-auto absolute inset-0 z-20 cursor-none touch-none"
                  onPointerDown={handleEraserPointerDown('questions')}
                  onPointerMove={handleEraserPointerMove('questions')}
                  onPointerUp={handleEraserPointerUp}
                  onPointerCancel={handleEraserPointerUp}
                  onPointerLeave={() => {
                    isErasingRef.current = false
                    setEraserClientPos(null)
                  }}
                />
              )}

              {/* Edge-style Text Boxes on Questions */}
              {questionTextBoxes.map((box) => (
                <EdgeStyleTextBox
                  key={box.id}
                  box={box}
                  isSelected={selectedTextBoxId === box.id}
                  onSelect={setSelectedTextBoxId}
                  onChange={updateEdgeTextBox}
                  onDelete={deleteEdgeTextBox}
                />
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Circular eraser indicator: radius = 0.75 cm (diameter = 1.5 cm) */}
      {toolMode === 'eraser' && eraserClientPos && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 rounded-full border-2 border-rose-500 bg-rose-500/15 shadow-xs"
          style={{
            width: '1.5cm',
            height: '1.5cm',
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

      {/* Unified Floating Highlight + Draw / Add Text / Erase Icon Toolbar */}
      {toolbarPosition && (
        <AnnotationToolbar
          position={toolbarPosition}
          selectedColor={selectedColor}
          hasSelection={Boolean(selection)}
          hasHighlight={Boolean(selection?.highlightIds.length)}
          toolMode={toolMode}
          drawColor={drawColor}
          hasAnyAnnotations={hasAnyAnnotations}
          onHighlight={applySelectedHighlight}
          onClearHighlight={clearSelectedHighlights}
          onToolChange={handleToolChange}
          onDrawColorChange={setDrawColor}
          onEraseAll={handleEraseAll}
          onClose={closeActiveTool}
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
    </div>
  )
}
