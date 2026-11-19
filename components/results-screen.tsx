'use client'

import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Bookmark, Check, CircleHelp, Info, Lightbulb, MessageSquareText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppHeader } from '@/components/app-header'
import type { ExamDefinition, GradingSummary, QuestionResult, SavedTestResult, UserAnswer } from '@/lib/types'

type StudyNote = { id: string; quote: string; text: string; color?: string }

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}m ${String(remainder).padStart(2, '0')}s`
}

function answerText(answer: UserAnswer) {
  return Array.isArray(answer) ? answer.join(' / ') : answer.trim()
}

function StatCard({ label, value, detail, tone = 'slate' }: { label: string; value: string; detail?: string; tone?: 'slate' | 'green' | 'rose' | 'amber' | 'sky' }) {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-900',
    green: 'border-emerald-100 bg-emerald-50/70 text-emerald-800',
    rose: 'border-rose-100 bg-rose-50/70 text-rose-800',
    amber: 'border-amber-100 bg-amber-50/70 text-amber-900',
    sky: 'border-sky-100 bg-sky-50/70 text-sky-800',
  }
  return <div className={`rounded-xl border p-4 ${tones[tone]}`}>
    <p className="text-xs font-semibold opacity-70">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>{detail && <p className="mt-1 text-[11px] opacity-65">{detail}</p>}
  </div>
}

export function ResultsScreen({
  exam,
  result,
  savedResult,
  warning,
  notes = [],
  timeSpent = 0,
  onReturn,
  onRetry,
}: {
  exam: ExamDefinition
  result: GradingSummary
  savedResult: SavedTestResult | null
  warning: string | null
  notes?: StudyNote[]
  timeSpent?: number
  onReturn: () => void
  onRetry: (questionIds: string[]) => void
}) {
  const [analysisFilter, setAnalysisFilter] = useState<'passage' | 'overview'>('passage')
  const [activePart, setActivePart] = useState<'all' | number>('all')
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionResult | null>(null)
  const answersRef = useRef<HTMLElement>(null)
  const wrongQuestionIds = result.results.filter((item) => item.status !== 'correct').map((item) => item.question_id)

  const analytics = useMemo(() => {
    const rows = new Map<string, { category: string; part: number; correct: number; incorrect: number; skipped: number; questions: QuestionResult[] }>()
    for (const question of result.results) {
      const key = analysisFilter === 'passage'
        ? `${question.passage_part}-${question.question_category}`
        : question.question_category
      const row = rows.get(key) ?? { category: question.question_category, part: question.passage_part, correct: 0, incorrect: 0, skipped: 0, questions: [] }
      row[question.status] += 1
      row.questions.push(question)
      rows.set(key, row)
    }
    return Array.from(rows.values()).filter((row) => activePart === 'all' || row.part === activePart)
      .sort((a, b) => a.part - b.part || a.category.localeCompare(b.category))
  }, [analysisFilter, activePart, result.results])

  const showAnswerKey = () => answersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const scrollToAnswer = (questionId: string) => document.getElementById(`answer-${questionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  const scoreBase = exam.mode === 'test' && !exam.retryQuestionIds ? 40 : result.totalQuestions

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <AppHeader />
    <div className="mx-auto max-w-[1240px] px-4 py-7 sm:px-6 sm:py-10">
      <button type="button" onClick={onReturn} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-sky-700"><ArrowLeft className="size-4" /> Back to Tests</button>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-600">Test Results</p><h1 className="mt-2 max-w-3xl text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{exam.title}</h1><p className="mt-2 text-sm text-slate-500">{exam.mode === 'test' ? 'IELTS Academic Reading' : 'Practice'} · {new Date(savedResult?.created_at ?? Date.now()).toLocaleString('en-US')}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={showAnswerKey} className="h-10 rounded-lg border-slate-200 bg-white"><CircleHelp className="mr-2 size-4 text-sky-600" /> Review Answer Key</Button>
          <Button onClick={() => onRetry(wrongQuestionIds)} disabled={!wrongQuestionIds.length} className="h-10 rounded-lg bg-sky-600 text-white hover:bg-sky-700"><ArrowRight className="mr-2 size-4" /> Retry Incorrect</Button>
        </div>
      </div>

      {warning && <div role="alert" className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><Info className="mt-0.5 size-4 shrink-0" />{warning}</div>}

      <section aria-label="Test summary" className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Score" value={`${result.score}/${scoreBase}`} detail={`${result.totalQuestions} questions in this attempt`} tone="sky" />
        <StatCard label="IELTS Reading Band" value={result.bandScore.toFixed(1)} detail="Academic conversion" tone="sky" />
        <StatCard label="Time Spent" value={formatDuration(savedResult?.time_spent ?? timeSpent)} detail={savedResult?.is_timed ? 'Timed' : 'Untimed'} />
        <StatCard label="Correct" value={String(result.correct)} detail="Accurate answers" tone="green" />
        <StatCard label="Incorrect" value={String(result.incorrect)} detail="Needs further review" tone="rose" />
        <StatCard label="Skipped" value={String(result.skipped)} detail="No answer submitted" tone="slate" />
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="analysis-heading">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div><h2 id="analysis-heading" className="text-lg font-bold text-slate-950">Detailed Analytics</h2><p className="mt-1 text-sm text-slate-500">Accuracy breakdown by question type and passage.</p></div>
          <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Group analytics by">
            <button type="button" onClick={() => setAnalysisFilter('passage')} aria-pressed={analysisFilter === 'passage'} className={`rounded-lg px-3 py-2 text-xs font-semibold ${analysisFilter === 'passage' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600'}`}>Passage</button>
            <button type="button" onClick={() => setAnalysisFilter('overview')} aria-pressed={analysisFilter === 'overview'} className={`rounded-lg px-3 py-2 text-xs font-semibold ${analysisFilter === 'overview' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600'}`}>Overview</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 pt-4 sm:px-6">
          <span className="mr-1 text-xs font-semibold text-slate-500">Filter passage:</span>
          {(['all', ...exam.passages.map((passage) => passage.passage_part)] as Array<'all' | number>).map((part) => <button key={part} type="button" aria-pressed={activePart === part} onClick={() => setActivePart(part)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${activePart === part ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>{part === 'all' ? 'All' : `Passage ${part}`}</button>)}
        </div>
        <div className="overflow-x-auto p-5 sm:px-6 sm:pb-6">
          <table className="w-full min-w-[780px] border-collapse text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="pb-3 pr-5 font-semibold">Question Category</th><th className="pb-3 px-3 text-center font-semibold">Correct</th><th className="pb-3 px-3 text-center font-semibold">Incorrect</th><th className="pb-3 px-3 text-center font-semibold">Skipped</th><th className="pb-3 px-3 text-right font-semibold">Accuracy</th><th className="pb-3
