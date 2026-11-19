'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Check } from 'lucide-react'
import { sanitizeHtml } from '@/lib/sanitize'
import { readStringArray } from '@/lib/grading'
import type { ExamGroup, UserAnswer } from '@/lib/types'

function isMatchingCategory(category?: string | null) {
  return (category ?? '').toLowerCase().includes('matching')
}

function getOptions(question: ExamGroup['questions'][number], group: ExamGroup) {
  const raw = question.options ?? group.shared_options
  let items: Array<{ value: string; label: string }> = []

  if (Array.isArray(raw)) {
    items = raw.flatMap((item) => {
      if (typeof item === 'string') {
        const match = item.match(/^([A-Z])\s*[.)\-:]/i)
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
  const category = (group.question_category ?? '').toLowerCase()
  if (category.includes('true/false')) return ['TRUE', 'FALSE', 'NOT GIVEN'].map((value) => ({ value, label: value }))
  if (category.includes('yes/no')) return ['YES', 'NO', 'NOT GIVEN'].map((value) => ({ value, label: value }))
  return []
}

function getSharedOptionList(group: ExamGroup): string[] {
  if (!Array.isArray(group.shared_options)) return []
  return group.shared_options
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>
        return String(record.label ?? record.text ?? record.value ?? '').trim()
      }
      return ''
    })
    .filter(Boolean)
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
      return `<span class="inline-question"><input id="question-${question.id}" class="exam-input inline-question-input" data-question-id="${question.id}" type="text" placeholder="${question.question_number}" aria-label="Question ${question.question_number}" autocomplete="off" /></span>`
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
      input.value = Array.isArray(value) ? value.join(', ') : (typeof value === 'string' ? value : '')
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
  const matching = isMatchingCategory(group.question_category)
  const options = getOptions(question, group)
  const selected: string[] = Array.isArray(answer) ? answer.filter((item): item is string => typeof item === 'string') : []

  if (group.input_type === 'text_box' || matching) {
    return (
      <input
        type="text"
        aria-label={`Question ${question.question_number}`}
        placeholder={String(question.question_number)}
        value={typeof answer === 'string' ? answer : ''}
        onChange={(event) => onAnswer(event.target.value)}
        autoComplete="off"
        className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:font-bold placeholder:text-slate-400 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
      />
    )
  }

  if (group.input_type === 'combo_box') {
    const currentValue = typeof answer === 'string' ? answer : ''
    return (
      <fieldset className="flex w-full flex-col gap-2">
        <legend className="sr-only">Chọn một đáp án cho câu {question.question_number}</legend>
        {options.map((option) => {
          const checked = currentValue === option.value
          return (
            <label
              key={option.value}
              className={`relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm transition ${
                checked
                  ? 'border-sky-400 bg-sky-50 font-semibold text-sky-900 shadow-xs'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/70'
              }`}
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                checked={checked}
                onChange={() => onAnswer(option.value)}
                className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0"
              />
              <span
                aria-hidden="true"
                className={`flex size-4 shrink-0 items-center justify-center rounded-full border transition ${
                  checked ? 'border-sky-600 bg-sky-600' : 'border-slate-300 bg-white'
                }`}
              >
                {checked && <span className="size-1.5 rounded-full bg-white" />}
              </span>
              <span>{option.label}</span>
            </label>
          )
        })}
      </fieldset>
    )
  }

  const maxSelection = getMaxSelection(group, question)
  const acceptedCount = readStringArray(question.accepted_answers).length
  const linkedCount = acceptedCount > 1 ? acceptedCount : maxSelection ?? 0
  const linkedRange = linkedCount > 1 ? `${question.question_number} – ${question.question_number + linkedCount - 1}` : String(question.question_number)
  const selectedCount = selected.length
  const atMax = maxSelection ? selectedCount >= maxSelection : false

  return (
    <div className="w-full space-y-3">
      {linkedCount > 1 && (
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
          Chọn {linkedCount} phương án (Câu {linkedRange}) · Đã chọn:{' '}
          <span className="tabular-nums">
            {selectedCount}/{linkedCount}
          </span>
        </div>
      )}
      <fieldset className="flex w-full flex-col gap-2">
        <legend className="sr-only">Chọn một hoặc nhiều đáp án cho câu {question.question_number}</legend>
        {options.map((option) => {
          const checked = selected.includes(option.value)
          const disabled = !checked && atMax
          return (
            <label
              key={option.value}
              className={`relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${checked ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled
