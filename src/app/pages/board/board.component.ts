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
import { BoardNote } from './board-note/board-note.data';
import { BoardNoteComponent } from './board-note/board-note.component';
import { BoardConnector } from './board-connector/board-connector';
import { BoardConnectorComponent } from './board-connector/board-connector.component';
import { NavbarService } from '../../helpers/navbar/navbar.service';
import { BoardMainService } from './board-main.service';
import { BoardApiService } from './board-api.service';
import { Observable, Subject, takeUntil } from 'rxjs';
import { SvgIconComponent } from '../../helpers/svg-icon/svg-icon.component';
import { Board } from './models/board.model';
import { Topic } from './models/topic.model';
import {
  ContextMenuComponent,
  ContextMenuItem,
} from '../common/context-menu/context-menu.component';
import { StorageService } from '../../service/storage.service';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [
    CommonModule,
    NavbarComponent,
    FormsModule,
    BoardNoteComponent,
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
  @ViewChildren(BoardNoteComponent)
  noteComponents!: QueryList<BoardNoteComponent>;
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

  notes: BoardNote[] = [];
  connectors: Array<BoardConnector> = [];
  tilesMap: Map<string, BoardTile> = new Map();
  requiredConnectors: Map<string, string[]> = new Map();

  selectedBoard: Board | null = null;
  private activeNavbarTile: BoardTile | null = null;

  @ViewChild('trailGlowPath', { static: false }) private trailGlowRef?: ElementRef<SVGPathElement>;
  @ViewChild('trailLinePath', { static: false }) private trailLineRef?: ElementRef<SVGPathElement>;
  @ViewChild('trailDot',      { static: false }) private trailDotRef?:  ElementRef<SVGCircleElement>;
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
  private tileZCounter = 1;

  bringToFront(tile: BoardTile) {
    tile.zIndex = ++this.tileZCounter;
  }

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
    this.notes.length = 0;
    this.connectors.length = 0;
    this.tilesMap.clear();
    this.requiredConnectors.clear();
  }

  private rebuildConnectors(): void {
    this.connectors.length = 0;
    for (const item of this.notes) {
      for (const conn of item.connectors) {
        if (conn.active) this.connectors.push(conn);
      }
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
        tiles: this.notes,
        tileComponents: this.noteComponents?.toArray() ?? [],
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
      if (this.notes.length > 0) {
        this.mainBoardService.centerOnItem(this.notes[0]);
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
        p instanceof HTMLElement &&
        (p.tagName === 'APP-BOARD-TILE' || p.tagName === 'APP-BOARD-NOTE'),
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
        this.connectors.forEach((c) => c.updateSize(z));
        this.cdr.detectChanges();
      });

    // Pan runs outside Angular zone, so camera changes never trigger CD on their own.
    // Without this, tiles that scroll into view stay hidden until the next zoom event.
    this.mainBoardService.camera$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
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
          { id: 'create-note', label: 'Create note here' },
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
      tiles: this.notes,
      tileComponents: this.noteComponents?.toArray() ?? [],
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
    if (this.notes.length > 0) {
      this.mainBoardService.centerOnItem(this.notes[0]);
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
    const tile = BoardNote.fromNoteTopic(topic);
    this.notes.push(tile);
    this.tilesMap.set(tile.id, tile);

    const waitingIds = this.requiredConnectors.get(tile.id) ?? [];
    for (const waitingId of waitingIds) {
      const waitingTile = this.tilesMap.get(waitingId);
      if (waitingTile && !waitingTile.activateConnectorTo(tile)) {
        waitingTile.addConnectors(tile, false);
      }
    }
    if (waitingIds.length) {
      this.requiredConnectors.delete(tile.id);
    }

    for (const relatedTopicId of topic.relatedTopics ?? []) {
      if (!relatedTopicId || relatedTopicId === tile.id) continue;

      const relatedTile = this.tilesMap.get(relatedTopicId);
      if (relatedTile) {
        if (!tile.activateConnectorTo(relatedTile)) {
          tile.addConnectors(relatedTile, false);
        }
        continue;
      }

      const pending = this.requiredConnectors.get(relatedTopicId) ?? [];
      pending.push(tile.id);
      this.requiredConnectors.set(relatedTopicId, pending);
    }
  }

  private createNoteAt(worldX: number, worldY: number): void {
    if (!this.selectedBoard) return;

    const zoom = this.mainBoardService.zoom;
    const size = 300 / zoom;
    const note = BoardNote.newNote(
      worldX - size / 2,
      worldY - size / 2,
      size,
      size,
    );

    this.notes.push(note);
    this.tilesMap.set(note.id, note);
    this.centerOnItem(note);

    Promise.resolve().then(() => {
      this.cdr.detectChanges();
      this.mainBoardService.tileComponents = this.noteComponents?.toArray() ?? [];
      const noteComp = this.noteComponents?.find(c => c.tile.id === note.id);
      noteComp?.focus();
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

    for (const conn of tile.connectors) {
      conn.itemB.inboundConnectors.delete(conn);
      for (const c of conn.itemB.connectors) {
        if (c.id === conn.id) { conn.itemB.connectors.delete(c); break; }
      }
    }
    for (const conn of tile.inboundConnectors) {
      conn.itemA.connectors.delete(conn);
      for (const c of conn.itemA.inboundConnectors) {
        if (c.id === conn.id) { conn.itemA.inboundConnectors.delete(c); break; }
      }
    }

    const tileId = tile.id;
    this.connectors = this.connectors.filter(c => c.itemA.id !== tileId && c.itemB.id !== tileId);
    this.notes = this.notes.filter(n => n.id !== tileId);
    this.tilesMap.delete(tileId);
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

    const onMove = (e: MouseEvent) => {
      const board = this.boardRef.nativeElement as HTMLElement;
      const rect = board.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const last = this.trailPoints[this.trailPoints.length - 1];
      if (!last || Math.hypot(sx - last.x, sy - last.y) > 4) {
        this.trailPoints.push({ x: sx, y: sy });
      }
      this.drawTrail();
    };

    const onUp = (e: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      this.trailPoints = [];
      this.clearTrail();

      if (!this.selectedBoard) return;

      const w = this.screenToWorld(e.clientX, e.clientY);

      // Drop on an existing note → connect instead of creating
      const targetTile = this.notes.find(t =>
        t !== tile &&
        w.x >= t.x && w.x <= t.x + t.width &&
        w.y >= t.y && w.y <= t.y + t.height,
      );

      if (targetTile) {
        const alreadyActive = Array.from(tile.connectors).some(c => c.active && c.itemB === targetTile);
        if (!alreadyActive) {
          if (tile.activateConnectorTo(targetTile)) {
            tile.markConnectorAdded(targetTile);
          } else {
            tile.addConnectors(targetTile);
          }
          for (const conn of tile.connectors) {
            if (conn.active && conn.itemB === targetTile) { this.connectors.push(conn); break; }
          }
          Promise.resolve().then(() => this.cdr.detectChanges());
        }
        return;
      }

      // Require minimum drag distance from the source tile edge before creating
      const outsideDx = Math.max(tile.x - w.x, 0, w.x - (tile.x + tile.width));
      const outsideDy = Math.max(tile.y - w.y, 0, w.y - (tile.y + tile.height));
      const distToEdge = Math.hypot(outsideDx, outsideDy);
      const minDist = Math.min(tile.width, tile.height) * 0.25;
      if (distToEdge < minDist) return;

      // Create new note at drop position
      const zoom = this.mainBoardService.zoom;
      const size = 300 / zoom;
      const newNote = BoardNote.newNote(
        w.x - size / 2,
        w.y - size / 2,
        size,
        size,
      );
      this.notes.push(newNote);
      this.tilesMap.set(newNote.id, newNote);

      tile.addConnectors(newNote);
      for (const conn of tile.connectors) {
        if (conn.active && conn.itemB === newNote) { this.connectors.push(conn); break; }
      }

      Promise.resolve().then(() => {
        this.cdr.detectChanges();
        this.mainBoardService.tileComponents = this.noteComponents?.toArray() ?? [];
      });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  private clearTrail(): void {
    this.trailGlowRef?.nativeElement?.setAttribute('d', '');
    this.trailLineRef?.nativeElement?.setAttribute('d', '');
    const dot = this.trailDotRef?.nativeElement;
    if (dot) { dot.setAttribute('cx', '-9999'); dot.setAttribute('cy', '-9999'); }
  }

  private drawTrail(): void {
    const lineEl = this.trailLineRef?.nativeElement;
    const glowEl = this.trailGlowRef?.nativeElement;
    const dotEl  = this.trailDotRef?.nativeElement;
    if (!lineEl || !dotEl) return;

    const pts = this.trailPoints;
    const n = pts.length;
    if (n < 2) return;

    const f = (v: number) => v.toFixed(1);
    let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
    for (let i = 1; i < n; i++) d += ` L${f(pts[i].x)},${f(pts[i].y)}`;

    lineEl.setAttribute('d', d);
    lineEl.setAttribute('stroke', 'rgba(255,213,79,0.9)');
    lineEl.setAttribute('stroke-width', '2.5');

    if (glowEl) {
      glowEl.setAttribute('d', d);
      glowEl.setAttribute('stroke', 'rgba(255,213,79,0.15)');
      glowEl.setAttribute('stroke-width', '16');
    }

    dotEl.setAttribute('cx', f(pts[n - 1].x));
    dotEl.setAttribute('cy', f(pts[n - 1].y));
    dotEl.setAttribute('r', '4');
    dotEl.setAttribute('fill', 'rgba(255,235,130,1)');
  }

  async saveBoard(): Promise<void> {
    if (!this.selectedBoard) return;

    const boardId = this.selectedBoard.id;
    const tilesToCreate = this.notes.filter((t) => !t.serverId);

    if (tilesToCreate.length > 0) {
      const createdTopics = await Promise.all(
        tilesToCreate.map((t) => this.boardSearchService.createTopic(t, boardId)),
      );
      for (let i = 0; i < createdTopics.length; i++) {
        const created = createdTopics[i];
        if (!created) continue;
        tilesToCreate[i].serverId = created.id;
      }
    }

    const resolveTopicId = (id: string) => this.tilesMap.get(id)?.serverId ?? id;
    const tilesWithServerId = this.notes.filter((t) => Boolean(t.serverId));

    // Read connector changes synchronously before saveTopic clears them via saved()
    const ops: Promise<void>[] = [];
    for (const t of tilesWithServerId) {
      for (const id of t.connectorsAdded) {
        ops.push(this.boardSearchService.linkTopics(t.serverId!, resolveTopicId(id)));
      }
      for (const id of t.connectorsRemoved) {
        ops.push(this.boardSearchService.unlinkTopics(t.serverId!, resolveTopicId(id)));
      }
      ops.push(this.boardSearchService.saveTopic(t, resolveTopicId));
    }
    await Promise.all(ops);
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
      case 'create-note':
        this.createNoteAt(this.lastWorldX, this.lastWorldY);
        return;
      default:
        console.log(item.label);
        return;
    }
  }
}
