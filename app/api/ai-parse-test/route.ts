import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const SYSTEM_PROMPT = `You are an expert IELTS Reading test parser. You are given the QUESTION SECTION of an IELTS Reading test (the passage has already been separated). Extract ONLY the questions and return a structured JSON object.

DO NOT include the passage text. Only extract questions, answers, and metadata.

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
- Do NOT output passage_content. The passage is handled separately.
- For "Choose TWO letters" with answers like ["B","D"], create ONE question with both answers in accepted_answers.
- For Summary/Note/Table Completion, use shared_content with [number] placeholders and input_type "text_box".
- For Matching Headings/Features/Information, use input_type "combo_box" with shared_options listing all heading/feature options.
- For True/False/Not Given and Yes/No/Not Given, use input_type "combo_box" with no options.
- For Multiple Choice single answer, use input_type "combo_box". For "Choose TWO", use input_type "check_box".
- Keep explanations to ONE short Vietnamese sentence each.
- Be fast and concise. Output only the JSON, no markdown.`

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
    const questionText: string = body?.questionText

    if (!questionText || typeof questionText !== 'string' || questionText.trim().length < 10) {
      return NextResponse.json(
        { error: 'Không tìm thấy nội dung câu hỏi. Hãy đảm bảo bạn đã dán cả câu hỏi và đáp án.' },
        { status: 400, headers: corsHeaders },
      )
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Chưa cấu hình GEMINI_API_KEY trong .env.local' },
        { status: 500, headers: corsHeaders },
      )
    }

    const questionTypes: string[] = Array.isArray(body?.questionTypes) ? body.questionTypes : []
    const questionCount: number = typeof body?.questionCount === 'number' ? body.questionCount : 13

    const extraInstructions: string[] = []
    if (questionTypes.length) extraInstructions.push(`- Focus on these question types: ${questionTypes.join(', ')}.`)
    if (questionCount) extraInstructions.push(`- Generate exactly ${questionCount} questions total across all question groups.`)

    const fullPrompt = extraInstructions.length
      ? `${SYSTEM_PROMPT}\n\nAdditional requirements:\n${extraInstructions.join('\n')}\n\n--- QUESTION TEXT TO PARSE ---\n${questionText}`
      : `${SYSTEM_PROMPT}\n\n--- QUESTION TEXT TO PARSE ---\n${questionText}`

    const configuredModel = process.env.GEMINI_MODEL?.trim()
    const fastModel = 'gemini-2.5-flash'
    const modelsToTry = configuredModel
      ? [configuredModel, fastModel]
      : [fastModel]

    let lastStatus = 502
    let lastErrorText = ''
    let data: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } | null = null

    for (const model of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
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
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      })

      if (response.ok) {
        data = await response.json()
        break
      }

      lastStatus = response.status
      lastErrorText = await response.text()

      if (response.status !== 404) break
    }

    if (!data) {
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
