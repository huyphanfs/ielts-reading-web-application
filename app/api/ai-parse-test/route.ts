import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const SYSTEM_PROMPT = `You are an expert IELTS Reading test parser. Given the full text of an IELTS Reading test (passage + questions + answer keys/explanations, possibly in Vietnamese or bilingual format), extract ONLY the structured questions and return a JSON object.

The passage text is included for context only — DO NOT output it. Extract questions, answers, and metadata only.

Return JSON with this exact schema:
{
  "passageTitle": "string - test title if found, otherwise empty",
  "duration_minutes": number (default 20),
  "question_groups": [
    {
      "instruction": "string - the instruction text for this group",
      "question_category": "one of: 'Matching Information to a Paragraph', 'Matching Headings', 'Matching Features', 'True/False/Not Given', 'Yes/No/Not Given', 'Multiple Choice', 'Summary Completion', 'Note Completion', 'Table Completion', 'Short Answer'",
      "input_type": "one of: 'combo_box' (single answer), 'check_box' (multiple answers like 'Choose TWO'), 'text_box' (fill in blank)",
      "shared_content": "string or null - HTML content with [number] placeholders for inline answers, or null",
      "shared_options": ["A. ...", "B. ..."] or null,
      "questions": [
        {
          "question_number": number,
          "question_text": "string or null",
          "options": ["A. ...", "B. ..."] or null,
          "accepted_answers": ["B"] or ["B","D"] or ["answer text"],
          "explanation": "ONE concise Vietnamese sentence explaining the answer"
        }
      ]
    }
  ]
}

Critical rules:
- Do NOT output passage_content. The passage is handled separately by the frontend.
- Support en-dash (–) and hyphen (-) in question ranges: "Questions 1–6", "Questions 1-6", "Questions 7–13".
- Support Vietnamese/bilingual answer sections like "Đáp án & Giải thích chi tiết" and "Answer Key & Explanations".
- Group headers may appear once in the question section and again in the answer section — merge them, do not duplicate groups.
- For "Choose TWO letters" with answers like ["B","D"], create ONE question with both answers in accepted_answers.
- For Summary/Note/Table Completion, use shared_content with [number] placeholders and input_type "text_box".
- For Matching Headings/Features/Information, use input_type "combo_box" with shared_options listing all heading/feature options.
- For True/False/Not Given and Yes/No/Not Given, use input_type "combo_box" with no options.
- For Multiple Choice single answer, use input_type "combo_box". For "Choose TWO", use input_type "check_box".
- Keep explanations to ONE short Vietnamese sentence each.
- Be fast and concise. Output only the JSON, no markdown.`

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const passageText = typeof body?.passageText === 'string' ? body.passageText.trim() : ''
    const questionText = typeof body?.questionText === 'string' ? body.questionText.trim() : ''
    const legacyRawText = typeof body?.rawText === 'string' ? body.rawText.trim() : ''
    const rawText = [passageText, questionText].filter(Boolean).join('\n\n') || legacyRawText

    if (!rawText || rawText.trim().length < 10) {
      return NextResponse.json(
        { error: 'Vui lòng dán nội dung bài thi (ít nhất 50 ký tự).' },
        { status: 400, headers: corsHeaders },
      )
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Chưa cấu hình GEMINI_API_KEY trong biến môi trường.' },
        { status: 500, headers: corsHeaders },
      )
    }

    const questionTypes: string[] = Array.isArray(body?.questionTypes) ? body.questionTypes : []
    const questionCount: number = typeof body?.questionCount === 'number' ? body.questionCount : 13

    const extraInstructions: string[] = []
    if (questionTypes.length) extraInstructions.push(`- Focus on these question types: ${questionTypes.join(', ')}.`)
    if (questionCount) extraInstructions.push(`- Generate exactly ${questionCount} questions total across all question groups.`)

    const fullPrompt = extraInstructions.length
      ? `${SYSTEM_PROMPT}\n\nAdditional requirements:\n${extraInstructions.join('\n')}\n\n--- TEXT TO PARSE (passage + questions + answers) ---\n${rawText}`
      : `${SYSTEM_PROMPT}\n\n--- TEXT TO PARSE (passage + questions + answers) ---\n${rawText}`

    const configuredModel = process.env.GEMINI_MODEL?.trim()
    const primaryModel = configuredModel || 'gemini-3.8-flash'
    const fallbackModels = [
      'gemini-3.8-flash',
      'gemini-3.8-flash-lite',
      'gemini-3-flash-preview',
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
    ].filter((model) => model !== primaryModel)

    const attempts: Array<{ model: string; delayBeforeMs: number }> = [
      { model: primaryModel, delayBeforeMs: 0 },
      { model: primaryModel, delayBeforeMs: 1500 },
      ...fallbackModels.map((model) => ({ model, delayBeforeMs: 400 })),
    ]

    let lastStatus = 502
    let lastErrorText = ''
    let data: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } | null = null

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
            contents: [
              {
                role: 'user',
                parts: [{ text: fullPrompt }],
              },
            ],
            generationConfig,
          }),
          signal: AbortSignal.timeout(25000),
        })

        if (response.ok) {
          data = await response.json()
          break
        }

        lastStatus = response.status
        lastErrorText = await response.text()

        if (!RETRYABLE_STATUSES.has(response.status)) {
          break
        }
      } catch (err) {
        lastStatus = 504
        lastErrorText = err instanceof Error ? err.message : 'Timeout khi gọi Gemini API'
      }
    }

    if (!data) {
      if (lastStatus === 503) {
        return NextResponse.json(
          { error: 'Máy chủ Gemini API đang quá tải tạm thời (503). Vui lòng đợi vài giây rồi bấm "Phân tích bằng AI" lại.' },
          { status: 503, headers: corsHeaders },
        )
      }
      if (lastStatus === 429) {
        return NextResponse.json(
          { error: 'API Key đã chạm giới hạn lượt gọi tạm thời (429). Vui lòng đợi ít giây rồi thử lại.' },
          { status: 429, headers: corsHeaders },
        )
      }
      return NextResponse.json(
        { error: `Gemini API trả về lỗi ${lastStatus}: ${lastErrorText.slice(0, 260)}` },
        { status: 502, headers: corsHeaders },
      )
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      return NextResponse.json(
        { error: 'Gemini không trả về nội dung. Thử lại với văn bản ngắn gọn hơn.' },
        { status: 502, headers: corsHeaders },
      )
    }

    const jsonStr = extractJsonObject(text)

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      return NextResponse.json(
        { error: 'AI trả về JSON không hợp lệ. Thử dán lại nội dung rõ ràng hơn.' },
        { status: 502, headers: corsHeaders },
      )
    }

    return NextResponse.json({ result: parsed }, { headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định'
    return NextResponse.json(
      { error: `Không thể xử lý yêu cầu: ${message}` },
      { status: 500, headers: corsHeaders },
    )
  }
}
