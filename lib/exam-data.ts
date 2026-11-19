import { createClient } from '@/lib/supabase/client'
import { readStringArray } from '@/lib/grading'
import type { ExamDefinition, ExamGroup, ExamQuestion, Passage, Question, QuestionGroup } from '@/lib/types'

const supabase = createClient()

export async function loadExamDefinition(input: {
  passages: Passage[]
  title: string
  mode: 'test' | 'practice'
  isTimed: boolean
  testId?: string | null
  retryQuestionIds?: string[]
}): Promise<ExamDefinition> {
  const passageIds = input.passages.map((passage) => passage.id)
  if (!passageIds.length) throw new Error('No reading passages found for this test.')

  const [{ data: groupData, error: groupError }, { data: questionData, error: questionError }] = await Promise.all([
    supabase.from('question_groups').select('*').in('passage_id', passageIds).order('group_order'),
    supabase.from('questions').select('*').in('passage_id', passageIds).order('question_number'),
  ])
  if (groupError) throw groupError
  if (questionError) throw questionError

  const passagesById = new Map(input.passages.map((passage) => [passage.id, passage]))
  const questionGroups = (groupData ?? []) as QuestionGroup[]
  const allQuestions = (questionData ?? []) as Question[]
  const allowedIds = input.retryQuestionIds ? new Set(input.retryQuestionIds) : null
  const groups: ExamGroup[] = questionGroups.map((group) => ({
    ...group,
    questions: allQuestions.filter((question) => question.group_id === group.id && (!allowedIds || allowedIds.has(question.id))),
  })).filter((group) => group.questions.length > 0)

  const groupById = new Map(groups.map((group) => [group.id, group]))
  const rawQuestions: ExamQuestion[] = allQuestions
    .filter((question) => !allowedIds || allowedIds.has(question.id))
    .map((question) => {
      const passage = passagesById.get(question.passage_id)
      const group = groupById.get(question.group_id)
      return {
        ...question,
        question_category: group?.question_category ?? 'Reading',
        input_type: group?.input_type ?? 'text_box',
        passage_part: passage?.passage_part ?? 1,
        passage_title: passage?.title ?? '',
      }
    })

  const questions: ExamQuestion[] = rawQuestions.flatMap((question) => {
    if (question.input_type !== 'check_box') return [question]
    const accepted = readStringArray(question.accepted_answers)
    if (accepted.length <= 1) return [question]
    return accepted.map((answer, index) => ({
      ...question,
      id: `${question.id}__sub_${index}`,
      question_number: question.question_number + index,
      accepted_answers: [answer],
      sub_index: index,
      total_sub: accepted.length,
    }))
  }).sort((a, b) => a.passage_part - b.passage_part || a.question_number - b.question_number)

  return {
    id: crypto.randomUUID(),
    title: input.title,
    mode: input.mode,
    testId: input.testId ?? null,
    isTimed: input.isTimed,
    passages: input.passages,
    groups,
    questions,
    retryQuestionIds: input.retryQuestionIds,
  }
}
