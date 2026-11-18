export type Profile = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: 'admin' | 'user' | null
}

export type Passage = {
  id: string
  title: string
  content: string
  passage_part: 1 | 2 | 3
  question_count: number
  is_test_only: boolean | null
  time_limit: number | null
  created_at: string
}

export type QuestionGroup = {
  id: string
  passage_id: string
  group_order: number
  instruction: string
  question_category: string
  input_type: 'combo_box' | 'check_box' | 'text_box'
  shared_content: string | null
  shared_options: unknown
}

export type Question = {
  id: string
  passage_id: string
  group_id: string
  question_number: number
  question_text: string | null
  options: unknown
  accepted_answers: unknown
  explanation: string | null
}

export type ExamQuestion = Question & {
  question_category: string
  input_type: QuestionGroup['input_type']
  passage_part: Passage['passage_part']
  passage_title: string
}

export type ExamGroup = QuestionGroup & {
  questions: Question[]
}

export type ExamDefinition = {
  id: string
  title: string
  mode: 'test' | 'practice'
  testId: string | null
  isTimed: boolean
  isDemo?: boolean
  passages: Passage[]
  groups: ExamGroup[]
  questions: ExamQuestion[]
  retryQuestionIds?: string[]
}

export type UserAnswer = string | string[]
export type AnswerStatus = 'correct' | 'incorrect' | 'skipped'

export type QuestionResult = {
  question_id: string
  question_number: number
  passage_part: Passage['passage_part']
  passage_title: string
  question_category: string
  question_text: string | null
  accepted_answers: string[]
  user_answer: UserAnswer
  status: AnswerStatus
  explanation: string | null
  input_type: QuestionGroup['input_type']
}

export type GradingSummary = {
  score: number
  totalQuestions: number
  bandScore: number
  correct: number
  incorrect: number
  skipped: number
  results: QuestionResult[]
}

export type StudyNote = {
  id: string
  quote: string
  text: string
  color?: string
  annotation_id?: string
  passage_part?: Passage['passage_part']
  pane?: 'passage' | 'questions'
}

export type SavedTestResult = {
  id: string
  user_id: string
  test_id: string | null
  test_title: string
  mode: 'test' | 'practice'
  is_timed: boolean | null
  score: number
  total_questions: number
  band_score: number
  time_spent: number | null
  user_answers: Record<string, UserAnswer>
  question_results: QuestionResult[]
  created_at: string
  profiles?: Profile | Profile[] | null
}
