'use client'

import { useEffect, useRef, useState } from 'react'
import { Bold, Italic, Underline, LoaderCircle, Save, Sparkles, WrapText, X } from 'lucide-react'
import DOMPurify from 'isomorphic-dompurify'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { sanitizeHtml } from '@/lib/sanitize'
import type { LucideIcon } from 'lucide-react'

const supabase = createClient()

type ParsedQuestion = {
  question_number: number
  question_text: string | null
  options: string[] | null
  accepted_answers: string[]
  explanation: string | null
}

type ParsedGroup = {
  instruction: string
  question_category: string
  input_type: 'combo_box' | 'check_box' | 'text_box'
  shared_content: string | null
  shared_options: string[] | null
  questions: ParsedQuestion[]
}

type ParsedResult = {
  passageTitle: string
  duration_minutes: number
  question_groups: ParsedGroup[]
}

type AIParseResult = {
  passageTitle: string
  durationMinutes: number
  questionGroups: Array<{
    groupOrder: number
    instruction: string
    questionCategory: string
    inputType: ParsedGroup['input_type']
    sharedContent: string | null
    sharedOptions: string[] | null
  }>
  questions: Array<{
    groupOrder: number
    questionNumber: number
    questionText: string | null
    options: string[] | null
    correctAnswer: string[]
    explanation: string
  }>
}

function mapAIParseResult(result: AIParseResult): ParsedResult {
  return {
    passageTitle: result.passageTitle,
    duration_minutes: result.durationMinutes || 20,
    question_groups: result.questionGroups.map((group) => ({
      instruction: group.instruction,
      question_category: group.questionCategory,
      input_type: group.inputType,
      shared_content: group.sharedContent,
      shared_options: group.sharedOptions,
      questions: result.questions
        .filter((question) => question.groupOrder === group.groupOrder)
        .map((question) => ({
          question_number: question.questionNumber,
          question_text: question.questionText,
          options: question.options,
          accepted_answers: question.correctAnswer,
          explanation: question.explanation,
        })),
    })),
  }
}

const QUESTION_TYPES = [
  'True/False/Not Given',
  'Yes/No/Not Given',
  'Multiple Choice',
  'Matching Headings',
  'Matching Information',
  'Matching Features',
  'Sentence Completion',
  'Summary Completion',
  'Short Answer',
  'Diagram / Table / Flow-chart Completion',
] as const

function sanitizePaste(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style', 'span', 'div', 'font', 'table', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'a'],
    FORBID_ATTR: ['style', 'class', 'id', 'srcdoc', 'color', 'face', 'size', 'bgcolor', 'background'],
  })
  return clean
    .replace(/<div>/gi, '<p>')
    .replace(/<\/div>/gi, '</p>')
    .replace(/\s+/g, ' ')
    .replace(/<p>\s*<\/p>/gi, '')
    .trim()
}

function escapeHtmlText(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function plainTextToHtml(text: string): string {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim() ? `<p>${escapeHtmlText(line.trim())}</p>` : '<p><br></p>')
    .join('')
}

const questionRangePattern = /questions\s+\d+\s*[-–—]\s*\d+/i

function collectTextNodes(node: Node): Text[] {
  return Array.from(node.childNodes).flatMap((child) =>
    child.nodeType === Node.TEXT_NODE ? [child as Text] : collectTextNodes(child),
  )
}

function extractPassageHtmlBeforeQuestions(html: string) {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = sanitizePaste(html)
  const heading = Array.from(wrapper.querySelectorAll('p')).find((paragraph) =>
    questionRangePattern.test(paragraph.textContent ?? ''),
  )
  if (!heading) return sanitizePaste(html)

  const textNodes = collectTextNodes(heading)
  const headingText = textNodes.map((node) => node.textContent ?? '').join('')
  const match = questionRangePattern.exec(headingText)
  if (!match) return sanitizePaste(html)

  let remainingOffset = match.index
  let headingNode: Text | null = null
  let headingOffset = 0
  for (const textNode of textNodes) {
    const nodeLength = textNode.textContent?.length ?? 0
    if (remainingOffset <= nodeLength) {
      headingNode = textNode
      headingOffset = remainingOffset
      break
    }
    remainingOffset -= nodeLength
  }

  const range = document.createRange()
  range.selectNodeContents(wrapper)
  if (headingNode) range.setEnd(headingNode, headingOffset)
  else range.setEndBefore(heading)

  const passage = document.createElement('div')
  passage.append(range.cloneContents())
  return sanitizePaste(passage.innerHTML)
}

function splitPassageFromQuestions(html: string, text: string) {
  const normalizedText = text.replace(/\r/g, '')
  const lines = normalizedText.split('\n')
  const headingLineIndex = lines.findIndex((line) => questionRangePattern.test(line))

  if (headingLineIndex < 0) {
    return {
      passageHtml: sanitizePaste(html),
      passageText: '',
      questionText: normalizedText.trim(),
    }
  }

  const questionStart = lines.slice(0, headingLineIndex).join('\n').length + (headingLineIndex > 0 ? 1 : 0)
  return {
    passageHtml: extractPassageHtmlBeforeQuestions(html),
    passageText: normalizedText.slice(0, questionStart).trim(),
    questionText: normalizedText.slice(questionStart).trim(),
  }
}

function ToolbarButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={label}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-sky-50 hover:text-sky-700"
    >
      <Icon className="size-4" />
    </button>
  )
}

export function AIParseTestModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: (passageId: string) => void
}) {
  const [passageHtml, setPassageHtml] = useState('')
  const [parsing, setParsing] = useState(false)
  const [progressText, setProgressText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedResult | null>(null)
  const [targetPart, setTargetPart] = useState<1 | 2 | 3>(1)
  const [questionTypes, setQuestionTypes] = useState<string[]>([])
  const [autoDetectTypes, setAutoDetectTypes] = useState(true)
  const [questionCount, setQuestionCount] = useState(13)
  const [autoFormatOnPaste, setAutoFormatOnPaste] = useState(true)
  const editorRef = useRef<HTMLDivElement>(null)
  const progressTimerRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (!parsing) {
      setProgressText('')
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current)
        progressTimerRef.current = null
      }
      return
    }
    const steps = ['Đang tách bài đọc...', 'AI đang trích xuất câu hỏi...', 'AI đang phân tích đáp án...']
    let stepIndex = 0
    setProgressText(steps[0])
    progressTimerRef.current = window.setInterval(() => {
      stepIndex = (stepIndex + 1) % steps.length
      setProgressText(steps[stepIndex])
    }, 4000)
    return () => {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current)
        progressTimerRef.current = null
      }
    }
  }, [parsing])

  const exec = (command: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const plain = e.clipboardData.getData('text/plain')
    const cleanHtml = html
      ? sanitizePaste(html)
      : autoFormatOnPaste
        ? plainTextToHtml(plain)
        : `<p>${escapeHtmlText(plain.replace(/\r/g, '')).replace(/\n/g, '<br>')}</p>`
    if (cleanHtml) document.execCommand('insertHTML', false, cleanHtml)
  }

  const autoFormatParagraphs = () => {
    setAutoFormatOnPaste((enabled) => !enabled)
    editorRef.current?.focus()
    document.execCommand('formatBlock', false, 'p')
  }

  const toggleType = (type: string) => {
    setQuestionTypes((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type],
    )
  }

  const parseTest = async () => {
    setError(null)
    setParsed(null)
    const fullHtml = editorRef.current?.innerHTML ?? ''
    const fullText = editorRef.current?.innerText ?? ''
    if (fullText.trim().length < 50) {
      setError('Vui lòng dán nội dung bài thi (ít nhất 50 ký tự).')
      return
    }

    const { passageHtml: extractedPassage, passageText, questionText } = splitPassageFromQuestions(fullHtml, fullText)
    setPassageHtml(extractedPassage)

    setParsing(true)
    const controller = new AbortController()
    timeoutRef.current = window.setTimeout(() => controller.abort(), 45000)

    try {
      const res = await fetch('/api/ai-parse-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passageText,
          questionText,
          questionTypes: autoDetectTypes ? [] : questionTypes,
          questionCount,
        }),
        signal: controller.signal,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Không thể phân tích bài thi.')
      } else {
        setParsed(mapAIParseResult(data.result as AIParseResult))
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Hết thời gian chờ AI phản hồi (45 giây). Thử lại hoặc rút gọn nội dung.')
      } else {
        setError('Lỗi kết nối tới server. Kiểm tra mạng và thử lại.')
      }
    } finally {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      setParsing(false)
    }
  }

  const saveAll = async () => {
    if (!parsed) return
    setSaving(true)
    setError(null)
    try {
      const { data: passageData, error: passageError } = await supabase
        .from('passages')
        .insert({
          title: parsed.passageTitle || `Passage ${targetPart}`,
          content: sanitizeHtml(passageHtml),
          passage_part: targetPart,
          question_count: parsed.question_groups.reduce((sum, g) => sum + g.questions.length, 0),
          is_test_only: false,
          time_limit: parsed.duration_minutes || 20,
        })
        .select('id')
        .single()

      if (passageError || !passageData) {
        setError('Không thể tạo bài đọc. Kiểm tra quyền admin.')
        setSaving(false)
        return
      }

      const passageId = passageData.id

      for (let gi = 0; gi < parsed.question_groups.length; gi++) {
        const group = parsed.question_groups[gi]
        const { data: groupData, error: groupError } = await supabase
          .from('question_groups')
          .insert({
            passage_id: passageId,
            group_order: gi + 1,
            instruction: sanitizeHtml(group.instruction),
            question_category: group.question_category,
            input_type: group.input_type,
            shared_content: group.shared_content ? sanitizeHtml(group.shared_content) : null,
            shared_options: group.shared_options ?? null,
          })
          .select('id')
          .single()

        if (groupError || !groupData) {
          setError(`Không thể tạo nhóm câu hỏi ${gi + 1}.`)
          setSaving(false)
          return
        }

        const groupId = groupData.id
        const questionRows = group.questions.map((q) => ({
          passage_id: passageId,
          group_id: groupId,
          question_number: q.question_number,
          question_text: q.question_text?.trim() || null,
          options: q.options ?? null,
          accepted_answers: q.accepted_answers,
          explanation: q.explanation?.trim() || null,
        }))

        const { error: qError } = await supabase.from('questions').insert(questionRows)
        if (qError) {
          setError(`Không thể tạo câu hỏi cho nhóm ${gi + 1}.`)
          setSaving(false)
          return
        }
      }

      setParsed(null)
      setPassageHtml('')
      onSaved(passageId)
      onClose()
    } catch {
      setError('Lỗi không xác định khi lưu.')
    }
    setSaving(false)
  }

  const reset = () => {
    setParsed(null)
    setPassageHtml('')
    setError(null)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-parse-title"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-500 text-white">
              <Sparkles className="size-5" />
            </span>
            <div>
              <h2 id="ai-parse-title" className="text-lg font-bold text-slate-900">AI Tự Động Tạo Đề</h2>
              <p className="text-xs text-slate-500">Dán nội dung — AI trích xuất câu hỏi và đáp án nhanh chóng</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!parsed && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="text-xs font-semibold text-slate-600">
                  Gán Passage
                  <select
                    value={targetPart}
                    onChange={(e) => setTargetPart(Number(e.target.value) as 1 | 2 | 3)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400"
                  >
                    <option value={1}>Passage 1</option>
                    <option value={2}>Passage 2</option>
                    <option value={3}>Passage 3</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Số câu hỏi
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Math.max(1, Math.min(40, Number(e.target.value) || 13)))}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-sky-400"
                  />
                </label>
                <div className="flex items-end">
                  <label className="flex h-10 items-center gap-2 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={autoDetectTypes}
                      onChange={(e) => setAutoDetectTypes(e.target.checked)}
                      className="size-4 rounded border-slate-300 text-sky-600 focus:ring-sky-400"
                    />
                    Tự động nhận diện loại câu hỏi
                  </label>
                </div>
              </div>

              {!autoDetectTypes && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-600">Loại câu hỏi dự định</p>
                  <div className="flex flex-wrap gap-2">
                    {QUESTION_TYPES.map((type) => {
                      const active = questionTypes.includes(type)
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => toggleType(type)}
                          className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                            active
                              ? 'border-sky-300 bg-sky-50 text-sky-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {type}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-semibold text-slate-700">
                  Nội dung bài thi (Passage + Questions + Answer Keys)
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={autoFormatParagraphs}
                aria-pressed={autoFormatOnPaste}
                  className="h-8 rounded-lg border-sky-200 bg-sky-50/70 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                >
                  <WrapText className="mr-1.5 size-3.5" /> Tự động tách đoạn &amp; xuống dòng
                </Button>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
                  <ToolbarButton icon={Bold} label="In đậm" onClick={() => exec('bold')} />
                  <ToolbarButton icon={Italic} label="In nghiêng" onClick={() => exec('italic')} />
                  <ToolbarButton icon={Underline} label="Gạch chân" onClick={() => exec('underline')} />
                  <span className="mx-1 h-5 w-px bg-slate-200" />
                  <span className="px-1 text-xs text-slate-400">Bôi đen văn bản để định dạng</span>
                </div>
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  aria-label="Trình soạn thảo nội dung AI"
                  aria-multiline="true"
                      onPaste={handlePaste}
                  data-placeholder="Dán nội dung bài thi vào đây (Ctrl+V)..."
                  className="rich-content min-h-[260px] max-h-[420px] overflow-y-auto px-4 py-3 text-sm leading-relaxed text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400 [&:empty]:before:text-slate-400 [&:empty]:before:content-[attr(data-placeholder)]"
                />
              </div>

              <p className="text-xs text-slate-500">
                Mẹo: Dán văn bản từ PDF/Word — định dạng <strong>in đậm</strong> và <em>in nghiêng</em> được giữ nguyên. Nhấn <strong>Tự động tách đoạn</strong> để tách rõ các đoạn A, B, C.
              </p>
            </div>
          )}

          {parsed && (
            <div className="space-y-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-sky-600">Passage {targetPart}</p>
                    <h3 className="mt-1 text-base font-bold text-slate-900">{parsed.passageTitle || '(Không có tiêu đề)'}</h3>
                  </div>
                  <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {parsed.question_groups.reduce((s, g) => s + g.questions.length, 0)} câu · {parsed.duration_minutes || 20} phút
                  </span>
                </div>
                <div
                  className="rich-content mt-3 max-h-48 overflow-y-auto rounded-lg bg-white p-3 text-sm"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(passageHtml) }}
                />
              </div>

              {parsed.question_groups.map((group, gi) => (
                <div key={gi} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="rounded-md bg-sky-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-sky-700">
                      {group.question_category}
                    </span>
                    <span className="text-xs text-slate-500">{group.input_type} · {group.questions.length} câu</span>
                  </div>
                  {group.instruction && <p className="mb-2 text-xs font-medium text-slate-600">{group.instruction}</p>}
                  {group.shared_options && <div className="mb-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{group.shared_options.join(' | ')}</div>}
                  <ul className="space-y-1.5">
                    {group.questions.map((q) => (
                      <li key={q.question_number} className="flex items-start gap-2 text-sm">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700">
                          {q.question_number}
                        </span>
                        <div className="min-w-0 flex-1">
                          {q.question_text && <p className="text-slate-800">{q.question_text}</p>}
                          {q.options && <p className="mt-0.5 text-xs text-slate-500">{q.options.join(' | ')}</p>}
                          <p className="mt-0.5 text-xs font-semibold text-emerald-700">Đáp án: {q.accepted_answers.join(' / ')}</p>
                          {q.explanation && <p className="mt-0.5 text-xs text-slate-500">{q.explanation}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {error && <p role="alert" className="mt-4 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          {parsed ? (
            <>
              <Button variant="outline" onClick={reset} className="rounded-lg">Phân tích lại</Button>
              <Button onClick={() => void saveAll()} disabled={saving} className="rounded-lg bg-sky-600 text-white hover:bg-sky-700">
                {saving ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
                {saving ? 'Đang lưu...' : 'Lưu toàn bộ vào hệ thống'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} className="rounded-lg">Hủy</Button>
              <Button
                onClick={() => void parseTest()}
                disabled={parsing}
                className="rounded-lg bg-gradient-to-r from-sky-600 to-indigo-600 text-white hover:from-sky-700 hover:to-indigo-700"
              >
                {parsing ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                {parsing ? (progressText || 'AI đang phân tích...') : 'Phân tích bằng AI'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
