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
} from '@angular/core';
import { BoardTile } from './board-tile.data';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Editor } from '@tiptap/core';
import { SvgIconComponent } from '../../../helpers/svg-icon/svg-icon.component';
import { QuerySelectComponent } from '../../common/query-select/query-select.component';
import { TileRect, TileResizeDirective } from './tile.resize.directive';
import { TileMoveDirective, Position } from './tile.move.directive';
import { BoardMainService } from '../board-main.service';
import { TiptapService } from './tiptap.service';
import { RichTextService } from '../../../helpers/rich-text.service';

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
  @Output() navbarChange = new EventEmitter<{
    template: TemplateRef<any>;
    context: any;
  }>();
  @ViewChild('titleElement', { static: false }) titleElement!: ElementRef;
  @ViewChild('contentElement', { static: false }) contentElement!: ElementRef;
  @ViewChild('navbarContentTemplate', { static: false })
  navbarContentTemplate!: TemplateRef<any>;
  @ViewChild('navbarTitleTemplate', { static: false })
  navbarTitleTemplate!: TemplateRef<any>;

  isColorPaletteVisible: boolean = false;

  private navbarPinned = false;
  private isDraggingTile = false;

  constructor(
    private host: ElementRef<HTMLElement>,
    private mainBoardService: BoardMainService,
    public tiptap: TiptapService,
    private richText: RichTextService,
  ) {}

  getTitleHtml(tile: BoardTile) {
    return this.richText.renderJsonToSafeHtml(tile.name);
  }

  get nameEditor(): Editor {
    return this.tiptap.nameEditor!;
  }

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

    // Click was outside this tile: clear its selection highlight.
    this.tiptap.clearSelectionHighlight();

    // If this tile was providing the navbar, allow it to be virtualized again.
    this.navbarPinned = false;
    if (!this.isDraggingTile) {
      this.tile.forceToRender = false;
    }
  }

  ngAfterViewInit() {
    this.tiptap.initEditors({
      tile: this.tile,
      titleElement: this.titleElement.nativeElement,
      contentElement: this.contentElement.nativeElement,
    });

    const root = this.contentElement.nativeElement as HTMLElement;

    // When user clicks inside this tile, publish its navbar template so the top navbar can render
    const titleRoot =
      this.titleElement && (this.titleElement.nativeElement as HTMLElement);
    const contentRoot =
      this.contentElement && (this.contentElement.nativeElement as HTMLElement);

    if (titleRoot) {
      titleRoot.addEventListener('click', () => {
        this.requestNavbar(this.navbarTitleTemplate);
      });
    }
    if (contentRoot) {
      contentRoot.addEventListener('click', () => {
        this.requestNavbar(this.navbarContentTemplate);
      });
    }

    // Listen for mouseup anywhere to detect text selection that ends outside the editor
    document.addEventListener('mouseup', () => {
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        const isInTitle = titleRoot && titleRoot.contains(selection.anchorNode);
        const isInContent =
          contentRoot && contentRoot.contains(selection.anchorNode);

        if (isInTitle) {
          this.requestNavbar(this.navbarTitleTemplate);
        } else if (isInContent) {
          this.requestNavbar(this.navbarContentTemplate);
        }
      }
    });

    root.addEventListener('mousemove', (e: MouseEvent) => {
      const path = (e.composedPath?.() ?? []) as EventTarget[];
      const anchor = path.find(
        (p): p is HTMLAnchorElement =>
          p instanceof HTMLAnchorElement,
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
  }

  onTileWorldRectChange(r: TileRect) {
    this.tile.x = r.x;
    this.tile.y = r.y;
    this.tile.width = r.width;
    this.tile.height = r.height;

    // This might not be the best ... will see
    for (const connector of this.tile.connectors) {
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
  }

  ngOnDestroy() {
    this.tiptap.destroyEditors();
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
}
