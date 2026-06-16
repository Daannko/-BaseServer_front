# Board & Topic API — current state

> Draft for frontend. **API will change** — this documents what exists *today* so you can build against it / plan around it. Flagged caveats inline.

## Auth

All endpoints require a JWT:

```
Authorization: Bearer <access_token>
```

- `/board`, `/board/*` → require `PERMISSION_BASIC` authority.
- `/topic`, `/topic/*` → require any authenticated user (no specific authority enforced yet).

User is derived from the token server-side. You never send a user id.

CORS: allowed methods `GET, POST, PUT, DELETE, OPTIONS, PATCH`. Credentials allowed. Allowed origins configured server-side.

---

## Shared types

### TiptapDoc
`title`, `content` are **Tiptap JSON documents** (ProseMirror schema), sent/received as JSON objects, e.g.:

```json
{ "type": "doc", "content": [ { "type": "paragraph", "content": [ { "type": "text", "text": "Hello" } ] } ] }
```

Server validates these are valid Tiptap docs. Empty doc is the default when omitted.

> ⚠️ **`note` is NOT a TiptapDoc in practice.** The frontend uses `note` as a **plain-string type discriminator** for the element kind: `__note__`, `__section__`, `__image__`, `__drawing__`. `Topic.note` is typed `string` client-side and compared by equality on load. See `BOARD_API_REQUIRED.md` for the proposed explicit `type` field that replaces this overload.

### Board (response object)
```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "authorId": 0,
  "topics": ["topicId", "..."]
}
```

### Topic (response object)
```json
{
  "id": "string",
  "title":   { /* TiptapDoc */ },
  "content": { /* TiptapDoc */ },
  "note":    { /* TiptapDoc */ },
  "tier": 0,
  "boardId": "string",
  "authorId": 0,
  "x": 0,
  "y": 0,
  "width": 0,
  "height": 0,
  "relatedTopics": ["topicId", "..."]
}
```

---

## Board endpoints — base `/board`

### POST `/board` — create board
Body (`AddBoardRequestDTO`):
```json
{
  "name": "string (required, max 255)",
  "description": "string (optional, max 1000)",
  "width": 0,
  "height": 0
}
```
Returns: `Board`.

> ⚠️ `width`/`height` accepted in payload but not stored on the `Board` model — likely board-canvas dimensions, behavior may change.

### GET `/board/all` — list current user's boards
Returns array of `GetBoardInfoResponse`:
```json
[ { "id": "string", "name": "string", "description": "string" } ]
```
> Lightweight list shape (no topics). Note: response field spelling is `Reponse` internally but JSON is the 3 fields above.

### GET `/board/{id}` — get one board
Returns: `Board` (full, includes `topics` id list).

### PATCH `/board` — update board
Body (`UpdateBoardRequestDTO`):
```json
{
  "id": "string (required)",
  "name": "string (optional, max 255)",
  "description": "string (optional, max 1000)"
}
```
Returns: `200`, empty body.
> ⚠️ `id` is in the **body**, not the path (inconsistent with delete/get). Likely to change.

### DELETE `/board/{id}` — delete board
Returns: `200`, empty body.

---

## Topic endpoints — base `/topic`

### POST `/topic` — create topic
Body (`TopicCreateRequestDTO`):
```json
{
  "boardId": "string (required)",
  "title":   { /* TiptapDoc, required */ },
  "content": { /* TiptapDoc, optional */ },
  "note":    { /* TiptapDoc, optional */ },
  "x": 0,
  "y": 0,
  "width": 0,
  "height": 0,
  "relatedTopics": ["topicId", "..."]
}
```
Returns: `Topic`.

### GET `/topic/{id}` — get one topic
Returns: `Topic`.

### GET `/topic/board/{boardId}` — all topics of a board
Returns: array of `Topic`.

### PATCH `/topic/{id}` — update topic
Body (`TopicUpdateRequestDTO`) — all fields optional, send only what changes:
```json
{
  "title":   { /* TiptapDoc */ },
  "content": { /* TiptapDoc */ },
  "note":    { /* TiptapDoc */ },
  "x": 0,
  "y": 0,
  "width": 0,
  "height": 0,
  "topicsToBeAdded":   ["topicId", "..."],
  "topicsToBeRemoved": ["topicId", "..."]
}
```
Returns: `200`, empty body.
> Links edited here via add/remove arrays (delta-style), OR via the dedicated link endpoints below.

### DELETE `/topic/{id}` — delete topic
Returns: `200`, empty body.

### POST `/topic/{id}/link/{otherId}` — link two topics
Returns: `200`, empty body.

### DELETE `/topic/{id}/unlink/{otherId}` — unlink two topics
Returns: `200`, empty body.

---

## Known rough edges (expect change)
- Board update takes `id` in body, not path.
- `width`/`height` on board create not persisted.
- Topic endpoints not yet locked to a specific permission (only authenticated).
- Two ways to manage topic links (PATCH arrays vs link/unlink endpoints) — may consolidate.
- No pagination on list endpoints.
- Empty-body responses return `200` with no content (no `201`/`204` distinction yet).

## Frontend gaps (what we still can't save) — see `BOARD_API_REQUIRED.md`
The board now has 4 **element types** (note / section / image / drawing), currently forced into
a single `Topic` model. Several editable properties have **nowhere to live** in the current API
and are lost on reload:

- **Element kind** smuggled through `note` as a magic string — needs first-class per-type resources.
- **Styling** on all elements: `bgColor`, `borderColor`, `borderWidth`, note `fontSize`, note `padding`.
- **Stacking order** (`zIndex`) — notes and sections each keep an independent z-counter.
- **Board canvas size** (`width`/`height`) and **camera** (pan x/y + zoom) — not stored/returned.
- **Images** persisted as base64 data URLs inside `content` — should live in a blob store
  (filesystem now, S3 later), not the DB.

**Dead tile-era surface** (zero frontend references — safe to remove): `tier`, `relatedTopics`,
`topicsToBeAdded/Removed`, `POST/DELETE /topic/*/link`, `note`-as-TiptapDoc, `PATCH /board`.
All `/topic/*` endpoints replaced by per-type element endpoints.

`BOARD_API_REQUIRED.md` describes the per-type Element API that replaces Topic entirely.
