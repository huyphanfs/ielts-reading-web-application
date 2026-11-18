'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { sanitizeHtml } from '@/lib/sanitize'
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
      className="h-10 w-full max-w-[340px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
    />
  }

  if (group.input_type === 'combo_box') {
    return <div className="relative max-w-[420px]">
      <select
        aria-label={`Chọn đáp án cho câu ${question.question_number}`}
        value={typeof answer === 'string' ? answer : ''}
        onChange={(event) => onAnswer(event.target.value)}
        className="h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 pr-9 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
      >
        <option value="">Chọn đáp án</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-slate-400" />
    </div>
  }

  return <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
    <legend className="sr-only">Chọn một hoặc nhiều đáp án cho câu {question.question_number}</legend>
    {options.map((option) => {
      const checked = selected.includes(option.value)
      return <label key={option.value} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${checked ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onAnswer(checked ? selected.filter((item) => item !== option.value) : [...selected, option.value])}
          className="peer sr-only"
        />
        <span aria-hidden="true" className={`flex size-4 items-center justify-center rounded border ${checked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>{checked && <Check className="size-3" />}</span>
        {option.label}
      </label>
    })}
  </fieldset>
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
        <span className="rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-indigo-700">{group.question_category}</span>
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
