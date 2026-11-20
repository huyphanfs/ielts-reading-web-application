'use client'

import { useMemo } from 'react'
import { Check } from 'lucide-react'
import { sanitizeHtml } from '@/lib/sanitize'
import { readStringArray } from '@/lib/grading'
import type { ExamGroup, UserAnswer } from '@/lib/types'

const ROMAN_NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv']

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
}

function isMatchingCategory(category?: string | null) {
  return (category ?? '').toLowerCase().includes('matching')
}

function isMatchingInfo(category?: string | null) {
  const c = (category ?? '').toLowerCase()
  return c.includes('matching information')
}

function isMatchingFeatures(category?: string | null) {
  const c = (category ?? '').toLowerCase()
  return c.includes('matching features')
}

function isMatchingHeadings(category?: string | null) {
  const c = (category ?? '').toLowerCase()
  return c.includes('matching headings')
}

function isMultipleChoice(category?: string | null) {
  const c = (category ?? '').toLowerCase()
  return c.includes('multiple choice')
}

function normalizeOptionLabel(item: string): { prefix: string; rest: string; isRoman: boolean; hasHtml: boolean } {
  const trimmed = item.trim()
  const hasHtml = /<[a-z][\s\S]*>/i.test(trimmed)

  if (hasHtml) {
    const unwrapped = trimmed.replace(/^<(p|div)[^>]*>([\s\S]*)<\/\1>$/i, '$2').trim()
    return { prefix: '', rest: unwrapped, isRoman: false, hasHtml: true }
  }

  const romanMatch = trimmed.match(/^([ivx]+)([.)]?)\s*(.*)/i)
  if (romanMatch && ROMAN_NUMERALS.includes(romanMatch[1].toLowerCase())) {
    const prefix = `${romanMatch[1]}.`
    return { prefix: prefix.toLowerCase(), rest: romanMatch[3], isRoman: true, hasHtml: false }
  }

  const letterMatch = trimmed.match(/^([A-Za-z])([.)\-:]?)\s*(.*)/)
  if (letterMatch && letterMatch[1].length === 1 && /[A-Za-z]/.test(letterMatch[1])) {
    const prefix = `${letterMatch[1].toUpperCase()}.`
    return { prefix, rest: letterMatch[3], isRoman: false, hasHtml: false }
  }
  return { prefix: '', rest: trimmed, isRoman: false, hasHtml: false }
}

function OptionLabelText({ label }: { label: string }) {
  const { prefix, rest, hasHtml } = normalizeOptionLabel(label)
  if (hasHtml) {
    return (
      <span
        className="[&_em]:italic [&_strong]:font-bold [&_u]:underline"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(rest) }}
      />
    )
  }
  return (
    <span>
      {prefix && <span className="font-bold">{prefix} </span>}
      {rest || label}
    </span>
  )
}

function getOptions(question: ExamGroup['questions'][number], group: ExamGroup) {
  const raw = question.options ?? group.shared_options
  let items: Array<{ value: string; label: string }> = []

  if (Array.isArray(raw)) {
    items = raw.flatMap((item) => {
      if (typeof item === 'string') {
        const plain = stripHtml(item)
        const match = plain.match(/^([A-Z])\s*[.)\-:]/i)
        return [{ value: match?.[1]?.toUpperCase() ?? plain, label: item }]
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

function renderSharedOption(group: ExamGroup, opt: string, index: number) {
  const { prefix, rest, hasHtml } = normalizeOptionLabel(opt)
  const mc = isMultipleChoice(group.question_category)
  const headings = isMatchingHeadings(group.question_category)
  const features = isMatchingFeatures(group.question_category)

  if (hasHtml) {
    return (
      <li
        key={index}
        className="leading-snug text-[16px] text-slate-800 [&_em]:italic [&_strong]:font-bold [&_u]:underline"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(rest) }}
      />
    )
  }

  if (headings || features || mc) {
    return (
      <li key={index} className="leading-snug text-[16px] text-slate-800">
        {prefix && <span className="font-bold text-slate-900">{prefix} </span>}
        {rest || opt}
      </li>
    )
  }
  return (
    <li key={index} className="leading-snug text-[16px] text-slate-800">
      {opt}
    </li>
  )
}

export function SharedContentAnswers({ group }: { group: ExamGroup }) {
  const markup = useMemo(() => {
    const safe = sanitizeHtml(group.shared_content)
    return safe.replace(/\[*(\d+)\]*/g, (placeholder, rawNumber: string) => {
      const question = group.questions.find((item) => item.question_number === Number(rawNumber))
      if (!question) return placeholder
      return `<span class="inline-blank-marker" data-target-input="input-${question.id}" title="Click to answer question ${question.question_number}"><strong>${question.question_number}</strong>....................</span>`
    })
  }, [group.shared_content, group.questions])

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const marker = (event.target as HTMLElement).closest<HTMLElement>('[data-target-input]')
    const inputId = marker?.dataset.targetInput
    if (!inputId) return
    const input = document.getElementById(inputId) as HTMLInputElement | null
    if (input) {
      input.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      input.focus()
    }
  }

  if (!markup) return null
  return <div onClick={handleClick} className="question-rich-content" dangerouslySetInnerHTML={{ __html: markup }} />
}

function QuestionControl({
  group,
  question,
  answer,
  onAnswer,
  showPrefixBadge = false,
}: {
  group: ExamGroup
  question: ExamGroup['questions'][number]
  answer: UserAnswer | undefined
  onAnswer: (answer: UserAnswer) => void
  showPrefixBadge?: boolean
}) {
  const matching = isMatchingCategory(group.question_category)
  const options = getOptions(question, group)
  const selected: string[] = Array.isArray(answer) ? answer.filter((item): item is string => typeof item === 'string') : []

  if (group.input_type === 'text_box' || matching) {
    return (
      <div className="flex w-full items-center gap-2.5">
        {showPrefixBadge && (
          <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 px-2 text-xs font-bold text-blue-700">
            {question.question_number}
          </span>
        )}
        <input
          id={`input-${question.id}`}
          type="text"
          size={matching ? undefined : 18}
          aria-label={`Question ${question.question_number}`}
          placeholder={showPrefixBadge ? undefined : String(question.question_number)}
          value={typeof answer === 'string' ? answer : ''}
          onChange={(event) => onAnswer(event.target.value)}
          autoComplete="off"
          className={`h-9.5 rounded-md border border-slate-300 bg-white px-3 text-[15px] text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 ${
            matching
              ? 'w-[115px] text-center font-semibold placeholder:text-center placeholder:font-bold placeholder:text-slate-500'
              : 'w-[18ch] max-w-full placeholder:text-center placeholder:font-bold placeholder:text-slate-500'
          }`}
        />
      </div>
    )
  }

  if (group.input_type === 'combo_box') {
    const currentValue = typeof answer === 'string' ? answer : ''
    return (
      <fieldset className="flex w-full flex-col gap-1.5">
        <legend className="sr-only">Choose one answer for question {question.question_number}</legend>
        {options.map((option) => {
          const checked = currentValue === option.value
          return (
            <label
              key={option.value}
              className={`relative flex w-full cursor-pointer items-start gap-2.5 rounded-md py-0 text-[16px] leading-[1.5] transition ${
                checked
                  ? 'font-semibold text-blue-800'
                  : 'text-slate-800 hover:text-slate-950'
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
                className={`mt-[3px] flex size-[18px] shrink-0 items-center justify-center rounded-full border transition ${
                  checked ? 'border-blue-600 bg-blue-600' : 'border-slate-400 bg-white'
                }`}
              >
                {checked && <span className="size-2 rounded-full bg-white" />}
              </span>
              <OptionLabelText label={option.label} />
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
    <div className="w-full space-y-1.5">
      {linkedCount > 1 && (
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-0.5 text-xs font-semibold text-blue-700">
          Choose {linkedCount} options (Questions {linkedRange}) · Selected:{' '}
          <span className="tabular-nums">
            {selectedCount}/{linkedCount}
          </span>
        </div>
      )}
      <fieldset className="flex w-full flex-col gap-1.5">
        <legend className="sr-only">Choose one or more answers for question {question.question_number}</legend>
        {options.map((option) => {
          const checked = selected.includes(option.value)
          const disabled = !checked && atMax
          return (
            <label
              key={option.value}
              className={`relative flex w-full cursor-pointer items-start gap-2.5 rounded-md py-0 text-[16px] leading-[1.5] transition ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${checked ? 'font-semibold text-blue-800' : 'text-slate-800 hover:text-slate-950'}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() =>
                  onAnswer(checked ? selected.filter((item) => item !== option.value) : [...selected, option.value])
                }
                className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
              <span
                aria-hidden="true"
                className={`mt-[3px] flex size-[18px] shrink-0 items-center justify-center rounded border transition ${checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-400 bg-white'}`}
              >
                {checked && <Check className="size-3.5" />}
              </span>
              <OptionLabelText label={option.label} />
            </label>
          )
        })}
      </fieldset>
    </div>
  )
}

function getMaxSelection(group: ExamGroup, question: ExamGroup['questions'][number]) {
  const accepted = readStringArray(question.accepted_answers)
  if (accepted.length > 1) return accepted.length
  const instruction = (group.instruction ?? '').toLowerCase()
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
  const matching = isMatchingCategory(group.question_category)
  const matchingInfo = isMatchingInfo(group.question_category)
  const matchingHeadings = isMatchingHeadings(group.question_category)
  const matchingFeatures = isMatchingFeatures(group.question_category)
  const mc = isMultipleChoice(group.question_category)
  const isTextInput = group.input_type === 'text_box' || matching
  const hasInlineAnswers = isTextInput && Boolean(group.shared_content?.match(/\[?\d+\]?/))
  const hideSharedOptions = matchingInfo
  const sharedOptionList = !hideSharedOptions && (matching || isTextInput) ? getSharedOptionList(group) : []
  const isStyledOptionList = matchingHeadings || matchingFeatures || mc
  const totalQuestionsCount = group.questions.reduce(
    (sum, q) =>
      sum + (group.input_type === 'check_box' && Array.isArray(q.accepted_answers) && q.accepted_answers.length > 1 ? q.accepted_answers.length : 1),
    0,
  )

  return (
    <section className="w-full rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby={`group-${group.id}`}>
      <div className="border-b border-slate-100 px-3.5 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-700">{group.question_category}</span>
          <span className="text-xs font-medium text-slate-500">
            {totalQuestionsCount} {totalQuestionsCount === 1 ? 'question' : 'questions'}
          </span>
        </div>
        {group.instruction && (
          <div
            id={`group-${group.id}`}
            className={`question-rich-content mt-2 font-medium text-slate-800 ${mc ? 'text-[16px]' : 'text-[15px]'}`}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(group.instruction) }}
          />
        )}
      </div>
      <div className="space-y-1 p-3.5 sm:p-4">
        {group.shared_content && <SharedContentAnswers group={group} />}
        {sharedOptionList.length > 0 && (
          <div className={`my-2.5 p-3 ${isStyledOptionList ? 'border-0 bg-white' : 'rounded-lg border border-slate-200 bg-slate-50/80'}`}>
            <ul className="space-y-1.5 text-[16px]">
              {sharedOptionList.map((opt, idx) => renderSharedOption(group, opt, idx))}
            </ul>
          </div>
        )}
        {group.shared_content && isTextInput && !hasInlineAnswers && group.questions.some((question) => !group.shared_content?.includes(`[${question.question_number}]`)) && (
          <p className="mt-2 text-xs text-slate-500">Enter your matching answer</p>
        )}

        {hasInlineAnswers && (
          <div className="mt-3.5 space-y-2.5 border-t border-slate-100 pt-3.5">
            {group.questions.map((question) => (
              <div key={question.id} id={`question-${question.id}`} className="scroll-mt-24">
                <QuestionControl
                  group={group}
                  question={question}
                  answer={answers[question.id]}
                  onAnswer={(answer) => onAnswer(question.id, answer)}
                  showPrefixBadge
                />
              </div>
            ))}
          </div>
        )}

        {!hasInlineAnswers && group.questions.map((question) => {
          const spanCount = group.input_type === 'check_box' && Array.isArray(question.accepted_answers) && question.accepted_answers.length > 1 ? question.accepted_answers.length : 1
          const badgeLabel = spanCount > 1 ? `${question.question_number}-${question.question_number + spanCount - 1}` : String(question.question_number)

          if (!question.question_text && isTextInput) {
            return (
              <div key={question.id} id={`question-${question.id}`} className="scroll-mt-24 rounded-lg py-1.5 first:pt-0.5">
                <QuestionControl
                  group={group}
                  question={question}
                  answer={answers[question.id]}
                  onAnswer={(answer) => onAnswer(question.id, answer)}
                  showPrefixBadge
                />
              </div>
            )
          }

          return (
            <div key={question.id} id={`question-${question.id}`} className="scroll-mt-24 rounded-lg py-2 first:pt-0.5">
              <div className="flex items-start gap-2.5">
                <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 px-2 text-xs font-bold text-blue-700">
                  {badgeLabel}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {question.question_text && (
                    <div
                      className={`question-rich-content font-medium text-slate-900 [&>p]:m-0 ${mc ? 'text-[16px]' : 'text-[15px]'}`}
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(question.question_text) }}
                    />
                  )}
                  <QuestionControl group={group} question={question} answer={answers[question.id]} onAnswer={(answer) => onAnswer(question.id, answer)} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
