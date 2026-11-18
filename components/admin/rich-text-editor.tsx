'use client'

import { useEffect, useRef, useState } from 'react'
import { Bold, ImagePlus, Italic, List, Table2, Underline } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sanitizeHtml } from '@/lib/sanitize'
import { Button } from '@/components/ui/button'

const supabase = createClient()

const fontSizes = [
  { label: '12 px', value: '2' },
  { label: '14 px', value: '3' },
  { label: '16 px', value: '4' },
  { label: '18 px', value: '5' },
  { label: '24 px', value: '6' },
  { label: '32 px', value: '7' },
]

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
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || document.activeElement === editor || editor.innerHTML === value) return
    editor.innerHTML = sanitizeHtml(value)
  }, [value])

  const command = (name: string, argument?: string) => {
    editorRef.current?.focus()
    document.execCommand(name, false, argument)
    if (editorRef.current) onChange(editorRef.current.innerHTML)
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
    if (editorRef.current) onChange(editorRef.current.innerHTML)
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2">
      <label className="sr-only" htmlFor={`${label}-font-family`}>Font chữ</label>
      <select id={`${label}-font-family`} aria-label="Chọn font chữ" onChange={(event) => command('fontName', event.target.value)} defaultValue="Arial" className="h-8 max-w-[145px] rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-indigo-400">
        <option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Times New Roman">Times New Roman</option>
      </select>
      <label className="sr-only" htmlFor={`${label}-font-size`}>Cỡ chữ</label>
      <select id={`${label}-font-size`} aria-label="Chọn cỡ chữ" onChange={(event) => command('fontSize', event.target.value)} defaultValue="4" className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-indigo-400">
        {fontSizes.map((size) => <option key={size.value} value={size.value}>{size.label}</option>)}
      </select>
      <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
      <ToolbarButton label="In đậm" icon={<Bold className="size-4" />} onClick={() => command('bold')} />
      <ToolbarButton label="In nghiêng" icon={<Italic className="size-4" />} onClick={() => command('italic')} />
      <ToolbarButton label="Gạch chân" icon={<Underline className="size-4" />} onClick={() => command('underline')} />
      <ToolbarButton label="Danh sách" icon={<List className="size-4" />} onClick={() => command('insertUnorderedList')} />
      <ToolbarButton label="Chèn bảng" icon={<Table2 className="size-4" />} onClick={insertTable} />
      <ToolbarButton label={uploading ? 'Đang tải ảnh' : 'Nhập ảnh'} icon={<ImagePlus className="size-4" />} onClick={() => fileRef.current?.click()} disabled={uploading} />
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="Chọn hình ảnh để tải lên" onChange={(event) => void uploadImage(event.target.files?.[0])} />
      {uploading && <span className="px-1 text-xs text-indigo-700" role="status">Đang tải ảnh…</span>}
    </div>
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={label}
      aria-multiline="true"
      onInput={(event) => onChange(event.currentTarget.innerHTML)}
      className="rich-content prose prose-slate max-w-none overflow-y-auto px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
      style={{ minHeight }}
    />
    {message && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">{message}</p>}
  </div>
}

function ToolbarButton({ label, icon, onClick, disabled = false }: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="rounded-md text-slate-600 hover:bg-indigo-50 hover:text-indigo-700">{icon}</Button>
}
