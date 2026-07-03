import { ElementRef, Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { BoardItem } from './board-item/board-item.data';
import { BoardDebugService } from './board-debug.service';

export type BoardContextMenuRequest = {
  clientX: number;
  clientY: number;
  worldX: number;
  worldY: number;
};

@Injectable({ providedIn: 'root' })
export class BoardMainService {
  constructor(
    private ngZone: NgZone,
    private debug: BoardDebugService,
  ) {}
  // internal state - set by caller via `initialize`
  boardRef: ElementRef | null = null;
  viewportRef: ElementRef | null = null;
  private readonly zoomSubject = new BehaviorSubject<number>(1);
  private readonly cameraSubject = new BehaviorSubject<{
    x: number;
    y: number;
  }>({ x: 0, y: 0 });
  readonly zoom$ = this.zoomSubject.asObservable();
  readonly camera$ = this.cameraSubject.asObservable();

  private readonly contextMenuSubject = new Subject<BoardContextMenuRequest>();
  readonly contextMenu$ = this.contextMenuSubject.asObservable();

  // ── Element-drag peer outlines ──────────────────────────────────────────────
  // While any element (or selection) is being moved, the board outlines every
  // OTHER on-screen element so the user can see alignment targets. Set by both
  // move paths: the per-element move directive and the selection group-drag.
  private readonly draggingSubject = new BehaviorSubject<boolean>(false);
  readonly dragging$ = this.draggingSubject.asObservable();
  private draggingMovingIds = new Set<string>();

  beginElementDrag(movingIds: Iterable<string>): void {
    this.draggingMovingIds = new Set(movingIds);
    this.draggingSubject.next(true);
  }
  endElementDrag(): void {
    if (!this.draggingSubject.value) return;
    this.draggingMovingIds = new Set();
    this.draggingSubject.next(false);
  }

  /** Rects (world px) of every on-screen element NOT being dragged — outlined
   *  during a move so peers' borders are visible as alignment references. */
  peerOutlines(): Array<{ x: number; y: number; width: number; height: number }> {
    const out: Array<{ x: number; y: number; width: number; height: number }> = [];
    const all = [...this.notes, ...this.sections, ...this.images, ...this.drawings];
    for (const it of all) {
      if (this.draggingMovingIds.has(it.id) || !it.inView) continue;
      out.push({ x: it.x, y: it.y, width: it.width, height: it.height });
    }
    return out;
  }

  private zoomSettleTimer: ReturnType<typeof setTimeout> | null = null;

  // Camera source of truth is plain fields, NOT the subject — so a pan can write
  // the viewport transform every frame without emitting (which would force a
  // full change-detection / frustum-cull pass per mousemove). The subject is
  // emitted only on a throttle during pan (and immediately for zoom/programmatic
  // moves) to drive culling + the position overlay.
  private _camX = 0;
  private _camY = 0;

  get cameraX(): number {
    return this._camX;
  }
  get cameraY(): number {
    return this._camY;
  }

  // Zoom source of truth is a field — so a zoom gesture can scale the viewport
  // transform every wheel tick WITHOUT emitting (which forces every note to
  // re-render its zoom-dependent bindings and re-rasterize the layer). The
  // subject is emitted only when the gesture settles.
  private _zoom = 1;

  get zoom(): number {
    return this._zoom;
  }

  setZoom(nextZoom: number) {
    if (!isFinite(nextZoom) || nextZoom <= 0) return;
    this._zoom = Math.max(0.01, Math.min(100, nextZoom));
    this.zoomSubject.next(this._zoom);
  }

  /** Clamp + write zoom WITHOUT emitting. Returns the CLAMPED value — callers
   *  must use it (not the raw input) for camera math, or the view drifts at the
   *  zoom limits where input ≠ clamped. */
  private setZoomSilent(nextZoom: number): number {
    if (!isFinite(nextZoom) || nextZoom <= 0) return this._zoom;
    this._zoom = Math.max(0.01, Math.min(100, nextZoom));
    return this._zoom;
  }

  setCamera(x: number, y: number) {
    if (!isFinite(x) || !isFinite(y)) return;
    // Keep |camX * zoom| < 5e6 so the CSS transform matrix never overflows ~32-bit float precision.
    const limit = 5_000_000 / Math.max(0.001, this.zoom);
    this._camX = Math.max(-limit, Math.min(limit, x));
    this._camY = Math.max(-limit, Math.min(limit, y));
    // Notify (culling, overlay). Pan uses the throttled emit in panFrame instead.
    this.cameraSubject.next({ x: this._camX, y: this._camY });
  }

  /** Clamp + write camera fields WITHOUT emitting — used by the per-frame pan so
   *  it doesn't trigger a change-detection pass on every frame. */
  private setCameraSilent(x: number, y: number): void {
    if (!isFinite(x) || !isFinite(y)) return;
    const limit = 5_000_000 / Math.max(0.001, this.zoom);
    this._camX = Math.max(-limit, Math.min(limit, x));
    this._camY = Math.max(-limit, Math.min(limit, y));
  }

  notes: Array<BoardItem> = [];
  sections: Array<BoardItem> = [];
  images: Array<BoardItem> = [];
  drawings: Array<BoardItem> = [];

  /** Bumped whenever any element's position/size changes (move, resize, snap,
   *  create, delete). Cheap monotonic counter the note components use to cache
   *  expensive per-frame geometry work (e.g. corner-squaring) so it only
   *  recomputes when geometry actually changed — not on every change-detection
   *  pass triggered by pan/zoom. */
  geometryVersion = 0;
  bumpGeometry(): void {
    this.geometryVersion++;
  }

  // Cached board viewport size in screen px. Reading offsetWidth/offsetHeight
  // forces a synchronous layout, so isItemVisible() must NOT read them per call
  // (it runs for every element on every CD pass). Refreshed once per
  // updateBoard() and on demand instead.
  private vpW = 0;
  private vpH = 0;
  refreshViewportSize(): void {
    if (!this.boardRef) return;
    const board = this.boardRef.nativeElement as HTMLElement;
    this.vpW = board.offsetWidth;
    this.vpH = board.offsetHeight;
  }
  noteComponents: any[] = [];
  cdr: any = null; // optional ChangeDetectorRef
  onBackgroundMouseDown: (() => void) | null = null;
  isDragging: boolean = false;
  startX: number = 0;
  startY: number = 0;
  /** When true the board ignores background pan / context-menu so the draw
   *  overlay can capture strokes. Set by BoardComponent.toggleDrawMode(). */
  drawMode = false;

  initialize(options: {
    boardRef: ElementRef;
    viewportRef?: ElementRef;
    notes?: Array<BoardItem>;
    sections?: Array<BoardItem>;
    images?: Array<BoardItem>;
    drawings?: Array<BoardItem>;
    noteComponents?: any[];
    cdr?: any;
    zoom?: number;
    cameraX?: number;
    cameraY?: number;
    onBackgroundMouseDown?: () => void;
  }) {
    this.boardRef = options.boardRef;
    this.viewportRef = options.viewportRef ?? this.viewportRef;
    this.notes = options.notes || this.notes;
    this.sections = options.sections || this.sections;
    this.images = options.images || this.images;
    this.drawings = options.drawings || this.drawings;
    this.noteComponents = options.noteComponents || this.noteComponents;
    this.cdr = options.cdr || this.cdr;
    if (typeof options.zoom === 'number') {
      this.setZoom(options.zoom);
    }
    this.setCamera(
      options.cameraX ?? this.cameraX,
      options.cameraY ?? this.cameraY,
    );
    this.onBackgroundMouseDown = options.onBackgroundMouseDown ?? null;
  }

  updateBoard() {
    if (!this.boardRef) return;
    const board = this.boardRef.nativeElement as HTMLElement;

    // Apply a single transform for pan/zoom. Children are positioned in world px.
    if (this.viewportRef) {
      const viewport = this.viewportRef.nativeElement as HTMLElement;
      viewport.style.transformOrigin = '0 0';
      viewport.style.transform = `scale(${this.zoom}) translate(${-this.cameraX}px, ${-this.cameraY}px)`;
    }

    // Infinite grid: lines are CSS gradients (see board.component.scss). The
    // cell size scales with zoom; an adaptive factor keeps the on-screen cell
    // in a sane range so the grid never turns to noise when zoomed far out/in.
    // Major lines sit every 5 fine cells. Background moves in screen px, so the
    // camera offset is multiplied by zoom (same as the viewport transform).
    const BASE = 50; // world px per fine cell at zoom 1
    let cell = BASE * this.zoom;
    while (cell < 24) cell *= 5;
    while (cell >= 120) cell /= 5;
    const major = cell * 5;
    // Diagnostic: skip the grid repaint while panning to measure how much the
    // full-board background gradient repaint costs per frame.
    if (this.debug.freezeGridOnPan && this.isDragging) return;
    const px = -this.cameraX * this.zoom;
    const py = -this.cameraY * this.zoom;
    board.style.backgroundSize =
      `${cell}px ${cell}px, ${cell}px ${cell}px, ${major}px ${major}px, ${major}px ${major}px`;
    board.style.backgroundPosition = `${px}px ${py}px`;
  }

  // ── Coalesced pan ──────────────────────────────────────────────────────────
  private panRafId = 0;
  private panPendingX = 0;
  private panPendingY = 0;
  private lastCullTs = 0;
  /** Min ms between culling passes during a pan (~20 Hz). Lower = newly-visible
   *  elements pop in sooner; higher = cheaper. The transform itself still
   *  updates every frame, so the pan stays smooth regardless. */
  private static readonly CULL_THROTTLE_MS = 50;

  /** One pan frame: apply the accumulated mouse delta, write the transform
   *  (cheap, no CD), and only occasionally emit to re-cull. Runs outside the
   *  Angular zone. */
  private panFrame = (): void => {
    this.panRafId = 0;
    if (!this.isDragging) return;

    const deltaX = this.panPendingX - this.startX;
    const deltaY = this.panPendingY - this.startY;
    this.startX = this.panPendingX;
    this.startY = this.panPendingY;

    this.setCameraSilent(
      this._camX - deltaX / this.zoom,
      this._camY - deltaY / this.zoom,
    );
    // Per-frame visual only: viewport transform + grid. No change detection.
    this.updateBoard();

    // Throttle the Angular work (frustum cull + position overlay).
    const now = performance.now();
    if (now - this.lastCullTs >= BoardMainService.CULL_THROTTLE_MS) {
      this.lastCullTs = now;
      this.cameraSubject.next({ x: this._camX, y: this._camY });
    }
  };

  // Promote the viewport to its own GPU compositor layer for the duration of a
  // pan drag, so each frame is a cheap layer translate instead of re-rasterizing
  // every element. Dropped on pointer-up so the layer doesn't linger.
  private panSettleTimer: ReturnType<typeof setTimeout> | null = null;
  private beginPanGesture() {
    // Viewport size is fixed during a pan — read it once here, not per frame.
    this.refreshViewportSize();
    if (!this.viewportRef || !this.debug.panGpuLayer) return;
    if (this.panSettleTimer !== null) {
      clearTimeout(this.panSettleTimer);
      this.panSettleTimer = null;
    }
    const viewport = this.viewportRef.nativeElement as HTMLElement;
    viewport.style.willChange = 'transform';
  }
  private endPanGesture() {
    if (!this.viewportRef) return;
    const viewport = this.viewportRef.nativeElement as HTMLElement;
    // Keep the layer briefly so a pan→pan sequence doesn't thrash the layer.
    if (this.panSettleTimer !== null) clearTimeout(this.panSettleTimer);
    this.panSettleTimer = setTimeout(() => {
      this.panSettleTimer = null;
      viewport.style.willChange = 'auto';
    }, 300);
  }

  // Promote the viewport to its own compositor layer for the duration of a zoom
  // gesture. While promoted, the browser just SCALES the cached note bitmap
  // (fast but blurry) instead of re-rasterizing every note per wheel tick.
  private beginZoomGesture() {
    this.refreshViewportSize();
    if (!this.viewportRef) return;
    (this.viewportRef.nativeElement as HTMLElement).style.willChange = 'transform';
  }

  /** Ms of wheel-idle before committing the zoom (re-rendering notes sharp). */
  private static readonly ZOOM_COMMIT_MS = 150;

  /** Debounced: every wheel tick pushes this out, so notes stay blurry-but-60fps
   *  while zooming and only re-render sharp once the wheel stops. */
  private scheduleZoomCommit(): void {
    if (this.zoomSettleTimer !== null) clearTimeout(this.zoomSettleTimer);
    this.zoomSettleTimer = setTimeout(
      () => this.commitZoom(),
      BoardMainService.ZOOM_COMMIT_MS,
    );
  }

  /** Gesture settled: emit the real zoom + camera so notes re-render sharp at the
   *  final scale and re-cull, then drop the layer (frees VRAM, composites sharp). */
  private commitZoom(): void {
    this.zoomSettleTimer = null;
    this.zoomSubject.next(this._zoom);
    this.cameraSubject.next({ x: this._camX, y: this._camY });
    if (this.viewportRef) {
      (this.viewportRef.nativeElement as HTMLElement).style.willChange = 'auto';
    }
  }

  isItemVisible(item: BoardItem): boolean {
    if (!this.boardRef) return true;
    // Use cached viewport size — never touch offsetWidth/offsetHeight here, or
    // every element triggers a layout reflow on every change-detection pass.
    if (this.vpW === 0) this.refreshViewportSize();
    const viewW = this.vpW / this.zoom;
    const viewH = this.vpH / this.zoom;

    const left = item.x;
    const top = item.y;
    const right = item.x + item.width;
    const bottom = item.y + item.height;

    const viewLeft = this.cameraX;
    const viewTop = this.cameraY;
    const viewRight = this.cameraX + viewW;
    const viewBottom = this.cameraY + viewH;

    item.inView =
      right > viewLeft &&
      left < viewRight &&
      bottom > viewTop &&
      top < viewBottom;

    return item.forceToRender || item.inView;
  }

  /** Resolve an element by its board-link targetId. Matches serverId first
   *  (stable across reloads), then the client id (for not-yet-saved targets). */
  findItemById(id: string): BoardItem | undefined {
    if (!id) return undefined;
    const all = [...this.notes, ...this.sections, ...this.images, ...this.drawings];
    return (
      all.find((i) => i.serverId === id) ?? all.find((i) => i.id === id)
    );
  }

  /** Center on the element a board-link points at, if it still exists. */
  navigateToLink(id: string): void {
    const item = this.findItemById(id);
    if (item) this.moveToItem(item);
  }

  centerOnItem(item: BoardItem) {
    if (!this.boardRef) return;
    // Refresh the cached viewport size so the centring math and the frustum
    // cull (isItemVisible) use the SAME, current dimensions — otherwise a stale
    // cache culls items that are actually on screen.
    this.refreshViewportSize();
    const viewportWidth = this.vpW;
    const viewportHeight = this.vpH;

    // Fit the whole item in view with breathing room (0.7), capped so small
    // items don't blow up to extreme zoom levels.
    const fitZoom =
      Math.min(viewportWidth / item.width, viewportHeight / item.height) * 0.7;
    this.setZoom(Math.min(1.5, fitZoom));

    this.setCamera(
      item.getCenterX() - viewportWidth / (2 * this.zoom),
      item.getCenterY() - viewportHeight / (2 * this.zoom),
    );

    this.updateBoard();
  }

  moveToItem(item: BoardItem) {
    item.forceToRender = true;
    if (this.cdr && typeof this.cdr.detectChanges === 'function') {
      this.cdr.detectChanges();
    }
    this.centerOnItem(item);
    this.updateBoard();

    Promise.resolve().then(() => {
      const centerTile = this.noteComponents.find(
        (tile) => tile.tile.id === item.id,
      );
      if (centerTile) {
        // Let the tile request its navbar; BoardComponent owns NavbarService.
        if (typeof centerTile.requestNavbar === 'function') {
          centerTile.requestNavbar(centerTile.navbarContentTemplate);
        }
      }
      item.forceToRender = false;
    });
  }

  setupListeners() {
    if (!this.boardRef) return;
    const board = this.boardRef.nativeElement as HTMLElement;
    this.ngZone.runOutsideAngular(() => this.registerListeners(board));
  }

  private registerListeners(board: HTMLElement) {

    board.addEventListener('wheel', (event: WheelEvent) => {
      event.preventDefault();
      const rect = board.getBoundingClientRect();

      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // Keep mouse position fixed during zoom (uses the CURRENT zoom).
      const worldMouseX = mouseX / this.zoom + this.cameraX;
      const worldMouseY = mouseY / this.zoom + this.cameraY;

      // Silent during the gesture: only the viewport scale transform changes, so
      // the GPU scales the cached note bitmap (blurry but 60fps). Notes re-render
      // sharp on settle (commitZoom). Use the CLAMPED return for the camera math
      // so the cursor anchor stays correct at the 1%/100% zoom limits.
      const z = this.setZoomSilent(this._zoom * (event.deltaY < 0 ? 1.1 : 0.9));
      this.setCameraSilent(worldMouseX - mouseX / z, worldMouseY - mouseY / z);

      this.beginZoomGesture();
      this.updateBoard();
      this.scheduleZoomCommit();
    });

    board.addEventListener('mousedown', (event: MouseEvent) => {
      // stop right click
      if (event.button !== 0) return;
      // Draw mode owns the canvas — never start a pan.
      if (this.drawMode) return;

      const path = (event.composedPath?.() ?? []) as EventTarget[];
      const hasClass = (cls: string) =>
        path.some((p) => p instanceof HTMLElement && p.classList.contains(cls));
      const hasTag = (tag: string) =>
        path.some((p) => p instanceof HTMLElement && p.tagName === tag);

      // Sections are intentionally excluded: their body is pannable background.
      // Their header / move grip / resize handles stop propagation or are guarded
      // by the hasClass checks below, so a pan only starts on the bare frame.
      const tileEl = path.find(
        (p): p is HTMLElement => p instanceof HTMLElement &&
          (p.tagName === 'APP-BOARD-NOTE' ||
            p.tagName === 'APP-BOARD-IMAGE' ||
            p.tagName === 'APP-BOARD-DRAWING'),
      ) as HTMLElement | undefined;
      const isInsideTileBounds = tileEl
        ? (() => {
            const r = tileEl.getBoundingClientRect();
            return (
              event.clientX >= r.left && event.clientX <= r.right &&
              event.clientY >= r.top && event.clientY <= r.bottom
            );
          })()
        : false;

      if (
        isInsideTileBounds ||
        hasClass('search-window') ||
        hasTag('APP-NAVBAR') ||
        // Section frames are pannable background, but their resize handles
        // and header must not start a board pan.
        hasClass('resize-handle') ||
        hasClass('section-header')
      ) {
        return;
      }

      event.preventDefault();
      document.body.style.userSelect = 'none';

      if (this.onBackgroundMouseDown) {
        this.ngZone.run(() => this.onBackgroundMouseDown!());
      }
      this.isDragging = true;
      this.startX = event.clientX;
      this.startY = event.clientY;
      this.panPendingX = event.clientX;
      this.panPendingY = event.clientY;
      board.style.cursor = 'grabbing';
      this.beginPanGesture();
    });

    // Pan is coalesced to one rAF per frame: many mousemoves (>60 Hz) collapse
    // into a single camera update + transform write per frame, and culling is
    // throttled (see panFrame) instead of running on every mousemove.
    board.addEventListener('mousemove', (event: MouseEvent) => {
      if (!this.isDragging) return;
      this.panPendingX = event.clientX;
      this.panPendingY = event.clientY;
      if (this.panRafId === 0) {
        this.panRafId = requestAnimationFrame(this.panFrame);
      }
    });

    const stopDragging = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      board.style.cursor = 'grab';
      document.body.style.userSelect = '';
      if (this.panRafId !== 0) {
        cancelAnimationFrame(this.panRafId);
        this.panRafId = 0;
      }
      // Final emit so culling + the position overlay settle on the exact spot.
      this.cameraSubject.next({ x: this._camX, y: this._camY });
      this.endPanGesture();
    };

    window.addEventListener('mouseup', stopDragging);
    board.addEventListener('mouseup', stopDragging);

    board.addEventListener('contextmenu', (ev: MouseEvent) =>
      this.ngZone.run(() => this.showContextMenu(ev)),
    );

    // Cached viewport size must follow window resizes (it's no longer read per
    // frame). Re-cull afterwards so culling matches the new viewport.
    window.addEventListener('resize', () => {
      this.refreshViewportSize();
      this.cameraSubject.next({ x: this._camX, y: this._camY });
    });
  }

  showContextMenu(ev: MouseEvent) {
    if (!this.boardRef) return;
    if (this.drawMode) return;
    ev.preventDefault();

    const path = (ev.composedPath?.() ?? []) as EventTarget[];
    const hasClass = (cls: string) =>
      path.some((p) => p instanceof HTMLElement && p.classList.contains(cls));
    const hasTag = (tag: string) =>
      path.some((p) => p instanceof HTMLElement && p.tagName === tag);

    // Background-only menu (avoid opening when interacting with UI/tile).
    const tileEl = path.find(
      (p): p is HTMLElement => p instanceof HTMLElement &&
        (p.tagName === 'APP-BOARD-TILE' || p.tagName === 'APP-BOARD-NOTE' ||
         p.tagName === 'APP-BOARD-IMAGE' || p.tagName === 'APP-BOARD-DRAWING'),
    ) as HTMLElement | undefined;
    const isInsideTileBounds = tileEl
      ? (() => {
          const r = tileEl.getBoundingClientRect();
          return (
            ev.clientX >= r.left && ev.clientX <= r.right &&
            ev.clientY >= r.top && ev.clientY <= r.bottom
          );
        })()
      : false;

    if (
      isInsideTileBounds ||
      hasClass('search-window') ||
      hasTag('APP-NAVBAR') ||
      hasClass('section-header')
    ) {
      return;
    }

    const board = this.boardRef.nativeElement as HTMLElement;
    const rect = board.getBoundingClientRect();
    const mouseX = ev.clientX - rect.left;
    const mouseY = ev.clientY - rect.top;

    const worldX = mouseX / this.zoom + this.cameraX;
    const worldY = mouseY / this.zoom + this.cameraY;

    this.contextMenuSubject.next({
      clientX: ev.clientX,
      clientY: ev.clientY,
      worldX,
      worldY,
    });
  }
}
