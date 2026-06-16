import { Injectable } from '@angular/core';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Serializable history entries ───────────────────────────────────────────

type HistoryEntry =
  | { kind: 'rect'; itemId: string; before: Rect; after: Rect }
  | { kind: 'delete'; itemIds: string[] }
  | { kind: 'create'; itemIds: string[] }
  | { kind: 'groupMove'; items: Array<{ id: string; bx: number; by: number; ax: number; ay: number }> };

/**
 * Undo/redo for board-level actions. All entries are serializable data — no
 * closures — so the stacks can survive a page refresh via sessionStorage.
 *
 * Text edits inside notes/sections are intentionally NOT recorded here — tiptap
 * editors keep their own history and handle Ctrl+Z while focused.
 */
@Injectable({ providedIn: 'root' })
export class BoardHistoryService {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private applying = false;
  private readonly STORAGE_KEY = 'board_history';

  /** Callbacks set by BoardComponent so undo/redo can touch the data. */
  onChange: (() => void) | null = null;

  /** Look up any element by its client-side id. */
  getItemById: ((id: string) => { x: number; y: number; width: number; height: number; [k: string]: any } | null) | null = null;

  /** Called when an undo restores a deleted element. */
  onRestoreDelete: ((itemId: string) => void) | null = null;

  /** Called when a redo removes a created element. */
  onRedoDelete: ((itemId: string) => void) | null = null;

  /** Called when undo creates a previously-deleted element. */
  onUndoCreate: ((itemId: string) => void) | null = null;

  /** Called when redo restores an undone create. */
  onRedoCreate: ((itemId: string) => void) | null = null;

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.store();
  }

  push(entry: HistoryEntry): void {
    if (this.applying) return;
    this.undoStack.push(entry);
    this.redoStack.length = 0;
    this.store();
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.applying = true;
    try {
      this.applyUndo(entry);
    } finally {
      this.applying = false;
    }
    this.redoStack.push(entry);
    this.store();
    this.onChange?.();
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.applying = true;
    try {
      this.applyRedo(entry);
    } finally {
      this.applying = false;
    }
    this.undoStack.push(entry);
    this.store();
    this.onChange?.();
  }

  // ── Convenience builders (called by BoardComponent) ──────────────────────

  pushRect(itemId: string, before: Rect, after: Rect): void;
  pushRect(item: { id: string; x: number; y: number; width: number; height: number }, before: Rect): void;
  pushRect(
    itemOrId: string | { id: string; x: number; y: number; width: number; height: number },
    before: Rect,
    after?: Rect,
  ): void {
    const id = typeof itemOrId === 'string' ? itemOrId : itemOrId.id;
    const a: Rect = after ?? {
      x: (itemOrId as any).x,
      y: (itemOrId as any).y,
      width: (itemOrId as any).width,
      height: (itemOrId as any).height,
    };
    if (
      before.x === a.x &&
      before.y === a.y &&
      before.width === a.width &&
      before.height === a.height
    ) return;
    this.push({ kind: 'rect', itemId: id, before, after: a });
  }

  pushDelete(itemIds: string[]): void {
    this.push({ kind: 'delete', itemIds });
  }

  pushCreate(itemIds: string[]): void {
    this.push({ kind: 'create', itemIds });
  }

  pushGroupMove(
    moves: Array<{ id: string; bx: number; by: number; ax: number; ay: number }>,
  ): void {
    this.push({ kind: 'groupMove', items: moves });
  }

  // ── Apply / serde ────────────────────────────────────────────────────────

  private applyUndo(entry: HistoryEntry): void {
    switch (entry.kind) {
      case 'rect': {
        const it = this.getItemById?.(entry.itemId);
        if (it) { it.x = entry.before.x; it.y = entry.before.y; it.width = entry.before.width; it.height = entry.before.height; }
        break;
      }
      case 'delete':
        for (const id of entry.itemIds) this.onRestoreDelete?.(id);
        break;
      case 'create':
        for (const id of entry.itemIds) this.onRedoDelete?.(id);
        break;
      case 'groupMove':
        for (const m of entry.items) {
          const it = this.getItemById?.(m.id);
          if (it) { it.x = m.bx; it.y = m.by; }
        }
        break;
    }
  }

  private applyRedo(entry: HistoryEntry): void {
    switch (entry.kind) {
      case 'rect': {
        const it = this.getItemById?.(entry.itemId);
        if (it) { it.x = entry.after.x; it.y = entry.after.y; it.width = entry.after.width; it.height = entry.after.height; }
        break;
      }
      case 'delete':
        for (const id of entry.itemIds) this.onRedoDelete?.(id);
        break;
      case 'create':
        for (const id of entry.itemIds) this.onUndoCreate?.(id);
        break;
      case 'groupMove':
        for (const m of entry.items) {
          const it = this.getItemById?.(m.id);
          if (it) { it.x = m.ax; it.y = m.ay; }
        }
        break;
    }
  }

  // ── sessionStorage persistence ───────────────────────────────────────────

  private store(): void {
    try {
      sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify({
        undo: this.undoStack,
        redo: this.redoStack,
      }));
    } catch {}
  }

  /** Restore stacks from sessionStorage. Call after board is loaded and
   *  getItemById / onRestoreDelete / etc. are wired. */
  restore(): void {
    try {
      const raw = sessionStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.undo)) this.undoStack = parsed.undo;
      if (Array.isArray(parsed?.redo)) this.redoStack = parsed.redo;
    } catch {}
  }

  /** Drops stored history (e.g. when switching boards). */
  dropStored(): void {
    try { sessionStorage.removeItem(this.STORAGE_KEY); } catch {}
  }
}
