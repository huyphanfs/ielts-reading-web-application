'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { ExamGroup, Question } from '@/lib/types'

const supabase = createClient()

type Choice = { value: string; label: string }

function getDefaultCategoryOptions(category: string): string[] {
  const normalized = category.toLowerCase()
  if (normalized.includes('true/false')) return ['TRUE', 'FALSE', 'NOT GIVEN']
  if (normalized.includes('yes/no')) return ['YES', 'NO', 'NOT GIVEN']
  return []
}

function resolveInitialOptions(group: ExamGroup, question?: Question | null): string[] {
  const questionOpts = Array.isArray(question?.options)
    ? question.options.map(String).map((item) => item.trim()).filter(Boolean)
    : []
  if (questionOpts.length) return questionOpts

  const sharedOpts = Array.isArray(group.shared_options)
    ? group.shared_options.map(String).map((item) => item.trim()).filter(Boolean)
    : []
  if (sharedOpts.length) return sharedOpts

  return getDefaultCategoryOptions(group.question_category)
}

function parseQuestionRange(range: string): number[] {
  if (!range.trim()) return []
  const cleaned = range.trim().replace(/\s/g, '')
  if (cleaned.includes('-')) {
    const [start, end] = cleaned.split('-').map(Number)
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    }
  }
  if (cleaned.includes(',')) {
    return cleaned.split(',').map(Number).filter((n) => Number.isFinite(n))
  }
  const single = Number(cleaned)
  return Number.isFinite(single) ? [single] : []
}

function toChoices(values: string[]): Choice[] {
  return values.map((label) => {
    const match = label.match(/^([A-Z])\s*[.)\-:]/i)
    return { value: match?.[1]?.toUpperCase() ?? label, label }
  })
}

function resolveSingleAnswer(choices: Choice[], accepted: string[]): string {
  const raw = accepted[0] ?? ''
  if (!raw) return ''
  const exact = choices.find((choice) => choice.value === raw)
  if (exact) return exact.value
  const caseInsensitive = choices.find((choice) => choice.value.toLowerCase() === raw.trim().toLowerCase())
  return caseInsensitive ? caseInsensitive.value : raw
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
  const isDefaultTfOrYn = getDefaultCategoryOptions(group.question_category).length > 0
  const isMatching = group.question_category.toLowerCase().includes('matching')
  const isTextInput = group.input_type === 'text_box' || isMatching

  const [number, setNumber] = useState(String(question?.question_number ?? nextNumber))
  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const [optionsText, setOptionsText] = useState(() => resolveInitialOptions(group, question).join('\n'))
  const [singleAnswer, setSingleAnswer] = useState(() => {
    const accepted = Array.isArray(question?.accepted_answers)
      ? question.accepted_answers.filter((item): item is string => typeof item === 'string')
      : []
    const initialChoices = toChoices(resolveInitialOptions(group, question))
    return resolveSingleAnswer(initialChoices, accepted)
  })
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>(() =>
    Array.isArray(question?.accepted_answers)
      ? question.accepted_answers.filter((item): item is string => typeof item === 'string')
      : [],
  )
  const [textAnswers, setTextAnswers] = useState<string[]>(() => {
    const accepted = Array.isArray(question?.accepted_answers)
      ? question.accepted_answers.filter((item): item is string => typeof item === 'string')
      : []
    return [accepted[0] ?? '', accepted[1] ?? '', accepted[2] ?? '']
  })
  const [explanation, setExplanation] = useState(question?.explanation ?? '')
  const [questionRange, setQuestionRange] = useState(() => {
    const accepted = Array.isArray(question?.accepted_answers)
      ? question.accepted_answers.filter((item): item is string => typeof item === 'string')
      : []
    const baseNum = question?.question_number ?? nextNumber
    return accepted.length > 1 ? `${baseNum}-${baseNum + accepted.length - 1}` : ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const baseNum = question?.question_number ?? nextNumber
    const resolvedOpts = resolveInitialOptions(group, question)
    const initialChoices = toChoices(resolvedOpts)
    const accepted = Array.isArray(question?.accepted_answers)
      ? question.accepted_answers.filter((item): item is string => typeof item === 'string')
      : []

    setNumber(String(baseNum))
    setQuestionText(question?.question_text ?? '')
    setOptionsText(resolvedOpts.join('\n'))
    setSingleAnswer(resolveSingleAnswer(initialChoices, accepted))
    setSelectedAnswers(accepted)
    setTextAnswers([accepted[0] ?? '', accepted[1] ?? '', accepted[2] ?? ''])
    setExplanation(question?.explanation ?? '')
    setQuestionRange(accepted.length > 1 ? `${baseNum}-${baseNum + accepted.length - 1}` : '')
    setError(null)
  }, [group.id, group.question_category, nextNumber, question?.id])

  const choices = useMemo(
    () => toChoices(optionsText.split('\n').map((item) => item.trim()).filter(Boolean)),
    [optionsText],
  )

  const handleRangeChange = (val: string) => {
    setQuestionRange(val)
    const nums = parseQuestionRange(val)
    if (nums.length > 0 && nums[0] > 0) {
      setNumber(String(nums[0]))
    }
  }

  const handleNumberChange = (val: string) => {
    setNumber(val)
    const n = Number(val)
    if (Number.isInteger(n) && n > 0 && selectedAnswers.length > 1) {
      setQuestionRange(`${n}-${n + selectedAnswers.length - 1}`)
    }
  }

  const toggleMultiAnswer = (choiceValue: string, checked: boolean) => {
    const next = checked ? selectedAnswers.filter((item) => item !== choiceValue) : [...selectedAnswers, choiceValue]
    setSelectedAnswers(next)
    const n = Number(number)
    if (Number.isInteger(n) && n > 0) {
      setQuestionRange(next.length > 1 ? `${n}-${n + next.length - 1}` : '')
    }
  }

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    const parsedNums = parseQuestionRange(questionRange)
    const questionNumber = parsedNums.length > 0 ? parsedNums[0] : Number(number)
    if (!Number.isInteger(questionNumber) || questionNumber < 1) {
      setError('Số câu phải là số nguyên lớn hơn 0.')
      return
    }
    const parsedOptions = optionsText.split('\n').map((item) => item.trim()).filter(Boolean)
    const options = parsedOptions.length ? parsedOptions : getDefaultCategoryOptions(group.question_category)
    const accepted = isTextInput
      ? textAnswers.map((answer) => answer.trim()).filter(Boolean)
      : group.input_type === 'combo_box'
        ? singleAnswer
          ? [singleAnswer]
          : []
        : selectedAnswers

    if (!accepted.length) {
      setError('Hãy chọn hoặc nhập ít nhất một đáp án đúng.')
      return
    }
    if (!isTextInput && !options.length) {
      setError('Thêm các lựa chọn vào danh sách, mỗi lựa chọn trên một dòng.')
      return
    }

    setSaving(true)
    const payload = {
      passage_id: group.passage_id,
      group_id: group.id,
      question_number: questionNumber,
      question_text: questionText.trim() || null,
      options: isTextInput ? null : options,
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

  return (
    <form onSubmit={(event) => void save(event)} className="rounded-xl border border-sky-100 bg-sky-50/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-800">{question ? `Chỉnh sửa câu ${question.question_number}` : 'Thêm câu hỏi'}</p>
        <button type="button" onClick={onCancel} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Đóng biểu mẫu">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[110px_1fr]">
        <label className="text-xs font-semibold text-slate-600">
          Số câu
          <input type="number" min="1" value={number} onChange={(event) => handleNumberChange(event.target.value)} required className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400" />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Nội dung câu hỏi (không bắt buộc)
          <textarea value={questionText} onChange={(event) => setQuestionText(event.target.value)} rows={2} className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400" />
        </label>
      </div>

      {isTextInput ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {textAnswers.map((answer, index) => (
            <label key={index} className="text-xs font-semibold text-slate-600">
              Đáp án {index + 1}
              <input value={answer} onChange={(event) => setTextAnswers((current) => current.map((value, i) => (i === index ? event.target.value : value)))} placeholder="Có thể để trống" className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400" />
            </label>
          ))}
          <p className="sm:col-span-3 text-[11px] leading-5 text-slate-500">
            {isMatching
              ? 'Nhập ký tự hoặc đáp án đối chiếu (vd: A, B, iv...). Không phân biệt chữ hoa/thường khi chấm.'
              : 'Nhập tối đa ba cách viết tương đương. Không phân biệt hoa/thường khi chấm.'}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-slate-600">
            Các lựa chọn{' '}
            <span className="font-normal text-slate-400">
              {isDefaultTfOrYn ? '(tự động mặc định theo nhóm câu hỏi)' : '(mỗi lựa chọn một dòng)'}
            </span>
            <textarea
              value={optionsText}
              onChange={(event) => setOptionsText(event.target.value)}
              rows={isDefaultTfOrYn ? 3 : 4}
              placeholder={'A. Option one\nB. Option two\nC. Option three'}
              className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
            />
          </label>
          {group.input_type === 'combo_box' ? (
            <label className="block text-xs font-semibold text-slate-600">
              Đáp án đúng
              <select value={singleAnswer} onChange={(event) => setSingleAnswer(event.target.value)} className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400">
                <option value="">Chọn một đáp án</option>
                {choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600">
                  Dải số câu liên kết <span className="font-normal text-slate-400">(vd: 25-26 hoặc 25, 26)</span>
                  <input value={questionRange} onChange={(event) => handleRangeChange(event.target.value)} placeholder="25-26" className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400" />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Số phương án học viên cần chọn
                  <input type="number" min="1" max="10" value={selectedAnswers.length || ''} readOnly className="mt-1.5 h-9 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 outline-none" />
                  <p className="mt-1 text-[11px] text-slate-400">Tự động đồng bộ với số đáp án đúng đã chọn</p>
                </label>
              </div>
              {(() => {
                const nums = parseQuestionRange(questionRange)
                const count = selectedAnswers.length
                const label =
                  nums.length > 1
                    ? `Liên kết ${nums.length} câu (Câu ${nums.join(', ')}) · Học viên phải chọn đúng ${count} phương án`
                    : count > 0
                      ? `Học viên phải chọn đúng ${count} phương án`
                      : 'Chọn đáp án đúng bên dưới'
                return <div className="inline-flex items-center gap-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">{label}</div>
              })()}
              <fieldset>
                <legend className="text-xs font-semibold text-slate-600">Đáp án đúng (chọn tất cả đáp án cần thiết)</legend>
                <div className="mt-2 flex flex-col gap-2">
                  {choices.map((choice) => {
                    const checked = selectedAnswers.includes(choice.value)
                    return (
                      <label key={choice.value} className={`relative inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${checked ? 'border-sky-300 bg-white text-sky-800' : 'border-slate-200 bg-white text-slate-600'}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleMultiAnswer(choice.value, checked)} className="absolute inset-0 m-0 size-full cursor-pointer opacity-0" />
                        <span className={`flex size-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300'}`}>{checked && <Check className="size-3" />}</span>
                        <span>{choice.label}</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            </div>
          )}
        </div>
      )}

      <label className="mt-4 block text-xs font-semibold text-slate-600">
        Giải thích
        <textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} rows={2} placeholder="Giải thích ngắn gọn vì sao đáp án đúng..." className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400" />
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} className="rounded-lg">Hủy</Button>
        <Button type="submit" disabled={saving} className="rounded-lg bg-sky-600 text-white hover:bg-sky-700">
          <Save className="mr-2 size-4" />
          {saving ? 'Đang lưu' : question ? 'Lưu thay đổi' : 'Thêm câu hỏi'}
        </Button>
      </div>
    </form>
  )
}
