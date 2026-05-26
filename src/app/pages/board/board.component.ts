import {
  Component,
  ElementRef,
  ViewChild,
  OnInit,
  OnDestroy,
  HostListener,
  ViewChildren,
  QueryList,
  ChangeDetectorRef,
  AfterViewInit,
  TemplateRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavbarComponent } from '../../helpers/navbar/navbar.component';
import { BoardTile } from './board-tile/board-tile.data';
import { BoardTileComponent } from './board-tile/board-tile.component';
import { BoardConnector } from './board-connector/board-connector';
import { BoardConnectorComponent } from './board-connector/board-connector.component';
import { NavbarService } from '../../helpers/navbar/navbar.service';
import { BoardMainService } from './board-main.service';
import { BoardApiService } from './board-api.service';
import { Observable, Subject, takeUntil } from 'rxjs';
import { SvgIconComponent } from '../../helpers/svg-icon/svg-icon.component';
import { Board } from './models/board.model';
import { Topic } from './models/topic.model';
import { emptyDoc } from '../../helpers/rich-text.util';
import {
  ContextMenuComponent,
  ContextMenuItem,
} from '../common/context-menu/context-menu.component';
import { StorageService } from '../../service/storage.service';
import { Theme } from '../../theme';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [
    CommonModule,
    NavbarComponent,
    FormsModule,
    BoardTileComponent,
    BoardConnectorComponent,
    SvgIconComponent,
    ContextMenuComponent,
  ],
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.scss'],
})
export class BoardComponent implements OnInit, AfterViewInit, OnDestroy {
  SELECTED_BOARD_KEY = 'SELECTED_BOARD' as const;
  @ViewChild('board', { static: true }) boardRef!: ElementRef<HTMLDivElement>;
  @ViewChild('viewport', { static: false })
  viewportRef!: ElementRef<HTMLDivElement>;
  @ViewChild('navbar', { static: true, read: ElementRef })
  navbarRef!: ElementRef;
  @ViewChild('defaultNavbarTemplate', { static: true })
  defaultNavbarTemplate!: TemplateRef<any>;
  @ViewChildren(BoardConnectorComponent)
  connectorComponents!: QueryList<BoardConnectorComponent>;
  @ViewChildren(BoardTileComponent)
  tileComponents!: QueryList<BoardTileComponent>;
  @ViewChild('newBoardNameInput', { static: false })
  nameInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('searchInput', { static: false })
  searchInputRef?: ElementRef<HTMLInputElement>;

  boards$!: Observable<Board[] | null>;
  topics$!: Observable<Topic[] | null>;
  isSearchOpen = true;
  isCreateOpen = false;
  newBoardName = '';
  newBoardNameTouched = false;
  newBoardDescription = '';
  searchQuery = '';
  zoom = 1;
  private readonly destroy$ = new Subject<void>();

  tiles: BoardTile[] = [];
  connectors: Array<BoardConnector> = [];
  tilesMap: Map<string, BoardTile> = new Map();
  requiredConnectors: Map<string, string[]> = new Map();

  selectedBoard: Board | null = null;
  private activeNavbarTile: BoardTile | null = null;

  @ViewChild('dragCanvas', { static: false })
  private dragCanvasRef?: ElementRef<HTMLCanvasElement>;
  private trailPoints: Array<{ x: number; y: number }> = [];

  deleteBoardPending: { id: string; name: string } | null = null;
  deleteConfirmInput = '';

  get deleteConfirmChars(): Array<{
    char: string;
    status: 'ghost' | 'correct' | 'wrong';
  }> {
    if (!this.deleteBoardPending) return [];
    const name = this.deleteBoardPending.name;
    const typed = this.deleteConfirmInput;
    const len = Math.max(name.length, typed.length);
    return Array.from({ length: len }, (_, i) => {
      const nameChar = name[i] ?? '';
      const typedChar = typed[i];
      if (typedChar === undefined)
        return { char: nameChar, status: 'ghost' as const };
      if (typedChar === nameChar)
        return { char: typedChar, status: 'correct' as const };
      return { char: typedChar, status: 'wrong' as const };
    });
  }

  get deleteConfirmValid(): boolean {
    return (
      !!this.deleteBoardPending &&
      this.deleteConfirmInput === this.deleteBoardPending.name
    );
  }

  ctxMenu = {
    visible: false,
    x: 0,
    y: 0,
    items: [] as ContextMenuItem[],
  };

  private lastWorldX = 0;
  private lastWorldY = 0;

  private buildDefaultNavbarContext() {
    return {
      getIsSearchOpen: () => this.isSearchOpen,
      toggleSearch: () => this.toggleSearchState(),
    };
  }

  onTileNavbarChange(event: { template: TemplateRef<any>; context: any }) {
    if (!event?.template) return;

    const nextTile = (event.context as any)?.tile as BoardTile | undefined;
    if (nextTile && nextTile !== this.activeNavbarTile) {
      if (this.activeNavbarTile) {
        this.activeNavbarTile.forceToRender = false;
      }
      nextTile.forceToRender = true;
      this.activeNavbarTile = nextTile;
    }

    this.navBarService.setTemplate(event.template, event.context);
  }

  private onBackgroundMouseDown() {
    this.closeContextMenu();
    if (this.activeNavbarTile) {
      this.activeNavbarTile.forceToRender = false;
      this.activeNavbarTile = null;
    }
    this.navBarService.setTemplate(
      this.defaultNavbarTemplate,
      this.buildDefaultNavbarContext(),
    );
  }

  private resetTileState(): void {
    this.tiles.length = 0;
    this.connectors.length = 0;
    this.tilesMap.clear();
    this.requiredConnectors.clear();
  }

  private rebuildConnectors(): void {
    this.connectors.length = 0;
    for (const tile of this.tiles) {
      this.connectors.push(...Array.from(tile.connectors));
    }
  }

  get isCreateNameValid(): boolean {
    return this.newBoardName.trim().length > 0;
  }

  constructor(
    private navBarService: NavbarService,
    private cdr: ChangeDetectorRef,
    private mainBoardService: BoardMainService,
    private boardSearchService: BoardApiService,
    private storageSerice: StorageService,
  ) {
    this.boards$ = this.boardSearchService.boards$;
    this.topics$ = this.boardSearchService.topics$;
  }

  resetNewBoardForm() {
    this.newBoardName = '';
    this.newBoardDescription = '';
  }

  toggleSearchState() {
    this.isSearchOpen = !this.isSearchOpen;
    if (this.isSearchOpen) {
      this.focusSearchInput();
    }
  }

  toggleCreateState() {
    const willOpen = !this.isCreateOpen;
    this.isCreateOpen = willOpen;
    if (willOpen) {
      this.focusCreateNameInput();
    } else {
      this.focusSearchInput();
    }
  }

  private focusSearchInput() {
    setTimeout(() => this.searchInputRef?.nativeElement?.focus());
  }

  private focusCreateNameInput() {
    setTimeout(() => this.nameInputRef?.nativeElement?.focus());
  }

  clearSearchQuery() {
    this.searchQuery = '';
    this.focusSearchInput();
  }

  onSearchWindowClick(event: MouseEvent) {
    if (this.isCreateOpen) return;

    const path = (event.composedPath?.() ?? []) as EventTarget[];
    const isInteractive = (target: EventTarget) =>
      target instanceof HTMLElement &&
      ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A'].includes(target.tagName);

    if (path.some(isInteractive)) return;
    this.focusSearchInput();
  }

  openCreateFromSearch(boards: Board[] | null | undefined) {
    this.isCreateOpen = true;
    const query = this.searchQuery.trim();
    if (!query) {
      this.focusCreateNameInput();
      return;
    }

    const matches = this.filteredBoards(boards).some(
      (b) => String(b?.name ?? '').toLowerCase() === query.toLowerCase(),
    );
    if (!matches) {
      this.newBoardName = query;
      this.newBoardNameTouched = false;
    }
    this.focusCreateNameInput();
  }

  onSearchEnter(boards: Board[] | null | undefined) {
    const query = this.searchQuery.trim();
    if (!query) return;

    const hasResults = this.filteredBoards(boards).length > 0;
    if (!hasResults) {
      this.openCreateFromSearch(boards);
    }
  }

  async selectBoard(id: string) {
    try {
      const board = await this.boardSearchService.getBoard(id);
      this.selectedBoard = board;

      const defaultNavbarContext = this.buildDefaultNavbarContext();

      this.resetTileState();
      this.boardSearchService.clearTopics();

      const topics = await this.boardSearchService.getTopicsByIds(
        board.topics,
        false,
      );
      for (const topic of topics) {
        this.addBoardTile(topic);
      }
      this.rebuildConnectors();

      // Let Angular render tiles/connectors, then refresh board + connector sizes.
      await Promise.resolve();
      this.cdr.detectChanges();

      this.mainBoardService.initialize({
        boardRef: this.boardRef,
        viewportRef: this.viewportRef,
        tiles: this.tiles,
        tileComponents: this.tileComponents
          ? this.tileComponents.toArray()
          : [],
        cdr: this.cdr,
        onBackgroundMouseDown: () =>
          this.navBarService.setTemplate(
            this.defaultNavbarTemplate,
            defaultNavbarContext,
          ),
      });
      this.isSearchOpen = false;

      this.storageSerice.setVariable(this.SELECTED_BOARD_KEY, id);

      // ensure navbar updates even if it was showing the default template
      this.navBarService.setTemplate(
        this.defaultNavbarTemplate,
        defaultNavbarContext,
      );
      this.connectorComponents?.forEach((c) => c.updateSize());
      if (this.tiles.length > 0) {
        this.mainBoardService.centerOnItem(this.tiles[0]);
      }
    } catch (e) {
      console.error('Failed to load board', e);
    }
  }

  filteredBoards(boards: any[] | null | undefined): any[] {
    const safeBoards = boards ?? [];
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) return safeBoards;

    return safeBoards.filter((b) =>
      String(b?.name ?? '')
        .toLowerCase()
        .includes(query),
    );
  }

  isItemVisible(item: BoardTile): boolean {
    return this.mainBoardService
      ? this.mainBoardService.isItemVisible(item)
      : false;
  }

  moveToItem(item: BoardTile) {
    if (!this.mainBoardService) return;
    this.mainBoardService.moveToItem(item);
  }

  centerOnItem(item: BoardTile) {
    if (!this.mainBoardService) return;
    this.mainBoardService.centerOnItem(item);
  }

  onTileDblClick(event: MouseEvent, item: BoardTile): void {
    const path = (event.composedPath?.() ?? []) as EventTarget[];
    const tileEl = path.find(
      (p): p is HTMLElement =>
        p instanceof HTMLElement && p.tagName === 'APP-BOARD-TILE',
    ) as HTMLElement | undefined;
    if (!tileEl) return;
    const r = tileEl.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    ) {
      return;
    }
    this.centerOnItem(item);
  }

  openDeleteBoardConfirm(board: Board, event: MouseEvent) {
    event.stopPropagation();
    this.deleteBoardPending = { id: board.id, name: board.name };
    this.deleteConfirmInput = '';
  }

  cancelDeleteBoard() {
    this.deleteBoardPending = null;
    this.deleteConfirmInput = '';
  }

  async confirmDeleteBoard() {
    if (!this.deleteConfirmValid || !this.deleteBoardPending) return;
    const { id } = this.deleteBoardPending;
    this.deleteBoardPending = null;
    this.deleteConfirmInput = '';
    await this.boardSearchService.deleteBoard(id);
    if (this.selectedBoard?.id === id) {
      this.selectedBoard = null;
      this.resetTileState();
    }
  }

  setRowHoverX(event: MouseEvent) {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
    el.style.setProperty('--hover-x', String(x));
  }

  clearRowHoverX(event: MouseEvent) {
    (event.currentTarget as HTMLElement).style.removeProperty('--hover-x');
  }

  async submitNewBoardRequest() {
    if (!this.isCreateNameValid) {
      return;
    }
    var viewportWidth: number | null = null;
    var viewportHeight: number | null = null;

    if (this.boardRef) {
      const board = this.boardRef.nativeElement as HTMLElement;
      viewportWidth = board.offsetWidth * 0.25;
      viewportHeight = board.offsetHeight * 0.8;
    }

    const board = await this.boardSearchService.createBoard(
      this.newBoardName,
      this.newBoardDescription,
      viewportWidth,
      viewportHeight,
    );
    if (board != null) {
      this.resetNewBoardForm();
      this.isCreateOpen = false;
      this.selectBoard(board.id);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent) {
    const isSave =
      (event.ctrlKey || event.metaKey) &&
      (event.key === 's' || event.key === 'S');
    if (!isSave) return;

    event.preventDefault();
    this.saveBoard();
  }

  ngOnInit() {
    this.mainBoardService.zoom$
      .pipe(takeUntil(this.destroy$))
      .subscribe((z) => {
        this.zoom = z;
        // Keep template bindings in sync (especially important during wheel zoom)
        this.cdr.detectChanges();
      });

    this.mainBoardService.contextMenu$
      .pipe(takeUntil(this.destroy$))
      .subscribe((req) => {
        this.lastWorldX = req.worldX;
        this.lastWorldY = req.worldY;

        this.ctxMenu.x = req.clientX;
        this.ctxMenu.y = req.clientY;
        this.ctxMenu.items = [
          { id: 'create', label: 'Create tile here' },
          { id: 'save', label: 'Save board', shortcut: 'Ctrl+S' },
        ];
        this.ctxMenu.visible = true;
      });
    if (this.storageSerice.hasKey(this.SELECTED_BOARD_KEY)) {
      this.isSearchOpen = false;
      this.selectBoard(
        this.storageSerice.getVariable(this.SELECTED_BOARD_KEY)!!,
      );
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit() {
    this.boardSearchService.refreshBoards();

    const defaultNavbarContext = this.buildDefaultNavbarContext();

    this.mainBoardService.initialize({
      boardRef: this.boardRef,
      viewportRef: this.viewportRef,
      tiles: this.tiles,
      tileComponents: this.tileComponents ? this.tileComponents.toArray() : [],
      cdr: this.cdr,
      zoom: this.zoom,
      cameraX: 0,
      cameraY: 0,
      onBackgroundMouseDown: () => this.onBackgroundMouseDown(),
    });

    this.navBarService.setTemplate(
      this.defaultNavbarTemplate,
      defaultNavbarContext,
    );
    this.mainBoardService.setupListeners();
    if (this.tiles.length > 0) {
      this.mainBoardService.centerOnItem(this.tiles[0]);
    }

    Promise.resolve()
      .then(() => {
        this.connectorComponents.forEach((item) => {
          item.updateSize();
        });
      })
      .then(() => {
        this.mainBoardService.updateBoard();
      });
  }

  addBoardTile(topic: Topic) {
    const tile = BoardTile.fromTopic(topic);

    this.tiles.push(tile);
    this.tilesMap.set(tile.id, tile);

    const waitingIds = this.requiredConnectors.get(tile.id) ?? [];
    for (const waitingId of waitingIds) {
      const waitingTile = this.tilesMap.get(waitingId);
      if (waitingTile) {
        waitingTile.addConnectors(tile);
      }
    }
    if (waitingIds.length) {
      this.requiredConnectors.delete(tile.id);
    }

    for (const relatedTopicId of topic.relatedTopics ?? []) {
      if (!relatedTopicId || relatedTopicId === tile.id) continue;

      const relatedTile = this.tilesMap.get(relatedTopicId);
      if (relatedTile) {
        tile.addConnectors(relatedTile);
        continue;
      }

      const pending = this.requiredConnectors.get(relatedTopicId) ?? [];
      pending.push(tile.id);
      this.requiredConnectors.set(relatedTopicId, pending);
    }
  }

  private createTileAt(worldX: number, worldY: number): void {
    if (!this.selectedBoard) return;

    const zoom = this.mainBoardService.zoom;
    const width = 440 / zoom;
    const height = 600 / zoom;
    const tile = BoardTile.newTile(
      worldX - width / 2,
      worldY - height / 2,
      width,
      height,
    );

    this.tiles.push(tile);
    this.tilesMap.set(tile.id, tile);
    this.centerOnItem(tile);

    Promise.resolve().then(() => {
      this.cdr.detectChanges();
      this.mainBoardService.tileComponents = this.tileComponents
        ? this.tileComponents.toArray()
        : [];
    });
  }

  async onDeleteTile(tile: BoardTile): Promise<void> {
    if (tile.serverId) {
      try {
        await this.boardSearchService.deleteTopic(tile.serverId);
      } catch {
        return;
      }
    }
    this.tiles = this.tiles.filter((t) => t.id !== tile.id);
    this.tilesMap.delete(tile.id);
    this.cdr.detectChanges();
  }

  private screenToWorld(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const board = this.boardRef.nativeElement as HTMLElement;
    const rect = board.getBoundingClientRect();
    const zoom = this.mainBoardService.zoom;
    return {
      x: (clientX - rect.left) / zoom + this.mainBoardService.cameraX,
      y: (clientY - rect.top) / zoom + this.mainBoardService.cameraY,
    };
  }

  onConnectorDragStart(tile: BoardTile): void {
    if (!this.selectedBoard) return;

    this.trailPoints = [];
    const canvas = this.dragCanvasRef?.nativeElement;
    if (canvas) {
      const board = this.boardRef.nativeElement as HTMLElement;
      canvas.width = board.offsetWidth;
      canvas.height = board.offsetHeight;
      canvas.style.display = 'block';
    }

    const onMove = (e: MouseEvent) => {
      const board = this.boardRef.nativeElement as HTMLElement;
      const rect = board.getBoundingClientRect();
      const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const last = this.trailPoints[this.trailPoints.length - 1];
      if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > 4) {
        this.trailPoints.push(pt);
      }
      this.drawTrail();
    };

    const onUp = (e: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);

      const c = this.dragCanvasRef?.nativeElement;
      if (c) {
        c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
        c.style.display = 'none';
      }
      this.trailPoints = [];

      const w = this.screenToWorld(e.clientX, e.clientY);
      if (!this.selectedBoard) return;
      const zoom = this.mainBoardService.zoom;
      const width = 440 / zoom;
      const height = 600 / zoom;
      const newTile = BoardTile.newTile(
        w.x - width / 2,
        w.y - height / 2,
        width,
        height,
      );
      this.tiles.push(newTile);
      this.tilesMap.set(newTile.id, newTile);
      Promise.resolve().then(() => {
        this.cdr.detectChanges();
        this.mainBoardService.tileComponents = this.tileComponents
          ? this.tileComponents.toArray()
          : [];
      });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  private drawTrail(): void {
    const canvas = this.dragCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pts = this.trailPoints;
    const n = pts.length;
    if (n < 2) return;

    for (let i = 1; i < n; i++) {
      const t = i / (n - 1); // 0 = oldest/tail, 1 = newest/head
      const alpha = 0.7 + 0.3 * t;
      const lineWidth = 1.5 + 2.5 * t;

      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = `rgba(255, 213, 79, ${alpha.toFixed(3)})`; // Theme.amber
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'butt';
      ctx.shadowColor = Theme.amberGlow;
      ctx.shadowBlur = 12 * t;
      ctx.stroke();
    }

    // Bright dot at cursor
    const head = pts[n - 1];
    ctx.beginPath();
    ctx.arc(head.x, head.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = Theme.amberLight;
    ctx.shadowColor = Theme.amberStrong;
    ctx.shadowBlur = 20;
    ctx.fill();
  }

  async saveBoard(): Promise<void> {
    if (!this.selectedBoard) return;

    const boardId = this.selectedBoard.id;
    const tilesToCreate = this.tiles.filter((t) => !t.serverId);

    if (tilesToCreate.length > 0) {
      const createdTopics = await Promise.all(
        tilesToCreate.map((t) =>
          this.boardSearchService.createTopic(t, boardId),
        ),
      );

      for (let i = 0; i < createdTopics.length; i++) {
        const created = createdTopics[i];
        if (!created) continue;
        tilesToCreate[i].serverId = created.id;
      }
    }

    const resolveTopicId = (id: string) =>
      this.tilesMap.get(id)?.serverId ?? id;
    const tilesWithServerId = this.tiles.filter((t) => Boolean(t.serverId));
    await Promise.all(
      tilesWithServerId.map((t) =>
        this.boardSearchService.saveTopic(t, resolveTopicId),
      ),
    );
  }

  closeContextMenu() {
    this.ctxMenu.visible = false;
  }

  onContextMenuItem(item: ContextMenuItem) {
    this.closeContextMenu();

    switch (item.id) {
      case 'save':
        this.saveBoard();
        return;
      case 'create':
        this.createTileAt(this.lastWorldX, this.lastWorldY);
        return;
      default:
        console.log(item.label);
        return;
    }
  }
}
