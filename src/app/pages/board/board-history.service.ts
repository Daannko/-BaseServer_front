import { Injectable } from '@angular/core';
import { BoardItem } from './board-item/board-item.data';

export interface HistoryCommand {
  undo(): void;
  redo(): void;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Undo/redo for board-level actions (move, resize, create, delete, …).
 *
 * Text edits inside notes/sections are intentionally NOT recorded here — the
 * tiptap editors keep their own history and handle Ctrl+Z while focused. The
 * board handler only runs when no editor is focused, so the two timelines merge
 * naturally by focus.
 */
@Injectable({ providedIn: 'root' })
export class BoardHistoryService {
  private undoStack: HistoryCommand[] = [];
  private redoStack: HistoryCommand[] = [];
  private applying = false;

  /** Invoked after an undo/redo so the host can run change detection. */
  onChange: (() => void) | null = null;

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  push(cmd: HistoryCommand): void {
    // Don't re-record changes made while applying an undo/redo.
    if (this.applying) return;
    this.undoStack.push(cmd);
    this.redoStack.length = 0;
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    this.run(() => cmd.undo());
    this.redoStack.push(cmd);
    this.onChange?.();
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    this.run(() => cmd.redo());
    this.undoStack.push(cmd);
    this.onChange?.();
  }

  private run(fn: () => void): void {
    this.applying = true;
    try {
      fn();
    } finally {
      this.applying = false;
    }
  }

  /** Record a position/size change (move or resize). No-op if unchanged. */
  pushRect(item: BoardItem, before: Rect): void {
    const after: Rect = {
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    };
    if (
      before.x === after.x &&
      before.y === after.y &&
      before.width === after.width &&
      before.height === after.height
    ) {
      return;
    }
    this.push({
      undo: () => applyRect(item, before),
      redo: () => applyRect(item, after),
    });
  }
}

function applyRect(item: BoardItem, r: Rect): void {
  item.x = r.x;
  item.y = r.y;
  item.width = r.width;
  item.height = r.height;
}
