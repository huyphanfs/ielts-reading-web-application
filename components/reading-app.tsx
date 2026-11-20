'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, BookOpenCheck, Check, Clock3, FileText, Layers, LoaderCircle, LockKeyhole, RotateCw, Search, Shuffle, Sparkles, Tag, Timer, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppHeader } from '@/components/app-header'
import { ExamShell } from '@/components/exam-shell'
import { ResultsScreen } from '@/components/results-screen'
import { useAuth } from '@/components/auth-provider'
import { createClient } from '@/lib/supabase/client'
import { loadExamDefinition } from '@/lib/exam-data'
import { gradeExam } from '@/lib/grading'
import { buildDemoExamDefinition, DEMO_TEST_CARD, DEMO_TEST_TITLE } from '@/lib/demo-test'
import { PASSAGE_TOPICS, parsePassageTopics } from '@/lib/types'
import type { ExamDefinition, GradingSummary, Passage, PassageTopic, SavedTestResult, StudyNote, UserAnswer } from '@/lib/types'

const supabase = createClient()

type TestRow = {
  id: string
  title: string
  passage_1_id: string | null
  passage_2_id: string | null
  passage_3_id: string | null
  created_at: string
  isDemo?: boolean
}

export function ReadingApp() {
  const { user, profile, loading: authLoading, signInWithGoogle } = useAuth()
  const [passages, setPassages] = useState<Passage[]>([])
  const [tests, setTests] = useState<TestRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [screen, setScreen] = useState<'lobby' | 'exam' | 'results'>('lobby')
  const [exam, setExam] = useState<ExamDefinition | null>(null)
  const [result, setResult] = useState<GradingSummary | null>(null)
  const [savedResult, setSavedResult] = useState<SavedTestResult | null>(null)
  const [resultWarning, setResultWarning] = useState<string | null>(null)
  const [studyNotes, setStudyNotes] = useState<StudyNote[]>([])
  const [resultTimeSpent, setResultTimeSpent] = useState(0)

  // Chế độ thời gian riêng cho từng mục:
  // - Full Test: 60 min hoặc Untimed
  // - Practice Single Passage: 20 min hoặc Untimed
  // - Practice Full 3 Passage: 60 min hoặc Untimed
  const [testTimed, setTestTimed] = useState(true)
  const [practiceType, setPracticeType] = useState<'single' | 'full3'>('single')
  const [singlePracticeTimed, setSinglePracticeTimed] = useState(true)
  const [fullPracticeTimed, setFullPracticeTimed] = useState(true)
  const [practiceTopicFilter, setPracticeTopicFilter] = useState<string>('all')
  const [practiceSearch, setPracticeSearch] = useState('')
  const [selectedPart1Id, setSelectedPart1Id] = useState('')
  const [selectedPart2Id, setSelectedPart2Id] = useState('')
  const [selectedPart3Id, setSelectedPart3Id] = useState('')

  const [starting, setStarting] = useState(false)
  const [authPrompt, setAuthPrompt] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true)
    setCatalogError(null)
    const [passageResult, testResult, questionResult] = await Promise.all([
      supabase.from('passages').select('*').order('passage_part').order('created_at'),
      supabase.from('tests').select('*').order('created_at'),
      supabase.from('questions').select('id,passage_id'),
    ])

    const error = passageResult.error ?? testResult.error ?? questionResult.error
    if (error) {
      setCatalogError('Unable to load reading passages. Please refresh the page or check your Supabase connection.')
      setPassages([])
      setTests([])
      setCounts({})
      setCatalogLoading(false)
      return
    }

    const questionCounts: Record<string, number> = {}
    for (const question of questionResult.data ?? []) {
      questionCounts[question.passage_id] = (questionCounts[question.passage_id] ?? 0) + 1
    }
    setPassages((passageResult.data ?? []) as Passage[])
    setTests((testResult.data ?? []) as TestRow[])
    setCounts(questionCounts)
    setCatalogLoading(false)
  }, [])

  useEffect(() => { void loadCatalog() }, [loadCatalog])

  const displayPassages = useMemo(
    () => passages.map((passage) => ({ ...passage, actualCount: counts[passage.id] ?? 0 })),
    [passages, counts],
  )
  const availableTests: TestRow[] = tests.length ? tests : [DEMO_TEST_CARD]
  const practicePassages = useMemo(
    () => displayPassages.filter((passage) => passage.is_test_only !== true),
    [displayPassages],
  )
  const testOnlyPassages = useMemo(
    () => displayPassages.filter((passage) => passage.is_test_only === true),
    [displayPassages],
  )
  const testOnlyCount = testOnlyPassages.length

  const filteredPracticePassages = useMemo(() => {
    const q = practiceSearch.trim().toLowerCase()
    return practicePassages.filter((p) => {
      if (practiceTopicFilter !== 'all' && !parsePassageTopics(p.topic).includes(practiceTopicFilter as PassageTopic)) return false
      if (q && !p.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [practicePassages, practiceTopicFilter, practiceSearch])

  const part1Options = useMemo(() => {
    const source = practiceTopicFilter === 'all' ? practicePassages : filteredPracticePassages
    const list = source.filter((p) => p.passage_part === 1 && p.actualCount > 0)
    return list.length ? list : source.filter((p) => p.actualCount > 0)
  }, [practicePassages, filteredPracticePassages, practiceTopicFilter])

  const part2Options = useMemo(() => {
    const source = practiceTopicFilter === 'all' ? practicePassages : filteredPracticePassages
    const list = source.filter((p) => p.passage_part === 2 && p.actualCount > 0)
    return list.length ? list : source.filter((p) => p.actualCount > 0)
  }, [practicePassages, filteredPracticePassages, practiceTopicFilter])

  const part3Options = useMemo(() => {
    const source = practiceTopicFilter === 'all' ? practicePassages : filteredPracticePassages
    const list = source.filter((p) => p.passage_part === 3 && p.actualCount > 0)
    return list.length ? list : source.filter((p) => p.actualCount > 0)
  }, [practicePassages, filteredPracticePassages, practiceTopicFilter])

  useEffect(() => {
    if (!part1Options.some((p) => p.id === selectedPart1Id)) {
      setSelectedPart1Id(part1Options[0]?.id ?? '')
    }
  }, [part1Options, selectedPart1Id])

  useEffect(() => {
    if (!part2Options.some((p) => p.id === selectedPart2Id)) {
      const distinct = part2Options.find((p) => p.id !== selectedPart1Id) ?? part2Options[0]
      setSelectedPart2Id(distinct?.id ?? '')
    }
  }, [part2Options, selectedPart1Id, selectedPart2Id])

  useEffect(() => {
    if (!part3Options.some((p) => p.id === selectedPart3Id)) {
      const distinct = part3Options.find((p) => p.id !== selectedPart1Id && p.id !== selectedPart2Id) ?? part3Options[0]
      setSelectedPart3Id(distinct?.id ?? '')
    }
  }, [part3Options, selectedPart1Id, selectedPart2Id, selectedPart3Id])

  const requireUser = () => {
    if (user) return true
    setAuthPrompt(true)
    return false
  }

  const beginExam = async (input: {
    selectedPassages?: Passage[]
    title: string
    mode: 'test' | 'practice'
    isTimed: boolean
    timeLimitSeconds?: number
    testId?: string | null
    retryQuestionIds?: string[]
    definition?: ExamDefinition
  }) => {
    if (!input.definition?.isDemo && !requireUser()) return
    setStarting(true)
    setNotice(null)
    try {
      const definition = input.definition ?? await loadExamDefinition({
        passages: input.selectedPassages ?? [],
        title: input.title,
        mode: input.mode,
        isTimed: input.isTimed,
        timeLimitSeconds: input.timeLimitSeconds,
        testId: input.testId,
        retryQuestionIds: input.retryQuestionIds,
      })
      if (!definition.questions.length) {
        setNotice('This reading passage has no questions yet. Please select another passage or add questions in Admin.')
        return
      }
      setExam(definition)
      setResult(null)
      setSavedResult(null)
      setResultWarning(null)
      setScreen('exam')
    } catch {
      setNotice('Unable to open the test. Please try again later.')
    } finally {
      setStarting(false)
    }
  }

  const startTest = async (test: TestRow) => {
    if (test.isDemo) {
      const definition = buildDemoExamDefinition(testTimed)
      await beginExam({ title: DEMO_TEST_TITLE, mode: 'test', isTimed: testTimed, timeLimitSeconds: 60 * 60, definition })
      return
    }

    const ids = [test.passage_1_id, test.passage_2_id, test.passage_3_id].filter((id): id is string => Boolean(id))
    const selected = ids.map((id) => passages.find((passage) => passage.id === id)).filter((value): value is Passage => Boolean(value))
    if (selected.length !== 3) {
      setNotice('This test does not have all three reading passages assigned yet.')
      return
    }
    const totalQuestions = selected.reduce((sum, passage) => sum + (counts[passage.id] ?? 0), 0)
    if (totalQuestions !== 40) {
      setNotice(`This test currently has ${totalQuestions} questions. A full test requires 40 questions.`)
      return
    }
    await beginExam({ selectedPassages: selected, title: test.title, mode: 'test', isTimed: testTimed, timeLimitSeconds: 60 * 60, testId: test.id })
  }

  // Random Full Test chỉ lấy từ các bài đọc phân loại "Test" (is_test_only === true)
  const startRandomTest = async () => {
    const part1 = testOnlyPassages.filter((passage) => passage.passage_part === 1 && passage.actualCount === 13)
    const part2 = testOnlyPassages.filter((passage) => passage.passage_part === 2 && (passage.actualCount === 13 || passage.actualCount === 14))
    const part3 = testOnlyPassages.filter((passage) => passage.passage_part === 3 && (passage.actualCount === 13 || passage.actualCount === 14))
    const combinations: Array<[Passage, Passage, Passage]> = []
    for (const first of part1) {
      for (const second of part2) {
        for (const third of part3) {
          if (second.id !== third.id && second.actualCount + third.actualCount === 27) combinations.push([first, second, third])
        }
      }
    }
    if (!combinations.length) {
      setNotice('No 40-question Test combination available yet. Requires Test-classified Passage 1 (13 questions) and Passages 2–3 totaling 27 questions (13 + 14).')
      return
    }
    const combination = combinations[Math.floor(Math.random() * combinations.length)]
    await beginExam({ selectedPassages: combination, title: 'Random Full Test · 40 Questions', mode: 'test', isTimed: testTimed, timeLimitSeconds: 60 * 60 })
  }

  // Practice 1: Single Passage -> 20 phút (1200s) hoặc không giới hạn thời gian
  const startSinglePractice = (passage: Passage) => beginExam({
    selectedPassages: [passage],
    title: passage.title,
    mode: 'practice',
    isTimed: singlePracticeTimed,
    timeLimitSeconds: 20 * 60,
    testId: null,
  })

  // Practice 2: Full 3 Passage -> 60 phút (3600s) hoặc không giới hạn thời gian
  const startCustomFull3Practice = async () => {
    const selectedIds = [selectedPart1Id, selectedPart2Id, selectedPart3Id].filter(Boolean)
    if (selectedIds.length !== 3 || new Set(selectedIds).size !== 3) {
      setNotice('Please select 3 distinct passages (Passage 1, Passage 2, and Passage 3) to start Full 3 Passage practice.')
      return
    }
    const selected = selectedIds
      .map((id, idx) => {
        const found = practicePassages.find((p) => p.id === id)
        return found ? { ...found, passage_part: (idx + 1) as 1 | 2 | 3 } : null
      })
      .filter((p): p is Passage & { actualCount: number } => Boolean(p))

    if (selected.length !== 3) {
      setNotice('Unable to load all 3 selected passages.')
      return
    }
    await beginExam({
      selectedPassages: selected,
      title: 'Full 3 Passage Practice',
      mode: 'practice',
      isTimed: fullPracticeTimed,
      timeLimitSeconds: 60 * 60,
      testId: null,
    })
  }

  const startRandomFull3Practice = async () => {
    const sourcePool = (practiceTopicFilter === 'all' ? practicePassages : filteredPracticePassages).filter((p) => p.actualCount > 0)
    const pool = sourcePool.length >= 3 ? sourcePool : practicePassages.filter((p) => p.actualCount > 0)
    if (pool.length < 3) {
      setNotice('At least 3 practice passages with questions are required for Full 3 Passage practice.')
      return
    }
    const p1List = pool.filter((p) => p.passage_part === 1)
    const p2List = pool.filter((p) => p.passage_part === 2)
    const p3List = pool.filter((p) => p.passage_part === 3)

    let chosen: Passage[]
    if (p1List.length && p2List.length && p3List.length) {
      chosen = [
        p1List[Math.floor(Math.random() * p1List.length)],
        p2List[Math.floor(Math.random() * p2List.length)],
        p3List[Math.floor(Math.random() * p3List.length)],
      ]
    } else {
      const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 3)
      chosen = shuffled.map((p, idx) => ({ ...p, passage_part: (idx + 1) as 1 | 2 | 3 }))
    }

    await beginExam({
      selectedPassages: chosen,
      title: 'Full 3 Passage Practice · Random',
      mode: 'practice',
      isTimed: fullPracticeTimed,
      timeLimitSeconds: 60 * 60,
      testId: null,
    })
  }

  const submitExam = async (answers: Record<string, UserAnswer>, timeSpent: number, notes: StudyNote[]) => {
    if (!exam) return
    const summary = gradeExam(exam.questions, answers)
    setResultTimeSpent(timeSpent)
    setStudyNotes(notes)

    if (!user) {
      setResult(summary)
      setSavedResult(null)
      setResultWarning('Sample test graded locally. Sign in to save results to your profile.')
      setScreen('results')
      return
    }

    const savedQuestionResults = notes.length
      ? [...summary.results, { record_type: 'study_notes', notes }]
      : summary.results
    const { data, error } = await supabase
      .from('test_results')
      .insert({
        user_id: user.id,
        test_id: exam.testId,
        test_title: exam.title,
        mode: exam.mode,
        is_timed: exam.isTimed,
        score: summary.score,
        total_questions: summary.totalQuestions,
        band_score: summary.bandScore,
        time_spent: timeSpent,
        user_answers: answers,
        question_results: savedQuestionResults,
      })
      .select('*')
      .single()

    setResult(summary)
    if (error) {
      setSavedResult(null)
      setResultWarning('Your test was graded locally, but could not be saved to your profile. Please check Supabase permissions and try again.')
    } else {
      setSavedResult(data as SavedTestResult)
      setResultWarning(null)
    }
    setScreen('results')
  }

  const retryIncorrect = async (questionIds: string[]) => {
    if (!exam || !questionIds.length) return
    await beginExam({
      selectedPassages: exam.passages,
      title: `${exam.title} · Retry Incorrect`,
      mode: exam.mode,
      isTimed: exam.isTimed,
      timeLimitSeconds: exam.timeLimitSeconds,
      testId: exam.testId,
      retryQuestionIds: questionIds,
    })
  }

  const returnToLobby = () => {
    setScreen('lobby')
    setExam(null)
    setResult(null)
    setSavedResult(null)
    setNotice(null)
    setAuthPrompt(false)
  }

  if (screen === 'exam' && exam) {
    return <ExamShell exam={exam} onExit={returnToLobby} onSubmit={submitExam} />
  }

  if (screen === 'results' && exam && result) {
    return <ResultsScreen
      exam={exam}
      result={result}
      savedResult={savedResult}
      warning={resultWarning}
      notes={studyNotes}
      timeSpent={resultTimeSpent}
      onReturn={returnToLobby}
      onRetry={retryIncorrect}
    />
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900">
      <AppHeader />
      <section className="relative isolate overflow-hidden border-b border-slate-200/70 bg-white">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_82%_20%,rgba(2,132,199,0.13),transparent_38%),radial-gradient(ellipse_at_18%_80%,rgba(14,165,233,0.06),transparent_36%)]" />
        <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:py-[76px]">
          <div className="min-w-0 max-w-[660px]">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50/80 px-3 py-1.5 text-xs font-semibold tracking-wide text-sky-700">
              <Sparkles className="size-3.5" /> IELTS ACADEMIC · READING
            </div>
            <h1 className="text-balance text-4xl font-bold leading-[1.08] tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-[58px]">
              Read deeper.<br /><span className="text-sky-600">Perform with confidence.</span>
            </h1>
            <p className="mt-5 max-w-[560px] text-base leading-7 text-slate-600 sm:text-lg">
              Practice IELTS Reading in a realistic computer-delivered environment, track your progress, and review every answer in detail.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100/80 px-3 py-2"><Clock3 className="size-4 text-sky-600" /> 60-minute standard timing</span>
              <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100/80 px-3 py-2"><BookOpenCheck className="size-4 text-sky-600" /> 3 passages · 40 questions</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[520px] lg:ml-auto">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-sky-100/80 via-white to-sky-100/70 blur-2xl" />
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_26px_70px_-34px_rgba(15,23,42,0.2)]">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">Your learning space</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">Practice Dashboard</p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><FileText className="size-5" /></span>
              </div>
              <div className="space-y-4 p-5">
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between text-sm"><span className="font-medium text-slate-700">Available tests</span><span className="font-semibold text-sky-700">{availableTests.length} {availableTests.length === 1 ? 'test' : 'tests'}</span></div>
                  <p className="mt-2 text-xs text-slate-500">Choose a full test or start Single Passage / Full 3 Passage practice by topic.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-100 p-4"><span className="text-2xl font-bold tracking-tight text-slate-900">{practicePassages.length}</span><p className="mt-1 text-xs text-slate-500">Practice passages</p></div>
                  <div className="rounded-xl border border-slate-100 p-4"><span className="text-2xl font-bold tracking-tight text-slate-900">{testOnlyCount}</span><p className="mt-1 text-xs text-slate-500">Test passages</p></div>
                </div>
                {authLoading ? <div className="h-10 animate-pulse rounded-lg bg-slate-100" /> : user ? (
                  <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><Check className="size-4 shrink-0" /> Signed in · results will be saved to your profile</div>
                ) : (
                  <button type="button" onClick={() => void signInWithGoogle()} className="flex w-full items-center justify-between rounded-xl bg-sky-600 px-4 py-3.5 text-left text-sm font-semibold text-white shadow-lg shadow-sky-200 transition hover:bg-sky-700">
                    <span className="inline-flex items-center gap-2"><LockKeyhole className="size-4" /> Sign in to save results</span><ArrowRight className="size-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-7">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-600">Choose your mode</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Start your practice</h2>
        </div>

        {authPrompt && !user && (
          <div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <span>Sign in with Google to start and save results to your student profile.</span>
            <Button size="sm" onClick={() => void signInWithGoogle()} className="rounded-lg bg-sky-600 text-white hover:bg-sky-700">Sign in with Google</Button>
          </div>
        )}
        {notice && (
          <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" /> <span className="flex-1">{notice}</span>
            <button type="button" aria-label="Dismiss notice" onClick={() => setNotice(null)} className="font-bold text-amber-800">×</button>
          </div>
        )}
        {catalogError && (
          <div role="alert" className="mb-6 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between">
            <span>{catalogError}</span><Button variant="outline" size="sm" onClick={() => void loadCatalog()} className="rounded-lg"><RotateCw className="mr-2 size-4" /> Reload</Button>
          </div>
        )}

        {catalogLoading ? (
          <div className="grid gap-5 lg:grid-cols-2"><div className="h-64 animate-pulse rounded-2xl bg-white shadow-sm" /><div className="h-64 animate-pulse rounded-2xl bg-white shadow-sm" /></div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Cột 1: Full Test · 40 Questions (Chỉ dùng các bài phân loại Test) */}
            <article className="group relative min-w-0 overflow-hidden rounded-2xl border border-sky-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sky-950/5 sm:p-7">
              <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-sky-50 blur-2xl transition group-hover:bg-sky-100" />
              <div className="relative min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-sky-600 text-white shadow-md shadow-sky-200"><FileText className="size-5" /></div>
                  <div role="radiogroup" aria-label="Full test timer mode" className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
                    <button type="button" role="radio" aria-checked={testTimed} onClick={() => setTestTimed(true)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${testTimed ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}><Timer className="mr-1 inline size-3.5" />60 min</button>
                    <button type="button" role="radio" aria-checked={!testTimed} onClick={() => setTestTimed(false)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${!testTimed ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}><Clock3 className="mr-1 inline size-3.5" />Untimed</button>
                  </div>
                </div>
                <h3 className="mt-5 text-xl font-bold text-slate-950">Full Test · 40 Questions</h3>
                <p className="mt-2 max-w-[420px] text-sm leading-6 text-slate-600">Simulate a complete IELTS Academic Reading exam with three passages and 60-minute or untimed mode.</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button disabled={starting} onClick={() => void startRandomTest()} className="h-10 rounded-lg bg-sky-600 px-4 text-white hover:bg-sky-700">
                    {starting ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />} Generate Random Test
                  </Button>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-xs font-medium text-slate-600"><Clock3 className="size-3.5" />{testTimed ? '60 min' : 'Untimed'}</span>
                </div>
                <div className="mt-7 border-t border-slate-100 pt-5">
                  <div className="mb-3 flex items-center justify-between"><h4 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Available Tests</h4><span className="text-xs text-slate-400">{availableTests.length} {availableTests.length === 1 ? 'test' : 'tests'}</span></div>
                  {availableTests.length ? (
                    <ul className="space-y-2">
                      {availableTests.map((test) => {
                        const valid = Boolean(test.isDemo || (test.passage_1_id && test.passage_2_id && test.passage_3_id))
                        const questionTotal = test.isDemo ? 40 : [test.passage_1_id, test.passage_2_id, test.passage_3_id].reduce((sum, id) => sum + (id ? counts[id] ?? 0 : 0), 0)
                        return <li key={test.id}>
                          <button type="button" disabled={starting || !valid} onClick={() => void startTest(test)} className="flex w-full items-center justify-between rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-left transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50">
                            <span><span className="block text-sm font-semibold text-slate-800">{test.title}</span><span className="mt-0.5 block text-xs text-slate-500">3 passages · {questionTotal} questions · {testTimed ? '60 min' : 'Untimed'}{test.isDemo ? ' · Ready to try' : ''}</span></span><ArrowRight className="size-4 text-slate-400" />
                          </button>
                        </li>
                      })}
                    </ul>
                  ) : <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No preset tests available. Use the random test generator once enough Test passages are added.</p>}
                </div>
              </div>
            </article>

            {/* Cột 2: Practice (Chỉ dùng các bài phân loại Practice + Lọc theo 15 Chủ đề) */}
            <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-lg hover:shadow-sky-950/5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                  {practiceType === 'single' ? <BookOpenCheck className="size-5" /> : <Layers className="size-5" />}
                </div>

                {practiceType === 'single' ? (
                  <div role="radiogroup" aria-label="Single passage timer mode" className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
                    <button type="button" role="radio" aria-checked={singlePracticeTimed} onClick={() => setSinglePracticeTimed(true)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${singlePracticeTimed ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}><Timer className="mr-1 inline size-3.5" />20 min</button>
                    <button type="button" role="radio" aria-checked={!singlePracticeTimed} onClick={() => setSinglePracticeTimed(false)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${!singlePracticeTimed ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}><Clock3 className="mr-1 inline size-3.5" />Untimed</button>
                  </div>
                ) : (
                  <div role="radiogroup" aria-label="Full 3 passage timer mode" className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
                    <button type="button" role="radio" aria-checked={fullPracticeTimed} onClick={() => setFullPracticeTimed(true)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${fullPracticeTimed ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}><Timer className="mr-1 inline size-3.5" />60 min</button>
                    <button type="button" role="radio" aria-checked={!fullPracticeTimed} onClick={() => setFullPracticeTimed(false)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${!fullPracticeTimed ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}><Clock3 className="mr-1 inline size-3.5" />Untimed</button>
                  </div>
                )}
              </div>

              <div className="mt-5 flex min-w-0 flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-xl font-bold text-slate-950">Practice</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">
                    {practiceType === 'single'
                      ? 'Practice a single reading passage in 20 minutes or untimed.'
                      : 'Practice all 3 passages together in 60 minutes or untimed.'}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                  {practiceType === 'single' ? (singlePracticeTimed ? '20 min' : 'Untimed') : (fullPracticeTimed ? '60 min' : 'Untimed')}
                </span>
              </div>

              {/* Thanh chuyển 2 dạng Practice: Single Passage | Full 3 Passage */}
              <div role="tablist" aria-label="Practice format" className="mt-5 grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  role="tab"
                  aria-selected={practiceType === 'single'}
                  onClick={() => setPracticeType('single')}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                    practiceType === 'single'
                      ? 'bg-white text-sky-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BookOpenCheck className="size-4" />
                  <span>Single Passage</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={practiceType === 'full3'}
                  onClick={() => setPracticeType('full3')}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                    practiceType === 'full3'
                      ? 'bg-white text-sky-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers className="size-4" />
                  <span>Full 3 Passage</span>
                </button>
              </div>

              {/* Bộ lọc Chủ đề (15 Topics) & Tìm kiếm bài đọc Practice */}
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={practiceSearch}
                    onChange={(e) => setPracticeSearch(e.target.value)}
                    placeholder="Search practice passage..."
                    aria-label="Search practice passage"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-sky-400"
                  />
                </div>
                <select
                  value={practiceTopicFilter}
                  onChange={(e) => setPracticeTopicFilter(e.target.value)}
                  aria-label="Filter practice passages by topic"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-sky-400"
                >
                  <option value="all">Topic: All Topics</option>
                  {PASSAGE_TOPICS.map((topicItem) => (
                    <option key={topicItem} value={topicItem}>
                      Topic: {topicItem}
                    </option>
                  ))}
                </select>
              </div>

              {practiceType === 'single' ? (
                <div className="mt-4 space-y-2">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Select 1 Passage</span>
                    <span className="text-xs text-slate-400">
                      {filteredPracticePassages.length} {filteredPracticePassages.length === 1 ? 'passage' : 'passages'}
                    </span>
                  </div>
                  <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                    {filteredPracticePassages.length ? filteredPracticePassages.map((passage) => {
                      const count = counts[passage.id] ?? 0
                      return (
                        <button
                          key={passage.id}
                          type="button"
                          disabled={starting || count === 0}
                          onClick={() => void startSinglePractice(passage)}
                          className="flex w-full items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-left transition hover:border-sky-200 hover:bg-sky-50/40 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate text-sm font-semibold text-slate-800">{passage.title}</span>
                              {parsePassageTopics(passage.topic).map((topicItem) => (
                                <span
                                  key={topicItem}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-200/80 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700"
                                >
                                  <Tag className="size-2.5" /> {topicItem}
                                </span>
                              ))}
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-500">
                              Passage {passage.passage_part} · {count} {count === 1 ? 'question' : 'questions'} · {singlePracticeTimed ? '20 min' : 'Untimed'}
                            </span>
                          </span>
                          <ArrowRight className="ml-3 size-4 shrink-0 text-slate-400" />
                        </button>
                      )
                    }) : (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center">
                        <BookOpenCheck className="mx-auto size-6 text-slate-400" />
                        <p className="mt-3 text-sm font-semibold text-slate-700">No matching practice passages</p>
                        <p className="mt-1 text-xs text-slate-500">Try selecting another topic or clearing your search filter.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Select 3 Practice Passages</p>

                    <div className="space-y-2.5">
                      <div>
                        <label htmlFor="practice-p1" className="mb-1 block text-xs font-semibold text-slate-600">Passage 1</label>
                        <select
                          id="practice-p1"
                          value={selectedPart1Id}
                          onChange={(e) => setSelectedPart1Id(e.target.value)}
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-sky-400"
                        >
                          {part1Options.length ? part1Options.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title}{p.topic ? ` [${p.topic}]` : ''} (P{p.passage_part} · {p.actualCount} questions)
                            </option>
                          )) : <option value="">No Passage 1 available</option>}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="practice-p2" className="mb-1 block text-xs font-semibold text-slate-600">Passage 2</label>
                        <select
                          id="practice-p2"
                          value={selectedPart2Id}
                          onChange={(e) => setSelectedPart2Id(e.target.value)}
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-sky-400"
                        >
                          {part2Options.length ? part2Options.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title}{p.topic ? ` [${p.topic}]` : ''} (P{p.passage_part} · {p.actualCount} questions)
                            </option>
                          )) : <option value="">No Passage 2 available</option>}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="practice-p3" className="mb-1 block text-xs font-semibold text-slate-600">Passage 3</label>
                        <select
                          id="practice-p3"
                          value={selectedPart3Id}
                          onChange={(e) => setSelectedPart3Id(e.target.value)}
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-sky-400"
                        >
                          {part3Options.length ? part3Options.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title}{p.topic ? ` [${p.topic}]` : ''} (P{p.passage_part} · {p.actualCount} questions)
                            </option>
                          )) : <option value="">No Passage 3 available</option>}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        disabled={starting || !selectedPart1Id || !selectedPart2Id || !selectedPart3Id}
                        onClick={() => void startCustomFull3Practice()}
                        className="h-9 flex-1 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-700 sm:text-sm"
                      >
                        {starting ? <LoaderCircle className="mr-1.5 size-4 animate-spin" /> : <ArrowRight className="mr-1.5 size-4" />}
                        Start 3-Passage Practice
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={starting || practicePassages.filter((p) => p.actualCount > 0).length < 3}
                        onClick={() => void startRandomFull3Practice()}
                        className="h-9 rounded-lg border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Shuffle className="mr-1.5 size-3.5" /> Random 3
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </article>
          </div>
        )}
      </section>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>IELTS Reading · Academic Practice Environment</span>
          <span>{profile?.role === 'admin' ? 'Verified administrator account' : 'Sign in to save your test results'}</span>
        </div>
      </footer>
    </main>
  )
}
