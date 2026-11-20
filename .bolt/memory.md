# Project memory

## Product intent & audience

- Next.js-based IELTS Reading exam/practice platform with Supabase backend.
- Primary users: students practicing reading passages; admins importing test questions via AI parsing.

## Brand personality & voice

- Utility-focused exam tooling; clarity and readability over decoration.

## Visual design & UX direction

- Mobile-first; viewport range 360–430px must not clip horizontally. `overflow-x-hidden` on `html`, `body`, `<main>`; flex children get `min-w-0`; action buttons `shrink-0`; padding `px-4`.
- Question-group rendering rules (all at `text-[14px]`, borderless white `bg-white` unless noted):
  - Matching Information: hide `shared_options` (A–F box) entirely; paragraph range stays in instructions only.
  - Matching Features: normalize option letters to `A.` `B.` etc.; leading letters `font-bold`.
  - Matching Headings: keep headings list in `shared_options` only (not instructions); normalize Roman numerals to end with period (`i.`, `ii.`); numerals `font-bold`.
  - Summary Completion: bold numbered gap markers (`<strong>[23]</strong>`) in `shared_content`; `SharedContentAnswers` renders question number bold.
  - Multiple Choice: normalize option letters to `A.` etc.; leading letters `font-bold`; option text at 14px (not 17px).
  - Short Answer (`text_box` outside shared content): compact input `size={45}` with `w-full max-w-[340px]`.
- Practice section: passage-part selector (Passage 1/2/3 → `passage_part` 1/2/3) plus Search/Topic filters; 5-passage `<select>` dropdown with "Shuffle 5" re-roll and "Start Practice" button. No long vertical passage lists.
- Exam tools: freehand Draw (Red `#DC2626`, Dark Blue `#1E3A8A`, Orange `#EA580C`) via SVG/Canvas overlay per scrollable pane; drawings scroll with content and persist per passage. Universal Eraser removes drawings and deletes `<mark>` highlights with associated study notes. Study Notes panel is a floating, draggable window (pointer events, viewport-bounded).

## Decisions, constraints & rationale

- Framework: Next.js (App Router). Data store: Supabase.
- AI-parsed `shared_options` normalization happens in `app/api/ai-parse-test/route.ts`; rendering rules enforced in `components/exam/question-group.tsx` and previewed in `components/admin/ai-parse-test-modal.tsx`.
- `PASSAGE_TOPICS` legacy mapping in `lib/types.ts`: `Economy` → `Economics`, `Fine arts` → `Art` for backward Supabase compatibility.
- Annotation overlay anchored to each scrollable container (Reading Passage pane, Questions pane) so strokes persist per passage for the session.
- Key files: `app/globals.css`, `components/app-header.tsx`, `components/reading-app.tsx`, `components/exam-shell.tsx`, `components/exam/annotation-toolbar.tsx`, `components/exam/study-notes-drawer.tsx`, `components/exam/question-group.tsx`, `components/admin/ai-parse-test-modal.tsx`, `app/api/ai-parse-test/route.ts`, `lib/types.ts`.

## Open questions & assumptions

- Drawing persistence is session-only; no DB storage assumed unless later required.
- Eraser deletion of highlights assumes `<mark>` elements carry associated note IDs accessible from the DOM.
- `PASSAGE_TOPICS` migration is read-time mapping; existing Supabase rows may still contain legacy topic strings.