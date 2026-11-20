'use client'

import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { sanitizeHtml } from '@/lib/sanitize'
import { readStringArray } from '@/lib/grading'
import type { ExamGroup, UserAnswer } from '@/lib/types'

const ROMAN_NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv']
const FIXED_WORDS = new Set(['TRUE', 'FALSE', 'NOT GIVEN', 'YES', 'NO'])

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

function hasMatchingInlinePlaceholder(
  sharedContent: string | null | undefined,
  questions: ExamGroup['questions'],
): boolean {
  if (!sharedContent) return false
  const textOnly = stripHtml(sharedContent)
  return questions.some((q) => {
    const n = q.question_number
    const bracketRe = new RegExp(`\\[\\s*${n}\\s*\\]`)
    const dottedRe = new RegExp(`(?:^|[^\\d\\w])${n}(?:(?:\\s*[._…]+){3,})`)
    return bracketRe.test(textOnly) || dottedRe.test(textOnly)
  })
}

function normalizeOptionLabel(
  item: string,
  preferRoman = false,
): { prefix: string; rest: string; isRoman: boolean; hasHtml: boolean } {
  const trimmed = item.trim()
  const unwrapped = trimmed.replace(/^<(p|div)[^>]*>([\s\S]*)<\/\1>$/i, '$2').trim()
  const hasHtml = /<[a-z][\s\S]*>/i.test(unwrapped)

  if (hasHtml) {
    // Bóc tách prefix kể cả khi người dùng/AI lỡ bọc <strong>A</strong> hoặc <b>A.</b>
    const htmlPrefixMatch = unwrapped.match(
      /^(?:<(?:strong|b)>\s*)?([ivx]+|[A-Za-z])(?:\s*<\/(?:strong|b)>)?\s*(?:[.)\-:]\s*|\s+)(.*)$/i,
    )
    if (htmlPrefixMatch) {
      const token = htmlPrefixMatch[1]
      const restHtml = htmlPrefixMatch[2] ?? ''
      const lower = token.toLowerCase()
      const isRomanToken =
        ROMAN_NUMERALS.includes(lower) && (preferRoman || lower.length > 1 || token === 'i')
      if (isRomanToken) {
        return { prefix: `${lower}.`, rest: restHtml, isRoman: true, hasHtml: true }
      }
      if (token.length === 1 && /[A-Za-z]/.test(token)) {
        return { prefix: `${token.toUpperCase()}.`, rest: restHtml, isRoman: false, hasHtml: true }
      }
    }
    return { prefix: '', rest: unwrapped, isRoman: false, hasHtml: true }
  }

  if (FIXED_WORDS.has(unwrapped.toUpperCase())) {
    return { prefix: '', rest: unwrapped, isRoman: false, hasHtml: false }
  }

  // Hỗ trợ cả "i. Heading", "i) Heading" lẫn "i Heading" (chưa có dấu chấm)
  const romanMatch = unwrapped.match(/^([ivx]+)(?:\s*[.)\-:]\s*(.*)|\s+(.*)|$)$/i)
  if (romanMatch && ROMAN_NUMERALS.includes(romanMatch[1].toLowerCase())) {
    const rawToken = romanMatch[1]
    const lower = rawToken.toLowerCase()
    const isRomanToken = preferRoman || lower.length > 1 || rawToken === 'i'
    if (isRomanToken) {
      const prefix = `${lower}.`
      const rest = (romanMatch[2] ?? romanMatch[3] ?? '').trim()
      return { prefix, rest, isRoman: true, hasHtml: false }
    }
  }

  // Hỗ trợ cả "A. John Hume", "A) John Hume" lẫn "A John Hume" (chưa có dấu chấm)
  const letterMatch = unwrapped.match(/^([A-Za-z])(?:\s*[.)\-:]\s*(.*)|\s+(.*)|$)$/)
  if (letterMatch && letterMatch[1].length === 1 && /[A-Za-z]/.test(letterMatch[1])) {
    const prefix = `${letterMatch[1].toUpperCase()}.`
    const rest = (letterMatch[2] ?? letterMatch[3] ?? '').trim()
    return { prefix, rest, isRoman: false, hasHtml: false }
  }

  return { prefix: '', rest: unwrapped, isRoman: false, hasHtml: false }
}

function OptionLabelText({ label, preferRoman = false }: { label: string; preferRoman?: boolean }) {
  const { prefix, rest, hasHtml } = normalizeOptionLabel(label, preferRoman)
  if (hasHtml) {
    return (
      <span>
        {prefix && <strong className="font-bold text-slate-900">{prefix} </strong>}
        <span
          className="[&_em]:italic [&_strong]:font-bold [&_u]:underline"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(rest) }}
        />
      </span>
    )
  }
  return (
    <span>
      {prefix && <strong className="font-bold text-slate-900">{prefix} </strong>}
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
        if (FIXED_WORDS.has(plain.toUpperCase())) {
          return [{ value: plain.toUpperCase(), label: item }]
        }
        const match = plain.match(/^([A-Z])(?:\s*[.)\-:]|\s+)/i)
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
  const headings = isMatchingHeadings(group.question_category)
  const { prefix, rest, hasHtml } = normalizeOptionLabel(opt, headings)

  if (hasHtml) {
    return (
      <li key={index} className="flex items-baseline gap-2 leading-snug text-[16px] text-slate-800">
        {prefix && <strong className="min-w-[1.6rem] shrink-0 font-bold text-slate-950">{prefix}</strong>}
        <span
          className="[&_em]:italic [&_strong]:font-bold [&_u]:underline"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(rest) }}
        />
      </li>
    )
  }

  return (
    <li key={index} className="flex items-baseline gap-2 leading-snug text-[16px] text-slate-800">
      {prefix && <strong className="min-w-[1.6rem] shrink-0 font-bold text-slate-950">{prefix}</strong>}
      <span>{rest || opt}</span>
    </li>
  )
}
