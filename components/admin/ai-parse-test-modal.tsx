'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlignLeft,
  Bold,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  KeyRound,
  LoaderCircle,
  Save,
  Sparkles,
  Table2,
  Tag,
  TextQuote,
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

const AI_FONT_SIZES = [
  { label: '12 px', value: '1' },
  { label: '13 px', value: '2' },
  { label: '14 px', value: '3' },
  { label: '15 px', value: '4' },
  { label: '16 px', value: '5' },
  { label: '18 px', value: '6' },
  { label: '20 px', value: '7' },
] as const

function sanitizeRichPaste(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'img', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'blockquote', 'font'],
    ALLOWED_ATTR: ['src', 'alt', 'width', 'height', 'style', 'size'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a'],
    FORBID_ATTR: ['class', 'id', 'srcdoc', 'color', 'face', 'bgcolor', 'background'],
  })
  return clean
    .replace(/<div>/gi, '<p>')
    .replace(/<\/div>/gi, '</p>')
    .replace(/<p>\s*<\/p>/g, '')
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

  const toggleFirstLineIndent = () => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const sel = window.getSelection()
    let targetEl: HTMLElement | null = null
    if (sel && sel.rangeCount > 0) {
      const node = sel.anchorNode
      const el = node instanceof HTMLElement ? node : node?.parentElement
      targetEl = el?.closest('p, li, div, blockquote') as HTMLElement | null
    }
    if (targetEl && editor.contains(targetEl) && targetEl !== editor) {
      targetEl.style.textIndent = targetEl.style.textIndent === '2em' ? '' : '2em'
    } else {
      document.execCommand('indent')
    }
    onContentChange?.()
  }

  const insertTable = () => {
    const rows = Number(window.prompt('Số hàng (1–12):', '3'))
    if (!Number.isFinite(rows) || rows < 1) return
    const columns = Number(window.prompt('Số cột (1–8):', '3'))
    if (!Number.isFinite(columns) || columns < 1) return
    const safeRows = Math.min(12, Math.floor(rows))
    const safeColumns = Math.min(8, Math.floor(columns))
    const cells = '<td><br></td>'.repeat(safeColumns)
    const markup = `<table><tbody>${Array.from({ length: safeRows }, () => `<tr>${cells}</tr>`).join('')}</tbody></table><p><br></p>`
    exec('insertHTML', markup)
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
    if (plain && !el.querySelector('img') && !el.querySelector('table')) {
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
            <label className="sr-only" htmlFor={`${label}-font-size`}>Cỡ chữ</label>
            <select
              id={`${label}-font-size`}
              aria-label="Chọn cỡ chữ"
              defaultValue="3"
              onChange={(e) => exec('fontSize', e.target.value)}
              className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-sky-400"
            >
              {AI_FONT_SIZES.map((size) => (
                <option key={size.value} value={size.value}>
                  {size.label}
                </option>
              ))}
            </select>

            <span className="mx-1 h-5 w-px bg-slate-200" />
            <ToolbarButton icon={Bold} label="In đậm" onClick={() => exec('bold')} />
            <ToolbarButton icon={Italic} label="In nghiêng" onClick={() => exec('italic')} />
            <ToolbarButton icon={Underline} label="Gạch chân" onClick={() => exec('underline')} />
            <span className="mx-1 h-5 w-px bg-slate-200" />

            <ToolbarButton icon={TextQuote} label="Thụt đầu dòng đoạn văn (2em)" onClick={toggleFirstLineIndent} />
            <ToolbarButton icon={IndentIncrease} label="Thụt lề vào" onClick={() => exec('indent')} />
            <ToolbarButton icon={IndentDecrease} label="Giảm thụt lề" onClick={() => exec('outdent')} />
            <span className="mx-1 h-5 w-px bg-slate-200" />

            <ToolbarButton icon={Table2} label="Chèn bảng (Table)" onClick={insertTable} />
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
