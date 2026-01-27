import { ElementRef, Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { BoardTile } from './board-tile/board-tile.data';

@Injectable({ providedIn: 'root' })
export class BoardMainService {
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
    this.zoomSubject.next(nextZoom);
  }

  setCamera(x: number, y: number) {
    this.cameraSubject.next({ x, y });
  }

  tiles: Array<BoardTile> = [];
  tileComponents: any[] = [];
  cdr: any = null; // optional ChangeDetectorRef
  onBackgroundMouseDown: (() => void) | null = null;
  isDragging: boolean = false;
  startX: number = 0;
  startY: number = 0;

  initialize(options: {
    boardRef: ElementRef;
    viewportRef?: ElementRef;
    tiles?: Array<BoardTile>;
    tileComponents?: any[];
    cdr?: any;
    zoom?: number;
    cameraX?: number;
    cameraY?: number;
    onBackgroundMouseDown?: () => void;
  }) {
    this.boardRef = options.boardRef;
    this.viewportRef = options.viewportRef ?? this.viewportRef;
    this.tiles = options.tiles || this.tiles;
    this.tileComponents = options.tileComponents || this.tileComponents;
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

  isItemVisible(item: any): boolean {
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

    return (
      item.forceToRender ||
      (right > viewLeft &&
        left < viewRight &&
        bottom > viewTop &&
        top < viewBottom)
    );
  }

  centerOnItem(item: BoardTile) {
    if (!this.boardRef) return;
    const board = this.boardRef.nativeElement as HTMLElement;
    const viewportWidth = board.offsetWidth;
    const viewportHeight = board.offsetHeight;

    // subtracting here to make place for the connectors
    const zoomHeightRatio = viewportHeight / item.height - 0.3;
    const zoomWidthRatio = viewportWidth / item.width - 0.4;

    this.setZoom(Math.min(zoomHeightRatio, zoomWidthRatio));

    this.setCamera(
      item.getCenterX() - viewportWidth / (2 * this.zoom),
      item.getCenterY() - viewportHeight / (2 * this.zoom),
    );

    this.updateBoard();
  }

  moveToItem(item: BoardTile) {
    item.forceToRender = true;
    if (this.cdr && typeof this.cdr.detectChanges === 'function') {
      this.cdr.detectChanges();
    }
    this.centerOnItem(item);
    this.updateBoard();

    Promise.resolve().then(() => {
      const centerTile = this.tileComponents.find(
        (tile) => tile.tile.label === item.label,
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

    board.addEventListener('wheel', (event: WheelEvent) => {
      event.preventDefault();
      const rect = board.getBoundingClientRect();

      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const newZoom = this.zoom + (event.deltaY < 0 ? 0.05 : -0.05);
      if (newZoom < 0.1 || newZoom > 5) return;

      // Keep mouse position fixed during zoom
      const worldMouseX = mouseX / this.zoom + this.cameraX;
      const worldMouseY = mouseY / this.zoom + this.cameraY;

      this.setZoom(newZoom);

      this.setCamera(
        worldMouseX - mouseX / this.zoom,
        worldMouseY - mouseY / this.zoom,
      );

      this.updateBoard();
    });

    board.addEventListener('mousedown', (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // Only start panning when interacting with the background.
      // (The viewport is transformed, so clicks often target children; we still want pan.)
      if (
        target.closest('app-board-tile') ||
        target.closest('.board-item') ||
        target.closest('app-board-connector') ||
        target.closest('.search-window') ||
        target.closest('app-navbar')
      ) {
        return;
      }

      event.preventDefault();
      document.body.style.userSelect = 'none';

      this.onBackgroundMouseDown?.();
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
    };

    window.addEventListener('mouseup', stopDragging);
    board.addEventListener('mouseup', stopDragging);
  }
}
