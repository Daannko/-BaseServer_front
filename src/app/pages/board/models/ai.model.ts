import type { JSONContent } from '@tiptap/core';

// ── Fact Check ─────────────────────────────────────────────────────────────

export interface FactCheckNoteInput {
  id: string;
  content: JSONContent;
  // Canvas geometry (world coords) — optional context so the model knows where
  // the note sits / how big it is relative to the others in the selection.
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface FactCheckRequest {
  notes: FactCheckNoteInput[];
}

export interface FactCheckClaim {
  claim: string;
  assessment: 'TRUE' | 'FALSE' | 'UNCERTAIN' | 'OPINION';
  explanation: string;
}

export type FactCheckScore =
  | 'VERIFIED'
  | 'MOSTLY_VERIFIED'
  | 'MIXED'
  | 'MOSTLY_INCORRECT'
  | 'INCORRECT';

export interface FactCheckVerdict {
  score: FactCheckScore;
  summary: string;
  details: FactCheckClaim[];
}

export interface FactCheckResult {
  noteId: string;
  ok: true;
  verdict: FactCheckVerdict;
}

export interface FactCheckResponse {
  results: FactCheckResult[];
}

// ── Quiz ───────────────────────────────────────────────────────────────────
// Mirrors BOARD_API_AI.md §2 + V2 implementation notes.

export type QuizQuestionType =
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_ANSWER'
  | 'TRUE_FALSE'
  | 'OPEN'
  | 'FILL_BLANK'
  | 'MATCHING'
  | 'ORDERING';

export interface QuizOption {
  key: string;
  text: string;
}

/** Type-specific answer value submitted by the client (see §2.7).
 *  - SINGLE_CHOICE / TRUE_FALSE: string ("B" | "TRUE")
 *  - MULTIPLE_ANSWER / FILL_BLANK / ORDERING: string[]
 *  - MATCHING: { leftKey: rightKey } */
export type QuizAnswerValue = string | string[] | Record<string, string>;

/** Answer key — present ONLY in reveal mode (`?reveal=true`); never while taking.
 *  Exactly one branch is set, selected by question `type`. */
export interface QuizAnswerKey {
  keys?: string[];
  pairs?: Record<string, string>;
  order?: string[];
  rubric?: string;
  sampleAnswer?: string;
}

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  question: string;
  points?: number;
  /** choice-style types (SINGLE_CHOICE, MULTIPLE_ANSWER, ORDERING) */
  options?: QuizOption[];
  /** MATCHING only */
  left?: QuizOption[];
  right?: QuizOption[];
  /** reveal mode only — omitted while taking */
  answerKey?: QuizAnswerKey;
  tags: string[];
  /** reveal/evaluate only — stripped while taking (V2 deviation #2) */
  explanation?: string;
  /** Exact note(s) this question derives from — subset of the quiz's notes.
   *  Empty/absent for expansion-material questions (coverage < 1.0). */
  sourceNoteIds?: string[];
  /** @deprecated single-note attribution; prefer `sourceNoteIds`. */
  sourceNoteId?: string | null;
}

export interface QuizGenerateRequest {
  notes: FactCheckNoteInput[];
  coverage: number; // 0.0 – 1.0
  boardId?: string | null;
  questionTypes?: QuizQuestionType[];
  count?: number;
  /** Optional free-text steer for the model (focus, difficulty, style…). */
  prompt?: string;
  /** Ask the backend to avoid repeating questions from quizzes already linked
   *  to these notes. Backend pulls the existing questions itself. */
  avoidExisting?: boolean;
  persist?: boolean; // default true server-side
}

/** Taking-mode quiz returned by generate. `id` is null when `persist: false`. */
export interface QuizGenerateResponse {
  id: string | null;
  title: string;
  tags: string[];
  boardId: string | null;
  sourceNoteIds: string[];
  coverage: number;
  createdAt: string;
  questions: QuizQuestion[];
}

/** Full stored quiz (detail fetch). */
export interface Quiz {
  id: string;
  title: string;
  tags: string[];
  boardId: string | null;
  sourceNoteIds: string[];
  coverage: number;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
  questions: QuizQuestion[];
}

/** List-endpoint row (no questions array). */
export interface QuizSummary {
  id: string;
  title: string;
  tags: string[];
  boardId: string | null;
  questionCount: number;
  coverage: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuizListResponse {
  quizzes: QuizSummary[];
  total: number;
}

export interface QuizTagCount {
  tag: string;
  count: number;
}

export interface QuizTagsResponse {
  tags: QuizTagCount[];
}

export interface QuizListQuery {
  boardId?: string;
  noteId?: string[]; // OR semantics
  tag?: string[]; // AND semantics
  q?: string;
  limit?: number;
  offset?: number;
}

export interface QuizPatchRequest {
  title?: string;
  tags?: string[];
  questions?: QuizQuestion[];
}

export interface QuizAnswerSubmission {
  questionId: string;
  answer: QuizAnswerValue;
}

/** POST /ai/quiz/{id}/evaluate */
export interface QuizEvaluateRequest {
  answers: QuizAnswerSubmission[];
}

/** POST /ai/quiz/evaluate — one-off, persist:false quizzes. */
export interface QuizEvaluateOneOffRequest {
  quiz: { questions: QuizQuestion[] };
  answers: QuizAnswerSubmission[];
}

export interface QuizEvaluateResult {
  questionId: string;
  correct: boolean;
  score: number; // 0.0–1.0 partial credit
  correctAnswer: QuizAnswerValue;
  feedback: string | null; // AI note for OPEN / FILL_BLANK
  explanation: string;
}

export interface QuizEvaluateResponse {
  results: QuizEvaluateResult[];
  score: string; // e.g. "7.5/10"
  percentage: number;
}

// ── Chat ───────────────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** A selected element sent to the chat as context. Notes only for now. */
export interface NoteContextInput {
  id: string;
  type: 'note';
  content: JSONContent;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChatRequest {
  boardId: string;
  messages: ChatMessage[];
  selection: NoteContextInput[];
}

/** Add a new note. `tempId` correlates with later actions in the same response. */
export interface CreateNoteAction {
  type: 'create_note';
  tempId: string;
  content: JSONContent;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  reason: string;
}

/** Replace a note's rich-text body. */
export interface UpdateNoteAction {
  type: 'update_note';
  id: string;
  content: JSONContent;
  reason: string;
}

/** Reposition a note. */
export interface MoveNoteAction {
  type: 'move_note';
  id: string;
  x: number;
  y: number;
  reason: string;
}

/** Remove a note. */
export interface DeleteNoteAction {
  type: 'delete_note';
  id: string;
  reason: string;
}

export type BoardAiAction =
  | CreateNoteAction
  | UpdateNoteAction
  | MoveNoteAction
  | DeleteNoteAction;

export interface ChatResponse {
  message: string;
  actions: BoardAiAction[];
}
