import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { firstValueFrom } from 'rxjs';
import { SnackBarService } from '../../service/snackbar.service';
import type {
  FactCheckRequest,
  FactCheckResponse,
  QuizGenerateRequest,
  QuizGenerateResponse,
  QuizEvaluateRequest,
  QuizEvaluateOneOffRequest,
  QuizEvaluateResponse,
  QuizListQuery,
  QuizListResponse,
  QuizTagsResponse,
  QuizPatchRequest,
  Quiz,
  ChatRequest,
  ChatResponse,
} from './models/ai.model';

@Injectable({ providedIn: 'root' })
export class BoardAiService {
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private snackBarService: SnackBarService,
  ) {}

  // ── Fact Check ────────────────────────────────────────────────────────────

  async factCheck(req: FactCheckRequest): Promise<FactCheckResponse | null> {
    try {
      return await firstValueFrom(
        this.http.post<FactCheckResponse>(`${this.apiUrl}/ai/fact-check`, req),
      );
    } catch (e: unknown) {
      this.handleError('fact-check', e);
      return null;
    }
  }

  // ── Quiz ──────────────────────────────────────────────────────────────────

  async generateQuiz(
    req: QuizGenerateRequest,
  ): Promise<QuizGenerateResponse | null> {
    try {
      return await firstValueFrom(
        this.http.post<QuizGenerateResponse>(
          `${this.apiUrl}/ai/quiz/generate`,
          req,
        ),
      );
    } catch (e: unknown) {
      this.handleError('quiz generation', e);
      return null;
    }
  }

  /** Evaluate a stored quiz (server holds the questions + answer keys). */
  async evaluateQuiz(
    quizId: string,
    req: QuizEvaluateRequest,
  ): Promise<QuizEvaluateResponse | null> {
    try {
      return await firstValueFrom(
        this.http.post<QuizEvaluateResponse>(
          `${this.apiUrl}/ai/quiz/${quizId}/evaluate`,
          req,
        ),
      );
    } catch (e: unknown) {
      this.handleError('quiz evaluation', e);
      return null;
    }
  }

  /** Evaluate a one-off (persist:false) quiz — send the questions back. */
  async evaluateQuizOneOff(
    req: QuizEvaluateOneOffRequest,
  ): Promise<QuizEvaluateResponse | null> {
    try {
      return await firstValueFrom(
        this.http.post<QuizEvaluateResponse>(
          `${this.apiUrl}/ai/quiz/evaluate`,
          req,
        ),
      );
    } catch (e: unknown) {
      this.handleError('quiz evaluation', e);
      return null;
    }
  }

  /** List stored quizzes. Reverse note→quiz lookup via `query.noteId`. */
  async listQuizzes(query: QuizListQuery = {}): Promise<QuizListResponse | null> {
    let params = new HttpParams();
    if (query.boardId) params = params.set('boardId', query.boardId);
    if (query.q) params = params.set('q', query.q);
    if (query.limit != null) params = params.set('limit', String(query.limit));
    if (query.offset != null) params = params.set('offset', String(query.offset));
    for (const n of query.noteId ?? []) params = params.append('noteId', n);
    for (const t of query.tag ?? []) params = params.append('tag', t);
    try {
      return await firstValueFrom(
        this.http.get<QuizListResponse>(`${this.apiUrl}/ai/quiz`, { params }),
      );
    } catch (e: unknown) {
      this.handleError('quiz list', e);
      return null;
    }
  }

  async getQuizTags(): Promise<QuizTagsResponse | null> {
    try {
      return await firstValueFrom(
        this.http.get<QuizTagsResponse>(`${this.apiUrl}/ai/quiz/tags`),
      );
    } catch (e: unknown) {
      this.handleError('quiz tags', e);
      return null;
    }
  }

  /** Fetch one quiz. `reveal` (owner only) includes answer keys + explanations. */
  async getQuiz(id: string, reveal = false): Promise<Quiz | null> {
    let params = new HttpParams();
    if (reveal) params = params.set('reveal', 'true');
    try {
      return await firstValueFrom(
        this.http.get<Quiz>(`${this.apiUrl}/ai/quiz/${id}`, { params }),
      );
    } catch (e: unknown) {
      this.handleError('quiz fetch', e);
      return null;
    }
  }

  async patchQuiz(id: string, req: QuizPatchRequest): Promise<Quiz | null> {
    try {
      return await firstValueFrom(
        this.http.patch<Quiz>(`${this.apiUrl}/ai/quiz/${id}`, req),
      );
    } catch (e: unknown) {
      this.handleError('quiz update', e);
      return null;
    }
  }

  async deleteQuiz(id: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.delete<void>(`${this.apiUrl}/ai/quiz/${id}`),
      );
      return true;
    } catch (e: unknown) {
      this.handleError('quiz delete', e);
      return false;
    }
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  async chat(req: ChatRequest): Promise<ChatResponse | null> {
    try {
      return await firstValueFrom(
        this.http.post<ChatResponse>(`${this.apiUrl}/ai/chat`, req),
      );
    } catch (e: unknown) {
      this.handleError('chat', e);
      return null;
    }
  }

  private handleError(op: string, e: unknown): void {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 429) {
        this.snackBarService.error('AI is busy — try again in a moment');
      } else if (e.status === 503 || e.status === 500) {
        this.snackBarService.error('AI is unavailable — try again later');
      } else if (e.status === 404) {
        this.snackBarService.error('Quiz not found');
      } else {
        this.snackBarService.error(`AI ${op} failed (${e.status})`);
      }
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      this.snackBarService.error(msg || `AI ${op} failed`);
    }
  }
}
