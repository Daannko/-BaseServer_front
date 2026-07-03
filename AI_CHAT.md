# AI Chat — Backend Contract

Endpoints the frontend (`board.component.ts` + `board-ai.service.ts`) calls. Types
mirror `src/app/pages/board/models/ai.model.ts`. Cookie-session auth like the
rest of the API (`withCredentials`). All bodies/responses are JSON.

Base path: `/ai`.

---

## 1. `POST /ai/chat` — send a message (existing, **extended**)

Sends the full running thread + context, gets the assistant reply + proposed
board actions. **Now also persists the turn into a session.**

### Request
```jsonc
{
  "boardId": "b123",
  "messages": [                       // entire conversation so far, in order
    { "role": "user",      "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "selection": [                      // selected NOTES sent as context (may be [])
    { "id": "n1", "type": "note", "content": { /* TiptapDoc */ },
      "x": 0, "y": 0, "width": 450, "height": 300 }
  ],
  "selectedText": "highlighted text…",// OPTIONAL — text the user highlighted in an element
  "sessionId": "s789"                 // OPTIONAL — null/omitted ⇒ create a new session
}
```

### Response
```jsonc
{
  "message": "assistant reply (markdown)",
  "actions": [                        // may be []
    { "type": "create_note", "tempId": "t1", "content": { /* TiptapDoc */ },
      "x": 0, "y": 0, "width": 450, "height": 300, "reason": "why" },
    { "type": "update_note", "id": "n1", "content": { /* TiptapDoc */ }, "reason": "why" },
    { "type": "move_note",   "id": "n1", "x": 100, "y": 200, "reason": "why" },
    { "type": "delete_note", "id": "n1", "reason": "why" }
  ],
  "sessionId": "s789",                // REQUIRED — the session this turn was stored in
                                      //  (echoes request, or the newly created id)
  "title": "Refactor onboarding notes"// REQUIRED on first turn — server-derived title
}
```

### Server behaviour
- If `sessionId` is null/missing → **create a new session** for `boardId`,
  derive `title` from the first user message (truncate sensibly), return its id.
- If `sessionId` is given → append to that session.
- **Persist both** the user message and the assistant message (with its
  `actions`) onto the session. Newly stored actions get `status: "pending"`.
- `selection` / `selectedText` are context only — not stored as messages
  (store if you want, but the frontend never reads them back).
- `tempId` lets a later action in the **same** response reference a note created
  earlier in that response. `id` is a note's server id for update/move/delete.

### Action persistence shape
Each stored assistant action keeps a resolution status:
```jsonc
{ "action": { "type": "update_note", ... }, "status": "pending" }   // pending | applied | rejected
```

---

## 2. `GET /ai/chat/sessions?boardId={id}` — list conversations

Newest first. No messages (lightweight list).

### Response
```jsonc
{
  "sessions": [
    { "id": "s789", "boardId": "b123", "title": "Refactor onboarding notes",
      "messageCount": 8, "createdAt": "ISO-8601", "updatedAt": "ISO-8601" }
  ],
  "total": 1
}
```

---

## 3. `GET /ai/chat/sessions/{id}` — one conversation (lazy-loaded on open)

### Response
```jsonc
{
  "id": "s789",
  "boardId": "b123",
  "title": "Refactor onboarding notes",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "...",
      "actions": [
        { "action": { "type": "update_note", "id": "n1",
                      "content": { /* TiptapDoc */ }, "reason": "why" },
          "status": "applied" }                 // pending | applied | rejected
      ]
    }
  ]
}
```
- Messages in chronological order.
- `actions` only on assistant messages; omit/empty for user messages.
- Return the **current** `status` for each action (set via §5).

---

## 4. `DELETE /ai/chat/sessions/{id}` — delete a conversation

`200`/`204` on success. Frontend drops it from the list; if it was open, falls
back to the list view.

---

## 5. `PATCH /ai/chat/sessions/{id}/action-status` — persist an action resolution

Called when the user applies / rejects / reverts a proposed action so the
decision survives a reload. Addressed by **position** in the stored
conversation (no per-action ids needed).

### Request
```jsonc
{
  "messageIndex": 3,   // 0-based index into the session's messages[] array
  "actionIndex": 0,    // 0-based index into that message's actions[] array
  "status": "applied"  // pending | applied | rejected
}
```
- `messageIndex` counts **all** messages (user + assistant), matching the order
  returned by §3 — i.e. the same array the client renders.
- Idempotent; just overwrite the stored status.
- Response body unused (`200`/`204`). Frontend fires this and forgets — it has
  already updated the UI locally.

> Indices are stable because conversations are append-only. If you later allow
> editing/deleting individual messages, switch this to action ids and tell the
> frontend.

---

## Frontend status semantics (FYI)

- New responses: actions start `pending`; user can **Apply** / **Reject**;
  applying an `update_note` also offers **Revert** (in-memory only).
- Loaded from history: status restored from the stored value. A still-`pending`
  action can be applied/rejected (re-persisted via §5). An already-`applied`
  edit shows "Applied" but **cannot be reverted after reload** (the pre-edit
  note body isn't persisted) — so don't expect a revert call for historical
  actions.

## Error handling
Frontend shows a snackbar on non-2xx. Reused codes: `429` (busy), `500/503`
(unavailable), `404` ("not found"). Anything else → generic `AI <op> failed`.
