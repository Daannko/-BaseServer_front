import { ElementRef, Injectable } from '@angular/core';
import { BoardTile } from './board-tile/board-tile.data';

@Injectable({ providedIn: 'root' })
export class BoardMainService {
  // internal state - set by caller via `initialize`
  boardRef: ElementRef | null = null;
  zoom: number = 1;
  cameraX: number = 0;
  cameraY: number = 0;
  tiles: Array<BoardTile> = [];
  tileComponents: any[] = [];
  cdr: any = null; // optional ChangeDetectorRef
  navBarService: any = null; // optional external service with `clear()`
  isDragging: boolean = false;
  startX: number = 0;
  startY: number = 0;

  /**
   * Initialize service context. Call from component to provide element refs and helpers.
   */
  initialize(options: {
    boardRef: ElementRef;
    tiles?: Array<BoardTile>;
    tileComponents?: any[];
    cdr?: any;
    navBarService?: any;
    zoom?: number;
    cameraX?: number;
    cameraY?: number;
  }) {
    this.boardRef = options.boardRef;
    this.tiles = options.tiles || this.tiles;
    this.tileComponents = options.tileComponents || this.tileComponents;
    this.cdr = options.cdr || this.cdr;
    this.navBarService = options.navBarService || this.navBarService;
    this.zoom = options.zoom ?? this.zoom;
    this.cameraX = options.cameraX ?? this.cameraX;
    this.cameraY = options.cameraY ?? this.cameraY;
  }

  /**
   * Update board visual state using the service's own context (boardRef, tiles, zoom, camera)
   */
  updateBoard() {
    if (!this.boardRef) return;
    const board = this.boardRef.nativeElement as HTMLElement;

    // Update background scaling/position
    board.style.backgroundSize = `scale(${this.zoom})`;
    board.style.backgroundPosition = `${-this.cameraX}px ${-this.cameraY}px`;

    // Update items positions in screen pixels
    (this.tiles || []).forEach((item) => {
      item.updateSize(this.zoom);
      item.updatePosition(this.cameraX, this.cameraY, this.zoom);
      item.connectors.forEach((connector: any) => {
        connector.updateSize(this.zoom);
        connector.updatePosition(this.zoom);
      });
    });
  }

  isItemVisible(item: any): boolean {
    if (!this.boardRef) return true;
    const board = this.boardRef.nativeElement as HTMLElement;
    const boardWidth = board.offsetWidth / this.zoom;
    const boardHeight = board.offsetHeight / this.zoom;

    return (
      item.forceToRender ||
      (item.screenX > -item.screenWidth &&
        item.screenX / this.zoom < boardWidth &&
        item.screenY > -item.screenHeight &&
        item.screenY / this.zoom < boardHeight)
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

    this.zoom = Math.min(zoomHeightRatio, zoomWidthRatio);

    this.cameraX = item.getCenterX() - viewportWidth / (2 * this.zoom);
    this.cameraY = item.getCenterY() - viewportHeight / (2 * this.zoom);

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
        (tile) => tile.tile.label === item.label
      );
      if (centerTile) {
        centerTile.setNavbarContext(centerTile.navbarContentTemplate);
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

      this.zoom = newZoom;

      this.cameraX = worldMouseX - mouseX / this.zoom;
      this.cameraY = worldMouseY - mouseY / this.zoom;

      this.updateBoard();
    });

    board.addEventListener('mousedown', (event: MouseEvent) => {
      // Only start dragging if clicking directly on the board, not on tiles or their children
      if (event.target !== board) return;

      if (
        this.navBarService &&
        typeof this.navBarService.clear === 'function'
      ) {
        this.navBarService.clear();
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

      // Convert delta to world coordinates by dividing by zoom
      this.cameraX -= deltaX / this.zoom;
      this.cameraY -= deltaY / this.zoom;

      this.startX = event.clientX;
      this.startY = event.clientY;

      board.style.backgroundPosition = `${-this.cameraX}px ${-this.cameraY}px`;

      (this.tiles || []).forEach((item) => {
        item.updatePosition(this.cameraX, this.cameraY, this.zoom);
        item.connectors.forEach((connector: any) => {
          if (typeof connector.updatePosition === 'function')
            connector.updatePosition(this.zoom);
        });
      });
    });

    board.addEventListener('mouseup', () => {
      this.isDragging = false;
      board.style.cursor = 'grab';
    });
  }
}
