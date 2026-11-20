'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RichTextEditor } from '@/components/admin/rich-text-editor'
import { QuestionEditor } from '@/components/admin/question-editor'
import { createClient } from '@/lib/supabase/client'
import { sanitizeHtml } from '@/lib/sanitize'
import type { ExamGroup, Question } from '@/lib/types'

const supabase = createClient()
const categories = [
  'Matching Information to a Paragraph', 'Matching Headings', 'Matching Features',
  'True/False/Not Given', 'Yes/No/Not Given', 'Multiple Choice',
  'Summary Completion', 'Note Completion', 'Table Completion', 'Short Answer',
]

const DEFAULT_OPTIONS_BY_CATEGORY: Record<string, string[]> = {
  'True/False/Not Given': ['TRUE', 'FALSE', 'NOT GIVEN'],
  'Yes/No/Not Given': ['YES', 'NO', 'NOT GIVEN'],
}

function getDefaultInputTypeForCategory(category: string): ExamGroup['input_type'] {
  const normalized = category.toLowerCase()
  if (
    normalized.includes('true/false') ||
    normalized.includes('yes/no') ||
    normalized.includes('multiple choice')
  ) {
    return 'combo_box'
  }
  return 'text_box'
}

function getInitialSharedOptions(group: ExamGroup): string {
  if (Array.isArray(group.shared_options) && group.shared_options.length > 0) {
    return group.shared_options.map(String).join('\n')
  }
  const defaults = DEFAULT_OPTIONS_BY_CATEGORY[group.question_category]
  return defaults ? defaults.join('\n') : ''
}

type Props = { group: ExamGroup; onChanged: () => void }

export function QuestionGroupManager({ group, onChanged }: Props) {
  const [expanded, setExpanded] = useState(true)
  const [editing, setEditing] = useState<Question | null | 'new'>(null)
  const [instruction, setInstruction] = useState(group.instruction ?? '')
  const [category, setCategory] = useState(group.question_category)
  const [inputType, setInputType] = useState(group.input_type)
  const [sharedContent, setSharedContent] = useState(group.shared_content ?? '')
  const [sharedOptions, setSharedOptions] = useState(() => getInitialSharedOptions(group))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCategoryChange = (nextCategory: string) => {
    const prevDefaults = DEFAULT_OPTIONS_BY_CATEGORY[category]?.join('\n') ?? ''
    const nextDefaults = DEFAULT_OPTIONS_BY_CATEGORY[nextCategory]?.join('\n') ?? ''

    setCategory(nextCategory)
    setInputType(getDefaultInputTypeForCategory(nextCategory))

    if (nextDefaults) {
      if (!sharedOptions.trim() || sharedOptions.trim() === prevDefaults) {
        setSharedOptions(nextDefaults)
      }
    } else if (sharedOptions.trim() === prevDefaults) {
      setSharedOptions('')
    }
  }

  const saveGroup = async () => {
    setSaving(true)
    setError(null)
    const parsedOptions = sharedOptions.split('\n').map((value) => value.trim()).filter(Boolean)
    const options = parsedOptions.length ? parsedOptions : (DEFAULT_OPTIONS_BY_CATEGORY[category] ?? [])
    const { error: saveError } = await supabase.from('question_groups').update({
      instruction: sanitizeHtml(instruction),
      question_category: category,
      input_type: inputType,
      shared_content: sharedContent ? sanitizeHtml(sharedContent) : null,
      shared_options: options.length ? options : null,
    }).eq('id', group.id)
    if (saveError) setError('Không thể lưu nhóm câu hỏi. Kiểm tra quyền quản trị.')
    else onChanged()
    setSaving(false)
  }

  const deleteGroup = async () => {
    if (!window.confirm(`Xóa nhóm “${group.question_category}” và toàn bộ câu hỏi bên trong?`)) return
    setSaving(true)
    const { error: questionError } = await supabase.from('questions').delete().eq('group_id', group.id)
    const { error: groupError } = questionError
      ? { error: questionError }
      : await supabase.from('question_groups').delete().eq('id', group.id)
    if (groupError) setError('Không thể xóa nhóm câu hỏi.')
    else onChanged()
    setSaving(false)
  }

  const removeQuestion = async (question: Question) => {
    if (!window.confirm(`Xóa câu ${question.question_number}?`)) return
    const { error: deleteError } = await supabase.from('questions').delete().eq('id', question.id)
    if (deleteError) setError('Không thể xóa câu hỏi.')
    else onChanged()
  }

  const effectiveSharedOptions = (() => {
    const parsed = sharedOptions.split('\n').map((value) => value.trim()).filter(Boolean)
    return parsed.length ? parsed : (DEFAULT_OPTIONS_BY_CATEGORY[category] ?? [])
  })()

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="flex min-w-0 items-center gap-3 text-left">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-xs font-bold text-sky-700">{group.group_order}</span>
        <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900">{group.question_category}</span><span className="text-xs text-slate-500">{group.questions.length} câu · {group.input_type}</span></span>
        {expanded ? <ChevronUp className="size-4 text-slate-400" /> : <ChevronDown className="size-4 text-slate-400" />}
      </button>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={() => { setEditing('new'); setExpanded(true) }} className="h-8 rounded-lg border-slate-200 px-2.5"><Plus className="mr-1 size-3.5" />Câu hỏi</Button>
        <Button variant="ghost" size="icon-sm" onClick={() => void deleteGroup()} aria-label="Xóa nhóm câu hỏi" className="text-slate-400 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="size-4" /></Button>
      </div>
    </div>
    {expanded && <div className="space-y-5 p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">Phân loại<select value={category} onChange={(event) => handleCategoryChange(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400">{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Kiểu trả lời<select value={inputType} onChange={(event) => setInputType(event.target.value as typeof inputType)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400"><option value="combo_box">Combo box · chọn 1 đáp án</option><option value="check_box">Checkbox · chọn nhiều đáp án</option><option value="text_box">Text box · nhập đối chiếu / điền từ</option></select></label>
      </div>
      <div><label className="mb-2 block text-xs font-semibold text-slate-600">Hướng dẫn</label><RichTextEditor label={`Hướng dẫn ${group.group_order}`} value={instruction} onChange={setInstruction} minHeight={90} /></div>
      <div><label className="mb-2 block text-xs font-semibold text-slate-600">Nội dung dùng chung <span className="font-normal text-slate-400">— dùng [số câu] hoặc số câu + dấu chấm (vd: [7] hoặc 7 .......) để đặt ô nhập</span></label><RichTextEditor label={`Nội dung nhóm ${group.group_order}`} value={sharedContent} onChange={setSharedContent} minHeight={150} /></div>
      <label className="block text-xs font-semibold text-slate-600">Lựa chọn dùng chung <span className="font-normal text-slate-400">(mỗi lựa chọn một dòng, tự động điền với T/F/NG và Y/N/NG)</span><textarea value={sharedOptions} onChange={(event) => setSharedOptions(event.target.value)} rows={DEFAULT_OPTIONS_BY_CATEGORY[category] ? 3 : 2} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400" /></label>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      <div className="flex justify-end"><Button onClick={() => void saveGroup()} disabled={saving} size="sm" className="rounded-lg bg-sky-600 text-white hover:bg-sky-700"><Save className="mr-1.5 size-3.5" />{saving ? 'Đang lưu' : 'Lưu nhóm câu hỏi'}</Button></div>

      <div className="border-t border-slate-100 pt-4">
        <div className="mb-3 flex items-center justify-between"><h4 className="text-sm font-bold text-slate-900">Câu hỏi trong nhóm</h4><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{group.questions.length}</span></div>
        {editing && <div className="mb-4"><QuestionEditor
          group={{ ...group, question_category: category, input_type: inputType, shared_options: effectiveSharedOptions }}
          question={editing === 'new' ? null : editing}
          nextNumber={Math.max(0, ...group.questions.map((question) => question.question_number)) + 1}
          onSaved={() => { setEditing(null); onChanged() }}
          onCancel={() => setEditing(null)}
        /></div>}
        {group.questions.length ? <ul className="divide-y divide-slate-100">{group.questions.map((question) => <li key={question.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
          <div className="min-w-0"><div className="flex items-center gap-2"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[10px] font-bold text-sky-700">{question.question_number}</span><p className="truncate text-sm font-medium text-slate-800">{question.question_text || 'Câu hỏi trong nội dung dùng chung'}</p></div><p className="mt-1 pl-8 text-xs text-slate-500">Đáp án: {Array.isArray(question.accepted_answers) ? question.accepted_answers.join(' / ') : String(question.accepted_answers ?? '')}</p></div>
          <div className="flex shrink-0 gap-1"><Button variant="ghost" size="icon-sm" aria-label={`Sửa câu ${question.question_number}`} onClick={() => setEditing(question)}><Pencil className="size-3.5" /></Button><Button variant="ghost" size="icon-sm" aria-label={`Xóa câu ${question.question_number}`} onClick={() => void removeQuestion(question)} className="text-slate-400 hover:text-rose-700"><Trash2 className="size-3.5" /></Button></div>
        </li>)}</ul> : !editing && <p className="rounded-lg bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">Chưa có câu hỏi. Thêm câu hỏi đầu tiên để bắt đầu.</p>}
        {!editing && <Button variant="outline" size="sm" onClick={() => setEditing('new')} className="mt-3 rounded-lg border-dashed"><Plus className="mr-1.5 size-3.5" /> Thêm câu hỏi</Button>}
      </div>
    </div>}
  </section>
}
