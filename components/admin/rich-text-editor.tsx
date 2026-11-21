'use client'

import { useEffect, useRef, useState } from 'react'
import { Bold, ImagePlus, Italic, List, Table2, Underline, AlignLeft, AlignCenter, AlignJustify } from 'lucide-react'
import DOMPurify from 'isomorphic-dompurify'
import { createClient } from '@/lib/supabase/client'
import { sanitizeHtml } from '@/lib/sanitize'
import { Button } from '@/components/ui/button'

const supabase = createClient()

const fontSizes = [
  { label: '12 px', value: '1' },
  { label: '13 px', value: '2' },
  { label: '14 px', value: '3' },
  { label: '15 px', value: '4' },
  { label: '16 px', value: '5' },
  { label: '18 px', value: '6' },
  { label: '20 px', value: '7' },
  { label: '24 px', value: '8' },
]

const blockFormats = [
  { label: 'Paragraph', tag: 'p' },
  { label: 'Heading 1', tag: 'h1' },
  { label: 'Heading 2', tag: 'h2' },
  { label: 'Heading 3', tag: 'h3' },
  { label: 'Blockquote', tag: 'blockquote' },
]

const textTones = [
  { label: 'Đen đậm', color: '#0f172a', swatch: 'bg-slate-900' },
  { label: 'Xám nhạt', color: '#64748b', swatch: 'bg-slate-400' },
  { label: 'Xanh nhấn', color: '#0284c7', swatch: 'bg-sky-600' },
  { label: 'Đỏ nhấn', color: '#dc2626', swatch: 'bg-red-600' },
] as const

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'BLOCKQUOTE',
  'PRE',
  'SECTION',
  'ARTICLE',
  'TABLE',
  'UL',
  'OL',
])

function cleanPastedHtml(rawHtml: string, plainFallback: string): string {
  if (typeof window === 'undefined') return rawHtml
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html')
  doc.querySelectorAll('script, style, meta, link, title, xml, o\\:p').forEach((el) => el.remove())

  // Chuyển <ol><li> và <ul><li> thành <p> có số thứ tự rõ ràng
  for (const list of Array.from(doc.body.querySelectorAll('ol, ul')).reverse()) {
    const isOrdered = list.tagName === 'OL'
    const startAttr = Number(list.getAttribute('start'))
    let num = Number.isFinite(startAttr) && startAttr > 0 ? Math.floor(startAttr) : 1
    const frag = doc.createDocumentFragment()

    for (const li of Array.from(list.children).filter((c) => c.tagName === 'LI')) {
      const valAttr = Number(li.getAttribute('value'))
      if (isOrdered && Number.isFinite(valAttr) && valAttr > 0) num = Math.floor(valAttr)

      const p = doc.createElement('p')
      while (li.firstChild) p.appendChild(li.firstChild)
      const txt = (p.textContent ?? '').replace(/^[\s\u00a0]+/, '')
      if (isOrdered) {
        if (!/^\(?\d{1,3}\)?\s*[.):\-]\s+/.test(txt)) {
          const strong = doc.createElement('strong')
          strong.textContent = `${num}. `
          p.insertBefore(strong, p.firstChild)
        }
        num += 1
      } else if (txt && !/^[•\-*▪–—]\s+/.test(txt)) {
        p.insertBefore(doc.createTextNode('• '), p.firstChild)
      }
      frag.appendChild(p)
    }
    list.replaceWith(frag)
  }

  // Chuyển <span style="..."> thành thẻ ngữ nghĩa
  for (const span of Array.from(doc.body.querySelectorAll('span')).reverse()) {
    const style = span.style
    const fw = style.fontWeight?.toLowerCase() || ''
    const isBold = fw === 'bold' || fw === 'bolder' || (Number.isFinite(Number(fw)) && Number(fw) >= 600)
    const isItalic = style.fontStyle?.toLowerCase() === 'italic'
    const isUnderline = (style.textDecoration || '').toLowerCase().includes('underline')

    let wrap: HTMLElement | null = null
    const applyWrap = (tag: string) => {
      const el = doc.createElement(tag)
      if (wrap) el.appendChild(wrap)
      else while (span.firstChild) el.appendChild(span.firstChild)
      wrap = el
    }
    if (isUnderline) applyWrap('u')
    if (isItalic) applyWrap('em')
    if (isBold) applyWrap('strong')
    if (wrap) span.replaceWith(wrap)
    else span.replaceWith(...Array.from(span.childNodes))
  }

  // Chuyển \n trong text node thành <br>
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const texts: Text[] = []
  let cur = walker.nextNode()
  while (cur) {
    texts.push(cur as Text)
    cur = walker.nextNode()
  }
  for (const t of texts) {
    const val = t.nodeValue ?? ''
    if (!val.includes('\n') && !val.includes('\r')) continue
    const parts = val.replace(/\r\n?/g, '\n').split('\n')
    const frag = doc.createDocumentFragment()
    parts.forEach((part, idx) => {
      if (part) frag.appendChild(doc.createTextNode(part))
      if (idx < parts.length - 1) frag.appendChild(doc.createElement('br'))
    })
    t.parentNode?.replaceChild(frag, t)
  }

  // Chuyển div/pre thành p và xóa style rác
  for (const div of Array.from(doc.body.querySelectorAll('div, section, article, pre')).reverse()) {
    const hasBlock = Array.from(div.children).some((c) => BLOCK_TAGS.has(c.tagName))
    if (hasBlock) {
      div.replaceWith(...Array.from(div.childNodes))
    } else {
      const p = doc.createElement('p')
      while (div.firstChild) p.appendChild(div.firstChild)
      div.replaceWith(p)
    }
  }
  doc.body.querySelectorAll('*').forEach((el) => {
    if (el.tagName !== 'IMG' && el.tagName !== 'TABLE') {
      el.removeAttribute('style')
    }
  })

  // Tách <p> có chứa <br> thành nhiều <p>
  for (const p of Array.from(doc.body.querySelectorAll('p'))) {
    if (!p.querySelector('br') || !p.parentNode) continue
    const segs: Node[][] = [[]]
    for (const child of Array.from(p.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName === 'BR') {
        segs.push([])
      } else {
        segs[segs.length - 1].push(child)
      }
    }
    const frag = doc.createDocumentFragment()
    for (const seg of segs) {
      if (!seg.some((n) => (n.textContent ?? '').trim().length > 0 || n.nodeType === Node.ELEMENT_NODE)) continue
      const newP = doc.createElement('p')
      seg.forEach((n) => newP.appendChild(n))
      frag.appendChild(newP)
    }
    p.parentNode.replaceChild(frag, p)
  }

  const sanitized = DOMPurify.sanitize(doc.body.innerHTML, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style', 'a'],
    FORBID_ATTR: ['class', 'id', 'srcdoc', 'color', 'face', 'bgcolor'],
  })
    .replace(/<p>\s*(?:&nbsp;|\u00a0|<br\s*\/?>)?\s*<\/p>/gi, '')
    .trim()

  const plainLines = plainFallback
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const htmlBlocks = (sanitized.match(/<(?:p|li|tr|h[1-6]|blockquote)\b/gi) || []).length

  if ((!sanitized || (plainLines.length >= 2 && htmlBlocks <= 1 && !/<(?:img|table)\b/i.test(sanitized))) && plainLines.length) {
    return plainLines
      .map((line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
      .join('')
  }

  return sanitized
}

export function RichTextEditor({
  value,
  onChange,
  minHeight = 180,
  label,
}: {
  value: string
  onChange: (value: string) => void
  minHeight?: number
  label: string
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const lastEmittedRef = useRef<string>(value)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (value === lastEmittedRef.current) return
    if (document.activeElement === editor) return
    const nextHtml = sanitizeHtml(value)
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml
    }
    lastEmittedRef.current = value
  }, [value])

  const emitChange = () => {
    if (!editorRef.current) return
    const html = editorRef.current.innerHTML
    lastEmittedRef.current = html
    onChange(html)
  }

  const command = (name: string, argument?: string) => {
    editorRef.current?.focus()
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p')
    } catch {
      // Ignore unsupported browsers
    }
    document.execCommand(name, false, argument)
    emitChange()
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.clipboardData.items || [])
    const imageItem = items.find((item) => item.type.startsWith('image/'))
    if (imageItem) {
      event.preventDefault()
      const file = imageItem.getAsFile()
      if (file) void uploadImage(file)
      return
    }

    event.preventDefault()
    const html = event.clipboardData.getData('text/html')
    const plain = event.clipboardData.getData('text/plain')
    const clean = cleanPastedHtml(html, plain)
    if (clean) {
      document.execCommand('insertHTML', false, clean)
      emitChange()
    }
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
    command('insertHTML', markup)
  }

  const uploadImage = async (file: File | undefined) => {
    setMessage(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setMessage('Chỉ hỗ trợ tệp hình ảnh.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Ảnh phải nhỏ hơn 5 MB.')
      return
    }

    setUploading(true)
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
    const path = `passages/${crypto.randomUUID()}.${extension}`
    const { error } = await supabase.storage.from('passage-images').upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    })
    if (error) {
      setMessage('Không thể tải ảnh lên. Hãy xác nhận tài khoản có quyền admin.')
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('passage-images').getPublicUrl(path)
    const image = document.createElement('img')
    image.src = data.publicUrl
    image.alt = file.name.replace(/\.[^.]+$/, '') || 'Hình minh họa'
    image.style.maxWidth = '100%'
    editorRef.current?.focus()
    document.execCommand('insertHTML', false, image.outerHTML)
    emitChange()
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2">
      <label className="sr-only" htmlFor={`${label}-font-family`}>Font chữ</label>
      <select id={`${label}-font-family`} aria-label="Chọn font chữ" onChange={(event) => command('fontName', event.target.value)} defaultValue="Arial" className="h-8 max-w-[145px] rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-sky-400">
        <option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Times New Roman">Times New Roman</option>
      </select>
      <label className="sr-only" htmlFor={`${label}-block-format`}>Định dạng khối</label>
      <select id={`${label}-block-format`} aria-label="Chọn định dạng đoạn văn" onChange={(event) => { if (event.target.value) command('formatBlock', event.target.value); event.target.selectedIndex = 0 }} defaultValue="" className="h-8 max-w-[130px] rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-sky-400">
        <option value="" disabled>Định dạng</option>
        {blockFormats.map((format) => <option key={format.tag} value={format.tag}>{format.label}</option>)}
      </select>
      <label className="sr-only" htmlFor={`${label}-font-size`}>Cỡ chữ</label>
      <select id={`${label}-font-size`} aria-label="Chọn cỡ chữ" onChange={(event) => command('fontSize', event.target.value)} defaultValue="4" className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-sky-400">
        {fontSizes.map((size) => <option key={size.value} value={size.value}>{size.label}</option>)}
      </select>
      <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
      <ToolbarButton label="In đậm" icon={<Bold className="size-4" />} onClick={() => command('bold')} />
      <ToolbarButton label="In nghiêng" icon={<Italic className="size-4" />} onClick={() => command('italic')} />
      <ToolbarButton label="Gạch chân" icon={<Underline className="size-4" />} onClick={() => command('underline')} />
      <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
      <div className="flex items-center gap-1 px-1" role="group" aria-label="Màu chữ đậm nhạt">
        {textTones.map((tone) => (
          <button
            key={tone.color}
            type="button"
            title={tone.label}
            aria-label={tone.label}
            onMouseDown={(event) => {
              event.preventDefault()
              command('foreColor', tone.color)
            }}
            className={`size-4 rounded-full border border-slate-300 transition hover:scale-110 ${tone.swatch}`}
          />
        ))}
      </div>
      <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
      <ToolbarButton label="Căn trái" icon={<AlignLeft className="size-4" />} onClick={() => command('justifyLeft')} />
      <ToolbarButton label="Căn giữa" icon={<AlignCenter className="size-4" />} onClick={() => command('justifyCenter')} />
      <ToolbarButton label="Căn đều" icon={<AlignJustify className="size-4" />} onClick={() => command('justifyFull')} />
      <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
      <ToolbarButton label="Danh sách" icon={<List className="size-4" />} onClick={() => command('insertUnorderedList')} />
      <ToolbarButton label="Chèn bảng" icon={<Table2 className="size-4" />} onClick={insertTable} />
      <ToolbarButton label={uploading ? 'Đang tải ảnh' : 'Nhập ảnh'} icon={<ImagePlus className="size-4" />} onClick={() => fileRef.current?.click()} disabled={uploading} />
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="Chọn hình ảnh để tải lên" onChange={(event) => void uploadImage(event.target.files?.[0])} />
      {uploading && <span className="px-1 text-xs text-sky-700" role="status">Đang tải ảnh…</span>}
    </div>
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={label}
      aria-multiline="true"
      onInput={emitChange}
      onPaste={handlePaste}
      className="rich-content prose prose-slate max-w-none overflow-y-auto break-words px-4 py-3 text-sm outline-none [overflow-wrap:anywhere] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400"
      style={{ minHeight }}
    />
    {message && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">{message}</p>}
  </div>
}

export function MiniRichTextEditor({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label: string
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const lastEmittedRef = useRef<string>(value)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (value === lastEmittedRef.current) return
    if (document.activeElement === editor) return
    const nextHtml = sanitizeHtml(value)
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml
    }
    lastEmittedRef.current = value
  }, [value])

  const emitChange = () => {
    if (!editorRef.current) return
    const html = editorRef.current.innerHTML
    lastEmittedRef.current = html
    onChange(html)
  }

  const command = (name: string, argument?: string) => {
    editorRef.current?.focus()
    document.execCommand(name, false, argument)
    emitChange()
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const html = event.clipboardData.getData('text/html')
    const plain = event.clipboardData.getData('text/plain')
    const clean = cleanPastedHtml(html, plain)
    if (clean) {
      document.execCommand('insertHTML', false, clean)
      emitChange()
    }
  }

  return (
    <div className="flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-sky-400">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50/80 px-1.5 py-1">
        <button
          type="button"
          title="In đậm"
          aria-label="In đậm"
          onMouseDown={(e) => { e.preventDefault(); command('bold') }}
          className="flex size-6 items-center justify-center rounded text-slate-600 hover:bg-sky-50 hover:text-sky-700"
        >
          <Bold className="size-3.5" />
        </button>
        <button
          type="button"
          title="In nghiêng"
          aria-label="In nghiêng"
          onMouseDown={(e) => { e.preventDefault(); command('italic') }}
          className="flex size-6 items-center justify-center rounded text-slate-600 hover:bg-sky-50 hover:text-sky-700"
        >
          <Italic className="size-3.5" />
        </button>
        <button
          type="button"
          title="Gạch chân"
          aria-label="Gạch chân"
          onMouseDown={(e) => { e.preventDefault(); command('underline') }}
          className="flex size-6 items-center justify-center rounded text-slate-600 hover:bg-sky-50 hover:text-sky-700"
        >
          <Underline className="size-3.5" />
        </button>
        <span className="mx-1 h-4 w-px bg-slate-200" />
        {textTones.map((tone) => (
          <button
            key={tone.color}
            type="button"
            title={tone.label}
            aria-label={tone.label}
            onMouseDown={(e) => { e.preventDefault(); command('foreColor', tone.color) }}
            className={`mx-0.5 size-3.5 rounded-full border border-slate-300 transition hover:scale-110 ${tone.swatch}`}
          />
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={label}
        data-placeholder={placeholder}
        onInput={emitChange}
        onPaste={handlePaste}
        className="min-h-[38px] break-words px-3 py-1.5 text-sm text-slate-800 outline-none [overflow-wrap:anywhere] empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] [&_em]:italic [&_strong]:font-bold [&_u]:underline"
      />
    </div>
  )
}

function ToolbarButton({ label, icon, onClick, disabled = false }: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="rounded-md text-slate-600 hover:bg-sky-50 hover:text-sky-700">{icon}</Button>
}
