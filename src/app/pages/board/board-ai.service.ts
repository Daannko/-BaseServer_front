import { HttpClient, HttpErrorResponse } from '@angular/common/http';
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
  QuizEvaluateResponse,
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

  async evaluateQuiz(
    req: QuizEvaluateRequest,
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

  private handleError(op: string, e: unknown): void {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 429) {
        this.snackBarService.error('AI is busy — try again in a moment');
      } else if (e.status === 503) {
        this.snackBarService.error('AI is unavailable — try again later');
      } else {
        this.snackBarService.error(`AI ${op} failed (${e.status})`);
      }
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      this.snackBarService.error(msg || `AI ${op} failed`);
    }
  }
}
