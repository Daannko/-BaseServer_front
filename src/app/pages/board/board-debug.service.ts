import { Injectable, NgZone } from '@angular/core';

/**
 * Lightweight performance instrumentation for the board canvas.
 *
 * Measures FPS plus per-second change-detection counts for the board host and
 * for the note components, so a laggy board can be profiled without external
 * tooling. The rAF loop runs OUTSIDE the Angular zone, so measuring never
 * itself triggers change detection.
 *
 * Also owns debug feature flags (currently: disable the rich-text editor) that
 * persist to localStorage so they survive the reload they trigger.
 */
@Injectable({ providedIn: 'root' })
export class BoardDebugService {
  private static readonly LS_DISABLE_EDITOR = 'BOARD_DEBUG_DISABLE_EDITOR';
  private static readonly LS_OVERLAY = 'BOARD_DEBUG_OVERLAY';
  private static readonly LS_SQUARES = 'BOARD_DEBUG_SQUARES';
  private static readonly LS_FLAT = 'BOARD_DEBUG_FLAT';

  /** Live (no-reload) flags + their localStorage keys. Persisted on change and
   *  restored on load via setLive() / the constructor loop. */
  private static readonly LIVE_FLAGS = {
    panGpuLayer: 'BOARD_DEBUG_GPU',
    freezeGridOnPan: 'BOARD_DEBUG_FREEZE_GRID',
    disableRadius: 'BOARD_DEBUG_NO_RADIUS',
    disableDashedBorder: 'BOARD_DEBUG_SOLID_BORDER',
    stripNoteChrome: 'BOARD_DEBUG_STRIP_CHROME',
  } as const;

  /** When true, BoardNoteComponent skips tiptap and renders plain text. */
  disableEditor = false;
  /** When true, the on-screen overlay is shown. */
  overlayVisible = true;
  /** When true, promote the viewport to a GPU layer during pan (will-change). */
  panGpuLayer = true;
  /** When true, skip the grid-background repaint while panning (diagnostic). */
  freezeGridOnPan = false;
  /** When true, render the real note shell (border/background/radius/glow) but
   *  with an empty body — no editor, no text. Isolates text paint cost from the
   *  note chrome. Persisted + reloads, so editors never mount. */
  renderBareSquares = false;
  /** When true, zero out note border-radius + overflow clip. Live toggle (CSS
   *  only) to measure the rounded-clip paint cost. */
  disableRadius = false;
  /** When true, force is-clear dashed borders to solid. Live toggle to measure
   *  dashed-stroke paint cost. */
  disableDashedBorder = false;
  /** When true, render each note as a single flat div — no shell, no overlays,
   *  no editor. The 60-fps paint floor. Persisted + reloads. */
  renderFlatSquares = false;
  /** When true, strip the note-surface background + border + shadow (keep DOM).
   *  Live toggle to split paint cost (fill/border) from DOM-depth cost. */
  stripNoteChrome = false;

  // ── Live metrics (recomputed once per second) ────────────────────────────
  fps = 0;
  /** Board-host template evaluations per second (one per board CD pass). */
  cdBoard = 0;
  /** Summed note-component template evaluations per second. */
  cdNotes = 0;
  /** Most recent frame duration in ms. */
  frameMs = 0;
  /** Note components mounted (ngAfterViewInit) per second. */
  noteMounts = 0;
  /** Note components destroyed (ngOnDestroy) per second. */
  noteDestroys = 0;
  /** Currently-mounted note components (live, not per-second). */
  notesLive = 0;

  // Counters incremented from templates; reset every sampling second.
  private boardCdCount = 0;
  private noteCdCount = 0;
  private frames = 0;
  private noteMountCount = 0;
  private noteDestroyCount = 0;

  private lastSecTs = 0;
  private lastFrameTs = 0;

  constructor(private zone: NgZone) {
    this.disableEditor =
      localStorage.getItem(BoardDebugService.LS_DISABLE_EDITOR) === '1';
    this.overlayVisible =
      localStorage.getItem(BoardDebugService.LS_OVERLAY) !== '0';
    this.renderBareSquares =
      localStorage.getItem(BoardDebugService.LS_SQUARES) === '1';
    this.renderFlatSquares =
      localStorage.getItem(BoardDebugService.LS_FLAT) === '1';
    // Restore live flags (keep code defaults when never stored).
    for (const [flag, key] of Object.entries(BoardDebugService.LIVE_FLAGS)) {
      const v = localStorage.getItem(key);
      if (v !== null) (this as any)[flag] = v === '1';
    }
    this.startLoop();
  }

  /** Set + persist a live (no-reload) flag. Bound from the overlay checkboxes. */
  setLive(flag: keyof typeof BoardDebugService.LIVE_FLAGS, value: boolean): void {
    (this as any)[flag] = value;
    localStorage.setItem(BoardDebugService.LIVE_FLAGS[flag], value ? '1' : '0');
  }

  /** Called from the board-host template; counts board CD passes. */
  tickBoard(): string {
    this.boardCdCount++;
    return '';
  }

  /** Called from each note template; counts note CD passes. */
  tickNote(): string {
    this.noteCdCount++;
    return '';
  }

  /** Note component mounted. */
  tickMount(): void {
    this.noteMountCount++;
    this.notesLive++;
  }

  /** Note component destroyed. */
  tickDestroy(): void {
    this.noteDestroyCount++;
    this.notesLive--;
  }

  setDisableEditor(value: boolean): void {
    localStorage.setItem(
      BoardDebugService.LS_DISABLE_EDITOR,
      value ? '1' : '0',
    );
    // Editors are created once in ngAfterViewInit; a reload is the cleanest way
    // to switch the whole board between editor and plain-text rendering.
    location.reload();
  }

  setRenderBareSquares(value: boolean): void {
    localStorage.setItem(BoardDebugService.LS_SQUARES, value ? '1' : '0');
    // Editors mount once on note creation — reload so they're skipped entirely
    // and the shell renders with an empty body.
    location.reload();
  }

  setRenderFlatSquares(value: boolean): void {
    localStorage.setItem(BoardDebugService.LS_FLAT, value ? '1' : '0');
    location.reload();
  }

  setOverlayVisible(value: boolean): void {
    this.overlayVisible = value;
    localStorage.setItem(BoardDebugService.LS_OVERLAY, value ? '1' : '0');
  }

  private startLoop(): void {
    this.zone.runOutsideAngular(() => {
      const loop = (ts: number) => {
        if (!this.lastSecTs) {
          this.lastSecTs = ts;
          this.lastFrameTs = ts;
        }
        this.frameMs = ts - this.lastFrameTs;
        this.lastFrameTs = ts;
        this.frames++;

        if (ts - this.lastSecTs >= 1000) {
          this.fps = this.frames;
          this.cdBoard = this.boardCdCount;
          this.cdNotes = this.noteCdCount;
          this.noteMounts = this.noteMountCount;
          this.noteDestroys = this.noteDestroyCount;
          this.frames = 0;
          this.boardCdCount = 0;
          this.noteCdCount = 0;
          this.noteMountCount = 0;
          this.noteDestroyCount = 0;
          this.lastSecTs = ts;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
  }
}
