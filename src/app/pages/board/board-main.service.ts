import { ElementRef, Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { BoardItem } from './board-item/board-item.data';

export type BoardContextMenuRequest = {
  clientX: number;
  clientY: number;
  worldX: number;
  worldY: number;
};

@Injectable({ providedIn: 'root' })
export class BoardMainService {
  constructor(private ngZone: NgZone) {}
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

  private zoomSettleTimer: ReturnType<typeof setTimeout> | null = null;

  get cameraX(): number {
    return this.cameraSubject.value.x;
  }
  get cameraY(): number {
    return this.cameraSubject.value.y;
  }

  get zoom(): number {
    return this.zoomSubject.value;
  }

  setZoom(nextZoom: number) {
    if (!isFinite(nextZoom) || nextZoom <= 0) return;
    this.zoomSubject.next(Math.max(0.01, Math.min(100, nextZoom)));
  }

  setCamera(x: number, y: number) {
    if (!isFinite(x) || !isFinite(y)) return;
    // Keep |camX * zoom| < 5e6 so the CSS transform matrix never overflows ~32-bit float precision.
    const limit = 5_000_000 / Math.max(0.001, this.zoom);
    this.cameraSubject.next({
      x: Math.max(-limit, Math.min(limit, x)),
      y: Math.max(-limit, Math.min(limit, y)),
    });
  }

  notes: Array<BoardItem> = [];
  sections: Array<BoardItem> = [];
  images: Array<BoardItem> = [];
  noteComponents: any[] = [];
  cdr: any = null; // optional ChangeDetectorRef
  onBackgroundMouseDown: (() => void) | null = null;
  isDragging: boolean = false;
  startX: number = 0;
  startY: number = 0;

  initialize(options: {
    boardRef: ElementRef;
    viewportRef?: ElementRef;
    notes?: Array<BoardItem>;
    sections?: Array<BoardItem>;
    images?: Array<BoardItem>;
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

    // Keep background "stuck" to world coordinates.
    // (Background moves in screen px, so multiply camera by zoom.)
    board.style.backgroundPosition = `${-this.cameraX * this.zoom}px ${-this.cameraY * this.zoom}px`;
  }

  // Promote the viewport to its own compositor layer only while a zoom gesture
  // is in flight. While promoted, the browser scales the cached raster (fast
  // but blurry); dropping `will-change` after the gesture settles forces a
  // re-rasterization at the final zoom level so content is sharp again.
  private beginZoomGesture() {
    if (!this.viewportRef) return;
    const viewport = this.viewportRef.nativeElement as HTMLElement;
    viewport.style.willChange = 'transform';

    if (this.zoomSettleTimer !== null) clearTimeout(this.zoomSettleTimer);
    this.zoomSettleTimer = setTimeout(() => {
      this.zoomSettleTimer = null;
      viewport.style.willChange = 'auto';
    }, 150);
  }

  isItemVisible(item: BoardItem): boolean {
    if (!this.boardRef) return true;
    const board = this.boardRef.nativeElement as HTMLElement;
    const viewW = board.offsetWidth / this.zoom;
    const viewH = board.offsetHeight / this.zoom;

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

  centerOnItem(item: BoardItem) {
    if (!this.boardRef) return;
    const board = this.boardRef.nativeElement as HTMLElement;
    const viewportWidth = board.offsetWidth;
    const viewportHeight = board.offsetHeight;

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

      const newZoom = this.zoom * (event.deltaY < 0 ? 1.1 : 0.9);

      // Keep mouse position fixed during zoom
      const worldMouseX = mouseX / this.zoom + this.cameraX;
      const worldMouseY = mouseY / this.zoom + this.cameraY;

      this.setZoom(newZoom);

      this.setCamera(
        worldMouseX - mouseX / this.zoom,
        worldMouseY - mouseY / this.zoom,
      );

      this.beginZoomGesture();
      this.updateBoard();
    });

    board.addEventListener('mousedown', (event: MouseEvent) => {
      // stop right click
      if (event.button !== 0) return;

      const path = (event.composedPath?.() ?? []) as EventTarget[];
      const hasClass = (cls: string) =>
        path.some((p) => p instanceof HTMLElement && p.classList.contains(cls));
      const hasTag = (tag: string) =>
        path.some((p) => p instanceof HTMLElement && p.tagName === tag);

      const tileEl = path.find(
        (p): p is HTMLElement => p instanceof HTMLElement &&
          (p.tagName === 'APP-BOARD-NOTE' || p.tagName === 'APP-BOARD-IMAGE'),
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
        hasTag('APP-BOARD-CONNECTOR') ||
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
      board.style.cursor = 'grabbing';
    });

    board.addEventListener('mousemove', (event: MouseEvent) => {
      if (!this.isDragging) return;

      // Calculate delta in screen pixels
      const deltaX = event.clientX - this.startX;
      const deltaY = event.clientY - this.startY;

      // Convert delta to world coordinates by dividing by zoo
      this.setCamera(
        this.cameraX - deltaX / this.zoom,
        this.cameraY - deltaY / this.zoom,
      );

      this.startX = event.clientX;
      this.startY = event.clientY;

      this.updateBoard();
    });

    const stopDragging = () => {
      this.isDragging = false;
      board.style.cursor = 'grab';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mouseup', stopDragging);
    board.addEventListener('mouseup', stopDragging);

    board.addEventListener('contextmenu', (ev: MouseEvent) =>
      this.ngZone.run(() => this.showContextMenu(ev)),
    );
  }

  showContextMenu(ev: MouseEvent) {
    if (!this.boardRef) return;
    ev.preventDefault();

    const path = (ev.composedPath?.() ?? []) as EventTarget[];
    const hasClass = (cls: string) =>
      path.some((p) => p instanceof HTMLElement && p.classList.contains(cls));
    const hasTag = (tag: string) =>
      path.some((p) => p instanceof HTMLElement && p.tagName === tag);

    // Background-only menu (avoid opening when interacting with UI/tile/connector).
    const tileEl = path.find(
      (p): p is HTMLElement => p instanceof HTMLElement &&
        (p.tagName === 'APP-BOARD-TILE' || p.tagName === 'APP-BOARD-NOTE' ||
         p.tagName === 'APP-BOARD-IMAGE'),
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
      hasTag('APP-BOARD-CONNECTOR') ||
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
