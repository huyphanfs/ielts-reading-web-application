import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const QUESTIONS_SYSTEM_PROMPT = `You are an expert IELTS Reading test parser. Given ONLY the questions section of an IELTS Reading test (possibly containing HTML tags like <img>, <strong>, <em>, <u>, <table>), extract the structured question groups and return a JSON object.

Return JSON with this exact schema:
{
  "passageTitle": "string - title if found in header, otherwise empty string",
  "duration_minutes": number (default 20),
  "question_groups": [
    {
      "instruction": "string - the instruction text for this group (preserve HTML formatting or <img> if present)",
      "question_category": "one of: 'Matching Information to a Paragraph', 'Matching Headings', 'Matching Features', 'True/False/Not Given', 'Yes/No/Not Given', 'Multiple Choice', 'Summary Completion', 'Note Completion', 'Table Completion', 'Short Answer'",
      "input_type": "one of: 'combo_box' (single answer), 'check_box' (multiple answers like 'Choose TWO'), 'text_box' (fill in blank)",
      "shared_content": "string or null - HTML content with [number] placeholders for inline answers (preserve any <img> or <table> tags inside), or null",
      "shared_options": ["A. ...", "B. ..."] or null,
      "questions": [
        {
          "question_number": number,
          "question_text": "string or null (preserve <img> or basic formatting if present)",
          "options": ["A. ...", "B. ..."] or null,
          "accepted_answers": [],
          "explanation": null
        }
      ]
    }
  ]
}

Critical rules:
- Extract ONLY questions and group structures. Leave accepted_answers as [] and explanation as null unless explicitly embedded right inside the question prompt.
- Preserve any <img ...> tags that belong to a group's instruction, shared_content (such as diagrams/flow-charts/maps), or an individual question_text.
- Support en-dash (–) and hyphen (-) in question ranges: "Questions 1–6", "Questions 1-6".
- For "Choose TWO letters" covering e.g. Questions 11–12, create ONE question with question_number: 11 and input_type: "check_box".
- For Summary/Note/Table/Diagram Completion, use shared_content with [number] placeholders and input_type "text_box".
- For Matching Headings/Features/Information, use input_type "combo_box" with shared_options listing all options.
- For True/False/Not Given and Yes/No/Not Given, use input_type "combo_box" with shared_options null.
- Output ONLY valid JSON, no markdown.`

const ANSWERS_SYSTEM_PROMPT = `You are an expert IELTS Reading answer key & explanation parser. Given an Answer Key & Explanations text/HTML (in English, Vietnamese, or bilingual) AND a list of existing questions from the test, match each answer and explanation to its exact question_number.

Return JSON with this exact schema:
{
  "answers": [
    {
      "question_number": number,
      "accepted_answers": ["TRUE"] or ["B"] or ["B", "D"] or ["exact answer", "alternative answer"],
      "explanation": "string or null - concise Vietnamese explanation (preserve any <img ...> or <strong>/<em> tags that belong to this question's explanation)"
    }
  ]
}

Critical rules:
- Match every question_number provided in the existing questions list.
- If an answer has alternatives separated by "/" or "OR" (e.g. "1985 / nineteen eighty-five"), include all valid variations in accepted_answers.
- For "Choose TWO letters" questions (e.g. "11 & 12: B, D" or "11-12: B, D"), map both letters ["B", "D"] to the starting question_number (e.g. 11) matching the existing question list.
- Preserve any <img ...> tags associated with a specific question's explanation.
- Keep explanations clear, accurate, and in Vietnamese (or preserve the user's provided explanation).
- Output ONLY valid JSON, no markdown.`

const RETRYABLE_STATUSES = new Set([404, 408, 429, 500, 502, 503, 504])

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()
}

function extractJsonObject(text: string): string {
  const cleaned = stripMarkdownFences(text)
  try {
    JSON.parse(cleaned)
    return cleaned
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) return cleaned.slice(start, end + 1)
    return cleaned
  }
}

async function callGeminiWithFallback(apiKey: string, fullPrompt: string) {
  const configuredModel = process.env.GEMINI_MODEL?.trim()
  const primaryModel = configuredModel || 'gemini-2.5-flash'
  const fallbackModels = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3-flash-preview',
  ].filter((model) => model !== primaryModel)

  const attempts: Array<{ model: string; delayBeforeMs: number }> = [
    { model: primaryModel, delayBeforeMs: 0 },
    { model: primaryModel, delayBeforeMs: 1200 },
    ...fallbackModels.map((model) => ({ model, delayBeforeMs: 400 })),
  ]

  let lastStatus = 502
  let lastErrorText = ''

  for (const attempt of attempts) {
    if (attempt.delayBeforeMs > 0) {
      await sleep(attempt.delayBeforeMs)
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${attempt.model}:generateContent`
    const generationConfig: Record<string, unknown> = {
      responseMimeType: 'application/json',
      temperature: 0.1,
    }
    if (attempt.model.startsWith('gemini-2.5')) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 }
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
          generationConfig,
        }),
        signal: AbortSignal.timeout(25000),
      })

      if (response.ok) {
        const data = await response.json()
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) return { ok: true as const, text }
        lastStatus = 502
        lastErrorText = 'Gemini không trả về nội dung.'
      } else {
        lastStatus = response.status
        lastErrorText = await response.text()
        if (!RETRYABLE_STATUSES.has(response.status)) break
      }
    } catch (err) {
      lastStatus = 504
      lastErrorText = err instanceof Error ? err.message : 'Timeout khi gọi Gemini API'
    }
  }

  return { ok: false as const, status: lastStatus, errorText: lastErrorText }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Chưa cấu hình GEMINI_API_KEY trong biến môi trường.' },
        { status: 500, headers: corsHeaders },
      )
    }

    const mode: 'questions' | 'answers' = body?.mode === 'answers' ? 'answers' : 'questions'

    if (mode === 'answers') {
      const answerContent = typeof body?.answerContent === 'string' ? body.answerContent.trim() : ''
      const existingQuestions = Array.isArray(body?.existingQuestions) ? body.existingQuestions : []

      if (answerContent.length < 5) {
        return NextResponse.json(
          { error: 'Vui lòng nhập nội dung đáp án & giải thích.' },
          { status: 400, headers: corsHeaders },
        )
      }

      const fullPrompt = `${ANSWERS_SYSTEM_PROMPT}

--- EXISTING QUESTIONS IN THIS PASSAGE ---
${JSON.stringify(existingQuestions, null, 2)}

--- ANSWER KEY & EXPLANATIONS INPUT ---
${answerContent}`

      const aiRes = await callGeminiWithFallback(apiKey, fullPrompt)
      if (!aiRes.ok) {
        return NextResponse.json(
          { error: `Lỗi Gemini API (${aiRes.status}): ${aiRes.errorText.slice(0, 240)}` },
          { status: aiRes.status === 429 || aiRes.status === 503 ? aiRes.status : 502, headers: corsHeaders },
        )
      }

      try {
        const parsed = JSON.parse(extractJsonObject(aiRes.text))
        return NextResponse.json({ result: parsed }, { headers: corsHeaders })
      } catch {
        return NextResponse.json(
          { error: 'AI trả về JSON không hợp lệ cho phần đáp án. Vui lòng thử lại.' },
          { status: 502, headers: corsHeaders },
        )
      }
    }

    // Mode: 'questions'
    const questionContent = typeof body?.questionContent === 'string'
      ? body.questionContent.trim()
      : (typeof body?.questionText === 'string' ? body.questionText.trim() : '')

    if (questionContent.length < 15) {
      return NextResponse.json(
        { error: 'Vui lòng dán nội dung câu hỏi (ít nhất 15 ký tự).' },
        { status: 400, headers: corsHeaders },
      )
    }

    const questionTypes: string[] = Array.isArray(body?.questionTypes) ? body.questionTypes : []
    const questionCount: number = typeof body?.questionCount === 'number' ? body.questionCount : 13
    const passageContext = typeof body?.passageTitle === 'string' && body.passageTitle.trim()
      ? `Passage title: "${body.passageTitle.trim()}".`
      : ''

    const extraInstructions: string[] = []
    if (passageContext) extraInstructions.push(`- ${passageContext}`)
    if (questionTypes.length) extraInstructions.push(`- Focus on these question types: ${questionTypes.join(', ')}.`)
    if (questionCount) extraInstructions.push(`- Expect approximately ${questionCount} questions total across all question groups.`)

    const fullPrompt = extraInstructions.length
      ? `${QUESTIONS_SYSTEM_PROMPT}\n\nAdditional requirements:\n${extraInstructions.join('\n')}\n\n--- QUESTIONS CONTENT TO PARSE ---\n${questionContent}`
      : `${QUESTIONS_SYSTEM_PROMPT}\n\n--- QUESTIONS CONTENT TO PARSE ---\n${questionContent}`

    const aiRes = await callGeminiWithFallback(apiKey, fullPrompt)
    if (!aiRes.ok) {
      if (aiRes.status === 503) {
        return NextResponse.json(
          { error: 'Máy chủ Gemini API đang quá tải tạm thời (503). Vui lòng đợi vài giây rồi thử lại.' },
          { status: 503, headers: corsHeaders },
        )
      }
      if (aiRes.status === 429) {
        return NextResponse.json(
          { error: 'API Key chạm giới hạn lượt gọi (429). Vui lòng đợi ít giây rồi thử lại.' },
          { status: 429, headers: corsHeaders },
        )
      }
      return NextResponse.json(
        { error: `Gemini API trả về lỗi ${aiRes.status}: ${aiRes.errorText.slice(0, 240)}` },
        { status: 502, headers: corsHeaders },
      )
    }

    try {
      const parsed = JSON.parse(extractJsonObject(aiRes.text))
      return NextResponse.json({ result: parsed }, { headers: corsHeaders })
    } catch {
      return NextResponse.json(
        { error: 'AI trả về JSON không hợp lệ. Vui lòng kiểm tra định dạng câu hỏi và thử lại.' },
        { status: 502, headers: corsHeaders },
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định'
    return NextResponse.json(
      { error: `Không thể xử lý yêu cầu: ${message}` },
      { status: 500, headers: corsHeaders },
    )
  }
}
