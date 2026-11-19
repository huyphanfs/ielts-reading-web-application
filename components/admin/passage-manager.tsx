'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CirclePlus,
  FilterX,
  FolderOpen,
  Library,
  LoaderCircle,
  PanelRightOpen,
  Plus,
  Save,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuestionGroupManager } from '@/components/admin/question-group-manager'
import { RichTextEditor } from '@/components/admin/rich-text-editor'
import { AIParseTestModal } from '@/components/admin/ai-parse-test-modal'
import { createClient } from '@/lib/supabase/client'
import { sanitizeHtml } from '@/lib/sanitize'
import {
  MAX_PASSAGE_TOPICS,
  PASSAGE_TOPICS,
  formatPassageTopics,
  parsePassageTopics,
} from '@/lib/types'
import type { ExamGroup, Passage, PassageTopic, Question, QuestionGroup } from '@/lib/types'

const supabase = createClient()
const PAGE_SIZE = 10

export function PassageManager() {
  const [passages, setPassages] = useState<Passage[]>([])
  const [groups, setGroups] = useState<QuestionGroup[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [selectedPassageId, setSelectedPassageId] = useState('')

  // Form state của bài đọc đang mở
  const [title, setTitle] = useState('')
  const [part, setPart] = useState<1 | 2 | 3>(1)
  const [testOnly, setTestOnly] = useState(false)
  const [selectedTopics, setSelectedTopics] = useState<PassageTopic[]>([])
  const [content, setContent] = useState('')
  const [timeLimit, setTimeLimit] = useState('20')

  // Trạng thái Bảng Thư Viện & Drawer
  const [tableOpen, setTableOpen] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'practice' | 'test'>('all')
  const [filterPart, setFilterPart] = useState<'all' | 1 | 2 | 3>('all')
  const [filterTopic, setFilterTopic] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'ready' | 'incomplete'>('all')
  const [currentPage, setCurrentPage] = useState(1)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aiModalOpen, setAiModalOpen] = useState(false)

  const loadData = useCallback(async (preferredId?: string) => {
    setLoading(true)
    const [passageResult, groupResult, questionResult] = await Promise.all([
      supabase.from('passages').select('*').order('passage_part').order('created_at', { ascending: false }),
      supabase.from('question_groups').select('*').order('group_order'),
      supabase.from('questions').select('*').order('question_number'),
    ])
    const loadError = passageResult.error ?? groupResult.error ?? questionResult.error
    if (loadError) {
      setError('Không thể tải thư viện bài đọc. Kiểm tra quyền admin và kết nối Supabase.')
      setLoading(false)
      return
    }
    const nextPassages = (passageResult.data ?? []) as Passage[]
    setPassages(nextPassages)
    setGroups((groupResult.data ?? []) as QuestionGroup[])
    setQuestions((questionResult.data ?? []) as Question[])

    if (preferredId !== undefined) {
      setSelectedPassageId(preferredId)
    } else {
      setSelectedPassageId((current) => {
        if (current === 'new') return current
        if (current && nextPassages.some((p) => p.id === current)) return current
        return nextPassages[0]?.id ?? ''
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  // Tính số câu hỏi thực tế cho từng bài đọc trong thư viện
  const questionStatsByPassage = useMemo(() => {
    const groupMap = new Map(groups.map((g) => [g.id, g]))
    const stats: Record<string, { rawCount: number; effectiveCount: number }> = {}
    for (const q of questions) {
      const entry = stats[q.passage_id] ?? { rawCount: 0, effectiveCount: 0 }
      entry.rawCount += 1
      const group = groupMap.get(q.group_id)
      if (group?.input_type === 'check_box' && Array.isArray(q.accepted_answers) && q.accepted_answers.length > 1) {
        entry.effectiveCount += q.accepted_answers.length
      } else {
        entry.effectiveCount += 1
      }
      stats[q.passage_id] = entry
    }
    return stats
  }, [groups, questions])

  const librarySummary = useMemo(() => {
    const practiceCount = passages.filter((p) => p.is_test_only !== true).length
    const testCount = passages.filter((p) => p.is_test_only === true).length
    return { total: passages.length, practiceCount, testCount }
  }, [passages])

  const filteredPassages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return passages.filter((p) => {
      if (q && !p.title.toLowerCase().includes(q)) return false
      if (filterMode === 'practice' && p.is_test_only === true) return false
      if (filterMode === 'test' && p.is_test_only !== true) return false
      if (filterPart !== 'all' && p.passage_part !== filterPart) return false

      const passageTopics = parsePassageTopics(p.topic)
      if (filterTopic === 'unassigned') {
        if (passageTopics.length > 0) return false
      } else if (filterTopic !== 'all') {
        if (!passageTopics.includes(filterTopic as PassageTopic)) return false
      }

      const eff = questionStatsByPassage[p.id]?.effectiveCount ?? 0
      const isReady = eff === 13 || eff === 14
      if (filterStatus === 'ready' && !isReady) return false
      if (filterStatus === 'incomplete' && isReady) return false
      return true
    })
  }, [passages, searchQuery, filterMode, filterPart, filterTopic, filterStatus, questionStatsByPassage])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filterMode, filterPart, filterTopic, filterStatus])

  const totalPages = Math.max(1, Math.ceil(filteredPassages.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedPassages = useMemo(
    () => filteredPassages.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredPassages, safePage],
  )

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    filterMode !== 'all' ||
    filterPart !== 'all' ||
    filterTopic !== 'all' ||
    filterStatus !== 'all'

  const resetFilters = () => {
    setSearchQuery('')
    setFilterMode('all')
    setFilterPart('all')
    setFilterTopic('all')
    setFilterStatus('all')
    setCurrentPage(1)
  }

  const activePassage = passages.find((passage) => passage.id === selectedPassageId) ?? null
  const attachedQuestions = useMemo(
    () => questions.filter((question) => question.passage_id === selectedPassageId),
    [questions, selectedPassageId],
  )
  const attachedGroups = useMemo<ExamGroup[]>(
    () =>
      groups
        .filter((group) => group.passage_id === selectedPassageId)
        .map((group) => ({ ...group, questions: questions.filter((question) => question.group_id === group.id) })),
    [groups, questions, selectedPassageId],
  )

  const effectiveQuestionCount = useMemo(
    () =>
      attachedQuestions.reduce((sum, q) => {
        const group = groups.find((g) => g.id === q.group_id)
        if (group?.input_type === 'check_box' && Array.isArray(q.accepted_answers) && q.accepted_answers.length > 1) {
          return sum + q.accepted_answers.length
        }
        return sum + 1
      }, 0),
    [attachedQuestions, groups],
  )
  const countValid = effectiveQuestionCount === 13 || effectiveQuestionCount === 14

  useEffect(() => {
    if (!activePassage) {
      setTitle('')
      setPart(1)
      setTestOnly(false)
      setSelectedTopics([])
      setContent('')
      setTimeLimit('20')
      return
    }
    setTitle(activePassage.title)
    setPart(activePassage.passage_part)
    setTestOnly(Boolean(activePassage.is_test_only))
    setSelectedTopics(parsePassageTopics(activePassage.topic))
    setContent(activePassage.content ?? '')
    setTimeLimit(String(activePassage.time_limit ?? 20))
  }, [activePassage])

  const toggleFormTopic = (topicItem: PassageTopic) => {
    setSelectedTopics((current) => {
      if (current.includes(topicItem)) {
        return current.filter((t) => t !== topicItem)
      }
      if (current.length >= MAX_PASSAGE_TOPICS) {
        return current
      }
      return [...current, topicItem]
    })
  }

  const selectPassageFromLibrary = (passageId: string) => {
    setSelectedPassageId(passageId)
    setNotice(null)
    setError(null)
    setDrawerOpen(false)
  }

  const refreshAndSyncCount = async () => {
    await loadData()
    if (selectedPassageId && selectedPassageId !== 'new') {
      const { count } = await supabase.from('questions').select('id', { count: 'exact', head: true }).eq('passage_id', selectedPassageId)
      await supabase.from('passages').update({ question_count: count ?? 0 }).eq('id', selectedPassageId)
      await loadData()
    }
  }

  const savePassage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setSaving(true)

    const basePayload = {
      title: title.trim(),
      passage_part: part,
      is_test_only: testOnly,
      content: sanitizeHtml(content),
      time_limit: Math.max(1, Number(timeLimit) || 20),
      question_count: attachedQuestions.length,
    }
    const fullPayload = {
      ...basePayload,
      topic: formatPassageTopics(selectedTopics),
    }

    let result = activePassage
      ? await supabase.from('passages').update(fullPayload).eq('id', activePassage.id).select('id').single()
      : await supabase.from('passages').insert(fullPayload).select('id').single()

    // Fallback an toàn nếu database chưa thêm cột `topic`
    if (result.error && result.error.message?.toLowerCase().includes('topic')) {
      result = activePassage
        ? await supabase.from('passages').update(basePayload).eq('id', activePassage.id).select('id').single()
        : await supabase.from('passages').insert(basePayload).select('id').single()

      if (!result.error) {
        setNotice(
          'Đã lưu bài đọc, nhưng bảng passages trên Supabase chưa có cột "topic". Hãy chạy lệnh SQL: alter table passages add column topic text;',
        )
        await loadData(result.data.id)
        setSaving(false)
        return
      }
    }

    if (result.error) {
      setError('Không thể lưu bài đọc. Hãy kiểm tra dữ liệu và quyền quản trị.')
    } else {
      setNotice(activePassage ? 'Đã cập nhật bài đọc.' : 'Đã tạo bài đọc mới.')
      await loadData(result.data.id)
    }
    setSaving(false)
  }

  const createPassage = () => {
    setSelectedPassageId('new')
    setTitle('')
    setPart(1)
    setTestOnly(false)
    setSelectedTopics([])
    setContent('')
    setTimeLimit('20')
    setNotice(null)
    setError(null)
    setDrawerOpen(false)
  }

  const addGroup = async () => {
    if (!activePassage) return
    setError(null)
    const { error: insertError } = await supabase.from('question_groups').insert({
      passage_id: activePassage.id,
      group_order: attachedGroups.length + 1,
      instruction: '',
      question_category: 'True/False/Not Given',
      input_type: 'combo_box',
      shared_content: null,
      shared_options: ['TRUE', 'FALSE', 'NOT GIVEN'],
    })
    if (insertError) setError('Không thể thêm nhóm câu hỏi.')
    else await refreshAndSyncCount()
  }

  const deleteTargetPassage = async (target: Passage) => {
    setError(null)
    setNotice(null)

    const { data: usedByTests, error: testCheckError } = await supabase
      .from('tests')
      .select('id, title, passage_1_id, passage_2_id, passage_3_id')
      .or(`passage_1_id.eq.${target.id},passage_2_id.eq.${target.id},passage_3_id.eq.${target.id}`)

    if (testCheckError) {
      setError('Không thể kiểm tra đề thi đang sử dụng bài đọc này.')
      return
    }

    const targetGroupCount = groups.filter((g) => g.passage_id === target.id).length
    const targetQuestionCount = questions.filter((q) => q.passage_id === target.id).length
    const linkedTests = usedByTests ?? []

    const confirmMessage = linkedTests.length
      ? `Bài đọc “${target.title}” đang được dùng trong ${linkedTests.length} đề thi (${linkedTests.map((t) => t.title).join(', ')}).\n\nBạn có chắc chắn muốn gỡ bài đọc này khỏi các đề thi trên và XÓA TOÀN BỘ bài đọc cùng tất cả nhóm câu hỏi và câu hỏi liên quan không?`
      : `Bạn có chắc chắn muốn XÓA TOÀN BỘ bài đọc “${target.title}” cùng tất cả nhóm câu hỏi (${targetGroupCount} nhóm) và câu hỏi (${targetQuestionCount} câu)? Hành động này không thể hoàn tác.`

    if (!window.confirm(confirmMessage)) return

    setSaving(true)

    for (const test of linkedTests) {
      const updates: Record<string, null> = {}
      if (test.passage_1_id === target.id) updates.passage_1_id = null
      if (test.passage_2_id === target.id) updates.passage_2_id = null
      if (test.passage_3_id === target.id) updates.passage_3_id = null

      const { error: unlinkError } = await supabase.from('tests').update(updates).eq('id', test.id)
      if (unlinkError) {
        setError(`Không thể gỡ bài đọc khỏi đề "${test.title}".`)
        setSaving(false)
        return
      }
    }

    const { error: questionError } = await supabase.from('questions').delete().eq('passage_id', target.id)
    if (questionError) {
      setError('Không thể xóa danh sách câu hỏi của bài đọc này.')
      setSaving(false)
      return
    }

    const { error: groupError } = await supabase.from('question_groups').delete().eq('passage_id', target.id)
    if (groupError) {
      setError('Không thể xóa các nhóm câu hỏi của bài đọc này.')
      setSaving(false)
      return
    }

    const { error: passageError } = await supabase.from('passages').delete().eq('id', target.id)
    if (passageError) {
      setError('Không thể xóa bài đọc. Vui lòng kiểm tra quyền quản trị.')
      setSaving(false)
      return
    }

    const remaining = passages.filter((p) => p.id !== target.id)
    setNotice(`Đã xóa toàn bộ bài đọc “${target.title}” và các câu hỏi liên quan.`)
    const nextPreferredId = selectedPassageId === target.id ? (remaining[0]?.id ?? '') : selectedPassageId
    await loadData(nextPreferredId)
    setSaving(false)
  }

  // Giao diện bộ lọc & bảng thư viện dùng chung cho cả Inline Table và Slide-over Drawer
  const renderLibraryBrowser = (compactDrawer = false) => (
    <div className="space-y-4">
      {/* Thanh tìm kiếm & bộ lọc */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-12">
        <div className={`relative ${compactDrawer ? 'sm:col-span-2 lg:col-span-12' : 'sm:col-span-2 lg:col-span-4'}`}>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tiêu đề bài đọc..."
            aria-label="Tìm theo tiêu đề bài đọc"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-sky-400"
          />
        </div>

        <div className={compactDrawer ? 'lg:col-span-6' : 'lg:col-span-2'}>
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as 'all' | 'practice' | 'test')}
            aria-label="Lọc theo phân loại"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-sky-400"
          >
            <option value="all">Phân loại: Tất cả ({librarySummary.total})</option>
            <option value="practice">Practice ({librarySummary.practiceCount})</option>
            <option value="test">Test ({librarySummary.testCount})</option>
          </select>
        </div>

        <div className={compactDrawer ? 'lg:col-span-6' : 'lg:col-span-2'}>
          <select
            value={filterPart}
            onChange={(e) => setFilterPart(e.target.value === 'all' ? 'all' : (Number(e.target.value) as 1 | 2 | 3))}
            aria-label="Lọc theo Passage"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-sky-400"
          >
            <option value="all">Passage: Tất cả</option>
            <option value="1">Passage 1</option>
            <option value="2">Passage 2</option>
            <option value="3">Passage 3</option>
          </select>
        </div>

        <div className={compactDrawer ? 'lg:col-span-6' : 'lg:col-span-2'}>
          <select
            value={filterTopic}
            onChange={(e) => setFilterTopic(e.target.value)}
            aria-label="Lọc theo chủ đề"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-sky-400"
          >
            <option value="all">Chủ đề: Tất cả</option>
            {PASSAGE_TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value="unassigned">Chưa gán chủ đề</option>
          </select>
        </div>

        <div className={compactDrawer ? 'lg:col-span-6' : 'lg:col-span
