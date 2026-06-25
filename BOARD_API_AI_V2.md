# Board AI API — V2 (implementation notes)

> Companion to `BOARD_API_AI.md`. Documents **what was actually built** and **where it
> deviates** from the original spec, with reasons. Only the **quiz system (§2)** is
> implemented in this pass — fact-check (§1) and chat (§3) are deferred.

---

## Scope of this pass

| Spec section | Status |
|---|---|
| §1 Fact-check | ⛔ deferred |
| §2 Quiz system (generate, list, tags, fetch, edit, delete, evaluate) | ✅ implemented |
| §3 Chat assistant | ⛔ deferred |

Built on top of a generic AI engine (`dev.dankoz.BaseServer.ai.AiService`) that currently
talks to **DeepSeek** (`deepseek-chat`). Providers/models are swappable later without
touching quiz code.

Code lives in `dev.dankoz.BaseServer.ai.quiz` (`model`, `dto`, `repository`, `service`,
`controller`). Quizzes persist in MongoDB collection **`quizzes`**.

---

## Endpoints implemented (all under `/ai/quiz`)

Auth: `Authorization: Bearer <token>` + `PERMISSION_BASIC` (same as board API).

| Method | Path | Spec § |
|---|---|---|
| POST | `/ai/quiz/generate` | 2.2 |
| GET | `/ai/quiz` (`boardId`, `noteId`*, `tag`*, `q`, `limit`, `offset`) | 2.3 / 2.1a-bis |
| GET | `/ai/quiz/tags` | 2.3a |
| GET | `/ai/quiz/{id}` (`?reveal=true`) | 2.4 |
| PATCH | `/ai/quiz/{id}` | 2.5 |
| DELETE | `/ai/quiz/{id}` → `204` | 2.6 |
| POST | `/ai/quiz/{id}/evaluate` | 2.7 |
| POST | `/ai/quiz/evaluate` (one-off) | 2.7 |

`*` = repeatable query param. `noteId` uses OR semantics (any linked note); `tag` uses AND.

Request/response shapes follow `BOARD_API_AI.md` §2 — same field names, same
`Quiz`/`Question`/`answerKey` model, same per-type answer payloads (§2.0).

---

## Deviations from the spec (and why)

1. **`ownerId` added to the stored quiz (server-side only).**
   The spec `Quiz` model has no owner field. Every quiz is scoped to the authenticated
   user via an internal `ownerId`; it is **never serialized** to clients. All reads/writes
   filter on it, so a user can only see/edit/delete/evaluate their own quizzes.
   *Why:* the spec requires owner scoping ("owned by the user", `reveal` "owner only")
   but didn't model how — this is the mechanism.

2. **`explanation` is stripped in taking mode** (not just `answerKey`).
   §2.1b only names `answerKey` as stripped, but §2.1 says `explanation` is "revealed
   after answering". So taking-mode `GET /ai/quiz/{id}` omits **both** `answerKey` and
   `explanation`; `?reveal=true` and evaluate responses include them.
   *Why:* `explanation` often leaks the answer; treating it like answer data is safer and
   matches "revealed after answering".

3. **Anti-cheat via response mapping.** Stored questions always hold the full data;
   the API emits a taking-mode view (answer fields nulled + omitted via `JSON include
   non-null`). Reveal mode emits the full object. No separate "stripped" copy is stored.

4. **Coverage slider interpretation.** Continuous 0.0–1.0 is honored, bucketed for the
   prompt: `≥0.85` strict, `≤0.15` exploratory, in-between mixed (with the ratio passed to
   the model). Exact question-by-question ratio is left to the model.
   *Why:* hard per-question interpolation isn't reliably controllable via prompting.

5. **`correct` threshold for AI-graded questions.** `OPEN` / rubric `FILL_BLANK` are
   graded by the AI to a `score` (0–1); `correct` is `true` when `score ≥ 0.6`.
   *Why:* spec says "backend threshold" without a number — 0.6 chosen, easy to tune.

6. **Partial-credit formulas** (spec said "partial credit", didn't define):
   - `MULTIPLE_ANSWER`: `max(0, (rightPicked − wrongPicked) / totalCorrect)`, clamped 0–1.
   - `MATCHING`: `correctPairs / totalPairs`.
   - `ORDERING`: `positionsCorrect / length`.
   - `FILL_BLANK` (exact): `correctBlanks / blanks`.
   `correct` is `true` only on a full match.

7. **Error model reuses the app's existing `ExceptionResponse`** (`{date, message, code}`),
   not a bespoke AI error body. `400` (`BadRequestException`) for bad input / too many
   notes / no questions; `404` (new `NotFoundException`) for missing/not-owned quiz.

8. **`429` and `503` are NOT implemented yet.** No rate limiting; if the AI provider
   errors, it currently surfaces as a generic `500`. Add a provider-exception → `503`
   mapping and a rate limiter when needed.
   *Why:* out of scope for the quiz core; needs infra decisions.

9. **Note/board ownership is NOT validated.** Per §1's "server **may** validate", we trust
   the `notes[].id` and `boardId` the client sends and store them as-is (so the reverse
   lookup in §2.1a-bis matches the client's ids). Quizzes are still owner-scoped.

10. **AI ids are not trusted.** Question `id`s are server-generated UUIDs at
    generate time (and on PATCH when missing), so answer submission ids are always stable
    and unique regardless of what the model emits.

11. **Same model for generation and grading** (`deepseek-chat`). `deepseek-reasoner`
    could be wired per-task later for tougher grading.

12. **`POST /ai/chat` collision not yet resolved.** The generic chat endpoint I built
    earlier still owns `/ai/chat`. When the board chat (§3) is implemented it will take
    that route; decision deferred until then (no conflict today since chat isn't built).

---

## Notes for the frontend

- `generate` returns the quiz in **taking mode** (no answer keys). If `persist:false`,
  `id` is `null` and nothing is stored — keep the returned questions to call the one-off
  `POST /ai/quiz/evaluate`.
- Question `id`s in the response are the handles to submit answers (`{ questionId, answer }`).
- `evaluate` is **stateless** — attempts are not stored. Re-evaluating is allowed.
- `tags` are AI-generated canonical UPPERCASE codes; compare case-sensitively as opaque
  strings (spec rule).
- DeepSeek JSON mode requires the word "json" in the prompt — handled server-side; no
  client impact.

---

## What's left (next passes)

- §1 Fact-check (`POST /ai/fact-check`).
- §3 Chat assistant (`POST /ai/chat`) + the route-collision resolution above.
- `429` rate limiting + `503` AI-unavailable mapping.
- Optional: store quiz attempts/results history.
