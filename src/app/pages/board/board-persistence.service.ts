import { Injectable } from '@angular/core';
import type { BoardItemSnapshot } from './board-item/board-item.data';

/** What gets written to localStorage for one board. */
interface PersistedBoard {
  savedAt: number;
  items: BoardItemSnapshot[];
}

/**
 * Mirrors a board's element state into `localStorage` so unsaved work survives
 * a refresh *and* a browser close. This is the safety net that makes a failed
 * server save non-fatal: even if every PATCH dies (e.g. an expired token), the
 * local copy is still here on the next load.
 *
 * `localStorage` (not `sessionStorage`) is deliberate — sessionStorage is wiped
 * when the tab/window closes, which is exactly the case the user lost work to.
 */
@Injectable({ providedIn: 'root' })
export class BoardPersistenceService {
  /** Keep a local copy for 6h, then treat it as stale and ignore it. */
  private readonly TTL_MS = 6 * 60 * 60 * 1000;
  private readonly PREFIX = 'board_local_';
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: { boardId: string; items: BoardItemSnapshot[] } | null = null;

  private key(boardId: string): string {
    return `${this.PREFIX}${boardId}`;
  }

  /** Debounced write — call freely on every mutation/snapshot tick. */
  save(boardId: string, items: BoardItemSnapshot[]): void {
    this.pending = { boardId, items };
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flush(), 800);
  }

  /** Synchronous write of any pending snapshot — use on `beforeunload`. */
  flush(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (!this.pending) return;
    const { boardId, items } = this.pending;
    this.pending = null;
    this.writeNow(boardId, items);
  }

  private writeNow(boardId: string, items: BoardItemSnapshot[]): void {
    const payload: PersistedBoard = { savedAt: Date.now(), items };
    try {
      localStorage.setItem(this.key(boardId), JSON.stringify(payload));
    } catch (e) {
      // Quota or serialization failure — log but never throw into the board.
      console.warn('Local board persistence failed', e);
    }
  }

  /** Load the persisted copy, or null if missing / expired / unparseable. */
  load(boardId: string): PersistedBoard | null {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(this.key(boardId));
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PersistedBoard;
      if (
        !parsed ||
        typeof parsed.savedAt !== 'number' ||
        !Array.isArray(parsed.items)
      ) {
        return null;
      }
      if (Date.now() - parsed.savedAt > this.TTL_MS) {
        this.clear(boardId);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /** True if a local copy exists and holds at least one not-synced element. */
  hasUnsynced(boardId: string): boolean {
    const data = this.load(boardId);
    if (!data) return false;
    return data.items.some((i) => i.syncState !== 'synced');
  }

  clear(boardId: string): void {
    try {
      localStorage.removeItem(this.key(boardId));
    } catch {}
    if (this.pending?.boardId === boardId) this.pending = null;
  }
}
