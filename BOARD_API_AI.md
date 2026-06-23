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

## 2. Quiz — generate questions from selected notes

### Request

```
POST /ai/quiz/generate
Content-Type: application/json

{
  "notes": [
    {
      "id": "string",
      "content": { /* TiptapDoc */ }
    }
  ],
  "coverage": 0.75   // 0.0 – 1.0   (see below)
}
```

### Coverage slider

| Value | Meaning |
|-------|---------|
| `1.0` | **Strict**: only use topics/claims already in the selected notes. Nothing new. |
| `0.5` | **Mixed**: base the quiz on the notes but introduce related topics / side info not explicitly in the notes. |
| `0.0` | **Exploratory**: only use topics *related to* the note content but never cover anything already stated in the notes. |
| `0.0–1.0` | Smooth scale between the extremes. Backend interpolates the ratio of known-material questions vs. expansion-material questions. |

### Response

```
200
{
  "questions": [
    {
      "id": "string (unique per question — used to submit answers)",
      "type": "MULTIPLE_CHOICE" | "TRUE_FALSE",
      "question": "string (the question text)",
      "options": [             // only for MULTIPLE_CHOICE
        { "key": "A", "text": "string" },
        { "key": "B", "text": "string" },
        { "key": "C", "text": "string" },
        { "key": "D", "text": "string" }
      ],
      "explanation": "string (revealed after answering — explains the correct answer)",
      "sourceNoteId": "string | null (which note inspired this question, if any)"
    }
  ],
  "title": "string (optional quiz title — backend may generate one)"
}
```

- 4–20 questions per request. Backend chooses length based on note count/content.
- `sourceNoteId` may be `null` for expansion-material questions (coverage < 1.0).

### 2b. Submit answers (optional — P2)

```
POST /ai/quiz/evaluate
Content-Type: application/json

{
  "questions": [
    { "id": "string", "answer": "A" | "B" | "C" | "D" | "TRUE" | "FALSE" }
  ]
}
→ 200
{
  "results": [
    { "questionId": "string", "correct": true, "correctAnswer": "B" }
  ],
  "score": "3/5",
  "percentage": 60
}
```

Frontend can also evaluate locally (return the correct answer key), but server-side
prevents cheating when needed.

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
| 2 | Generate quiz from selected notes + coverage slider | `POST /ai/quiz/generate` | P0 |
| 3 | Chat assistant (read selected notes, propose note edits/creates) | `POST /ai/chat` | P0 |
| 4 | Evaluate quiz answers (server-side) | `POST /ai/quiz/evaluate` | P2 |
