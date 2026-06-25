# Board AI API

> AI helpers for selected notes. Backend owns the LLM prompt/judge logic;
> frontend only sends note content + parameters and renders the returned answer.
>
> Endpoints 1–2 are stateless analyzers (fact-check, quiz). Endpoint 3 (chat) is a
> conversational assistant that can **propose edits** to the board; the frontend
> shows those edits for the user to approve before anything is mutated.

---

## Auth & protocol

Same as rest of board API — `Authorization: Bearer <token>`, cookie-based session.
All endpoints are note-scoped: only notes from boards the user owns are accepted.

---

## Shared types

### `NoteInput` — a selected element passed as context

```
{
  "id": "string (element id — serverId if the note is saved, else the local id)",
  "type": "note",                 // only "note" for now; more types later
  "content": { /* TiptapDoc — the rich-text body */ },

  // Canvas geometry (world coordinates). OPTIONAL for fact-check/quiz
  // (older clients omit them); the chat endpoint always sends them so the
  // model understands layout / relative position of the selected notes.
  "x": number,
  "y": number,
  "width": number,
  "height": number
}
```

- `id` is the handle the model must use to refer back to an element in any
  returned action. The backend MUST NOT invent ids — only echo ids it was given.
- Geometry is in the board's world space (the same units as element x/y/width/height).
  This is the "where is it on the board" signal asked for in the chat feature.
- **Future:** section membership, image/section element types, and a board-level
  map may be added here. Treat unknown fields as additive and ignore them.

`TiptapDoc` = a ProseMirror/Tiptap document JSON (`{ "type": "doc", "content": [...] }`).

---

## 1. Fact-check — verify each note independently

### Request

```
POST /ai/fact-check
Content-Type: application/json

{
  "notes": [
    {
      "id": "string (note element id)",
      "content": { /* TiptapDoc — the rich-text body */ }
    }
  ]
}
```

- Max 10 notes per request (reject with `400` beyond that).
- Each `id` must be a valid note owned by the user on a board they own
  (server **may** validate; send the plain text from `content` regardless).

### Response

```
200
{
  "results": [
    {
      "noteId": "string",
      "ok": true,
      "verdict": {
        "score": "VERIFIED" | "MOSTLY_VERIFIED" | "MIXED" | "MOSTLY_INCORRECT" | "INCORRECT",
        "summary": "string (1-2 sentence human-readable summary)",
        "details": [
          {
            "claim": "string (excerpt from the note being checked)",
            "assessment": "TRUE" | "FALSE" | "UNCERTAIN" | "OPINION",
            "explanation": "string (brief reasoning, max ~200 chars)"
          }
        ]
      }
    }
  ]
}
```

- `score`: overall confidence level for the whole note.
- `details`: per-claim breakdown. `OPINION` = not falsifiable (e.g. "cats are better than dogs").
- Backend chooses how many claims to extract (frontend renders whatever it receives).

### UI behavior

- Selected notes → navbar shows fact-check button.
- Clicking it sends all selected notes in one request.
- Each note's verdict is shown inline (icon + short summary overlay on the note).
- Click overlay → expand details list.

---

## 2. Quiz — generate, store, and evaluate quizzes from selected notes

> Quizzes are **persistent**. Generating one creates a stored quiz (owned by the user,
> optionally tied to a board) that can be listed, re-opened, edited, re-taken, and
> deleted later. Each quiz carries **tags** describing what it is about, and supports
> **multiple question types** — including open questions graded by the AI.

### 2.0 Question types

The `type` discriminator drives both the answer payload and the grading strategy.
The set is open-ended — unknown types must be ignored by the frontend, not error.

| `type` | Client answer (§2.7) | `answerKey` branch | Graded by | Notes |
|--------|----------------------|--------------------|-----------|-------|
| `SINGLE_CHOICE` | one key `"B"` | `keys` (len 1) | exact match | exactly one correct option (was `MULTIPLE_CHOICE`) |
| `MULTIPLE_ANSWER` | array `["A","C"]` | `keys` | set match | 1+ correct; order-independent; partial credit |
| `TRUE_FALSE` | `"TRUE"`\|`"FALSE"` | `keys` (len 1) | exact match | special case of single choice |
| `OPEN` | free text | `rubric` + `sampleAnswer` | **AI** | short/long answer; AI judges vs rubric |
| `FILL_BLANK` | array, one per blank | `keys` (or `rubric`) | exact / **AI** | `question` has `___` markers; `rubric` set ⇒ AI tolerates synonyms |
| `MATCHING` | `{ leftKey: rightKey }` | `pairs` | set match | match `left[]` to `right[]`; partial credit |
| `ORDERING` | ordered keys | `order` | sequence match | put `options[]` in correct order; partial credit |

> **Compat:** the old `MULTIPLE_CHOICE` value is accepted as an alias for
> `SINGLE_CHOICE` on read. New quizzes should emit `SINGLE_CHOICE`.

### 2.1 Stored quiz model

```
Quiz {
  "id": "string (server quiz id)",
  "title": "string",
  "tags": ["string", ...],          // topic tags — what the quiz is about (see 2.1a)
  "boardId": "string | null",       // board it was generated from, if any
  "sourceNoteIds": ["string", ...], // notes the quiz was generated from
  "coverage": number,               // 0.0–1.0 used at generation time
  "questionCount": number,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "questions": [ Question, ... ]    // omitted from list endpoints; present on detail
}

Question {
  "id": "string (unique within the quiz — used to submit answers)",
  "type": "SINGLE_CHOICE" | "MULTIPLE_ANSWER" | "TRUE_FALSE" | "OPEN" | "FILL_BLANK" | "MATCHING" | "ORDERING",
  "question": "string (prompt; may contain ___ blanks for FILL_BLANK)",
  "points": number,                 // optional weight, default 1

  // ── prompt material (always sent, both taking + reveal) ──
  // choice-style types (SINGLE_CHOICE, MULTIPLE_ANSWER, ORDERING)
  "options": [ { "key": "A", "text": "string" }, ... ],
  // MATCHING only
  "left":  [ { "key": "L1", "text": "string" }, ... ],
  "right": [ { "key": "R1", "text": "string" }, ... ],

  // ── answer key (server-side only; STRIPPED in taking mode, see 2.1b) ──
  // One normalized object. Grader switches on `type`. Exactly one branch is set:
  "answerKey": {
    "keys":   ["B"],                // SINGLE_CHOICE | TRUE_FALSE | MULTIPLE_ANSWER | FILL_BLANK (one per blank)
    "pairs":  { "L1": "R2", ... },  // MATCHING
    "order":  ["B", "A", "C"],      // ORDERING
    "rubric": "string",             // OPEN / AI-graded FILL_BLANK — what a correct answer must contain
    "sampleAnswer": "string"        // OPEN — reference answer, shown after grading
  },

  "tags": ["string", ...],          // per-question topic tags, e.g. ["JAVA","OOP"] (see 2.1a)
  "explanation": "string (revealed after answering)",
  "sourceNoteId": "string | null"
}
```

#### 2.1a Tags — quiz-level AND question-level

Tags exist at **two** levels:

- **Quiz tags** (`Quiz.tags`) — what the whole quiz is about, used to filter the
  "my quizzes" list. Backend derives them from the union of question tags + note content.
- **Question tags** (`Question.tags`) — what each individual question is about, e.g.
  `["JAVA","OOP"]`, `["JAVA","COLLECTIONS"]`. Lets the UI label questions, group a
  results breakdown by topic ("you missed 3/4 OOP questions"), and later build
  cross-quiz "practice this tag" sets.

Rules:
- Backend generates tags from the source content. 1–8 tags per question, 1–8 per quiz.
- Casing: emit a canonical form (e.g. uppercase topic codes `JAVA`, `OOP`) consistently
  so equal tags collapse. Frontend treats them as opaque strings, compared case-sensitively.
- `GET /ai/quiz/tags` returns the distinct **quiz-level** tag set with counts, for filter UIs.

#### 2.1a-bis Note ↔ quiz link (persistent, queryable both ways)

When a quiz is generated it is **permanently linked** to the notes it was built from
via `Quiz.sourceNoteIds` (and per-question `Question.sourceNoteId`). The link must be
queryable **from the note side** so the UI can, when the user selects/clicks notes,
list the quizzes that already exist for them — instead of always generating a new one.

- The link is stored by note **element id** — the same id the frontend sends in `notes[].id`
  (serverId if saved, else local id). Backend must persist whatever id it was given so the
  reverse lookup matches what the client holds.
- A quiz can link many notes; a note can have many quizzes (many-to-many).
- Deleting a note does **not** delete its quizzes; the dangling id is simply dropped from
  any future reverse-lookup result (or kept — backend's choice — but must not 500).

Reverse lookup (note → existing quizzes):

```
GET /ai/quiz?noteId={id}&noteId={id2}     // repeatable; OR semantics (any linked note)
→ 200  { "quizzes": [ <summary>, ... ], "total": N }
```

Use this on selection-change to show an "Existing quizzes (N)" entry next to the
"Generate quiz" button.

#### 2.1b Answer-key exposure (anti-cheat)

The whole `answerKey` object is **never** included while the user is *taking* the
quiz. The grading data lives server-side only and is returned only:

- inside an **evaluate** response (per question — via `correctAnswer`), and
- on a **detail fetch with `?reveal=true`** (only the quiz owner; for review/editing).

A normal `GET /ai/quiz/{id}` (taking mode) returns questions with prompt material
(`options`/`left`/`right`) but **without** `answerKey`.

---

### 2.2 Generate a quiz (creates + stores it)

```
POST /ai/quiz/generate
Content-Type: application/json

{
  "notes": [
    { "id": "string", "content": { /* TiptapDoc */ } }
  ],
  "coverage": 0.75,                 // 0.0–1.0 (see slider table below)
  "boardId": "string | null",       // optional — associates the stored quiz with a board
  "questionTypes": ["SINGLE_CHOICE","TRUE_FALSE","OPEN"],  // optional whitelist; default = backend's choice
  "count": 10,                      // optional target question count (backend may clamp 4–20)
  "prompt": "string",               // optional free-text steer (focus/difficulty/style) — appended to the system prompt
  "persist": true                   // optional, default true. false = one-off, not stored
}
```

- `notes[]` carry `x`/`y`/`width`/`height` (world coords) so the model understands the
  layout/position of the selected notes (same geometry as `NoteInput`, §Shared types).
- `prompt` is an optional user instruction (e.g. "focus on edge cases, exam style"). The
  backend should treat it as guidance, not as authoritative content, and still respect
  `coverage` / `questionTypes` / `count`.

#### Coverage slider

| Value | Meaning |
|-------|---------|
| `1.0` | **Strict**: only use topics/claims already in the selected notes. Nothing new. |
| `0.5` | **Mixed**: base the quiz on the notes but introduce related topics / side info not explicitly in the notes. |
| `0.0` | **Exploratory**: only use topics *related to* the note content but never cover anything already stated in the notes. |
| `0.0–1.0` | Smooth scale between the extremes. Backend interpolates the ratio of known-material questions vs. expansion-material questions. |

#### Response

```
200
{
  "id": "string (new stored quiz id — null if persist:false)",
  "title": "string (backend-generated)",
  "tags": ["string", ...],
  "boardId": "string | null",
  "sourceNoteIds": ["string", ...],
  "coverage": 0.75,
  "createdAt": "ISO-8601",
  "questions": [ Question, ... ]    // WITHOUT correct answers (taking mode)
}
```

- 4–20 questions per request. Backend chooses length based on note count/content unless `count` given.
- `sourceNoteId` may be `null` for expansion-material questions (coverage < 1.0).
- Max 10 notes per request (reject `400` beyond that).

---

### 2.3 List stored quizzes

```
GET /ai/quiz?boardId={id}&noteId={id}&tag={tag}&tag={tag2}&q={search}&limit=50&offset=0
```

- All filters optional. `tag` repeatable (AND semantics). `noteId` repeatable (OR — any
  linked note; this is the note → existing-quizzes reverse lookup of §2.1a-bis). `q`
  matches title/tags.
- Returns quiz **summaries** (no `questions` array).

```
200
{
  "quizzes": [
    {
      "id": "string", "title": "string", "tags": ["..."],
      "boardId": "string | null", "questionCount": 12,
      "coverage": 0.75, "createdAt": "ISO-8601", "updatedAt": "ISO-8601"
    }
  ],
  "total": 37
}
```

### 2.3a List distinct tags

```
GET /ai/quiz/tags
→ 200
{ "tags": [ { "tag": "mitosis", "count": 4 }, ... ] }
```

### 2.4 Fetch one quiz

```
GET /ai/quiz/{id}                 // taking mode — NO correct answers
GET /ai/quiz/{id}?reveal=true     // owner only — full Question incl. answerKey
→ 200  Quiz   (with questions[])
→ 404  not found / not owned
```

### 2.5 Update a quiz (owner)

```
PATCH /ai/quiz/{id}
Content-Type: application/json

{
  "title": "string",                // optional
  "tags": ["string", ...],          // optional — replaces the tag set
  "questions": [ Question, ... ]     // optional — full replace of the question list (incl. correct keys)
}
→ 200  Quiz (reveal shape)
```

- Use for renaming, retagging, hand-editing AI questions, or fixing a bad answer key.
- Partial: omitted fields are left untouched.

### 2.6 Delete a quiz (owner)

```
DELETE /ai/quiz/{id}
→ 204
```

---

### 2.7 Evaluate answers

Two forms. Both return per-question results; **OPEN / AI-graded** questions are scored
by the model against the stored `answerKey.rubric` / `answerKey.sampleAnswer`.

**Stored quiz (preferred — server already has the questions + keys):**

```
POST /ai/quiz/{id}/evaluate
Content-Type: application/json

{
  "answers": [
    { "questionId": "string", "answer": <type-specific, see 2.0> }
  ]
}
```

**One-off quiz (`persist:false`, server holds nothing) — send the questions back:**

```
POST /ai/quiz/evaluate
Content-Type: application/json

{
  "quiz": { "questions": [ Question, ... ] },   // full questions incl. answer data
  "answers": [ { "questionId": "string", "answer": <type-specific> } ]
}
```

#### Response (both)

```
200
{
  "results": [
    {
      "questionId": "string",
      "correct": true,              // boolean verdict (threshold-based for OPEN)
      "score": 1.0,                 // 0.0–1.0 partial credit (OPEN / MULTIPLE_ANSWER / MATCHING / ORDERING)
      "correctAnswer": <type-specific>,   // the canonical right answer, for display
      "feedback": "string | null",  // AI note for OPEN/FILL_BLANK — why this score
      "explanation": "string"       // the question's stored explanation
    }
  ],
  "score": "7.5/10",                // sum of per-question score * points
  "percentage": 75
}
```

- `correct` for `MULTIPLE_ANSWER` / `MATCHING` / `ORDERING` is `true` only on a full
  match; `score` carries the partial credit.
- For `OPEN` / AI-graded `FILL_BLANK`, the backend runs an AI judge against
  `answerKey.rubric` / `answerKey.sampleAnswer`, returns a `score` (0–1) plus
  `feedback`, and sets `correct` when
  `score` ≥ a backend threshold.

---

## 3. Chat — conversational board assistant

A multi-turn chat where the user can ask the assistant to read the notes they have
selected and **propose** changes (edit existing notes, add new ones). The backend is
stateless: the frontend replays the whole conversation on every turn.

> **Important:** the response NEVER mutates the board directly. The assistant returns
> a list of *proposed* actions; the frontend renders them as approve/reject cards and
> only applies the ones the user accepts. Keep actions small and self-contained.

### Request

```
POST /ai/chat
Content-Type: application/json

{
  "boardId": "string",
  "messages": [
    { "role": "user" | "assistant", "content": "string (markdown/plain text)" }
  ],
  "selection": [ NoteInput, ... ]   // see Shared types; notes only for now, may be empty
}
```

- `messages`: full history so far, oldest first; the last entry is the new user turn.
  The backend holds no session state — everything needed is in this array.
- `selection`: the elements the user currently has selected, each enriched with
  geometry. This is the *only* board context sent for now (no full-board dump).
  May be empty — the user can chat without a selection.
- Max 10 notes in `selection` (reject `400` beyond that), same cap as fact-check.

### Response

```
200
{
  "message": "string (assistant reply, markdown — shown in the chat thread)",
  "actions": [ Action, ... ]   // may be empty when the assistant only answers in prose
}
```

### Action types

All geometry is in world coordinates (same space as `NoteInput`). Notes only for now;
the `type` discriminator is designed so new element types slot in later. Every action
carries a short `reason` rendered in the approval card.

```
// Add a new note. The server has no id yet, so the model assigns a tempId it can
// reference from later actions in the SAME response. width/height/x/y optional —
// frontend supplies sensible defaults (placed near the current viewport) if omitted.
{
  "type": "create_note",
  "tempId": "string (unique within this response)",
  "content": { /* TiptapDoc */ },
  "x": number,            // optional
  "y": number,            // optional
  "width": number,        // optional
  "height": number,       // optional
  "reason": "string (short, human-readable — why this note is being added)"
}

// Replace a note's rich-text body. `id` MUST be an id the frontend sent.
{
  "type": "update_note",
  "id": "string",
  "content": { /* TiptapDoc */ },
  "reason": "string"
}

// Reposition a note.
{
  "type": "move_note",
  "id": "string",
  "x": number,
  "y": number,
  "reason": "string"
}

// Remove a note.
{
  "type": "delete_note",
  "id": "string",
  "reason": "string"
}
```

- `id` on `update_note` / `move_note` / `delete_note` MUST match an `id` the frontend
  sent in `selection` (or a `tempId` minted earlier in the same response). Unknown ids
  are dropped by the frontend.
- The assistant should prefer the smallest set of actions that satisfies the request,
  and explain them in `message`.

### UI behavior (propose → approve)

- A chat panel toggles open from the board navbar. Selected notes are auto-attached as
  context (shown as chips above the input).
- The assistant `message` is rendered in the thread.
- Each returned action becomes a **proposed-change card** (icon + `reason` + a content
  preview). The board is NOT touched yet.
- The user clicks **Apply** on a card (or **Apply all**). Applying performs the local
  mutation through the normal element pipeline and pushes one **undo** entry, so
  `Ctrl+Z` reverts an applied AI change like any other edit.
- **Reject** discards the card. Unapplied actions never reach the server.

---

## 4. Rate limits & errors

| Status | Meaning |
|--------|---------|
| `429` | Too many AI requests — back off and retry |
| `400` | Too many notes, missing content, invalid coverage, invalid action |
| `503` | AI backend unavailable — try again later |

---

## 5. Frontend integration summary

| # | Feature | Endpoint | Priority |
|---|---------|----------|----------|
| 1 | Fact-check selected notes | `POST /ai/fact-check` | P0 |
| 2 | Generate + store quiz (tags, multi-type questions) | `POST /ai/quiz/generate` | P0 |
| 3 | Chat assistant (read selected notes, propose note edits/creates) | `POST /ai/chat` | P0 |
| 4 | List my quizzes (filter board/tag/search) + note→quiz reverse lookup | `GET /ai/quiz` (`?noteId=`) | P1 |
| 5 | List distinct quiz tags | `GET /ai/quiz/tags` | P1 |
| 6 | Fetch one quiz (taking / `?reveal=true` owner) | `GET /ai/quiz/{id}` | P1 |
| 7 | Edit quiz (title, tags, questions) | `PATCH /ai/quiz/{id}` | P2 |
| 8 | Delete quiz | `DELETE /ai/quiz/{id}` | P2 |
| 9 | Evaluate answers (incl. AI-graded OPEN questions) | `POST /ai/quiz/{id}/evaluate` | P1 |
