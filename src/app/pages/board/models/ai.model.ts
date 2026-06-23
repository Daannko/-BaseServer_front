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

export interface QuizGenerateRequest {
  notes: FactCheckNoteInput[];
  coverage: number; // 0.0 – 1.0
}

export interface QuizOption {
  key: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE';
  question: string;
  options?: QuizOption[];
  explanation: string;
  sourceNoteId: string | null;
}

export interface QuizGenerateResponse {
  questions: QuizQuestion[];
  title?: string;
}

export interface QuizAnswer {
  id: string;
  answer: string;
}

export interface QuizEvaluateRequest {
  questions: QuizAnswer[];
}

export interface QuizEvaluateResult {
  questionId: string;
  correct: boolean;
  correctAnswer: string;
}

export interface QuizEvaluateResponse {
  results: QuizEvaluateResult[];
  score: string;
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
