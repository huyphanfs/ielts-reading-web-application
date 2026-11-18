import type {
  AnswerStatus,
  ExamQuestion,
  GradingSummary,
  QuestionResult,
  UserAnswer,
} from '@/lib/types'

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

function isEmpty(answer: UserAnswer | undefined) {
  if (Array.isArray(answer)) return answer.every((item) => !item.trim())
  return !answer?.trim()
}

function answersMatch(question: ExamQuestion, answer: UserAnswer | undefined) {
  const accepted = readStringArray(question.accepted_answers).map(normalize)
  if (!accepted.length || answer === undefined) return false

  if (question.input_type === 'check_box') {
    if (!Array.isArray(answer)) return false
    const chosen = answer.map(normalize).filter(Boolean).sort()
    const expected = accepted.filter(Boolean).sort()
    return chosen.length === expected.length && chosen.every((value, index) => value === expected[index])
  }

  if (Array.isArray(answer)) return false
  return accepted.includes(normalize(answer))
}

export function bandFromScore(score: number, totalQuestions: number) {
  const outOfForty = totalQuestions === 40
    ? score
    : totalQuestions > 0
      ? Math.round((score / totalQuestions) * 40)
      : 0

  if (outOfForty >= 39) return 9
  if (outOfForty >= 37) return 8.5
  if (outOfForty >= 35) return 8
  if (outOfForty >= 33) return 7.5
  if (outOfForty >= 30) return 7
  if (outOfForty >= 27) return 6.5
  if (outOfForty >= 23) return 6
  if (outOfForty >= 19) return 5.5
  if (outOfForty >= 15) return 5
  if (outOfForty >= 13) return 4.5
  if (outOfForty >= 10) return 4
  return 3.5
}

export function gradeExam(
  questions: ExamQuestion[],
  answers: Record<string, UserAnswer>,
): GradingSummary {
  const results: QuestionResult[] = questions.map((question) => {
    const answer = answers[question.id] ?? (question.input_type === 'check_box' ? [] : '')
    let status: AnswerStatus = 'incorrect'

    if (isEmpty(answer)) status = 'skipped'
    else if (answersMatch(question, answer)) status = 'correct'

    return {
      question_id: question.id,
      question_number: question.question_number,
      passage_part: question.passage_part,
      passage_title: question.passage_title,
      question_category: question.question_category,
      question_text: question.question_text,
      accepted_answers: readStringArray(question.accepted_answers),
      user_answer: answer,
      status,
      explanation: question.explanation,
      input_type: question.input_type,
    }
  })

  const correct = results.filter((result) => result.status === 'correct').length
  const incorrect = results.filter((result) => result.status === 'incorrect').length
  const skipped = results.filter((result) => result.status === 'skipped').length

  return {
    score: correct,
    totalQuestions: results.length,
    bandScore: bandFromScore(correct, results.length),
    correct,
    incorrect,
    skipped,
    results,
  }
}
