# Board element API — required spec

> Replaces the old monolithic **Topic** model with per-type **Element** resources.
> Every element shares the same position/style structure; only the *content*
> payload differs by type. Backend validates each content type against its own
> schema (Tiptap for notes/sections, plain JSON for images/drawings).

---

## Shared base fields (every element)

All elements carry the same geometry + style skeleton. Create payloads require
`x, y, width, height`; the rest have sensible defaults. Update payloads are
always partial — send only changed keys.

```jsonc
{
  // ── required on create ──
  "x":          0,
  "y":          0,
  "width":      0,
  "height":     0,
  // ── optional, always returned ──
  "id":         "string",
  "boardId":    "string",
  "zIndex":     1,
  "bgColor":     "#1e1e1e | null",
  "borderColor": "#ffffff | null",
  "borderWidth": 1
}
```

> The frontend uses a single `BoardItem` base class for all of these; per-type
> classes (`BoardNote`, `BoardSection`, `BoardImage`, `BoardDrawing`) extend it
> and only add type-specific fields. `hydrateBase()` hydrates shared fields from
> any API response; `buildBaseCreate()` / `buildBaseUpdate()` serialize them back.
> No field is repeated across the four type handlers.

---

## 1. Note — rich-text sticky note

### Response

```jsonc
{
  // …shared base fields…
  "content":  { /* TiptapDoc (ProseMirror JSON) — the rich-text body */ },
  "fontSize": 25,
  "padding":  12 | null
}
```

### Endpoints

```
POST   /board/{boardId}/note       body: { x, y, width, height, content?: TiptapDoc, fontSize?, padding?, ...base }
                                   → 201 Note

PATCH  /note/{id}                  body: { ...partial Note }      → 200 Note
DELETE /note/{id}                  → 204
```

- `content` is validated as TiptapDoc. Empty doc default.
- `fontSize` frozen at creation (computed from element size if omitted).

---

## 2. Section — labeled grouping area

### Response

```jsonc
{
  // …shared base fields…
  "title": { /* TiptapDoc — the section name/label */ }
}
```

### Endpoints

```
POST   /board/{boardId}/section    body: { x, y, width, height, title?: TiptapDoc, ...base }
                                   → 201 Section

PATCH  /section/{id}               body: { ...partial Section }    → 200 Section
DELETE /section/{id}               → 204
```

---

## 3. Image — pasted/uploaded picture

### Response

```jsonc
{
  // …shared base fields…
  "src":            "string (URL — never base64)",
  "naturalWidth":   1920,    // original image dimensions; may be 0 if unknown
  "naturalHeight":  1080
}
```

### Endpoints

```
POST   /board/{boardId}/image/upload   multipart/form-data, field "file"
                                       → 201 { url, width, height }

POST   /board/{boardId}/image          body: { x, y, width, height, src, naturalWidth?, naturalHeight?, ...base }
                                       → 201 Image

PATCH  /image/{id}                     body: { ...partial Image }    → 200 Image
DELETE /image/{id}                     → 204
```

- **Upload and create are separate.** Paste flow: upload blob → get URL → create element with URL.
- Validate MIME (png/jpeg/webp/gif), max size (e.g. 10 MB) on upload.
- Delete the backing blob when the image element is deleted (synchronous; sweep job as backstop).

### Blob storage

| Phase | Backend | Notes |
|-------|---------|-------|
| Now | Local filesystem — `./uploads/boards/{boardId}/{uuid}.{ext}` | served as `/media/{key}` |
| Later | S3-compatible bucket | same interface, no DB/schema change |

Serve route: `GET /media/{key}` → bytes (now) or 302 → bucket URL (later). Long cache headers.
The `url` returned by upload is an app-relative path like `/media/boards/{boardId}/{uuid}.png`.

---

## 4. Drawing — freehand vector stroke(s)

### Response

```jsonc
{
  // …shared base fields…
  "strokes": [
    {
      "color":  "#ffd54f",
      "width":  4.5,
      "points": [0, 0, 12, 5, 24, 12]   // flat [x0,y0,…] relative to element (x,y)
    }
  ]
}
```

### Endpoints

```
POST   /board/{boardId}/drawing     body: { x, y, width, height, strokes: [...], ...base }
                                    → 201 Drawing

PATCH  /drawing/{id}                body: { ...partial Drawing }    → 200 Drawing
DELETE /drawing/{id}                → 204
```

- **Strokes are NOT Tiptap.** No ProseMirror validation. Plain JSON array of `{color, width, points: number[]}`.
- `points` are integer pixel offsets (local coordinates relative to element origin).
- PATCH may send full `strokes` replacement; individual stroke add/remove can be added later.

---

## 5. Board-scoped element list

```
GET /board/{boardId}/elements   → 200 { notes: Note[], sections: Section[], images: Image[], drawings: Drawing[] }
```

One request loads every element on a board, grouped by kind. Replaces `GET /topic/board/{boardId}`.

---

## 6. Dead — removed from spec

Everything below is **not carried forward** from the old monolithic Topic API:

| Removed | Reason |
|---------|--------|
| `Topic` (one table for everything) | split into per-type Element resources |
| `type` discriminator on Topic | resource path is the discriminator |
| `note` field (TiptapDoc) | was overloaded as magic marker string |
| `tier` | tile-era ranking |
| `relatedTopics` | connectors not implemented |
| `topicsToBeAdded / topicsToBeRemoved` | link deltas not used |
| `POST /topic/{id}/link`, `DELETE /topic/{id}/unlink` | links not used |
| `PATCH /board` (rename/description) | no rename UI exists; keep if needed later |
| `GET /topic/{id}` (single) | use board-scoped list instead |
| `GET /topic/board/{boardId}` | replaced by `GET /board/{boardId}/elements` |

---

## 7. Board canvas size + camera — P2

Persist and return on `Board`:

```jsonc
"width":  3000,
"height": 2000,
"camera": { "x": 0, "y": 0, "zoom": 1 }
```

Accepted on `POST /board`, returnable via `GET /board/{id}`, updatable via `PATCH /board/{id}`.

---

## Summary checklist

| # | Change | Prio | Endpoints |
|---|--------|------|-----------|
| 1 | Separate Note resource | P0 | `POST /board/{id}/note`, `PATCH/DELETE /note/{id}` |
| 2 | Separate Section resource | P0 | `POST /board/{id}/section`, `PATCH/DELETE /section/{id}` |
| 3 | Separate Image resource + upload | P0 | `POST /board/{id}/image/upload`, `POST /board/{id}/image`, `PATCH/DELETE /image/{id}` |
| 4 | Separate Drawing resource (no Tiptap) | P0 | `POST /board/{id}/drawing`, `PATCH/DELETE /drawing/{id}` |
| 5 | Board-scoped element list | P0 | `GET /board/{id}/elements` |
| 6 | Blob store for images (filesystem → S3) | P1 | `GET /media/{key}`, filesystem impl |
| 7 | Board canvas size + camera | P2 | `POST/GET/PATCH /board/{id}` |
| 8 | Remove dead Topic API surface | P1 | all `/topic/*`, link endpoints, `tier`, `relatedTopics` |
