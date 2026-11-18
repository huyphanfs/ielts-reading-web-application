'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, BookOpenCheck, Check, Clock3, FileText, LoaderCircle, LockKeyhole, RotateCw, Sparkles, Timer, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppHeader } from '@/components/app-header'
import { ExamShell } from '@/components/exam-shell'
import { ResultsScreen } from '@/components/results-screen'
import { useAuth } from '@/components/auth-provider'
import { createClient } from '@/lib/supabase/client'
import { loadExamDefinition } from '@/lib/exam-data'
import { gradeExam } from '@/lib/grading'
import { buildDemoExamDefinition, DEMO_TEST_CARD, DEMO_TEST_TITLE } from '@/lib/demo-test'
import type { ExamDefinition, GradingSummary, Passage, SavedTestResult, StudyNote, UserAnswer } from '@/lib/types'

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

function formatMinutes(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes} phút`
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
  const [timed, setTimed] = useState(true)
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
      setCatalogError('Không thể tải dữ liệu bài đọc. Vui lòng tải lại trang hoặc kiểm tra kết nối Supabase.')
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
  const practicePassages = displayPassages.filter((passage) => passage.is_test_only !== true)
  const testOnlyCount = displayPassages.filter((passage) => passage.is_test_only === true).length

  const requireUser = () => {
    if (user) return true
    setAuthPrompt(true)
    return false
  }

  const beginExam = async (input: {
    selectedPassages?: Passage[]
    title: string
    mode: 'test' | 'practice'
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
        isTimed: timed,
        testId: input.testId,
        retryQuestionIds: input.retryQuestionIds,
      })
      if (!definition.questions.length) {
        setNotice('Bài đọc này chưa có câu hỏi. Hãy chọn bài khác hoặc bổ sung câu hỏi trong bảng quản trị.')
        return
      }
      setExam(definition)
      setResult(null)
      setSavedResult(null)
      setResultWarning(null)
      setScreen('exam')
    } catch {
      setNotice('Không thể mở bài thi. Vui lòng thử lại sau.')
    } finally {
      setStarting(false)
    }
  }

  const startTest = async (test: TestRow) => {
    if (test.isDemo) {
      const definition = buildDemoExamDefinition(timed)
      await beginExam({ title: DEMO_TEST_TITLE, mode: 'test', definition })
      return
    }

    const ids = [test.passage_1_id, test.passage_2_id, test.passage_3_id].filter((id): id is string => Boolean(id))
    const selected = ids.map((id) => passages.find((passage) => passage.id === id)).filter((value): value is Passage => Boolean(value))
    if (selected.length !== 3) {
      setNotice('Đề thi này chưa được gán đủ ba bài đọc.')
      return
    }
    const totalQuestions = selected.reduce((sum, passage) => sum + (counts[passage.id] ?? 0), 0)
    if (totalQuestions !== 40) {
      setNotice(`Đề thi này hiện có ${totalQuestions} câu. Chỉ có thể bắt đầu đề đủ 40 câu.`)
      return
    }
    await beginExam({ selectedPassages: selected, title: test.title, mode: 'test', testId: test.id })
  }

  const startRandomTest = async () => {
    const part1 = displayPassages.filter((passage) => passage.passage_part === 1 && passage.actualCount === 13)
    const part2 = displayPassages.filter((passage) => passage.passage_part === 2 && (passage.actualCount === 13 || passage.actualCount === 14))
    const part3 = displayPassages.filter((passage) => passage.passage_part === 3 && (passage.actualCount === 13 || passage.actualCount === 14))
    const combinations: Array<[Passage, Passage, Passage]> = []
    for (const first of part1) {
      for (const second of part2) {
        for (const third of part3) {
          if (second.id !== third.id && second.actualCount + third.actualCount === 27) combinations.push([first, second, third])
        }
      }
    }
    if (!combinations.length) {
      setNotice('Chưa có bộ đề đủ 40 câu. Cần Passage 1 có 13 câu và Passage 2–3 có tổng 27 câu (13 + 14).')
      return
    }
    const combination = combinations[Math.floor(Math.random() * combinations.length)]
    await beginExam({ selectedPassages: combination, title: 'Đề ngẫu nhiên · 40 câu', mode: 'test' })
  }

  const startPractice = (passage: Passage) => beginExam({
    selectedPassages: [passage],
    title: passage.title,
    mode: 'practice',
    testId: null,
  })

  const submitExam = async (answers: Record<string, UserAnswer>, timeSpent: number, notes: StudyNote[]) => {
    if (!exam) return
    const summary = gradeExam(exam.questions, answers)
    setResultTimeSpent(timeSpent)
    setStudyNotes(notes)

    if (!user) {
      setResult(summary)
      setSavedResult(null)
      setResultWarning('Bài thi mẫu đã được chấm trên thiết bị. Đăng nhập để lưu kết quả vào hồ sơ học viên.')
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
      setResultWarning('Bài làm đã được chấm trên thiết bị nhưng chưa lưu được vào hồ sơ. Vui lòng kiểm tra quyền Supabase rồi gửi lại.')
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
      title: `${exam.title} · Làm lại câu sai`,
      mode: exam.mode,
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
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />
      <section className="relative isolate overflow-hidden border-b border-slate-200/70 bg-white">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_82%_20%,rgba(2,132,199,0.13),transparent_38%),radial-gradient(ellipse_at_18%_80%,rgba(14,165,233,0.06),transparent_36%)]" />
        <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:py-[76px]">
          <div className="max-w-[660px]">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50/80 px-3 py-1.5 text-xs font-semibold tracking-wide text-sky-700">
              <Sparkles className="size-3.5" /> IELTS ACADEMIC · READING
            </div>
            <h1 className="text-balance text-4xl font-bold leading-[1.08] tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-[58px]">
              Đọc sâu hơn.<br /><span className="text-sky-600">Làm bài tự tin hơn.</span>
            </h1>
            <p className="mt-5 max-w-[560px] text-base leading-7 text-slate-600 sm:text-lg">
              Luyện thi IELTS Reading trong môi trường mô phỏng máy tính, theo dõi tiến độ và hiểu rõ từng câu trả lời.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100/80 px-3 py-2"><Clock3 className="size-4 text-sky-600" /> 60 phút chuẩn đề</span>
              <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100/80 px-3 py-2"><BookOpenCheck className="size-4 text-sky-600" /> 3 bài đọc · 40 câu</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[520px] lg:ml-auto">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-sky-100/80 via-white to-sky-100/70 blur-2xl" />
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_26px_70px_-34px_rgba(15,23,42,0.2)]">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">Your learning space</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">Bảng điều khiển luyện tập</p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><FileText className="size-5" /></span>
              </div>
              <div className="space-y-4 p-5">
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between text-sm"><span className="font-medium text-slate-700">Bộ đề đã sẵn sàng</span><span className="font-semibold text-sky-700">{availableTests.length} đề</span></div>
                  <p className="mt-2 text-xs text-slate-500">Chọn đề thi hoặc bắt đầu một bài luyện tập.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-100 p-4"><span className="text-2xl font-bold tracking-tight text-slate-900">{displayPassages.length}</span><p className="mt-1 text-xs text-slate-500">Bài đọc trong thư viện</p></div>
                  <div className="rounded-xl border border-slate-100 p-4"><span className="text-2xl font-bold tracking-tight text-slate-900">{testOnlyCount}</span><p className="mt-1 text-xs text-slate-500">Bài trong đề thi</p></div>
                </div>
                {authLoading ? <div className="h-10 animate-pulse rounded-lg bg-slate-100" /> : user ? (
                  <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><Check className="size-4 shrink-0" /> Đăng nhập thành công · kết quả sẽ được lưu vào hồ sơ</div>
                ) : (
                  <button type="button" onClick={() => void signInWithGoogle()} className="flex w-full items-center justify-between rounded-xl bg-sky-600 px-4 py-3.5 text-left text-sm font-semibold text-white shadow-lg shadow-sky-200 transition hover:bg-sky-700">
                    <span className="inline-flex items-center gap-2"><LockKeyhole className="size-4" /> Đăng nhập để lưu kết quả</span><ArrowRight className="size-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-600">Chọn cách luyện tập</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Bắt đầu hành trình của bạn</h2>
          </div>
          <div role="radiogroup" aria-label="Chế độ thời gian" className="flex w-fit items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button type="button" role="radio" aria-checked={timed} onClick={() => setTimed(true)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${timed ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}><Timer className="mr-1.5 inline size-3.5" />60 phút</button>
            <button type="button" role="radio" aria-checked={!timed} onClick={() => setTimed(false)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${!timed ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}><Clock3 className="mr-1.5 inline size-3.5" />Không giới hạn</button>
          </div>
        </div>

        {authPrompt && !user && (
          <div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <span>Đăng nhập bằng Google để bắt đầu và lưu kết quả vào hồ sơ học viên.</span>
            <Button size="sm" onClick={() => void signInWithGoogle()} className="rounded-lg bg-sky-600 text-white hover:bg-sky-700">Đăng nhập Google</Button>
          </div>
        )}
        {notice && (
          <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" /> <span className="flex-1">{notice}</span>
            <button type="button" aria-label="Đóng thông báo" onClick={() => setNotice(null)} className="font-bold text-amber-800">×</button>
          </div>
        )}
        {catalogError && (
          <div role="alert" className="mb-6 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between">
            <span>{catalogError}</span><Button variant="outline" size="sm" onClick={() => void loadCatalog()} className="rounded-lg"><RotateCw className="mr-2 size-4" /> Tải lại</Button>
          </div>
        )}

        {catalogLoading ? (
          <div className="grid gap-5 lg:grid-cols-2"><div className="h-64 animate-pulse rounded-2xl bg-white shadow-sm" /><div className="h-64 animate-pulse rounded-2xl bg-white shadow-sm" /></div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <article className="group relative overflow-hidden rounded-2xl border border-sky-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sky-950/5 sm:p-7">
              <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-sky-50 blur-2xl transition group-hover:bg-sky-100" />
              <div className="relative">
                <div className="flex size-12 items-center justify-center rounded-xl bg-sky-600 text-white shadow-md shadow-sky-200"><FileText className="size-5" /></div>
                <h3 className="mt-5 text-xl font-bold text-slate-950">Full Test · 40 câu</h3>
                <p className="mt-2 max-w-[420px] text-sm leading-6 text-slate-600">Mô phỏng bài thi IELTS Academic Reading đầy đủ với ba passage và thời gian làm bài tùy chọn.</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button disabled={starting} onClick={() => void startRandomTest()} className="h-10 rounded-lg bg-sky-600 px-4 text-white hover:bg-sky-700">
                    {starting ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />} Tạo đề ngẫu nhiên
                  </Button>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-xs font-medium text-slate-600"><Clock3 className="size-3.5" />{timed ? '60 phút' : 'Không giới hạn'}</span>
                </div>
                <div className="mt-7 border-t border-slate-100 pt-5">
                  <div className="mb-3 flex items-center justify-between"><h4 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Đề thi có sẵn</h4><span className="text-xs text-slate-400">{availableTests.length} bộ đề</span></div>
                  {availableTests.length ? (
                    <ul className="space-y-2">
                      {availableTests.map((test) => {
                        const valid = Boolean(test.isDemo || (test.passage_1_id && test.passage_2_id && test.passage_3_id))
                        const questionTotal = test.isDemo ? 40 : [test.passage_1_id, test.passage_2_id, test.passage_3_id].reduce((sum, id) => sum + (id ? counts[id] ?? 0 : 0), 0)
                        return <li key={test.id}>
                          <button type="button" disabled={starting || !valid} onClick={() => void startTest(test)} className="flex w-full items-center justify-between rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-left transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50">
                            <span><span className="block text-sm font-semibold text-slate-800">{test.title}</span><span className="mt-0.5 block text-xs text-slate-500">3 bài đọc · {questionTotal} câu{test.isDemo ? ' · Sẵn sàng chơi thử' : ''}</span></span><ArrowRight className="size-4 text-slate-400" />
                          </button>
                        </li>
                      })}
                    </ul>
                  ) : <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Chưa có đề thi cố định. Hãy dùng chức năng tạo đề ngẫu nhiên khi thư viện có đủ bài đọc.</p>}
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-lg hover:shadow-sky-950/5 sm:p-7">
              <div className="flex size-12 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><BookOpenCheck className="size-5" /></div>
              <div className="mt-5 flex items-end justify-between gap-3">
                <div><h3 className="text-xl font-bold text-slate-950">Luyện tập từng bài</h3><p className="mt-2 text-sm leading-6 text-slate-600">Chọn một passage để tập trung vào dạng bài hoặc chủ đề cụ thể.</p></div>
                <span className="shrink-0 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">{practicePassages.length} bài</span>
              </div>
              <div className="mt-6 space-y-2">
                {practicePassages.length ? practicePassages.map((passage) => {
                  const count = counts[passage.id] ?? 0
                  return <button key={passage.id} type="button" disabled={starting || count === 0} onClick={() => void startPractice(passage)} className="flex w-full items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-left transition hover:border-sky-200 hover:bg-sky-50/40 disabled:cursor-not-allowed disabled:opacity-50">
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{passage.title}</span><span className="mt-0.5 block text-xs text-slate-500">Passage {passage.passage_part} · {count} câu · {formatMinutes(passage.time_limit ?? 20)}</span></span>
                    <ArrowRight className="ml-3 size-4 shrink-0 text-slate-400" />
                  </button>
                }) : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center">
                  <BookOpenCheck className="mx-auto size-6 text-slate-400" /><p className="mt-3 text-sm font-semibold text-slate-700">Chưa có bài luyện tập</p><p className="mt-1 text-xs text-slate-500">Bài đọc mới sẽ xuất hiện tại đây khi được thêm vào thư viện.</p>
                </div>}
              </div>
            </article>
          </div>
        )}
      </section>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>IELTS Reading · Môi trường luyện thi Academic</span>
          <span>{profile?.role === 'admin' ? 'Tài khoản quản trị đã xác thực' : 'Đăng nhập để lưu lại kết quả của bạn'}</span>
        </div>
      </footer>
    </main>
  )
}
