'use client'

import { useState } from 'react'
import { Check, Database, LoaderCircle, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { DEMO_GROUPS, DEMO_PASSAGES, DEMO_TEST_TITLE } from '@/lib/demo-test'
import type { Profile } from '@/lib/types'

const supabase = createClient()
const allowedAdminEmail = 'tanhuyiten@gmail.com'

type SeedState = { type: 'success' | 'error' | 'info'; message: string } | null

export function DemoSeeder({ profile }: { profile: Profile }) {
  const [seeding, setSeeding] = useState(false)
  const [state, setState] = useState<SeedState>(null)
  const isAllowed = profile.role === 'admin' && profile.email.toLowerCase() === allowedAdminEmail

  if (!isAllowed) return null

  const seedDemoTest = async () => {
    if (seeding) return
    setSeeding(true)
    setState(null)

    let existingTest: { id: string } | null = null
    try {
      const result = await supabase
        .from('tests')
        .select('id')
        .eq('title', DEMO_TEST_TITLE)
        .limit(1)
        .maybeSingle()
      if (result.error) throw result.error
      existingTest = result.data
    } catch {
      setState({ type: 'error', message: 'Không thể kiểm tra đề mẫu. Hãy xác nhận tài khoản quản trị có quyền đọc bảng tests.' })
      setSeeding(false)
      return
    }

    if (existingTest) {
      setState({ type: 'info', message: 'Đề thi mẫu đã có trong thư viện, không tạo bản trùng.' })
      setSeeding(false)
      return
    }

    const passageIds = new Map<number, string>()
    const createdPassageIds: string[] = []
    const groupIds = new Map<string, string>()
    let createdTestId: string | null = null

    try {
      for (const passage of DEMO_PASSAGES) {
        const { data, error } = await supabase.from('passages').insert({
          title: passage.title,
          content: passage.content,
          passage_part: passage.passage_part,
          question_count: passage.question_count,
          is_test_only: true,
          time_limit: passage.time_limit,
        }).select('id').single()

        if (error || !data) throw new Error('passage_insert_failed')
        passageIds.set(passage.passage_part, data.id)
        createdPassageIds.push(data.id)
      }

      for (const group of DEMO_GROUPS) {
        const passageId = passageIds.get(group.passagePart)
        if (!passageId) throw new Error('passage_mapping_failed')

        const { data, error } = await supabase.from('question_groups').insert({
          passage_id: passageId,
          group_order: group.groupOrder,
          instruction: group.instruction,
          question_category: group.questionCategory,
          input_type: group.inputType,
          shared_content: null,
          shared_options: group.sharedOptions,
        }).select('id').single()

        if (error || !data) throw new Error('group_insert_failed')
        groupIds.set(group.id, data.id)
      }

      const questionRows = DEMO_GROUPS.flatMap((group) => {
        const passageId = passageIds.get(group.passagePart)
        const groupId = groupIds.get(group.id)
        if (!passageId || !groupId) throw new Error('question_mapping_failed')

        return group.questions.map((question) => ({
          passage_id: passageId,
          group_id: groupId,
          question_number: question.questionNumber,
          question_text: question.questionText,
          options: null,
          accepted_answers: question.acceptedAnswers,
          explanation: question.explanation,
        }))
      })

      const { error: questionError } = await supabase.from('questions').insert(questionRows)
      if (questionError) throw new Error('question_insert_failed')

      const { data: insertedTest, error: testError } = await supabase.from('tests').insert({
        title: DEMO_TEST_TITLE,
        passage_1_id: passageIds.get(1),
        passage_2_id: passageIds.get(2),
        passage_3_id: passageIds.get(3),
      }).select('id').single()

      if (testError || !insertedTest) throw new Error('test_insert_failed')
      createdTestId = insertedTest.id
      setState({ type: 'success', message: 'Đã nạp thành công 3 bài đọc, 7 nhóm câu hỏi, 40 câu và Test 1 vào Supabase.' })
    } catch {
      if (createdTestId) await supabase.from('tests').delete().eq('id', createdTestId)
      if (createdPassageIds.length) {
        await supabase.from('questions').delete().in('passage_id', createdPassageIds)
        await supabase.from('question_groups').delete().in('passage_id', createdPassageIds)
        await supabase.from('passages').delete().in('id', createdPassageIds)
      }
      setState({ type: 'error', message: 'Không thể hoàn tất nạp đề mẫu. Các bản ghi vừa tạo đã được dọn nếu quyền RLS cho phép; hãy kiểm tra quyền quản trị rồi thử lại.' })
    } finally {
      setSeeding(false)
    }
  }

  return <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" aria-labelledby="demo-seeder-title">
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white"><Database className="size-5" /></span>
      <div>
        <h2 id="demo-seeder-title" className="font-bold text-slate-900">Đề thi mẫu IELTS Reading · 40 câu</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Nạp bộ dữ liệu dùng thử gồm 3 passage, 7 nhóm câu hỏi và 40 câu vào Supabase. Nút này chỉ hiển thị với tài khoản quản trị được chỉ định.</p>
        {state && <p role={state.type === 'error' ? 'alert' : 'status'} className={`mt-2 flex items-start gap-2 text-sm ${state.type === 'error' ? 'text-rose-700' : state.type === 'success' ? 'text-emerald-700' : 'text-sky-700'}`}>
          {state.type === 'success' ? <Check className="mt-0.5 size-4 shrink-0" /> : state.type === 'error' ? <TriangleAlert className="mt-0.5 size-4 shrink-0" /> : null}
          <span>{state.message}</span>
        </p>}
      </div>
    </div>
    <Button onClick={() => void seedDemoTest()} disabled={seeding} className="h-11 shrink-0 rounded-lg bg-sky-600 px-4 text-white hover:bg-sky-700">
      {seeding ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Database className="mr-2 size-4" />}
      {seeding ? 'Đang nạp đề mẫu…' : 'Nạp Đề Thi Mẫu vào Supabase (40 Câu)'}
    </Button>
  </section>
}
