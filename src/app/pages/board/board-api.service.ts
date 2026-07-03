import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { SnackBarService } from '../../service/snackbar.service';
import { Board } from './models/board.model';
import { BoardItem } from './board-item/board-item.data';
import { BoardNote } from './board-note/board-note.data';
import { BoardSection } from './board-section/board-section.data';
import { BoardImage } from './board-image/board-image.data';
import { BoardDrawing } from './board-draw.data';
import type {
  Note,
  Section,
  Image,
  Drawing,
  BoardElements,
  CreateNote,
  CreateSection,
  CreateImage,
  CreateDrawing,
  UpdateNote,
  UpdateSection,
  UpdateImage,
  UpdateDrawing,
  DrawingStroke,
} from './models/element.model';

type BoardElement = Note | Section | Image | Drawing;

@Injectable({ providedIn: 'root' })
export class BoardApiService {
  constructor(
    private http: HttpClient,
    private snackBarService: SnackBarService,
  ) {}
  private apiUrl = environment.apiUrl;
  private _boards = new BehaviorSubject<Board[] | null>(null);
  readonly boards$ = this._boards.asObservable();

  // ── Board CRUD (unchanged) ────────────────────────────────────────────────

  private upsertBoard(existing: Board[], incoming: Board): Board[] {
    const next = existing.slice();
    const index = next.findIndex((b) => b.id === incoming.id);
    if (index >= 0) { next[index] = incoming; return next; }
    next.push(incoming);
    return next;
  }

  async createBoard(
    name: string,
    description: string,
    width: number | null,
    height: number | null,
  ): Promise<Board | null> {
    try {
      const created = await firstValueFrom(
        this.http.post<Board>(`${this.apiUrl}/board`, { name, description, width, height }),
      );
      const current = this._boards.value ?? [];
      this._boards.next(this.upsertBoard(current, created));
      return created;
    } catch {
      this.snackBarService.error('Failed to create board');
      return null;
    }
  }

  async updateBoard(
    boardId: string,
    changes: { name?: string; description?: string },
  ): Promise<Board | null> {
    try {
      const updated = await firstValueFrom(
        this.http.patch<Board>(`${this.apiUrl}/board/${boardId}`, changes),
      );
      const current = this._boards.value ?? [];
      this._boards.next(this.upsertBoard(current, updated));
      return updated;
    } catch (e: unknown) {
      const status = e instanceof HttpErrorResponse ? ` (${e.status})` : '';
      this.snackBarService.error(`Failed to update board${status}`);
      return null;
    }
  }

  async deleteBoard(boardId: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`${this.apiUrl}/board/${boardId}`));
      const current = this._boards.value ?? [];
      this._boards.next(current.filter((b) => b.id !== boardId));
    } catch (e: unknown) {
      const status = e instanceof HttpErrorResponse ? ` (${e.status})` : '';
      this.snackBarService.error(`Failed to delete board${status}`);
      throw e;
    }
  }

  refreshBoards(): void {
    this.http.get<Board[]>(`${this.apiUrl}/board/all`).subscribe({
      next: (b) => this._boards.next(b),
      error: () => this._boards.next([]),
    });
  }

  async getBoard(boardId: string): Promise<Board> {
    try {
      return await firstValueFrom(
        this.http.get<Board>(`${this.apiUrl}/board/${boardId}`),
      );
    } catch {
      this.snackBarService.error('Failed to fetch board');
      throw new Error('Failed to fetch board');
    }
  }

  // ── Board-scoped element list ──────────────────────────────────────────────

  async getBoardElements(boardId: string): Promise<BoardElements> {
    try {
      return await firstValueFrom(
        this.http.get<BoardElements>(`${this.apiUrl}/board/${boardId}/elements`),
      );
    } catch {
      this.snackBarService.error('Failed to load board elements');
      throw new Error('Failed to load board elements');
    }
  }

  // ── Image upload ──────────────────────────────────────────────────────────

  async uploadImage(
    boardId: string,
    blob: Blob,
    filename: string,
  ): Promise<{ url: string; width: number; height: number } | null> {
    const form = new FormData();
    form.append('file', blob, filename);
    try {
      return await firstValueFrom(
        this.http.post<{ url: string; width: number; height: number }>(
          `${this.apiUrl}/board/${boardId}/image/upload`,
          form,
        ),
      );
    } catch (e: unknown) {
      const status = e instanceof HttpErrorResponse ? ` (${e.status})` : '';
      this.snackBarService.error(`Failed to upload image${status}`);
      return null;
    }
  }

  // ── Element create (per-type) ─────────────────────────────────────────────

  /** Shared geometry + style fields, pulled from any element via duck-typing.
   *  Every element class carries `bgColor`, `borderColor`, `borderWidth`, `zIndex`. */
  private buildBaseCreate(item: BoardItem): {
    x: number; y: number; width: number; height: number;
    zIndex: number; bgColor: string | null; borderColor: string | null; borderWidth: number;
  } {
    const s = item as any;
    return {
      x: item.x, y: item.y, width: item.width, height: item.height,
      zIndex: item.zIndex,
      bgColor: s.bgColor ?? null,
      borderColor: s.borderColor ?? null,
      borderWidth: s.borderWidth ?? 1,
    };
  }

  /** Shared geometry + style diff for PATCH. Only emits keys that changed. */
  private buildBaseUpdate(item: BoardItem): {
    x?: number; y?: number; width?: number; height?: number;
    zIndex?: number; bgColor?: string | null; borderColor?: string | null; borderWidth?: number;
  } {
    const u: ReturnType<typeof this.buildBaseUpdate> = {};
    if (item.positionUpdated) { u.x = item.x; u.y = item.y; }
    if (item.sizeUpdated) { u.width = item.width; u.height = item.height; }
    // Style fields always sent — cheap and ensures ordering/styling doesn't drift.
    const s = item as any;
    u.zIndex = item.zIndex;
    if (s.bgColor !== undefined) u.bgColor = s.bgColor;
    if (s.borderColor !== undefined) u.borderColor = s.borderColor;
    if (s.borderWidth !== undefined) u.borderWidth = s.borderWidth;
    return u;
  }

  /** Route a BoardItem to the correct create endpoint based on its class. */
  async createElement(item: BoardItem, boardId: string): Promise<BoardElement | null> {
    if (item instanceof BoardNote) return this.createNote(item, boardId);
    if (item instanceof BoardSection) return this.createSection(item, boardId);
    if (item instanceof BoardImage) return this.createImage(item, boardId);
    if (item instanceof BoardDrawing) return this.createDrawing(item, boardId);
    return null;
  }

  private async createNote(note: BoardNote, boardId: string): Promise<Note | null> {
    const payload: CreateNote = {
      ...this.buildBaseCreate(note),
      content: note.content,
      fontSize: note.fontSize,
      padding: note.options.padding ?? null,
    };
    return this.postElement('note', boardId, payload);
  }

  private async createSection(section: BoardSection, boardId: string): Promise<Section | null> {
    const payload: CreateSection = {
      ...this.buildBaseCreate(section),
      title: section.name,
    };
    return this.postElement('section', boardId, payload);
  }

  private async createImage(image: BoardImage, boardId: string): Promise<Image | null> {
    const payload: CreateImage = {
      ...this.buildBaseCreate(image),
      src: image.src,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    };
    return this.postElement('image', boardId, payload);
  }

  private async createDrawing(drawing: BoardDrawing, boardId: string): Promise<Drawing | null> {
    const payload: CreateDrawing = {
      ...this.buildBaseCreate(drawing),
      strokes: drawing.strokes.map((s) => ({
        color: s.color,
        width: s.width,
        points: s.points.reduce<number[]>((flat, pt) => {
          flat.push(Math.round(pt.x), Math.round(pt.y));
          return flat;
        }, []),
      })),
    };
    return this.postElement('drawing', boardId, payload);
  }

  private async postElement<T>(kind: string, boardId: string, payload: unknown): Promise<T | null> {
    try {
      return await firstValueFrom(
        this.http.post<T>(`${this.apiUrl}/board/${boardId}/${kind}`, payload),
      );
    } catch (e: unknown) {
      this.logCreateError(kind, boardId, e);
      return null;
    }
  }

  private logCreateError(kind: string, boardId: string, e: unknown): void {
    if (e instanceof HttpErrorResponse) {
      console.error(`Failed to create ${kind}`, { boardId, status: e.status, error: e.error });
      this.snackBarService.error(`Failed to create ${kind} (${e.status})`);
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to create ${kind}`, { boardId, error: e });
      this.snackBarService.error(msg || `Failed to create ${kind}`);
    }
  }

  // ── Element save (per-type PATCH) ─────────────────────────────────────────

  /** Route a BoardItem to the correct PATCH endpoint based on its class. */
  async saveElement(item: BoardItem): Promise<void> {
    if (item instanceof BoardNote) return this.saveNote(item);
    if (item instanceof BoardSection) return this.saveSection(item);
    if (item instanceof BoardImage) return this.saveImage(item);
    if (item instanceof BoardDrawing) return this.saveDrawing(item);
  }

  private async saveNote(note: BoardNote): Promise<void> {
    const payload: UpdateNote = this.buildBaseUpdate(note);
    if (note.contentUpdated) payload.content = note.content;
    payload.fontSize = note.fontSize;
    payload.padding = note.options.padding ?? null;
    return this.patchIfDirty(`note/${note.serverId ?? note.id}`, payload, note);
  }

  private async saveSection(section: BoardSection): Promise<void> {
    const payload: UpdateSection = this.buildBaseUpdate(section);
    if (section.nameUpdated) payload.title = section.name;
    return this.patchIfDirty(`section/${section.serverId ?? section.id}`, payload, section);
  }

  private async saveImage(image: BoardImage): Promise<void> {
    const payload: UpdateImage = this.buildBaseUpdate(image);
    // src never changes on an existing image — only position/size/style.
    return this.patchIfDirty(`image/${image.serverId ?? image.id}`, payload, image);
  }

  private async saveDrawing(drawing: BoardDrawing): Promise<void> {
    const payload: UpdateDrawing = this.buildBaseUpdate(drawing);
    // strokes never change on existing — only position/zIndex.
    return this.patchIfDirty(`drawing/${drawing.serverId ?? drawing.id}`, payload, drawing);
  }

  private async patchIfDirty(path: string, payload: object, item: BoardItem): Promise<void> {
    if (Object.keys(payload).length === 0) return;
    await this.patchElement(path, payload);
    item.saved();
  }

  private async patchElement(path: string, payload: unknown): Promise<void> {
    const url = `${this.apiUrl}/${path}`;
    try {
      await firstValueFrom(this.http.patch(url, payload));
    } catch (e: unknown) {
      if (e instanceof HttpErrorResponse) {
        console.error('Failed to save element', { url, status: e.status, error: e.error });
        this.snackBarService.error(`Failed to save element (${e.status})`);
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Failed to save element', { url, error: e });
        this.snackBarService.error(msg || 'Failed to save element');
      }
      // Rethrow so the caller never clears dirty flags on a failed save — that
      // bug silently dropped data when the token expired mid-session.
      throw e;
    }
  }

  // ── Element delete (per-type) ─────────────────────────────────────────────

  /** Route a BoardItem to the correct DELETE endpoint based on its class. */
  async deleteElement(item: BoardItem): Promise<void> {
    const id = item.serverId ?? item.id;
    let kind: string;
    if (item instanceof BoardNote) kind = 'note';
    else if (item instanceof BoardSection) kind = 'section';
    else if (item instanceof BoardImage) kind = 'image';
    else if (item instanceof BoardDrawing) kind = 'drawing';
    else return;

    const url = `${this.apiUrl}/${kind}/${id}`;
    try {
      await firstValueFrom(this.http.delete(url));
    } catch (e: unknown) {
      const status = e instanceof HttpErrorResponse ? ` (${e.status})` : '';
      this.snackBarService.error(`Failed to delete ${kind}${status}`);
      throw e;
    }
  }

  // ── Element → BoardItem hydration helpers ──────────────────────────────────

  /** Map an API response to the correct BoardItem subclass. */
  static elementToBoardItem(el: BoardElement): BoardItem | null {
    // Distinguish by the presence of type-specific fields
    if ('strokes' in el) {
      return BoardDrawing.fromDrawingElement(el as Drawing);
    }
    if ('src' in el) {
      return BoardImage.fromImageElement(el as Image);
    }
    if ('title' in el) {
      return BoardSection.fromSectionElement(el as Section);
    }
    if ('content' in el && !('title' in el)) {
      return BoardNote.fromNoteElement(el as Note);
    }
    return null;
  }
}
