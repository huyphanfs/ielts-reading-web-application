'use client'

import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Bookmark, Check, CircleHelp, Info, Lightbulb, MessageSquareText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppHeader } from '@/components/app-header'
import { sanitizeHtml } from '@/lib/sanitize'
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
    <AppHeader onHomeClick={onReturn} />
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
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="pb-3 pr-5 font-semibold">Question Category</th><th className="pb-3 px-3 text-center font-semibold">Correct</th><th className="pb-3 px-3 text-center font-semibold">Incorrect</th><th className="pb-3 px-3 text-center font-semibold">Skipped</th><th className="pb-3 px-3 text-right font-semibold">Accuracy</th><th className="pb-3 pl-5 font-semibold">Questions</th></tr></thead>
            <tbody>
              {analytics.map((row) => {
                const total = row.correct + row.incorrect + row.skipped
                return <tr key={`${row.part}-${row.category}`} className="border-b border-slate-100 last:border-0">
                  <th className="py-4 pr-4 font-semibold text-slate-800">{analysisFilter === 'passage' && <span className="mr-2 text-xs font-medium text-slate-400">P{row.part}</span>}[Reading] {row.category}</th>
                  <td className="px-3 py-4 text-center font-semibold text-emerald-700">{row.correct}</td><td className="px-3 py-4 text-center font-semibold text-rose-700">{row.incorrect}</td><td className="px-3 py-4 text-center font-semibold text-slate-500">{row.skipped}</td>
                  <td className="px-3 py-4 text-right font-semibold text-slate-800">{total ? Math.round((row.correct / total) * 100) : 0}%</td>
                  <td className="py-4 pl-5"><div className="flex flex-wrap gap-1.5">{row.questions.sort((a, b) => a.question_number - b.question_number).map((question) => <button key={question.question_id} type="button" onClick={() => scrollToAnswer(question.question_id)} aria-label={`View answer for question ${question.question_number}`} className={`flex size-7 items-center justify-center rounded-full text-[11px] font-bold transition hover:scale-110 ${question.status === 'correct' ? 'bg-emerald-100 text-emerald-800' : question.status === 'incorrect' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'}`}>{question.question_number}</button>)}</div></td>
                </tr>
              })}
              {!analytics.length && <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-500">No analytics data available for this filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section ref={answersRef} className="mt-8 scroll-mt-6" aria-labelledby="answer-key-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-600">Answer Key</p><h2 id="answer-key-heading" className="mt-1 text-xl font-bold text-slate-950">Answer Comparison</h2></div>
          <p className="inline-flex items-center gap-2 text-xs text-slate-500"><Bookmark className="size-4 text-emerald-600" /> Highlights and notes are saved with your test results.</p>
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900"><Lightbulb className="mt-1 size-4 shrink-0" /><p><strong>Tips:</strong> While reviewing the answer key, you can keep vocabulary highlights, keywords, and notes for future revision.</p></div>
        {notes.length > 0 && <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="Saved notes">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><MessageSquareText className="size-4 text-sky-600" /> Study Notes <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700">{notes.length}</span></div>
          <div className="grid gap-3 sm:grid-cols-2">{notes.map((note) => <article key={note.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            {note.quote && <blockquote className="border-l-2 border-sky-300 pl-3 text-sm italic text-slate-600">{note.quote}</blockquote>}
            {note.text && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{note.text}</p>}
          </article>)}</div>
        </section>}
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {exam.passages.map((passage) => {
            const questions = result.results.filter((question) => question.passage_part === passage.passage_part).sort((a, b) => a.question_number - b.question_number)
            return <article key={passage.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-600">Passage {passage.passage_part}</p><h3 className="mt-1 text-sm font-bold text-slate-900">{passage.title}</h3></div>
              <div className="divide-y divide-slate-100">
                {questions.map((question) => {
                  const userAnswer = answerText(question.user_answer)
                  const statusText = question.status === 'correct' ? 'Correct' : question.status === 'incorrect' ? 'Incorrect' : 'Skipped'
                  return <div key={question.question_id} id={`answer-${question.question_id}`} className="scroll-mt-24 px-4 py-4 sm:px-5">
                    <div className="flex items-start gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white">{question.question_number}</span>
                      <div className="min-w-0 flex-1">
                        {question.question_text && <p className="mb-2 text-sm font-medium leading-5 text-slate-700">{question.question_text}</p>}
                        <p className="text-sm leading-6"><strong className="font-bold text-slate-900">{question.accepted_answers.map((answer) => answer.toLocaleUpperCase()).join(' / ') || '—'}</strong><span className="text-slate-500"> : </span>
                          {question.status === 'correct' ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><Check className="size-4" /> {userAnswer}</span> : question.status === 'incorrect' ? <span className="font-medium text-rose-700 line-through decoration-rose-500">{userAnswer || '—'}</span> : <span className="text-slate-400">not answered —</span>}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-3"><span className={`text-[11px] font-semibold ${question.status === 'correct' ? 'text-emerald-700' : question.status === 'incorrect' ? 'text-rose-700' : 'text-slate-500'}`}>{statusText}</span><button type="button" onClick={() => setSelectedQuestion(question)} className="text-xs font-semibold text-sky-700 underline decoration-sky-200 underline-offset-2 hover:text-sky-900">Details</button></div>
                      </div>
                    </div>
                  </div>
                })}
                {!questions.length && <p className="px-5 py-8 text-center text-sm text-slate-500">No questions in this attempt.</p>}
              </div>
            </article>
          })}
        </div>
      </section>
    </div>

    {selectedQuestion && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedQuestion(null) }}>
      <section role="dialog" aria-modal="true" aria-labelledby="explanation-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between border-b border-slate-100 p-5"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">Question {selectedQuestion.question_number} · Passage {selectedQuestion.passage_part}</p><h2 id="explanation-title" className="mt-1 text-lg font-bold text-slate-950">Answer Explanation</h2></div><Button variant="ghost" size="icon" aria-label="Close explanation" onClick={() => setSelectedQuestion(null)}><X className="size-4" /></Button></div>
        <div className="overflow-y-auto p-5">
          {selectedQuestion.question_text && <p className="text-sm font-medium leading-6 text-slate-800">{selectedQuestion.question_text}</p>}
          <div className="mt-4 rounded-xl bg-sky-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-sky-700">Accepted Answer</p><p className="mt-1 font-semibold text-sky-950">{selectedQuestion.accepted_answers.join(' / ') || 'No answer configured'}</p></div>
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Explanation</p>
            {selectedQuestion.explanation ? (
              <div
                className="mt-2 space-y-2 text-sm leading-6 text-slate-700 [&_img]:my-3 [&_img]:max-h-80 [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-xl [&_img]:border [&_img]:border-slate-200 [&_img]:object-contain [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:leading-6 [&_strong]:font-semibold [&_strong]:text-slate-900 [&_ul]:list-disc [&_ul]:pl-5"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedQuestion.explanation) }}
              />
            ) : (
              <p className="mt-2 text-sm leading-6 text-slate-700">No explanation provided for this question yet.</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 justify-end border-t border-slate-100 px-5 py-3"><Button onClick={() => setSelectedQuestion(null)} variant="outline" className="rounded-lg">Close</Button></div>
      </section>
    </div>}
  </main>
}
