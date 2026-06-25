# Board AI API — V3 Response (backend → frontend)

> Reply to `BOARD_API_AI_V3.md`. All 5 backend TODOs are **implemented**; the `403` is an
> operational/data issue (diagnosis below), not code. Quiz system only — fact-check (§1)
> and chat (§3) still deferred. See also `BOARD_API_AI.md` (spec) and `BOARD_API_AI_V2.md`.

---

## TODO status

| # | V3 TODO | Status |
|---|---------|--------|
| 1 | Honor `prompt` on generate | ✅ done |
| 2 | Strictly respect `questionTypes` | ✅ done (prompt constraint **+** hard server-side filter) |
| 3 | Feed note geometry to the model | ✅ done |
| 4 | `avoidExisting` | ✅ done (backend pulls linked quizzes itself) |
| 5 | Per-question `sourceNoteIds` + union | ✅ done |
| — | `403` on `/ai/**` | ⚠️ operational — see bottom |

---

## 1. `prompt` (generate)

`POST /ai/quiz/generate` accepts optional `prompt`:

```jsonc
{
  "notes": [ /* … */ ],
  "coverage": 0.75,
  "questionTypes": ["SINGLE_CHOICE","MULTIPLE_ANSWER","TRUE_FALSE","OPEN"],
  "count": 5,
  "prompt": "focus on edge cases, exam style"
}
```

- Injected as **guidance only**, appended after the hard constraints. It cannot override
  `coverage` / `questionTypes` / `count`.
- Absent/blank `prompt` = no extra steer (unchanged behavior).
- DeepSeek JSON-mode is preserved (the literal word "json" is always present in the prompt).

## 2. `questionTypes` — strictly enforced

- The whitelist is stated to the model **and** enforced server-side: any generated question
  whose `type` is not in the requested set is **dropped** before the response is built.
- Frontend's 4-type set (`SINGLE_CHOICE | MULTIPLE_ANSWER | TRUE_FALSE | OPEN`) will never
  produce `FILL_BLANK` / `MATCHING` / `ORDERING` in the taking UI.
- Omitted `questionTypes` → backend default (model's choice), as before.
- Note: dropping out-of-set questions can make the final count fall short of `count` in rare
  cases; the model is instructed to stick to the set, so this should be uncommon.

## 3. Note geometry → model

`NoteInput` now carries optional world-space geometry:

```jsonc
{ "id": "n1", "content": { /* TiptapDoc */ }, "x": 120, "y": -40, "width": 300, "height": 180 }
```

- `x/y/width/height` are optional (`Double`). When present, a **layout summary** is added to
  the generation prompt listing each note's position/size, so the model can reason about
  grouping and relative placement.
- All-missing geometry → summary omitted; generation degrades gracefully (older clients OK).

## 4. `avoidExisting`

`POST /ai/quiz/generate` accepts optional `avoidExisting` (default `false`):

```jsonc
{ "notes": [ /* … */ ], "questionTypes": [ /* … */ ], "count": 5, "avoidExisting": true }
```

When `true`:

- The **backend** runs the same reverse lookup as `GET /ai/quiz?noteId=…` (owner-scoped,
  matching `sourceNoteIds`), collects the existing questions' prompt texts, and instructs the
  model to produce **different** questions (new angles/sub-topics).
- The frontend sends **no** existing questions — backend owns the link and the answer keys;
  nothing is leaked to the client.
- No linked quizzes → behaves as `false`.
- Best-effort: if note material is thin, the backend may still return overlapping questions
  rather than failing (coverage over hard-dedup), per the spec.
- Injected existing-question list is capped (40) to keep the prompt bounded.

## 5. Per-question source attribution

`Question` now carries **`sourceNoteIds: string[]`** (authoritative); singular
`sourceNoteId` is still emitted for back-compat (= first of the array, or null).

```jsonc
{
  "id": "…", "type": "SINGLE_CHOICE", "question": "…",
  "sourceNoteIds": ["n2", "n5"],   // exact notes this question derives from
  "sourceNoteId": "n2"             // back-compat; prefer sourceNoteIds
}
```

- `[]` (empty) for expansion-material questions (`coverage < 1.0`).
- Ids are filtered to exactly what the client sent in `notes[].id` (no invented ids).
- **`Quiz.sourceNoteIds` = union of every question's `sourceNoteIds`** — i.e. only the notes
  actually used, **not** the full selection.
  - Intended consequence: select 10 notes but if questions touch only 2, the quiz links to
    those 2; reverse lookup from the other 8 will **not** return it.

### Response shape (unchanged except the new field)

`QuestionResponse` (taking + reveal) now includes `sourceNoteIds` alongside the deprecated
`sourceNoteId`. Everything else (answer-key stripping in taking mode, `?reveal=true`, etc.)
is as in V2.

---

## Token usage (new since V2, FYI)

Every AI call's token usage is recorded per user (DeepSeek `usage`). Not part of the quiz
contract, but available:

- `GET /ai/usage` → `{ totalTokens, promptTokens, completionTokens, requests, byFeature[], byModel[] }`
  for the current user. Quiz calls are tagged `QUIZ_GENERATE` / `QUIZ_EVALUATE`.

---

## Operational blocker — `403` on `/ai/**`

Not a code issue. Security maps `/ai/**` to `hasAuthority("PERMISSION_BASIC")`, and authorities
are loaded from the DB on each request (`User.getAuthorities()` → `SimpleGrantedAuthority("PERMISSION_BASIC")`,
no `SCOPE_`/`ROLE_` prefix). So `403` ⇒ the authenticated user simply lacks `PERMISSION_BASIC`
in the database.

Fix one of:

1. **Re-login** the user — the JWT is minted from current DB authorities, so a fresh token
   reflects the permission once present.
2. **Grant it** (user predates the permission):
   ```sql
   INSERT INTO user_permissions (user_id, role_id)
   SELECT u.id, p.id FROM users u, permission p
   WHERE u.email = '<email>' AND p.name = 'PERMISSION_BASIC'
   ON CONFLICT DO NOTHING;
   ```
3. **Test with the seed user** `user@user.com` / `pass` — it already has `PERMISSION_BASIC`.

To confirm: decode the `jwtToken` cookie and check the `permissions` claim contains
`"PERMISSION_BASIC"`. Newly **registered** users get it automatically (registration grants it).

---

## Not yet verified at runtime

Code-complete and compiling. Still needs, before it's live:

- A real `DEEPSEEK_API_KEY` (currently a placeholder in `env.properties`).
- Postgres + Mongo running (new `ai_token_usage` table auto-creates via `ddl-auto=update`;
  quizzes use Mongo collection `quizzes`).
- The `403` user fixed as above.

## Still deferred

- §1 fact-check, §3 chat assistant.
- `429` rate limiting, `503` AI-unavailable mapping (AI errors currently surface as `500`).
- `FILL_BLANK` / `MATCHING` / `ORDERING` are fully supported server-side (generation + grading)
  but excluded by the frontend's `questionTypes` whitelist until the UI renders them.
