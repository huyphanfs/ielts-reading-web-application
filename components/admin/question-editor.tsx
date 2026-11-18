'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Plus, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { ExamGroup, Question } from '@/lib/types'

const supabase = createClient()

type Choice = { value: string; label: string }

function toChoices(values: string[]): Choice[] {
  return values.map((label) => {
    const match = label.match(/^([A-E])\s*[.)\-:]/i)
    return { value: match?.[1]?.toUpperCase() ?? label, label }
  })
}

export function QuestionEditor({
  group,
  question,
  nextNumber,
  onSaved,
  onCancel,
}: {
  group: ExamGroup
  question?: Question | null
  nextNumber: number
  onSaved: () => void
  onCancel: () => void
}) {
  const [number, setNumber] = useState(String(question?.question_number ?? nextNumber))
  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const [optionsText, setOptionsText] = useState(() => {
    const values = Array.isArray(question?.options) ? question?.options : Array.isArray(group.shared_options) ? group.shared_options : []
    return values.map(String).join('\n')
  })
  const [singleAnswer, setSingleAnswer] = useState(() => Array.isArray(question?.accepted_answers) ? String(question?.accepted_answers[0] ?? '') : '')
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>(() => Array.isArray(question?.accepted_answers) ? question.accepted_answers.filter((item): item is string => typeof item === 'string') : [])
  const [textAnswers, setTextAnswers] = useState<string[]>(() => {
    const accepted = Array.isArray(question?.accepted_answers) ? question.accepted_answers.filter((item): item is string => typeof item === 'string') : []
    return [accepted[0] ?? '', accepted[1] ?? '', accepted[2] ?? '']
  })
  const [explanation, setExplanation] = useState(question?.explanation ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setNumber(String(question?.question_number ?? nextNumber))
    setQuestionText(question?.question_text ?? '')
    const values = Array.isArray(question?.options) ? question.options : Array.isArray(group.shared_options) ? group.shared_options : []
    setOptionsText(values.map(String).join('\n'))
    const accepted = Array.isArray(question?.accepted_answers) ? question.accepted_answers.filter((item): item is string => typeof item === 'string') : []
    setSingleAnswer(accepted[0] ?? '')
    setSelectedAnswers(accepted)
    setTextAnswers([accepted[0] ?? '', accepted[1] ?? '', accepted[2] ?? ''])
    setExplanation(question?.explanation ?? '')
    setError(null)
  }, [group.id, nextNumber, question?.id])

  const choices = useMemo(() => toChoices(optionsText.split('\n').map((item) => item.trim()).filter(Boolean)), [optionsText])

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    const questionNumber = Number(number)
    if (!Number.isInteger(questionNumber) || questionNumber < 1) {
      setError('Số câu phải là số nguyên lớn hơn 0.')
      return
    }
    const options = optionsText.split('\n').map((item) => item.trim()).filter(Boolean)
    const accepted = group.input_type === 'text_box'
      ? textAnswers.map((answer) => answer.trim()).filter(Boolean)
      : group.input_type === 'combo_box'
        ? (singleAnswer ? [singleAnswer] : [])
        : selectedAnswers

    if (!accepted.length) {
      setError('Hãy chọn hoặc nhập ít nhất một đáp án đúng.')
      return
    }
    if (group.input_type !== 'text_box' && !options.length) {
      setError('Thêm các lựa chọn vào danh sách, mỗi lựa chọn trên một dòng.')
      return
    }

    setSaving(true)
    const payload = {
      passage_id: group.passage_id,
      group_id: group.id,
      question_number: questionNumber,
      question_text: questionText.trim() || null,
      options: group.input_type === 'text_box' ? null : options,
      accepted_answers: accepted,
      explanation: explanation.trim() || null,
    }
    const result = question?.id
      ? await supabase.from('questions').update(payload).eq('id', question.id)
      : await supabase.from('questions').insert(payload)
    if (result.error) setError('Không thể lưu câu hỏi. Kiểm tra quyền quản trị và dữ liệu đã nhập.')
    else onSaved()
    setSaving(false)
  }

  return <form onSubmit={(event) => void save(event)} className="rounded-xl border border-sky-100 bg-sky-50/40 p-4">
    <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-bold text-slate-800">{question ? `Chỉnh sửa câu ${question.question_number}` : 'Thêm câu hỏi'}</p><button type="button" onClick={onCancel} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Đóng biểu mẫu"><X className="size-4" /></button></div>
    <div className="grid gap-3 sm:grid-cols-[110px_1fr]">
      <label className="text-xs font-semibold text-slate-600">Số câu<input type="number" min="1" value={number} onChange={(event) => setNumber(event.target.value)} required className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400" /></label>
      <label className="text-xs font-semibold text-slate-600">Nội dung câu hỏi (không bắt buộc)<textarea value={questionText} onChange={(event) => setQuestionText(event.target.value)} rows={2} className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400" /></label>
    </div>

    {group.input_type === 'text_box' ? <div className="mt-4 grid gap-3 sm:grid-cols-3">
      {textAnswers.map((answer, index) => <label key={index} className="text-xs font-semibold text-slate-600">Đáp án {index + 1}<input value={answer} onChange={(event) => setTextAnswers((current) => current.map((value, i) => i === index ? event.target.value : value))} placeholder="Có thể để trống" className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400" /></label>)}
      <p className="sm:col-span-3 text-[11px] leading-5 text-slate-500">Nhập tối đa ba cách viết tương đương. Không phân biệt hoa/thường khi chấm.</p>
    </div> : <div className="mt-4 space-y-3">
      <label className="block text-xs font-semibold text-slate-600">Các lựa chọn <span className="font-normal text-slate-400">(mỗi lựa chọn một dòng)</span><textarea value={optionsText} onChange={(event) => setOptionsText(event.target.value)} rows={4} placeholder={'A. Option one\nB. Option two\nC. Option three'} className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400" /></label>
      {group.input_type === 'combo_box' ? <label className="block text-xs font-semibold text-slate-600">Đáp án đúng<select value={singleAnswer} onChange={(event) => setSingleAnswer(event.target.value)} className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400"><option value="">Chọn một đáp án</option>{choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label> : <fieldset><legend className="text-xs font-semibold text-slate-600">Đáp án đúng (chọn tất cả đáp án cần thiết)</legend><div className="mt-2 flex flex-wrap gap-2">{choices.map((choice) => {
        const checked = selectedAnswers.includes(choice.value)
        return <label key={choice.value} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${checked ? 'border-sky-300 bg-white text-sky-800' : 'border-slate-200 bg-white text-slate-600'}`}><input type="checkbox" checked={checked} onChange={() => setSelectedAnswers((current) => checked ? current.filter((item) => item !== choice.value) : [...current, choice.value])} className="sr-only" /><span className={`flex size-4 items-center justify-center rounded border ${checked ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300'}`}>{checked && <Check className="size-3" />}</span>{choice.label}</label>
      })}</div></fieldset>}
    </div>}

    <label className="mt-4 block text-xs font-semibold text-slate-600">Giải thích<textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} rows={2} placeholder="Giải thích ngắn gọn vì sao đáp án đúng..." className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400" /></label>
    {error && <p role="alert" className="mt-3 text-xs text-rose-700">{error}</p>}
    <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={onCancel} className="rounded-lg">Hủy</Button><Button type="submit" size="sm" disabled={saving} className="rounded-lg bg-sky-600 text-white hover:bg-sky-700"><Save className="mr-1.5 size-3.5" />{saving ? 'Đang lưu' : 'Lưu câu hỏi'}</Button></div>
  </form>
}
