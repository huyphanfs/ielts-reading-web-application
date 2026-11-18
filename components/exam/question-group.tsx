'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { sanitizeHtml } from '@/lib/sanitize'
import { readStringArray } from '@/lib/grading'
import type { ExamGroup, UserAnswer } from '@/lib/types'

function getOptions(question: ExamGroup['questions'][number], group: ExamGroup) {
  const raw = question.options ?? group.shared_options
  let items: Array<{ value: string; label: string }> = []

  if (Array.isArray(raw)) {
    items = raw.flatMap((item) => {
      if (typeof item === 'string') {
        const match = item.match(/^([A-E])\s*[.)\-:]/i)
        return [{ value: match?.[1]?.toUpperCase() ?? item, label: item }]
      }
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>
        const value = String(record.value ?? record.key ?? record.label ?? '')
        const label = String(record.label ?? record.text ?? value)
        return value ? [{ value, label }] : []
      }
      return []
    })
  } else if (raw && typeof raw === 'object') {
    items = Object.entries(raw as Record<string, unknown>).map(([value, label]) => ({ value, label: String(label) }))
  }

  if (items.length) return items
  const category = group.question_category.toLowerCase()
  if (category.includes('true/false')) return ['TRUE', 'FALSE', 'NOT GIVEN'].map((value) => ({ value, label: value }))
  if (category.includes('yes/no')) return ['YES', 'NO', 'NOT GIVEN'].map((value) => ({ value, label: value }))
  if (category.includes('matching information')) return ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((value) => ({ value, label: `Paragraph ${value}` }))
  if (category.includes('matching headings') || category.includes('matching features')) return ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((value) => ({ value, label: value }))
  return []
}

export function SharedContentAnswers({
  group,
  answers,
  onAnswer,
}: {
  group: ExamGroup
  answers: Record<string, UserAnswer>
  onAnswer: (questionId: string, answer: UserAnswer) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const markup = useMemo(() => {
    const safe = sanitizeHtml(group.shared_content)
    return safe.replace(/\[(\d+)\]/g, (placeholder, rawNumber: string) => {
      const question = group.questions.find((item) => item.question_number === Number(rawNumber))
      if (!question) return placeholder
      return `<span class="inline-question"><label for="question-${question.id}">${question.question_number}</label><input id="question-${question.id}" class="exam-input inline-question-input" data-question-id="${question.id}" type="text" aria-label="Câu ${question.question_number}" autocomplete="off" /></span>`
    })
  }, [group.shared_content, group.questions])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const inputs = root.querySelectorAll<HTMLInputElement>('.inline-question-input')
    const listeners: Array<() => void> = []
    inputs.forEach((input) => {
      const questionId = input.dataset.questionId
      if (!questionId) return
      const value = answers[questionId]
      input.value = Array.isArray(value) ? value.join(', ') : value ?? ''
      const handleInput = () => onAnswer(questionId, input.value)
      input.addEventListener('input', handleInput)
      listeners.push(() => input.removeEventListener('input', handleInput))
    })
    return () => listeners.forEach((remove) => remove())
  }, [answers, markup, onAnswer])

  if (!markup) return null
  return <div ref={rootRef} className="rich-content" dangerouslySetInnerHTML={{ __html: markup }} />
}

function ComboBox({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (value: string) => void
  ariaLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((opt) => opt.value === value)
  const filtered = useMemo(() => {
    if (!query.trim()) return options
    const q = query.trim().toLowerCase()
    return options.filter((opt) => opt.value.toLowerCase().includes(q) || opt.label.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectOption = (optValue: string) => {
    onChange(optValue)
    setOpen(false)
    setQuery('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered.length === 1) selectOption(filtered[0].value)
      else if (filtered.length > 1) selectOption(filtered[0].value)
    }
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
  }

  return <div ref={ref} className="relative max-w-[420px]">
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        aria-label={ariaLabel}
        value={open ? query : (selected?.label ?? '')}
        placeholder="Chọn hoặc gõ đáp án..."
        onFocus={() => setOpen(true)}
        onChange={(e) => { setOpen(true); setQuery(e.target.value); if (selected) onChange('') }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 pr-9 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
      />
      <ChevronDown className={`pointer-events-none absolute right-3 top-3 size-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
    </div>
    {open && (
      <ul role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
        {filtered.length ? filtered.map((opt) => (
          <li key={opt.value} role="option" aria-selected={opt.value === value}>
            <button
              type="button"
              onClick={() => selectOption(opt.value)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-sky-50 ${opt.value === value ? 'bg-sky-50 font-semibold text-sky-800' : 'text-slate-700'}`}
            >
              <span>{opt.label}</span>
              {opt.value === value && <Check className="size-4 text-sky-600" />}
            </button>
          </li>
        )) : <li className="px-3 py-2 text-sm text-slate-400">Không tìm thấy đáp án</li>}
      </ul>
    )}
  </div>
}

function QuestionControl({
  group,
  question,
  answer,
  onAnswer,
}: {
  group: ExamGroup
  question: ExamGroup['questions'][number]
  answer: UserAnswer | undefined
  onAnswer: (answer: UserAnswer) => void
}) {
  const options = getOptions(question, group)
  const selected = Array.isArray(answer) ? answer : []

  if (group.input_type === 'text_box') {
    return <input
      type="text"
      aria-label={`Đáp án câu ${question.question_number}`}
      value={typeof answer === 'string' ? answer : ''}
      onChange={(event) => onAnswer(event.target.value)}
      autoComplete="off"
      className="h-10 w-full max-w-[340px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
    />
  }

  if (group.input_type === 'combo_box') {
    return <ComboBox
      options={options}
      value={typeof answer === 'string' ? answer : ''}
      onChange={onAnswer}
      ariaLabel={`Chọn đáp án cho câu ${question.question_number}`}
    />
  }

  const maxSelection = getMaxSelection(group, question)
  const acceptedCount = readStringArray(question.accepted_answers).length
  const linkedCount = acceptedCount > 1 ? acceptedCount : maxSelection ?? 0
  const linkedRange = linkedCount > 1 ? `${question.question_number} – ${question.question_number + linkedCount - 1}` : String(question.question_number)
  const selectedCount = selected.length
  const atMax = maxSelection ? selectedCount >= maxSelection : false

  return <div className="space-y-3">
    {linkedCount > 1 && <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
      Chọn {linkedCount} phương án (Câu {linkedRange}) · Đã chọn: <span className="tabular-nums">{selectedCount}/{linkedCount}</span>
    </div>}
    <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
    <legend className="sr-only">Chọn một hoặc nhiều đáp án cho câu {question.question_number}</legend>
    {options.map((option) => {
      const checked = selected.includes(option.value)
      const disabled = !checked && atMax
      return <label key={option.value} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${checked ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={() => onAnswer(checked ? selected.filter((item) => item !== option.value) : [...selected, option.value])}
          className="peer sr-only"
        />
        <span aria-hidden="true" className={`flex size-4 items-center justify-center rounded border ${checked ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 bg-white'}`}>{checked && <Check className="size-3" />}</span>
        {option.label}
      </label>
    })}
    </fieldset>
  </div>
}

function getMaxSelection(group: ExamGroup, question: ExamGroup['questions'][number]) {
  const accepted = readStringArray(question.accepted_answers)
  if (accepted.length > 1) return accepted.length
  const instruction = group.instruction.toLowerCase()
  const match = instruction.match(/choose (\w+)/)
  if (match) {
    const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 }
    return words[match[1]] ?? null
  }
  return null
}

export function QuestionGroupCard({
  group,
  answers,
  onAnswer,
}: {
  group: ExamGroup
  answers: Record<string, UserAnswer>
  onAnswer: (questionId: string, answer: UserAnswer) => void
}) {
  const hasInlineAnswers = group.input_type === 'text_box' && Boolean(group.shared_content?.match(/\[\d+\]/))
  const optionLabel = group.input_type === 'check_box' ? 'Chọn đáp án phù hợp' : group.input_type === 'combo_box' ? 'Chọn một đáp án' : 'Nhập câu trả lời'

  return <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby={`group-${group.id}`}>
    <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-md bg-sky-50 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-700">{group.question_category}</span>
        <span className="text-xs text-slate-500">{group.questions.length} câu</span>
      </div>
      {group.instruction && <div id={`group-${group.id}`} className="rich-content mt-3 text-sm font-medium text-slate-800" dangerouslySetInnerHTML={{ __html: sanitizeHtml(group.instruction) }} />}
    </div>
    <div className="space-y-1 p-4 sm:p-5">
      {group.shared_content && <SharedContentAnswers group={group} answers={answers} onAnswer={onAnswer} />}
      {group.shared_content && group.input_type === 'text_box' && group.questions.some((question) => !group.shared_content?.includes(`[${question.question_number}]`)) && (
        <p className="mt-3 text-xs text-slate-500">{optionLabel}</p>
      )}
      {group.questions.map((question) => {
        const inline = hasInlineAnswers && Boolean(group.shared_content?.includes(`[${question.question_number}]`))
        if (inline) return null
        const questionOptions = getOptions(question, group)
        return <div key={question.id} id={`question-${question.id}`} className="scroll-mt-24 rounded-lg py-3 first:pt-1">
          <div className="mb-2 flex items-start gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">{question.question_number}</span>
            <div className="min-w-0 flex-1">
              {question.question_text && <div className="rich-content text-sm font-medium text-slate-800" dangerouslySetInnerHTML={{ __html: sanitizeHtml(question.question_text) }} />}
              {questionOptions.length > 0 && group.input_type !== 'text_box' && <p className="mt-1 text-xs text-slate-500">{optionLabel}</p>}
            </div>
          </div>
          <div className="pl-10">
            <QuestionControl group={group} question={question} answer={answers[question.id]} onAnswer={(answer) => onAnswer(question.id, answer)} />
          </div>
        </div>
      })}
    </div>
  </section>
}
