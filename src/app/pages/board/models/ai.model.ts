import type { JSONContent } from '@tiptap/core';

// ── Fact Check ─────────────────────────────────────────────────────────────

export interface FactCheckNoteInput {
  id: string;
  content: JSONContent;
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
