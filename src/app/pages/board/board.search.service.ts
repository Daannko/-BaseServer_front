import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { SnackBarService } from '../../service/snackbar.service';
import { Topic } from './models/topic.model';
import { Board } from './models/board.model';

@Injectable({ providedIn: 'root' })
export class BoardSearchService {
  constructor(
    private http: HttpClient,
    private snackBarService: SnackBarService
  ) {}
  private apiUrl = 'http://localhost:8080';
  private _boards = new BehaviorSubject<Board[] | null>(null);
  readonly boards$ = this._boards.asObservable();
  private _topics = new BehaviorSubject<Topic[] | null>(null);
  readonly topics$ = this._topics.asObservable();

  private upsertBoard(existing: Board[], incoming: Board): Board[] {
    const next = existing.slice();
    const index = next.findIndex((b) => b.id === incoming.id);
    if (index >= 0) {
      next[index] = incoming;
      return next;
    }
    next.push(incoming);
    return next;
  }

  private mergeTopicsById(existing: Topic[], incoming: Topic[]): Topic[] {
    const byId = new Map<string, Topic>();
    for (const topic of existing) {
      if (!topic?.id) continue;
      byId.set(topic.id, topic);
    }
    for (const topic of incoming) {
      if (!topic?.id) continue;
      byId.set(topic.id, topic);
    }
    return Array.from(byId.values());
  }

  clearTopics(): void {
    this._topics.next(null);
  }

  setTopics(topics: Topic[] | null): void {
    this._topics.next(topics);
  }

  addTopic(topic: Topic): void {
    const current = this._topics.value ?? [];
    this._topics.next(this.mergeTopicsById(current, [topic]));
  }

  addTopics(topics: Topic[]): void {
    const current = this._topics.value ?? [];
    this._topics.next(this.mergeTopicsById(current, topics));
  }

  async createBoard(
    name: string,
    description: string,
    width: number | null,
    height: number | null
  ): Promise<Board | null> {
    const createBoardUrl = '/board';
    const payload = {
      name: name,
      description: description,
      width: width,
      height: height,
    };
    try {
      const createdBoard = await firstValueFrom(
        this.http.post<Board>(this.apiUrl + createBoardUrl, payload)
      );
      const current = this._boards.value ?? [];
      this._boards.next(this.upsertBoard(current, createdBoard));
      return createdBoard;
    } catch (e) {
      this.snackBarService.error('Failed to create board');
      return null;
    }
  }

  refreshBoards(): void {
    var retrieveBoardsUrl = '/board/all';
    this.http.get<Board[]>(this.apiUrl + retrieveBoardsUrl).subscribe({
      next: (b) => this._boards.next(b),
      error: () => this._boards.next([]),
    });
  }

  async getBoard(boardId: string): Promise<Board> {
    const getBoardUrl = '/board/' + boardId;
    try {
      return await firstValueFrom(
        this.http.get<Board>(this.apiUrl + getBoardUrl)
      );
    } catch (e) {
      this.snackBarService.error('Failed to fetch board');
      throw e;
    }
  }

  async getTopic(topicId: string, store: boolean = true): Promise<Topic> {
    const getTopicUrl = '/topic/' + topicId;
    try {
      const topic = await firstValueFrom(
        this.http.get<Topic>(this.apiUrl + getTopicUrl)
      );
      if (store) {
        this.addTopic(topic);
      }
      return topic;
    } catch (e) {
      this.snackBarService.error('Failed to fetch topic');
      throw e;
    }
  }

  async getTopicsByIds(
    topicIds: string[],
    store: boolean = true
  ): Promise<Topic[]> {
    const uniqueIds = Array.from(new Set(topicIds.filter(Boolean)));
    const topics = await Promise.all(
      uniqueIds.map((id) => this.getTopic(id, false))
    );
    if (store) {
      this.addTopics(topics);
    }
    return topics;
  }
}
