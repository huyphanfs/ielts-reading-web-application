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

        <div className={compactDrawer ? 'lg:col-span-6' : 'lg:col-span-2'}>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'ready' | 'incomplete')}
            aria-label="Lọc theo trạng thái câu hỏi"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-sky-400"
          >
            <option value="all">Câu hỏi: Tất cả</option>
            <option value="ready">Đạt chuẩn (13–14 câu)</option>
            <option value="incomplete">Chưa đủ câu</option>
          </select>
        </div>
      </div>

      {/* Thanh tóm tắt kết quả lọc */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          Hiển thị <strong className="text-slate-800">{filteredPassages.length}</strong> / {passages.length} bài đọc
        </span>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:text-sky-900"
          >
            <FilterX className="size-3.5" /> Xóa bộ lọc
          </button>
        )}
      </div>

      {/* Bảng dữ liệu thư viện */}
      {paginatedPassages.length ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Tiêu đề bài đọc</th>
                <th className="px-3 py-2.5 text-center">Passage</th>
                <th className="px-3 py-2.5">Chủ đề</th>
                <th className="px-3 py-2.5 text-center">Phân loại</th>
                <th className="px-3 py-2.5 text-center">Số câu</th>
                <th className="px-4 py-2.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedPassages.map((p) => {
                const isSelected = p.id === selectedPassageId
                const effCount = questionStatsByPassage[p.id]?.effectiveCount ?? 0
                const isReady = effCount === 13 || effCount === 14
                const isTestOnly = p.is_test_only === true
                const rowTopics = parsePassageTopics(p.topic)

                return (
                  <tr
                    key={p.id}
                    onClick={() => selectPassageFromLibrary(p.id)}
                    className={`cursor-pointer transition ${
                      isSelected
                        ? 'bg-sky-50/90 hover:bg-sky-50'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="max-w-[300px] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`size-2 shrink-0 rounded-full ${
                            isSelected ? 'bg-sky-600' : 'bg-transparent'
                          }`}
                        />
                        <span className={`truncate font-semibold ${isSelected ? 'text-sky-900' : 'text-slate-800'}`}>
                          {p.title}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                        P{p.passage_part}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {rowTopics.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {rowTopics.map((topicItem) => (
                            <span
                              key={topicItem}
                              className="inline-flex items-center gap-1 rounded-full border border-sky-200/80 bg-sky-50/80 px-2.5 py-0.5 text-xs font-medium text-sky-700"
                            >
                              <Tag className="size-3" /> {topicItem}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {isTestOnly ? (
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                          Test
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                          Practice
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          isReady
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {effCount} câu
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => selectPassageFromLibrary(p.id)}
                          className={`h-7 rounded-md px-2 text-xs ${
                            isSelected
                              ? 'bg-sky-600 text-white hover:bg-sky-700'
                              : 'text-sky-700 hover:bg-sky-50'
                          }`}
                        >
                          {isSelected ? 'Đang mở' : 'Chọn sửa'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={saving}
                          onClick={() => void deleteTargetPassage(p)}
                          aria-label={`Xóa ${p.title}`}
                          className="size-7 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center">
          <Library className="mx-auto size-6 text-slate-400" />
          <p className="mt-2 text-sm font-semibold text-slate-700">Không tìm thấy bài đọc phù hợp</p>
          <p className="mt-1 text-xs text-slate-500">Thử thay đổi từ khóa tìm kiếm hoặc xóa bộ lọc hiện tại.</p>
        </div>
      )}

      {/* Phân trang */}
      {filteredPassages.length > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-1 text-xs text-slate-600">
          <span>
            Trang <strong>{safePage}</strong> / {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-8 rounded-lg px-2.5 text-xs"
            >
              <ChevronLeft className="mr-1 size-3.5" /> Trước
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 rounded-lg px-2.5 text-xs"
            >
              Sau <ChevronRight className="ml-1 size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )

  const reachedMaxTopics = selectedTopics.length >= MAX_PASSAGE_TOPICS

  return (
    <div className="space-y-6">
      {/* ================================================================= */}
      {/* KHỐI 1: THANH ĐIỀU KHIỂN THƯ VIỆN & BẢNG THƯ VIỆN THU GỌN         */}
      {/* ================================================================= */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm">
              <Library className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  Thư viện bài đọc ({librarySummary.total})
                </h2>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  Practice: {librarySummary.practiceCount}
                </span>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  Test: {librarySummary.testCount}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {activePassage
                  ? `Đang mở: Passage ${activePassage.passage_part} · ${activePassage.title}`
                  : 'Đang tạo bài đọc mới'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTableOpen((prev) => !prev)}
              className="h-9 rounded-lg border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
            >
              <FolderOpen className="mr-1.5 size-3.5 text-sky-600" />
              {tableOpen ? 'Thu gọn bảng' : 'Mở bảng thư viện'}
              {tableOpen ? <ChevronUp className="ml-1.5 size-3.5" /> : <ChevronDown className="ml-1.5 size-3.5" />}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => setDrawerOpen(true)}
              className="h-9 rounded-lg border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
            >
              <PanelRightOpen className="mr-1.5 size-3.5 text-sky-600" />
              Ngăn kéo nhanh
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={createPassage}
              className="h-9 rounded-lg border-slate-200 bg-white px-3 text-xs font-semibold"
            >
              <CirclePlus className="mr-1.5 size-3.5" /> Tạo bài đọc mới
            </Button>

            <Button
              type="button"
              onClick={() => setAiModalOpen(true)}
              className="h-9 rounded-lg bg-gradient-to-r from-sky-600 to-indigo-600 px-3.5 text-xs font-semibold text-white hover:from-sky-700 hover:to-indigo-700"
            >
              <Sparkles className="mr-1.5 size-3.5" /> Soạn bài &amp; câu hỏi bằng AI
            </Button>
          </div>
        </div>

        {tableOpen && !loading && (
          <div className="p-4 sm:p-5">{renderLibraryBrowser(false)}</div>
        )}
      </section>

      {/* Slide-over Library Drawer (Ngăn kéo thư viện trượt từ bên phải) */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-xs"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDrawerOpen(false)
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Ngăn kéo thư viện bài đọc"
            className="flex h-full w-full max-w-3xl flex-col border-l border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Ngăn kéo Thư viện Bài đọc</h3>
                <p className="text-xs text-slate-500">
                  Tìm kiếm, lọc theo chủ đề hoặc phân loại và bấm chọn để chuyển nhanh bài đọc
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setDrawerOpen(false)}
                aria-label="Đóng ngăn kéo thư viện"
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{renderLibraryBrowser(true)}</div>
          </aside>
        </div>
      )}

      <AIParseTestModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onSaved={(passageId) => {
          void loadData(passageId).then(() => {
            setNotice('AI đã tạo bài đọc và câu hỏi. Kiểm tra và lưu lại nếu cần.')
            setError(null)
          })
        }}
      />

      {loading && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
          <LoaderCircle className="size-4 animate-spin" /> Đang tải thư viện…
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {/* ================================================================= */}
      {/* KHỐI 2: FORM BIÊN TẬP THÔNG TIN BÀI ĐỌC ĐANG MỞ                   */}
      {/* ================================================================= */}
      {!loading && (
        <form onSubmit={(event) => void savePassage(event)} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-start gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                <BookOpen className="size-5" />
              </span>
              <div>
                <h3 className="font-bold text-slate-900">{activePassage ? 'Thông tin bài đọc' : 'Bài đọc mới'}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Phân loại <strong>Practice</strong> chỉ dùng cho luyện tập (Test không dùng bài này); phân loại <strong>Test</strong> chỉ dùng để ghép đề thi.
                </p>
              </div>
            </div>
            <div
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${
                countValid
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              <span className={`size-2 rounded-full ${countValid ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {attachedQuestions.length} câu {countValid ? '· Đạt cấu hình' : '· Cần 13 hoặc 14 câu'}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-semibold text-slate-600 md:col-span-2">
              Tiêu đề
              <input
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ví dụ: The History of Paper"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-50"
              />
            </label>

            <label className="text-xs font-semibold text-slate-600">
              Passage
              <select
                value={part}
                onChange={(event) => setPart(Number(event.target.value) as 1 | 2 | 3)}
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400"
              >
                {[1, 2, 3].map((value) => (
                  <option key={value} value={value}>
                    Passage {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-600">
              Thời gian luyện tập (phút)
              <input
                type="number"
                min="1"
                max="90"
                value={timeLimit}
                onChange={(event) => setTimeLimit(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-sky-400"
              />
            </label>

            <label className="text-xs font-semibold text-slate-600 md:col-span-2 lg:col-span-4">
              Phân loại
              <select
                value={testOnly ? 'test' : 'practice'}
                onChange={(event) => setTestOnly(event.target.value === 'test')}
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400"
              >
                <option value="practice">Practice (Chỉ dùng luyện tập — Test không dùng bài này)</option>
                <option value="test">Test (Chỉ dùng cho đề Test)</option>
              </select>
            </label>

            {/* Chọn tối đa 2 chủ đề (Topics) */}
            <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 md:col-span-2 lg:col-span-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <Tag className="size-3.5 text-sky-600" />
                    Chủ đề (Topic)
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      reachedMaxTopics
                        ? 'bg-sky-100 text-sky-800'
                        : 'bg-slate-200/70 text-slate-600'
                    }`}
                  >
                    Đã chọn {selectedTopics.length}/{MAX_PASSAGE_TOPICS}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-500">
                    {selectedTopics.length === 0
                      ? 'Chọn tối đa 2 chủ đề cho bài đọc'
                      : reachedMaxTopics
                        ? 'Đã đạt tối đa 2 chủ đề (bấm vào thẻ đang chọn để bỏ)'
                        : 'Có thể chọn thêm 1 chủ đề nữa'}
                  </span>
                  {selectedTopics.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedTopics([])}
                      className="text-[11px] font-semibold text-rose-600 hover:text-rose-700"
                    >
                      Xóa chọn
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {PASSAGE_TOPICS.map((topicItem) => {
                  const isSelected = selectedTopics.includes(topicItem)
                  const isDisabled = !isSelected && reachedMaxTopics
                  return (
                    <button
                      key={topicItem}
                      type="button"
                      disabled={isDisabled}
                      aria-pressed={isSelected}
                      onClick={() => toggleFormTopic(topicItem)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        isSelected
                          ? 'border-sky-600 bg-sky-600 text-white shadow-xs'
                          : isDisabled
                            ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 opacity-50'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50/70 hover:text-sky-700'
                      }`}
                    >
                      <Tag className="size-3" />
                      {topicItem}
                      {isSelected && <X className="ml-0.5 size-3" />}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-600">Nội dung bài đọc</label>
            <RichTextEditor label="Nội dung bài đọc" value={content} onChange={setContent} minHeight={300} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            {activePassage ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void deleteTargetPassage(activePassage)}
                disabled={saving}
                className="rounded-lg text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="mr-2 size-4" />
                Xóa toàn bộ bài đọc &amp; câu hỏi
              </Button>
            ) : (
              <span className="text-xs text-slate-500">Lưu bài đọc trước khi thêm nhóm câu hỏi.</span>
            )}
            <Button type="submit" disabled={saving || !title.trim()} className="h-10 rounded-lg bg-sky-600 px-4 text-white hover:bg-sky-700">
              <Save className="mr-2 size-4" />
              {saving ? 'Đang lưu' : activePassage ? 'Lưu thay đổi' : 'Tạo bài đọc'}
            </Button>
          </div>
        </form>
      )}

      {/* ================================================================= */}
      {/* KHỐI 3: QUẢN LÝ NHÓM CÂU HỎI CỦA BÀI ĐỌC ĐANG MỞ                  */}
      {/* ================================================================= */}
      {activePassage && (
        <section aria-labelledby="groups-heading" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">Câu hỏi</p>
              <h3 id="groups-heading" className="mt-1 text-lg font-bold text-slate-900">
                Question Groups
              </h3>
              <p className="mt-1 text-xs text-slate-500">Nhóm hướng dẫn, nội dung dùng chung và định dạng đáp án.</p>
            </div>
            <Button onClick={() => void addGroup()} className="h-9 rounded-lg bg-sky-600 text-white hover:bg-sky-700">
              <Plus className="mr-1.5 size-4" />
              Thêm Question Group
            </Button>
          </div>
          {attachedGroups.length ? (
            attachedGroups.map((group) => (
              <QuestionGroupManager key={group.id} group={group} onChanged={() => void refreshAndSyncCount()} />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-sm font-semibold text-slate-800">Chưa có Question Group</p>
              <p className="mt-1 text-xs text-slate-500">Tạo nhóm đầu tiên để thêm câu hỏi cho bài đọc này.</p>
              <Button onClick={() => void addGroup()} variant="outline" size="sm" className="mt-4 rounded-lg">
                <Plus className="mr-1.5 size-3.5" />
                Thêm nhóm đầu tiên
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
