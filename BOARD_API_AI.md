# Board AI API

> AI helpers for selected notes. Backend owns the LLM prompt/judge logic;
> frontend only sends note content + parameters and renders the returned answer.

---

## Auth & protocol

Same as rest of board API — `Authorization: Bearer <token>`, cookie-based session.
All endpoints are note-scoped: only notes from boards the user owns are accepted.

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

## 3. Rate limits & errors

| Status | Meaning |
|--------|---------|
| `429` | Too many AI requests — back off and retry |
| `400` | Too many notes, missing content, invalid coverage |
| `503` | AI backend unavailable — try again later |

---

## 4. Frontend integration summary

| # | Feature | Endpoint | Priority |
|---|---------|----------|----------|
| 1 | Fact-check selected notes | `POST /ai/fact-check` | P0 |
| 2 | Generate quiz from selected notes + coverage slider | `POST /ai/quiz/generate` | P0 |
| 3 | Evaluate quiz answers (server-side) | `POST /ai/quiz/evaluate` | P2 |
