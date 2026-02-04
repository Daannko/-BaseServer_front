import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { SnackBarService } from '../../service/snackbar.service';
import { Topic } from './models/topic.model';
import { Board } from './models/board.model';
import { BoardTile } from './board-tile/board-tile.data';
import { UpdateTopic } from './models/updateTopic.model';
import { CreateTopic } from './models/create-topic.model';

@Injectable({ providedIn: 'root' })
export class BoardApiService {
  constructor(
    private http: HttpClient,
    private snackBarService: SnackBarService,
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
    height: number | null,
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
        this.http.post<Board>(this.apiUrl + createBoardUrl, payload),
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
        this.http.get<Board>(this.apiUrl + getBoardUrl),
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
        this.http.get<Topic>(this.apiUrl + getTopicUrl),
      );
      if (store) {
        this.addTopic(topic);
      }
      return topic;
    } catch (e) {
      const url = this.apiUrl + getTopicUrl;
      if (e instanceof HttpErrorResponse) {
        console.error('Failed to fetch topic', {
          topicId,
          url,
          status: e.status,
          statusText: e.statusText,
          message: e.message,
          error: e.error,
        });
        this.snackBarService.error(`Failed to fetch topic (${e.status})`);
      } else {
        console.error('Failed to fetch topic', { topicId, url, error: e });
        this.snackBarService.error('Failed to fetch topic');
      }
      throw e;
    }
  }

  async getTopicsByIds(
    topicIds: string[],
    store: boolean = true,
  ): Promise<Topic[]> {
    const uniqueIds = Array.from(new Set(topicIds.filter(Boolean)));
    const results = await Promise.allSettled(
      uniqueIds.map((id) => this.getTopic(id, false)),
    );
    const topics = results
      .filter(
        (r): r is PromiseFulfilledResult<Topic> => r.status === 'fulfilled',
      )
      .map((r) => r.value);

    const failedCount = results.length - topics.length;
    if (failedCount > 0) {
      this.snackBarService.error(
        `Failed to load ${failedCount} topic${failedCount === 1 ? '' : 's'}`,
      );
    }
    if (store) {
      this.addTopics(topics);
    }
    return topics;
  }

  async createTopic(topic: BoardTile, boardId: string): Promise<Topic | null> {
    const payload: CreateTopic = {
      boardId,
      title: topic.name,
      content: topic.content,
      x: topic.x,
      y: topic.y,
      width: topic.width,
      height: topic.height,
      relatedTopics: [],
    };
    const createTopicUrl = `${this.apiUrl}/topic`;
    try {
      const created = await firstValueFrom(
        this.http.post<Topic>(createTopicUrl, payload),
      );
      this.addTopic(created);
      return created;
    } catch (e: unknown) {
      if (e instanceof HttpErrorResponse) {
        console.error('Failed to create topic', {
          boardId,
          url: createTopicUrl,
          status: e.status,
          statusText: e.statusText,
          message: e.message,
          error: e.error,
        });
        this.snackBarService.error(`Failed to create topic (${e.status})`);
        return null;
      }
      const message = e instanceof Error ? e.message : String(e);
      console.error('Failed to create topic', { boardId, error: e });
      this.snackBarService.error(message || 'Failed to create topic');
      return null;
    }
  }

  async saveTopic(
    topic: BoardTile,
    resolveTopicId?: (id: string) => string,
  ): Promise<void> {
    const payload: Partial<UpdateTopic> = {};

    if (topic.nameUpdated) {
      payload.title = topic.name;
    }
    if (topic.contentUpdated) {
      payload.content = topic.content;
    }
    if (topic.positionUpdated) {
      payload.x = topic.x;
      payload.y = topic.y;
    }
    if (topic.sizeUpdated) {
      payload.width = topic.width;
      payload.height = topic.height;
    }
    if (topic.connectorsAdded.length > 0) {
      payload.topicsToBeAdded = resolveTopicId
        ? topic.connectorsAdded.map(resolveTopicId)
        : topic.connectorsAdded;
    }
    if (topic.connectorsRemoved.length > 0) {
      payload.topicsToBeRemoved = resolveTopicId
        ? topic.connectorsRemoved.map(resolveTopicId)
        : topic.connectorsRemoved;
    }

    if (Object.keys(payload).length === 0) return;
    console.log(payload);
    const apiId = topic.serverId ?? topic.id;
    const saveTopicUrl = `${this.apiUrl}/topic/${apiId}`;
    try {
      await firstValueFrom(this.http.patch(saveTopicUrl, payload));
      topic.saved();
    } catch (e: unknown) {
      if (e instanceof HttpErrorResponse) {
        console.error('Failed to save topic', {
          topicId: topic.id,
          url: saveTopicUrl,
          status: e.status,
          statusText: e.statusText,
          message: e.message,
          error: e.error,
        });
        this.snackBarService.error(`Failed to save topic (${e.status})`);
        return;
      }

      const message = e instanceof Error ? e.message : String(e);
      console.error('Failed to save topic', { topicId: topic.id, error: e });
      this.snackBarService.error(message || 'Failed to save topic');
    }
  }
}
