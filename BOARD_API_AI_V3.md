# Board AI API — V3 (frontend deltas → backend TODO)

> Companion to `BOARD_API_AI.md` (spec) and `BOARD_API_AI_V2.md` (what backend built).
> This file lists what the **frontend now sends/expects** that the V2 backend does not
> yet handle. Quiz system only — fact-check (§1) and chat (§3) still deferred.

The frontend quiz flow is implemented: option pickers (question types, count, custom
prompt) in the AI panel, note→quiz reverse lookup, geometry per note, generate → take →
evaluate, and reopening stored quizzes.

---

## Backend TODO

### 1. Honor the new `prompt` field (generate) — REQUIRED

`POST /ai/quiz/generate` now may include:

```jsonc
{
  "notes": [ /* … */ ],
  "coverage": 0.75,
  "boardId": "string | null",
  "questionTypes": ["SINGLE_CHOICE","MULTIPLE_ANSWER","TRUE_FALSE","OPEN"],
  "count": 5,
  "prompt": "focus on edge cases, exam style"   // <-- NEW
}
```

- `prompt` is an **optional** free-text user instruction. Inject it into the generation
  system/user prompt as *guidance*, not authoritative content.
- It must NOT override `coverage` / `questionTypes` / `count` — those still bound the output.
- Treat absent/empty `prompt` as "no extra steer" (current behavior).
- Keep DeepSeek JSON-mode happy (the word "json" must remain in the prompt) — unaffected,
  just don't drop it when appending the user text.

Spec reference: `BOARD_API_AI.md` §2.2 (updated).

### 2. Strictly respect `questionTypes` — REQUIRED (UI breaks otherwise)

The frontend **only renders** these four types:

```
SINGLE_CHOICE | MULTIPLE_ANSWER | TRUE_FALSE | OPEN
```

and sends exactly that set in `questionTypes`. The other spec types
(`FILL_BLANK`, `MATCHING`, `ORDERING`) are **not rendered yet** — a question of those
types shows up blank in the taking UI.

- The backend MUST constrain generated questions to the requested `questionTypes`.
- If V2 currently lets the model emit any type, add a hard filter / prompt constraint and
  (defensively) drop or regenerate any out-of-set question before returning.
- When `questionTypes` is omitted, backend's default is fine — but the frontend always
  sends the 4-type whitelist today.

### 3. Feed note geometry to the model — REQUIRED for the layout feature

Each note in `notes[]` is sent with world-space geometry:

```jsonc
{ "id": "…", "content": { /* TiptapDoc */ }, "x": 120, "y": -40, "width": 300, "height": 180 }
```

- V2 (#9) stores/echoes note ids but does not state geometry reaches the model.
- To satisfy the product ask ("model should understand positions and layout"), include
  each note's `x/y/width/height` in the generation prompt (e.g. a short layout summary:
  which notes are near each other, above/below, grouped).
- Geometry stays **optional** — older clients may omit it; degrade gracefully.

### 4. `avoidExisting` — generate fresh questions vs. existing quizzes — REQUIRED

`POST /ai/quiz/generate` now may include:

```jsonc
{
  "notes": [ /* … */ ],
  "questionTypes": [ /* … */ ],
  "count": 5,
  "avoidExisting": true            // <-- NEW (default false)
}
```

When `avoidExisting` is `true`:

- The **backend itself** looks up the quizzes already linked to `notes[].id` (the same
  reverse lookup as `GET /ai/quiz?noteId=…`), collects their questions, and instructs the
  model to produce **different** questions — new angles/sub-topics, not rephrasings of the
  existing ones.
- The frontend does **not** send the existing questions; backend pulls them (it owns the
  link + the answer keys; keeps payload small; avoids leaking keys to the client).
- If there are no linked quizzes, behaves as `false` (nothing to avoid).
- Best-effort: if the notes are small and material is exhausted, the backend may still
  return overlapping questions rather than failing — prefer coverage over hard-dedup.

Frontend: shown as an **"Avoid questions from these quizzes"** checkbox, only when the
selection already has linked quizzes. Sent as `avoidExisting: true` only when checked
**and** at least one existing quiz is present.

### 5. Per-question source attribution must be precise — REQUIRED

Problem: a quiz generated from 10 selected notes where a given question only concerns 2 of
them must link that question (and, transitively, the quiz) to **only those 2** — not all 10.

Rules:

- Each `Question` carries **`sourceNoteIds: string[]`** — the exact note id(s) the question
  derives from (a subset of the input notes). Empty/absent for expansion-material questions
  (`coverage < 1.0`) that come from related-but-not-stated topics.
  - This **replaces** the old singular `sourceNoteId` (keep emitting `sourceNoteId` too if
    convenient for back-compat, but `sourceNoteIds` is authoritative).
- The quiz's top-level **`Quiz.sourceNoteIds` = the union of all questions' `sourceNoteIds`**
  — i.e. only the notes actually used, **not** the full input selection.
  - Consequence (intended): pick 10 notes, but if questions only touch 2, the quiz links to
    those 2. The note→quiz reverse lookup (`GET /ai/quiz?noteId=`) from the other 8 notes
    will **not** return this quiz. This is the desired behavior.
- Ids must be the exact ids the client sent in `notes[].id` (so reverse lookup matches),
  per V2 #9 (don't invent ids; only echo given ones).

Frontend already reads `sourceNoteIds` (falls back to `sourceNoteId`).

### 6. Use markdown code formatting in AI text — REQUESTED

The frontend now renders a markdown subset in all AI-authored text (quiz `question`,
option `text`, `explanation`, `feedback`, `sampleAnswer`, and chat messages): **fenced
code blocks** ` ``` `, **inline code** `` ` ``, `**bold**`, `*italic*`, newlines.

- The model should wrap code/identifiers/keywords in inline code (`` `std::vector` ``) and
  multi-line snippets in fenced blocks (```` ```cpp … ``` ````). Greatly improves
  readability for programming quizzes.
- Plain text still renders fine (no markdown required) — this is additive.
- Frontend escapes + DOMPurify-sanitizes everything, so raw HTML in AI text is neutralized;
  only the markdown subset becomes formatting.

---

## Already implemented in V2 (no change needed)

- `GET /ai/quiz?noteId=` reverse lookup (note → existing quizzes) — used on selection change.
- `count`, `boardId` on generate.
- `POST /ai/quiz/{id}/evaluate` + `POST /ai/quiz/evaluate` (one-off), with `score` /
  `feedback` / partial credit.
- `GET /ai/quiz/{id}` (taking) + `?reveal=true`; `PATCH`; `DELETE`; `GET /ai/quiz/tags`.
- Per-question + quiz-level `tags`.

---

## Operational blocker (not code)

### `403` on `/ai/**` — `PERMISSION_BASIC`

Observed in the browser: `403` on an `/ai` call for the test user. `403` = authenticated
but lacking authority, so quiz endpoints will reject until **either**:

- the user's granted authorities actually include `PERMISSION_BASIC`, **or**
- the security config maps `/ai/quiz/**` to the authority the user does have.

Verify the JWT's granted authorities and the `/ai/**` security mapping. Independent of the
three TODOs above.

---

## Frontend not-yet-wired (for backend awareness)

- `FILL_BLANK` / `MATCHING` / `ORDERING` rendering — excluded via the `questionTypes`
  whitelist on purpose; enabling them is a later frontend pass.
- Quiz library/browse-by-tag view — service methods (`listQuizzes`, `getQuizTags`) exist,
  UI pending.
