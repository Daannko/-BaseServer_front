import { Injectable } from '@angular/core';
import type { BoardItemSnapshot } from './board-item/board-item.data';
import { SecureStorageService } from '../../service/secure-storage.service';

/** What gets persisted locally for one board. */
export interface PersistedBoard {
  savedAt: number;
  items: BoardItemSnapshot[];
}

/**
 * Mirrors a board's element state into `localStorage` so unsaved work survives
 * a refresh *and* a browser close. This is the safety net that makes a failed
 * server save non-fatal: even if every PATCH dies (e.g. an expired token), the
 * local copy is still here on the next load.
 *
 * The copy is PERMANENT — no TTL. It only goes away when the server confirms a
 * fully successful save or the user explicitly discards it in the restore
 * prompt.
 *
 * Snapshots are AES-GCM-encrypted via SecureStorageService before they touch
 * localStorage, so inspecting the browser's storage shows ciphertext instead
 * of board content (see that service for key handling and the exact threat
 * model). Encryption makes writes async: `save()` coalesces — while one write
 * is in flight, newer snapshots simply replace the pending one and the loop
 * picks the freshest up next.
 */
@Injectable({ providedIn: 'root' })
export class BoardPersistenceService {
  private readonly PREFIX = 'board_local_';
  private pending: { boardId: string; items: BoardItemSnapshot[] } | null = null;
  private writing = false;

  constructor(private secure: SecureStorageService) {}

  private key(boardId: string): string {
    return `${this.PREFIX}${boardId}`;
  }

  /** Queue a snapshot write — call freely on every mutation/snapshot tick. */
  save(boardId: string, items: BoardItemSnapshot[]): void {
    this.pending = { boardId, items };
    void this.writeLoop();
  }

  /** Best-effort kick of any queued snapshot (used on unload/destroy). The
   *  final encrypt may not finish if the page dies first — in that case the
   *  previous successful write (at most one snapshot tick old) stands. */
  flush(): void {
    void this.writeLoop();
  }

  private async writeLoop(): Promise<void> {
    if (this.writing) return;
    this.writing = true;
    try {
      while (this.pending) {
        const { boardId, items } = this.pending;
        this.pending = null;
        const payload: PersistedBoard = { savedAt: Date.now(), items };
        await this.secure.setJson(this.key(boardId), payload);
      }
    } catch (e) {
      // Quota or crypto failure — log but never throw into the board.
      console.warn('Local board persistence failed', e);
    } finally {
      this.writing = false;
    }
  }

  /** Load the persisted copy, or null if missing / unreadable. */
  async load(boardId: string): Promise<PersistedBoard | null> {
    const parsed = await this.secure.getJson<PersistedBoard>(
      this.key(boardId),
    );
    if (
      !parsed ||
      typeof parsed.savedAt !== 'number' ||
      !Array.isArray(parsed.items)
    ) {
      return null;
    }
    return parsed;
  }

  clear(boardId: string): void {
    this.secure.remove(this.key(boardId));
    if (this.pending?.boardId === boardId) this.pending = null;
  }
}
