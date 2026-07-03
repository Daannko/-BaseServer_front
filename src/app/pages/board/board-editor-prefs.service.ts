import { Injectable } from '@angular/core';

/**
 * Editor preferences shared across every note/section editor (root singleton,
 * so the value survives switching between elements and full reloads).
 *
 * `lastFontSize` is the font size the user last applied anywhere. New empty
 * elements and freshly-emptied ones default to it — instead of a size-derived
 * value — so the size you were just working in carries over to the next item.
 */
@Injectable({ providedIn: 'root' })
export class EditorPrefsService {
  private static readonly KEY = 'board.editor.lastFontSize';
  /** Fallback before the user has set any size (matches the old base note size). */
  static readonly DEFAULT_FONT_SIZE = 25;

  private static readonly DEFAULT_KEY = 'board.editor.defaultNoteFontSize';

  private _lastFontSize = this.load();
  private _defaultNoteFontSize = this.loadDefault();

  /** Base font size (px) for a note's text that carries no explicit size mark —
   *  i.e. new notes / fresh lines. User-configurable (Options popup). */
  get defaultNoteFontSize(): number {
    return this._defaultNoteFontSize;
  }

  set defaultNoteFontSize(px: number) {
    if (!Number.isFinite(px) || px <= 0) return;
    this._defaultNoteFontSize = Math.round(px);
    try {
      localStorage.setItem(
        EditorPrefsService.DEFAULT_KEY,
        String(this._defaultNoteFontSize),
      );
    } catch {}
  }

  private loadDefault(): number {
    try {
      const raw = localStorage.getItem(EditorPrefsService.DEFAULT_KEY);
      const px = raw ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(px) && px > 0) return px;
    } catch {}
    return EditorPrefsService.DEFAULT_FONT_SIZE;
  }

  /** Last font size (px) applied by the user, anywhere. */
  get lastFontSize(): number {
    return this._lastFontSize;
  }

  set lastFontSize(px: number) {
    if (!Number.isFinite(px) || px <= 0) return;
    this._lastFontSize = Math.round(px);
    try {
      localStorage.setItem(EditorPrefsService.KEY, String(this._lastFontSize));
    } catch {}
  }

  private load(): number {
    try {
      const raw = localStorage.getItem(EditorPrefsService.KEY);
      const px = raw ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(px) && px > 0) return px;
    } catch {}
    return EditorPrefsService.DEFAULT_FONT_SIZE;
  }
}
