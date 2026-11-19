'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlignLeft,
  Bold,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  ImagePlus,
  Italic,
  KeyRound,
  LoaderCircle,
  Save,
  Sparkles,
  Tag,
  Underline,
  X,
} from 'lucide-react'
import DOMPurify from 'isomorphic-dompurify'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { sanitizeHtml } from '@/lib/sanitize'
import {
  MAX_PASSAGE_TOPICS,
  PASSAGE_TOPICS,
  formatPassageTopics,
  parsePassageTopics,
} from '@/lib/types'
import type { PassageTopic } from '@/lib/types'
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

type ParsedQuestionsResponse = {
  passageTitle?: string
  suggested_topics?: string[]
  duration_minutes?: number
  question_groups?: ParsedGroup[]
}

type ParsedAnswersResponse = {
  answers?: Array<{
    question_number: number
    accepted_answers: string[]
    explanation: string | null
  }>
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

function sanitizeRichPaste(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'img', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['src', 'alt', 'width', 'height', 'style'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style', 'span', 'div', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a'],
    FORBID_ATTR: ['class', 'id', 'srcdoc', 'color', 'face', 'size', 'bgcolor', 'background'],
  })
  return clean
    .replace(/<div>/gi, '<p>')
    .replace(/<\/div>/gi, '</p>')
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
    .map((line) => (line.trim() ? `<p>${escapeHtmlText(line.trim())}</p>` : '<p><br></p>'))
    .join('')
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault()
        if (!disabled) onClick()
      }}
      title={label}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon className="size-4" />
    </button>
  )
}

function RichFormatTextBox({
  label,
  placeholder,
  editorRef,
  minHeight = 170,
  onContentChange,
}: {
  label: string
  placeholder: string
  editorRef: React.RefObject<HTMLDivElement | null>
  minHeight?: number
  onContentChange?: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [autoFormatOnPaste, setAutoFormatOnPaste] = useState(true)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    onContentChange?.()
  }

  const uploadAndInsertImage = async (file: File | undefined) => {
    setUploadError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setUploadError('Chỉ hỗ trợ tệp hình ảnh (PNG, JPG, WEBP, GIF).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Dung lượng ảnh tối đa là 5 MB.')
      return
    }

    setUploadingImage(true)
    try {
      const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
      const path = `passages/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage.from('passage-images').upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      })

      if (error) {
        setUploadError('Không thể tải ảnh lên Supabase Storage. Kiểm tra bucket "passage-images" và quyền admin.')
        setUploadingImage(false)
        return
      }

      const { data } = supabase.storage.from('passage-images').getPublicUrl(path)
      const img = document.createElement('img')
      img.src = data.publicUrl
      img.alt = file.name.replace(/\.[^.]+$/, '') || 'Hình minh họa'
      img.style.maxWidth = '100%'

      editorRef.current?.focus()
      document.execCommand('insertHTML', false, `${img.outerHTML}<p><br></p>`)
      onContentChange?.()
    } catch {
      setUploadError('Lỗi kết nối khi tải hình ảnh lên.')
    } finally {
      setUploadingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.clipboardData.items || [])
    const imageItem = items.find((item) => item.type.startsWith('image/'))
    if (imageItem) {
      e.preventDefault()
      const file = imageItem.getAsFile()
      if (file) void uploadAndInsertImage(file)
      return
    }

    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const plain = e.clipboardData.getData('text/plain')
    const cleanHtml = html
      ? sanitizeRichPaste(html)
      : autoFormatOnPaste
        ? plainTextToHtml(plain)
        : `<p>${escapeHtmlText(plain.replace(/\r/g, '')).replace(/\n/g, '<br>')}</p>`
    if (cleanHtml) {
      document.execCommand('insertHTML', false, cleanHtml)
      onContentChange?.()
    }
  }

  const autoFormatParagraphs = () => {
    setAutoFormatOnPaste((enabled) => !enabled)
    const el = editorRef.current
    if (!el) return
    el.focus()
    const plain = el.innerText.trim()
    if (plain && !el.querySelector('img')) {
      el.innerHTML = plainTextToHtml(plain)
      onContentChange?.()
    } else {
      document.execCommand('formatBlock', false, 'p')
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <ToolbarButton icon={Bold} label="In đậm" onClick={() => exec('bold')} />
            <ToolbarButton icon={Italic} label="In nghiêng" onClick={() => exec('italic')} />
            <ToolbarButton icon={Underline} label="Gạch chân" onClick={() => exec('underline')} />
            <span className="mx-1 h-5 w-px bg-slate-200" />
            <ToolbarButton
              icon={ImagePlus}
              label={uploadingImage ? 'Đang tải ảnh lên...' : 'Chèn hình ảnh'}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label={`Chọn hình ảnh cho ${label}`}
              onChange={(e) => void uploadAndInsertImage(e.target.files?.[0])}
            />
            {uploadingImage && (
              <span className="inline-flex items-center gap-1 px-1.5 text-xs font-medium text-sky-700">
                <LoaderCircle className="size-3.5 animate-spin" /> Đang tải ảnh...
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={autoFormatParagraphs}
            aria-pressed={autoFormatOnPaste}
            className="inline-flex h-7 items-center rounded-md border border-sky-200 bg-sky-50/80 px-2.5 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100"
          >
            <AlignLeft className="mr-1 size-3" /> Tự động tách đoạn &amp; xuống dòng
          </button>
        </div>

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label={label}
          aria-multiline="true"
          onInput={() => onContentChange?.()}
          onPaste={handlePaste}
          data-placeholder={placeholder}
          style={{ minHeight }}
          className="rich-content max-h-[300px] overflow-y-auto px-4 py-3 text-sm leading-relaxed text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400 [&:empty]:before:text-slate-400 [&:empty]:before:content-[attr(data-placeholder)]"
        />
      </div>

      {uploadError && (
        <p role="alert" className="rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
          {uploadError}
        </p>
      )}
    </div>
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
  // Cấu hình chung
  const [targetPart, setTargetPart] = useState<1 | 2 | 3>(1)
  const [passageTitle, setPassageTitle] = useState('')
  const [selectedTopics, setSelectedTopics] = useState<PassageTopic[]>([])
  const [durationMinutes, setDurationMinutes] = useState(20)
  const [questionCount, setQuestionCount] = useState(13)
  const [autoDetectTypes, setAutoDetectTypes] = useState(true)
  const [questionTypes, setQuestionTypes] = useState<string[]>([])

  // ID bài đọc đã tạo trên Supabase để liên kết 3 phần
  const [savedPassageId, setSavedPassageId] = useState<string | null>(null)

  // Refs cho 3 textbox độc lập
  const passageEditorRef = useRef<HTMLDivElement>(null)
  const questionsEditorRef = useRef<HTMLDivElement>(null)
  const answersEditorRef = useRef<HTMLDivElement>(null)

  // Trạng thái từng phần
  const [savingPassage, setSavingPassage] = useState(false)
  const [passageDone, setPassageDone] = useState(false)

  const [parsingQuestions, setParsingQuestions] = useState(false)
  const [questionsDone, setQuestionsDone] = useState(false)
  const [parsedGroups, setParsedGroups] = useState<ParsedGroup[]>([])

  const [parsingAnswers, setParsingAnswers] = useState(false)
  const [answersDone, setAnswersDone] = useState(false)
  const [matchedAnswersCount, setMatchedAnswersCount] = useState(0)

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setNotice(null)
  }, [open])

  const resetModalState = () => {
    setTargetPart(1)
    setPassageTitle('')
    setSelectedTopics([])
    setDurationMinutes(20)
    setQuestionCount(13)
    setAutoDetectTypes(true)
    setQuestionTypes([])
    setSavedPassageId(null)
    setPassageDone(false)
    setQuestionsDone(false)
    setParsedGroups([])
    setAnswersDone(false)
    setMatchedAnswersCount(0)
    setError(null)
    setNotice(null)
    if (passageEditorRef.current) passageEditorRef.current.innerHTML = ''
    if (questionsEditorRef.current) questionsEditorRef.current.innerHTML = ''
    if (answersEditorRef.current) answersEditorRef.current.innerHTML = ''
  }

  const handleCloseModal = () => {
    resetModalState()
    onClose()
  }

  const toggleTopic = (topicItem: PassageTopic) => {
    setPassageDone(false)
    setSelectedTopics((current) => {
      if (current.includes(topicItem)) {
        return current.filter((t) => t !== topicItem)
      }
      if (current.length >= MAX_PASSAGE_TOPICS) {
        return current
      }
      return [...current, topicItem]
    })
  }

  const toggleType = (type: string) => {
    setQuestionTypes((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type],
    )
  }

  // --- PHẦN 1: LƯU BÀI ĐỌC (PASSAGE + MAX 2 TOPICS) ---
  const handleSavePassage = async (): Promise<string | null> => {
    setError(null)
    setNotice(null)

    const rawHtml = passageEditorRef.current?.innerHTML ?? ''
    const plainText = passageEditorRef.current?.innerText?.trim() ?? ''
    const hasImage = Boolean(passageEditorRef.current?.querySelector('img'))

    if (plainText.length < 20 && !hasImage) {
      setError('Phần 1 (Bài đọc): Vui lòng nhập nội dung bài đọc hoặc chèn hình ảnh.')
      return null
    }

    const derivedTitle =
      passageTitle.trim() ||
      plainText.split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 120) ||
      `Passage ${targetPart}`

    setSavingPassage(true)
    try {
      const basePayload = {
        title: derivedTitle,
        content: sanitizeHtml(rawHtml),
        passage_part: targetPart,
        is_test_only: false,
        time_limit: Math.max(1, Number(durationMinutes) || 20),
      }
      const fullPayload = {
        ...basePayload,
        topic: formatPassageTopics(selectedTopics),
      }

      if (savedPassageId) {
        let updateRes = await supabase
          .from('passages')
          .update(fullPayload)
          .eq('id', savedPassageId)

        if (updateRes.error && updateRes.error.message?.toLowerCase().includes('topic')) {
          updateRes = await supabase
            .from('passages')
            .update(basePayload)
            .eq('id', savedPassageId)

          if (!updateRes.error) {
            setPassageTitle(derivedTitle)
            setPassageDone(true)
            setNotice(
              'Đã cập nhật bài đọc, nhưng bảng passages trên Supabase chưa có cột "topic". Hãy chạy SQL: alter table passages add column topic text;',
            )
            return savedPassageId
          }
        }

        if (updateRes.error) {
          setError('Không thể cập nhật bài đọc. Kiểm tra quyền admin.')
          return null
        }
        setPassageTitle(derivedTitle)
        setPassageDone(true)
        setNotice(
          selectedTopics.length
            ? `Đã cập nhật Phần 1 (Bài đọc) với chủ đề: ${selectedTopics.join(', ')}.`
            : 'Đã cập nhật nội dung Phần 1 (Bài đọc) lên hệ thống.',
        )
        return savedPassageId
      } else {
        let insertRes = await supabase
          .from('passages')
          .insert({ ...fullPayload, question_count: 0 })
          .select('id')
          .single()

        if (insertRes.error && insertRes.error.message?.toLowerCase().includes('topic')) {
          insertRes = await supabase
            .from('passages')
            .insert({ ...basePayload, question_count: 0 })
            .select('id')
            .single()

          if (!insertRes.error && insertRes.data) {
            setSavedPassageId(insertRes.data.id)
            setPassageTitle(derivedTitle)
            setPassageDone(true)
            setNotice(
              'Đã lưu bài đọc, nhưng bảng passages trên Supabase chưa có cột "topic". Hãy chạy SQL: alter table passages add column topic text;',
            )
            return insertRes.data.id
          }
        }

        if (insertRes.error || !insertRes.data) {
          setError('Không thể lưu bài đọc mới. Kiểm tra kết nối Supabase và quyền admin.')
          return null
        }
        setSavedPassageId(insertRes.data.id)
        setPassageTitle(derivedTitle)
        setPassageDone(true)
        setNotice(
          selectedTopics.length
            ? `Đã lưu xong Phần 1 (Bài đọc · Chủ đề: ${selectedTopics.join(', ')}). Bạn có thể tiếp tục Phần 2 hoặc Phần 3.`
            : 'Đã lưu xong Phần 1 (Bài đọc). Bạn có thể tiếp tục Phần 2 hoặc Phần 3.',
        )
        return insertRes.data.id
      }
    } finally {
      setSavingPassage(false)
    }
  }

  // --- PHẦN 2: AI TRÍCH XUẤT & LƯU CÂU HỎI ---
  const handleExtractQuestions = async () => {
    setError(null)
    setNotice(null)

    const qHtml = questionsEditorRef.current?.innerHTML ?? ''
    const qText = questionsEditorRef.current?.innerText?.trim() ?? ''
    const hasImage = Boolean(questionsEditorRef.current?.querySelector('img'))

    if (qText.length < 15 && !hasImage) {
      setError('Phần 2 (Câu hỏi): Vui lòng dán nội dung câu hỏi vào ô số 2.')
      return
    }

    let activePassageId = savedPassageId
    if (!activePassageId) {
      activePassageId = await handleSavePassage()
      if (!activePassageId) return
    }

    setParsingQuestions(true)
    try {
      const res = await fetch('/api/ai-parse-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'questions',
          questionContent: sanitizeHtml(qHtml),
          passageTitle,
          questionTypes: autoDetectTypes ? [] : questionTypes,
          questionCount,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Không thể phân tích câu hỏi.')
        return
      }

      const result = data.result as ParsedQuestionsResponse
      const groups = Array.isArray(result.question_groups) ? result.question_groups : []
      if (!groups.length) {
        setError('AI không tìm thấy nhóm câu hỏi nào. Hãy kiểm tra lại nội dung ô Câu hỏi.')
        return
      }

      const passageUpdates: Record<string, unknown> = {}
      if (!passageTitle.trim() && result.passageTitle?.trim()) {
        setPassageTitle(result.passageTitle.trim())
        passageUpdates.title = result.passageTitle.trim()
      }

      // Nếu admin chưa tự chọn Topic thì lấy tối đa 2 Topic do AI gợi ý
      let appliedTopics = selectedTopics
      if (selectedTopics.length === 0 && Array.isArray(result.suggested_topics) && result.suggested_topics.length > 0) {
        const aiTopics = parsePassageTopics(result.suggested_topics.join(', '))
        if (aiTopics.length > 0) {
          setSelectedTopics(aiTopics)
          appliedTopics = aiTopics
          passageUpdates.topic = formatPassageTopics(aiTopics)
        }
      }

      if (Object.keys(passageUpdates).length > 0) {
        await supabase
          .from('passages')
          .update(passageUpdates)
          .eq('id', activePassageId)
      }

      // Xóa câu hỏi/nhóm cũ của passage này (nếu chạy lại Phần 2) để tránh trùng lặp
      await supabase.from('questions').delete().eq('passage_id', activePassageId)
      await supabase.from('question_groups').delete().eq('passage_id', activePassageId)

      let totalInserted = 0
      for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi]
        const { data: groupData, error: groupError } = await supabase
          .from('question_groups')
          .insert({
            passage_id: activePassageId,
            group_order: gi + 1,
            instruction: sanitizeHtml(group.instruction ?? ''),
            question_category: group.question_category,
            input_type: group.input_type,
            shared_content: group.shared_content ? sanitizeHtml(group.shared_content) : null,
            shared_options: group.shared_options ?? null,
          })
          .select('id')
          .single()

        if (groupError || !groupData) {
          setError(`Lỗi khi lưu nhóm câu hỏi ${gi + 1} vào Supabase.`)
          return
        }

        const questionRows = (group.questions ?? []).map((q) => ({
          passage_id: activePassageId,
          group_id: groupData.id,
          question_number: q.question_number,
          question_text: q.question_text ? sanitizeHtml(q.question_text) : null,
          options: q.options ?? null,
          accepted_answers: Array.isArray(q.accepted_answers) ? q.accepted_answers : [],
          explanation: q.explanation ? sanitizeHtml(q.explanation) : null,
        }))

        if (questionRows.length) {
          const { error: qError } = await supabase.from('questions').insert(questionRows)
          if (qError) {
            setError(`Lỗi khi lưu danh sách câu hỏi nhóm ${gi + 1}.`)
            return
          }
          totalInserted += questionRows.length
        }
      }

      await supabase
        .from('passages')
        .update({ question_count: totalInserted })
        .eq('id', activePassageId)

      setParsedGroups(groups)
      setQuestionsDone(true)
      setAnswersDone(false)
      setNotice(
        appliedTopics.length > 0
          ? `Đã trích xuất và lưu ${totalInserted} câu hỏi (Chủ đề: ${appliedTopics.join(', ')}). Tiếp tục nhập Phần 3 (Đáp án & Giải thích).`
          : `Đã trích xuất và lưu ${totalInserted} câu hỏi cho Phần 2. Tiếp tục nhập Phần 3 (Đáp án & Giải thích).`,
      )
    } catch {
      setError('Lỗi kết nối tới server khi phân tích câu hỏi.')
    } finally {
      setParsingQuestions(false)
    }
  }

  // --- PHẦN 3: AI KHỚP ĐÁP ÁN & LƯU GIẢI THÍCH ---
  const handleExtractAnswers = async () => {
    setError(null)
    setNotice(null)

    if (!savedPassageId || !parsedGroups.length) {
      setError('Vui lòng hoàn thành Phần 2 (Trích xuất & Lưu câu hỏi) trước khi khớp đáp án.')
      return
    }

    const aHtml = answersEditorRef.current?.innerHTML ?? ''
    const aText = answersEditorRef.current?.innerText?.trim() ?? ''
    const hasImage = Boolean(answersEditorRef.current?.querySelector('img'))

    if (aText.length < 5 && !hasImage) {
      setError('Phần 3 (Đáp án & Giải thích): Vui lòng dán nội dung đáp án vào ô số 3.')
      return
    }

    const existingQuestions = parsedGroups.flatMap((g) =>
      g.questions.map((q) => ({
        question_number: q.question_number,
        question_category: g.question_category,
        question_text: q.question_text,
        options: q.options ?? g.shared_options,
      })),
    )

    setParsingAnswers(true)
    try {
      const res = await fetch('/api/ai-parse-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'answers',
          answerContent: sanitizeHtml(aHtml),
          existingQuestions,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Không thể phân tích đáp án & giải thích.')
        return
      }

      const result = data.result as ParsedAnswersResponse
      const answerItems = Array.isArray(result.answers) ? result.answers : []
      if (!answerItems.length) {
        setError('AI không trích xuất được đáp án nào từ nội dung ô số 3.')
        return
      }

      let updatedCount = 0
      const answerMap = new Map<number, { accepted_answers: string[]; explanation: string | null }>()

      for (const item of answerItems) {
        const cleanAnswers = Array.isArray(item.accepted_answers)
          ? item.accepted_answers.map((a) => String(a).trim()).filter(Boolean)
          : []
        const cleanExplanation = item.explanation ? sanitizeHtml(item.explanation) : null

        const { error: updateErr } = await supabase
          .from('questions')
          .update({
            accepted_answers: cleanAnswers,
            explanation: cleanExplanation,
          })
          .eq('passage_id', savedPassageId)
          .eq('question_number', item.question_number)

        if (!updateErr) {
          updatedCount += 1
          answerMap.set(item.question_number, {
            accepted_answers: cleanAnswers,
            explanation: cleanExplanation,
          })
        }
      }

      setParsedGroups((prev) =>
        prev.map((group) => ({
          ...group,
          questions: group.questions.map((q) => {
            const matched = answerMap.get(q.question_number)
            return matched
              ? {
                  ...q,
                  accepted_answers: matched.accepted_answers,
                  explanation: matched.explanation,
                }
              : q
          }),
        })),
      )

      setMatchedAnswersCount(updatedCount)
      setAnswersDone(true)
      setNotice(`Hoàn tất! Đã cập nhật đáp án & giải thích cho ${updatedCount}/${existingQuestions.length} câu hỏi.`)
    } catch {
      setError('Lỗi kết nối tới server khi phân tích đáp án.')
    } finally {
      setParsingAnswers(false)
    }
  }

  const handleFinish = () => {
    const createdId = savedPassageId
    resetModalState()
    if (createdId) {
      onSaved(createdId)
    }
    onClose()
  }

  if (!open) return null

  const totalExtractedQuestions = parsedGroups.reduce((sum, g) => sum + g.questions.length, 0)
  const reachedMaxTopics = selectedTopics.length >= MAX_PASSAGE_TOPICS

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleCloseModal()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-parse-title"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-500 text-white">
              <Sparkles className="size-5" />
            </span>
            <div>
              <h2 id="ai-parse-title" className="text-lg font-bold text-slate-900">
                AI Tự Động Tạo Đề (3 Phần Độc Lập)
              </h2>
              <p className="text-xs text-slate-500">
                Nhập từng phần Bài đọc · Câu hỏi · Đáp án &amp; Giải thích — hỗ trợ gán tối đa 2 Topic và chèn hình ảnh
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseModal}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto bg-slate-50/60 p-5">
          {/* Thanh cấu hình chung + Chọn tối đa 2 Topic */}
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-4">
              <label className="text-xs font-semibold text-slate-600">
                Gán Passage
                <select
                  value={targetPart}
                  onChange={(e) => {
                    setTargetPart(Number(e.target.value) as 1 | 2 | 3)
                    setPassageDone(false)
                  }}
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400"
                >
                  <option value={1}>Passage 1</option>
                  <option value={2}>Passage 2</option>
                  <option value={3}>Passage 3</option>
                </select>
              </label>

              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                Tiêu đề bài đọc
                <input
                  type="text"
                  value={passageTitle}
                  onChange={(e) => {
                    setPassageTitle(e.target.value)
                    setPassageDone(false)
                  }}
                  placeholder="Ví dụ: The History of Glass (để trống sẽ tự lấy dòng đầu)"
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-sky-400"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-600">
                  Số câu hỏi
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={questionCount}
                    onChange={(e) =>
                      setQuestionCount(Math.max(1, Math.min(40, Number(e.target.value) || 13)))
                    }
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-sky-400"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Phút
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={durationMinutes}
                    onChange={(e) => {
                      setDurationMinutes(Math.max(1, Math.min(90, Number(e.target.value) || 20)))
                      setPassageDone(false)
                    }}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-sky-400"
                  />
                </label>
              </div>
            </div>

            {/* Bộ chọn Chủ đề (Tối đa 2 Topic) */}
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <Tag className="size-3.5 text-indigo-600" />
                    Chủ đề bài đọc (Topic)
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      reachedMaxTopics
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Đã chọn {selectedTopics.length}/{MAX_PASSAGE_TOPICS}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-400">
                    {selectedTopics.length === 0
                      ? 'Có thể chọn tối đa 2 chủ đề hoặc để AI tự gợi ý'
                      : reachedMaxTopics
                        ? 'Đã đạt tối đa 2 chủ đề (bấm vào thẻ đang chọn để bỏ)'
                        : 'Có thể chọn thêm 1 chủ đề nữa'}
                  </span>
                  {selectedTopics.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTopics([])
                        setPassageDone(false)
                      }}
                      className="text-[11px] font-semibold text-rose-600 hover:text-rose-700"
                    >
                      Xóa chọn
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {PASSAGE_TOPICS.map((topicItem) => {
                  const isSelected = selectedTopics.includes(topicItem)
                  const isDisabled = !isSelected && reachedMaxTopics
                  return (
                    <button
                      key={topicItem}
                      type="button"
                      disabled={isDisabled}
                      aria-pressed={isSelected}
                      onClick={() => toggleTopic(topicItem)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs'
                          : isDisabled
                            ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 opacity-50'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700'
                      }`}
                    >
                      <Tag className="size-3" />
                      {topicItem}
                      {isSelected && <X className="ml-0.5 size-3" />}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* PHẦN 1: UPLOAD / NHẬP BÀI ĐỌC (PASSAGE)                      */}
          {/* ============================================================ */}
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-sky-100 text-xs font-bold text-sky-700">
                  1
                </span>
                <div>
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    <BookOpen className="size-4 text-sky-600" />
                    Phần 1: Nội dung Bài đọc (Passage)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Dán văn bản bài đọc, định dạng B/I/U hoặc chèn hình minh họa vào bài đọc
                  </p>
                </div>
              </div>

              {passageDone && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="size-3.5" /> Đã lưu bài đọc
                </span>
              )}
            </div>

            <RichFormatTextBox
              label="Nội dung Bài đọc"
              placeholder="Dán nội dung bài đọc (Passage) vào đây hoặc dán/tải hình ảnh..."
              editorRef={passageEditorRef}
              minHeight={180}
              onContentChange={() => setPassageDone(false)}
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-400">
                Mẹo: Có thể dán ảnh chụp màn hình trực tiếp bằng Ctrl+V.
              </span>
              <Button
                type="button"
                onClick={() => void handleSavePassage()}
                disabled={savingPassage}
                className="h-9 rounded-lg bg-sky-600 px-4 text-xs font-semibold text-white hover:bg-sky-700"
              >
                {savingPassage ? (
                  <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 size-3.5" />
                )}
                {savingPassage ? 'Đang lưu bài đọc...' : passageDone ? 'Cập nhật bài đọc' : 'Lưu bài đọc'}
              </Button>
            </div>
          </section>

          {/* ============================================================ */}
          {/* PHẦN 2: UPLOAD / NHẬP CÂU HỎI (QUESTIONS)                    */}
          {/* ============================================================ */}
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-100 text-xs font-bold text-indigo-700">
                  2
                </span>
                <div>
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    <HelpCircle className="size-4 text-indigo-600" />
                    Phần 2: Nội dung Câu hỏi (Questions)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Dán toàn bộ câu hỏi (Questions 1–13...), có thể chèn thêm hình sơ đồ/bảng biểu
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={autoDetectTypes}
                    onChange={(e) => setAutoDetectTypes(e.target.checked)}
                    className="size-3.5 rounded border-slate-300 text-sky-600"
                  />
                  Tự nhận diện dạng câu hỏi
                </label>

                {questionsDone && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="size-3.5" /> Đã lưu {totalExtractedQuestions} câu hỏi
                  </span>
                )}
              </div>
            </div>

            {!autoDetectTypes && (
              <div className="flex flex-wrap gap-1.5 rounded-lg bg-slate-50 p-2.5">
                {QUESTION_TYPES.map((type) => {
                  const active = questionTypes.includes(type)
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleType(type)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
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
            )}

            <RichFormatTextBox
              label="Nội dung Câu hỏi"
              placeholder="Dán danh sách câu hỏi (Questions 1–13...) vào đây..."
              editorRef={questionsEditorRef}
              minHeight={180}
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-400">
                AI sẽ tự chia nhóm câu hỏi, bảng điền từ và giữ nguyên hình ảnh đính kèm.
              </span>
              <Button
                type="button"
                onClick={() => void handleExtractQuestions()}
                disabled={parsingQuestions || savingPassage}
                className="h-9 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                {parsingQuestions ? (
                  <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 size-3.5" />
                )}
                {parsingQuestions ? 'AI đang trích xuất câu hỏi...' : 'AI trích xuất & Lưu câu hỏi'}
              </Button>
            </div>
          </section>

          {/* ============================================================ */}
          {/* PHẦN 3: UPLOAD / NHẬP ĐÁP ÁN & GIẢI THÍCH                   */}
          {/* ============================================================ */}
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-700">
                  3
                </span>
                <div>
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    <KeyRound className="size-4 text-emerald-600" />
                    Phần 3: Đáp án &amp; Giải thích (Answer Keys &amp; Explanations)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Dán đáp án và lời giải chi tiết (có thể chèn hình ảnh dẫn chứng trong bài)
                  </p>
                </div>
              </div>

              {answersDone && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="size-3.5" /> Đã khớp {matchedAnswersCount} đáp án
                </span>
              )}
            </div>

            <RichFormatTextBox
              label="Nội dung Đáp án & Giải thích"
              placeholder="Dán Answer Key & Giải thích chi tiết cho các câu hỏi vào đây..."
              editorRef={answersEditorRef}
              minHeight={160}
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-400">
                AI tự đối chiếu số thứ tự câu hỏi từ Phần 2 để gán đáp án &amp; giải thích chính xác.
              </span>
              <Button
                type="button"
                onClick={() => void handleExtractAnswers()}
                disabled={parsingAnswers || parsingQuestions || !questionsDone}
                className="h-9 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {parsingAnswers ? (
                  <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 size-3.5" />
                )}
                {parsingAnswers ? 'AI đang khớp đáp án...' : 'AI khớp đáp án & Lưu giải thích'}
              </Button>
            </div>
          </section>

          {/* Xem trước nhanh kết quả đã trích xuất */}
          {parsedGroups.length > 0 && (
            <section className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/40 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wide text-sky-800">
                Xem trước câu hỏi &amp; đáp án đã lưu ({totalExtractedQuestions} câu)
              </h4>
              <div className="space-y-3">
                {parsedGroups.map((group, gi) => (
                  <div key={gi} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="rounded bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                        {group.question_category}
                      </span>
                      <span className="text-xs text-slate-500">
                        {group.input_type} · {group.questions.length} câu
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {group.questions.map((q) => (
                        <li key={q.question_number} className="flex items-start gap-2 text-xs">
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-700">
                            {q.question_number}
                          </span>
                          <div className="min-w-0 flex-1">
                            {q.question_text && (
                              <div
                                className="question-rich-content text-slate-800"
                                dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) }}
                              />
                            )}
                            <p className="font-semibold text-emerald-700">
                              Đáp án:{' '}
                              {q.accepted_answers.length
                                ? q.accepted_answers.join(' / ')
                                : '(Chưa có — nhập ở Phần 3)'}
                            </p>
                            {q.explanation && (
                              <div
                                className="rich-content mt-0.5 text-slate-600"
                                dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.explanation) }}
                              />
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
              {error}
            </p>
          )}

          {notice && (
            <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
              {notice}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
          <span className="text-xs text-slate-500">
            {savedPassageId
              ? 'Dữ liệu đã được lưu tự động sau mỗi bước.'
              : 'Lưu Phần 1 trước hoặc bấm trực tiếp nút xử lý ở từng phần.'}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={handleCloseModal} className="rounded-lg">
              Đóng
            </Button>
            {savedPassageId && (
              <Button
                type="button"
                onClick={handleFinish}
                className="rounded-lg bg-sky-600 text-white hover:bg-sky-700"
              >
                <CheckCircle2 className="mr-1.5 size-4" /> Hoàn tất &amp; Mở bài đọc
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
