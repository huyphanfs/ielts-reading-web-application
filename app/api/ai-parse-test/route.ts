import { NextRequest, NextResponse } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const DEFAULT_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash']

const SYSTEM_PROMPT = `You are an expert IELTS Reading test parser. Given raw text (which may be HTML or plain text, and may have missing line breaks from PDF copy-pasting) containing an IELTS Reading passage, questions, and answer keys/explanations, you must extract and return a structured JSON object.

Return JSON with this exact schema:
{
  "title": "string - test title if found, otherwise empty",
  "passage_number": number (1, 2, or 3),
  "duration_minutes": number (default 20),
  "passage_content": "string - clean semantic HTML with paragraphs wrapped in <p> tags. Use <p><strong>A</strong> ...</p> format for paragraph labels. Preserve all text content.",
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
          "explanation": "Vietnamese explanation string"
        }
      ]
    }
  ]
}

Important rules:
- If paragraphs or section labels (like "A.", "B.", "C." or "Questions 1-13") were merged onto one line during copy-paste, intelligently separate them into clean <p> paragraphs in passage_content.
- For "Choose TWO letters" questions with answers like ["B","D"], create ONE question with both answers in accepted_answers. The system will expand it.
- For Summary/Note/Table Completion, use shared_content with [number] placeholders and input_type "text_box".
- For Matching Headings/Features/Information, use input_type "combo_box" with shared_options listing all heading/feature options.
- For True/False/Not Given and Yes/No/Not Given, use input_type "combo_box" with no options (the system auto-generates TRUE/FALSE/NOT GIVEN).
- For Multiple Choice single answer, use input_type "combo_box". For Multiple Choice with "Choose TWO", use input_type "check_box".
- Always provide Vietnamese explanations for each question.
- Format passage_content as clean semantic HTML paragraphs.`

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const rawText: string = body?.rawText

    if (!rawText || typeof rawText !== 'string' || rawText.trim().length < 20) {
      return NextResponse.json(
        { error: 'Vui lòng dán nội dung bài đọc và câu hỏi (ít nhất 20 ký tự).' },
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

    const passagePart: number = body?.passagePart ?? 1
    const questionTypes: string[] = Array.isArray(body?.questionTypes) ? body.questionTypes : []
    const questionCount: number = typeof body?.questionCount === 'number' ? body.questionCount : 13

    const extraInstructions: string[] = []
    if (passagePart) extraInstructions.push(`- This is Passage ${passagePart}. Set passage_number to ${passagePart}.`)
    if (questionTypes.length) extraInstructions.push(`- Focus on these question types: ${questionTypes.join(', ')}.`)
    if (questionCount) extraInstructions.push(`- Generate exactly ${questionCount} questions total across all question groups.`)

    const fullPrompt = extraInstructions.length
      ? `${SYSTEM_PROMPT}\n\nAdditional requirements:\n${extraInstructions.join('\n')}\n\n--- RAW TEXT TO PARSE ---\n${rawText}`
      : `${SYSTEM_PROMPT}\n\n--- RAW TEXT TO PARSE ---\n${rawText}`

    const configuredModel = process.env.GEMINI_MODEL?.trim()
    const modelsToTry = configuredModel
      ? [configuredModel, ...DEFAULT_MODELS.filter((m) => m !== configuredModel)]
      : DEFAULT_MODELS

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
          },
        }),
      })

      if (response.ok) {
        data = await response.json()
        break
      }

      lastStatus = response.status
      lastErrorText = await response.text()

      // Chỉ fallback sang model kế tiếp nếu model hiện tại không khả dụng (404)
      if (response.status !== 404) {
        break
      }
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

    const cleaned = text
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim()

    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      const start = cleaned.indexOf('{')
      const end = cleaned.lastIndexOf('}')
      if (start === -1 || end === -1 || end <= start) {
        return NextResponse.json(
          { error: 'Gemini trả về JSON không hợp lệ. Thử lại.' },
          { status: 502, headers: corsHeaders },
        )
      }
      try {
        parsed = JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        return NextResponse.json(
          { error: 'Gemini trả về JSON không hợp lệ. Thử lại.' },
          { status: 502, headers: corsHeaders },
        )
      }
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
