import {
  Component,
  ElementRef,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  OnDestroy,
  AfterViewInit,
  TemplateRef,
  HostListener,
  HostBinding,
  NgZone,
} from '@angular/core';
import { BoardTile } from './board-tile.data';
import { extractPlainText, docFromText } from '../../../helpers/rich-text.util';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Editor } from '@tiptap/core';
import { SvgIconComponent } from '../../../helpers/svg-icon/svg-icon.component';
import { QuerySelectComponent } from '../../common/query-select/query-select.component';
import { TileRect, TileResizeDirective } from './tile.resize.directive';
import { TileMoveDirective, Position } from './tile.move.directive';
import { BoardMainService } from '../board-main.service';
import { TiptapService } from './tiptap.service';

@Component({
  selector: 'app-board-tile',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SvgIconComponent,
    QuerySelectComponent,
    TileResizeDirective,
    TileMoveDirective,
  ],
  providers: [TiptapService],
  templateUrl: './board-tile.component.html',
  styleUrl: './board-tile.component.scss',
})
export class BoardTileComponent implements OnDestroy, AfterViewInit {
  @Input() tile!: BoardTile;
  @Input() zoom = 1;
  @Input() nameLabelScale = 18;
  @Output() navbarChange = new EventEmitter<{
    template: TemplateRef<any>;
    context: any;
  }>();
  @Output() deleteTile = new EventEmitter<void>();
  @Output() connectorDragStart = new EventEmitter<{ fromX: number; fromY: number }>();
  @ViewChild('contentElement', { static: false }) contentElement!: ElementRef;
  @ViewChild('nameLabel', { static: false }) nameLabelRef?: ElementRef<HTMLElement>;
  @ViewChild('navbarContentTemplate', { static: false })
  navbarContentTemplate!: TemplateRef<any>;

  @HostBinding('style.left.px') get hostLeft() {
    return this.tile?.x ?? 0;
  }
  @HostBinding('style.top.px') get hostTop() {
    return this.tile?.y ?? 0;
  }
  @HostBinding('style.width.px') get hostWidth() {
    return this.tile?.width ?? 0;
  }
  @HostBinding('style.height.px') get hostHeight() {
    return this.tile?.height ?? 0;
  }
  @HostBinding('style.--tile-min')
  get hostTileMin() {
    const min = Math.min(this.tile?.width ?? 0, this.tile?.height ?? 0);
    return min + 'px';
  }

  @HostBinding('style.--name-label-scale')
  get hostNameLabelScale() {
    return String(this.nameLabelScale);
  }

  getTileName(): string {
    return extractPlainText(this.tile?.name).trim();
  }

  onNameKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLElement).blur();
    } else if (event.key === 'Escape') {
      const el = event.target as HTMLElement;
      el.textContent = this.getTileName();
      el.blur();
    }
  }

  onNameBlur(event: FocusEvent): void {
    const el = event.target as HTMLElement;
    const text = el.textContent?.trim() ?? '';
    if (!text) {
      el.textContent = this.getTileName();
      return;
    }
    if (text !== this.getTileName()) {
      this.tile.name = docFromText(text);
    }
  }

  isColorPaletteVisible: boolean = false;
  deleteConfirmPending = false;
  activeEdge: 'top' | 'right' | 'bottom' | 'left' | null = null;

  private navbarPinned = false;
  private isDraggingTile = false;
  private deleteConfirmTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private host: ElementRef<HTMLElement>,
    private ngZone: NgZone,
    public tiptap: TiptapService,
  ) {}

  get contentEditor(): Editor {
    return this.tiptap.contentEditor!;
  }

  /**
   * Called by the board when clicking empty background.
   * Ensures no persistent selection highlight remains visible.
   */
  clearSelectionHighlight() {
    this.tiptap.clearSelectionHighlight();
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(ev: MouseEvent) {
    const path = (ev.composedPath?.() ?? []) as EventTarget[];
    // Ignore clicks that occur inside this tile (including TipTap internals / text nodes).
    if (path.includes(this.host.nativeElement)) return;

    // If this tile was providing the navbar, allow it to be virtualized again —
    // but only if there is no active text selection that should stay visible.
    this.navbarPinned = false;
    if (!this.isDraggingTile && !this.tiptap.hasActiveSelection) {
      this.tile.forceToRender = false;
    }
  }

  ngAfterViewInit() {
    if (this.nameLabelRef) {
      this.nameLabelRef.nativeElement.textContent = this.getTileName();
    }

    this.tiptap.initEditors({
      tile: this.tile,
      contentElement: this.contentElement.nativeElement,
    });

    const root = this.contentElement.nativeElement as HTMLElement;
    const contentRoot = root;

    contentRoot.addEventListener('click', () => {
      this.requestNavbar(this.navbarContentTemplate);
    });

    this.tiptap.onFocusCallback = () => {
      if (!this.navbarPinned && !this.isDraggingTile) {
        this.tile.forceToRender = false;
      }
    };

    // Listen for mouseup anywhere to detect text selection that ends outside the editor
    document.addEventListener('mouseup', () => {
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        if (contentRoot.contains(selection.anchorNode)) {
          this.requestNavbar(this.navbarContentTemplate);
        }
      }
    });

    root.addEventListener('mousemove', (e: MouseEvent) => {
      const path = (e.composedPath?.() ?? []) as EventTarget[];
      const anchor = path.find(
        (p): p is HTMLAnchorElement => p instanceof HTMLAnchorElement,
      );
      // If hovering a real <a> element, pointer
      if (anchor) {
        root.style.cursor = 'pointer';
        return;
      }

      const el = (e.target as HTMLElement) || null;

      // If hovering image, show grab
      if (el && el.tagName === 'IMG') {
        root.style.cursor = 'grab';
        return;
      }

      root.style.cursor = 'text';
    });

    this.ngZone.runOutsideAngular(() => {
      document.addEventListener('mousemove', this.onDocumentMouseMove);
    });
  }

  onTileWorldRectChange(r: TileRect) {
    this.tile.x = r.x;
    this.tile.y = r.y;
    this.tile.width = r.width;
    this.tile.height = r.height;

    for (const connector of this.tile.connectors) {
      connector.updateAngles();
      connector.updatePosition();
    }
    for (const connector of this.tile.inboundConnectors) {
      connector.updateAngles();
      connector.updatePosition();
    }
  }

  onTileWorldPosChange(p: Position) {
    this.tile.x = p.x;
    this.tile.y = p.y;

    for (const connector of this.tile.connectors) {
      connector.updateAngles();
      connector.updatePosition();
    }
    for (const connector of this.tile.inboundConnectors) {
      connector.updateAngles();
      connector.updatePosition();
    }
  }

  onDeleteClick(event: MouseEvent) {
    event.stopPropagation();
    if (this.deleteConfirmPending) {
      clearTimeout(this.deleteConfirmTimeout);
      this.deleteConfirmPending = false;
      this.deleteTile.emit();
    } else {
      this.deleteConfirmPending = true;
      this.deleteConfirmTimeout = setTimeout(() => {
        this.deleteConfirmPending = false;
      }, 2500);
    }
  }

  ngOnDestroy() {
    clearTimeout(this.deleteConfirmTimeout);
    this.tiptap.destroyEditors();
    document.removeEventListener('mousemove', this.onDocumentMouseMove);
  }

  private getNavbarContext() {
    return { tile: this.tile };
  }

  requestNavbar(template: TemplateRef<any>) {
    if (!template) return;

    // Keep tile rendered while its template is being used by the global navbar.
    this.navbarPinned = true;
    this.tile.forceToRender = true;

    this.navbarChange.emit({
      template,
      context: this.getNavbarContext(),
    });
  }

  onMoveStart() {
    this.isDraggingTile = true;
    this.tile.forceToRender = true;
  }

  onMoveEnd() {
    this.isDraggingTile = false;
    if (!this.navbarPinned) {
      this.tile.forceToRender = false;
    }
  }

  onConnectorMouseDown(event: MouseEvent): void {
    event.stopPropagation();
    this.connectorDragStart.emit({
      fromX: this.tile.x + this.tile.width / 2,
      fromY: this.tile.y + this.tile.height / 2,
    });
  }

  private readonly onDocumentMouseMove = (e: MouseEvent) => {
    const rect = this.host.nativeElement.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const tileMinScreen = Math.min(rect.width, rect.height);
    const maxDist = tileMinScreen * 0.4;

    const outsideDx = Math.max(0, -mx, mx - rect.width);
    const outsideDy = Math.max(0, -my, my - rect.height);
    const outsideDist = Math.hypot(outsideDx, outsideDy);

    if (outsideDist === 0 || outsideDist > maxDist) {
      this.host.nativeElement.style.setProperty('--connector-opacity', '0');
      if (this.activeEdge !== null) {
        this.ngZone.run(() => { this.activeEdge = null; });
      }
      return;
    }

    const innerDist = tileMinScreen * 0.2;
    const gradientDist = Math.max(0, outsideDist - innerDist);
    const gradientRange = maxDist - innerDist;
    const t = gradientRange > 0 ? Math.min(1, gradientDist / gradientRange) : 0;
    const opacity = 1 - t * 0.85;
    this.host.nativeElement.style.setProperty('--connector-opacity', opacity.toFixed(3));

    const nx = (mx - rect.width / 2) / (rect.width / 2);
    const ny = (my - rect.height / 2) / (rect.height / 2);
    const edge =
      Math.abs(nx) > Math.abs(ny)
        ? nx > 0 ? 'right' : 'left'
        : ny > 0 ? 'bottom' : 'top';

    if (edge !== this.activeEdge) {
      this.ngZone.run(() => {
        this.activeEdge = edge as 'top' | 'right' | 'bottom' | 'left';
      });
    }
  };
}
