import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  OnDestroy,
  Output,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BackgroundColor, FontSize, TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import { BoardSection } from './board-section.data';
import { ItemRect, ItemResizeDirective } from '../board-item/item.resize.directive';
import { ItemMoveDirective, Position } from '../board-item/item.move.directive';
import { TiptapService } from '../board-item/tiptap.service';
import { BoardSnapService } from '../board-snap.service';
import { BoardHistoryService } from '../board-history.service';
import { BoardSelectionService } from '../board-selection.service';
import { BoardMainService } from '../board-main.service';
import { SvgIconComponent } from '../../../helpers/svg-icon/svg-icon.component';
import { QuerySelectComponent } from '../../common/query-select/query-select.component';
import { ColorPaletteComponent } from '../../common/color-palette/color-palette.component';

@Component({
  selector: 'app-board-section',
  standalone: true,
  imports: [
    CommonModule,
    ItemResizeDirective,
    ItemMoveDirective,
    SvgIconComponent,
    QuerySelectComponent,
    ColorPaletteComponent,
  ],
  providers: [TiptapService],
  templateUrl: './board-section.component.html',
  styleUrl: './board-section.component.scss',
})
export class BoardSectionComponent implements AfterViewInit, OnDestroy {
  @Input() tile!: BoardSection;
  @Input() zoom = 1;
  @Output() deleteSection = new EventEmitter<void>();
  @Output() navbarChange = new EventEmitter<{ template: TemplateRef<any>; context: any }>();
  @ViewChild('nameElement', { static: true }) nameElement!: ElementRef<HTMLElement>;
  @ViewChild('navbarContentTemplate', { static: false }) navbarContentTemplate!: TemplateRef<any>;

  @HostBinding('style.zIndex') get hostZIndex() { return this.tile?.zIndex ?? 1; }
  @HostBinding('style.left.px') get hostLeft() { return this.tile?.x ?? 0; }
  @HostBinding('style.top.px') get hostTop() { return this.tile?.y ?? 0; }
  @HostBinding('style.width.px') get hostWidth() { return this.tile?.width ?? 0; }
  @HostBinding('style.height.px') get hostHeight() { return this.tile?.height ?? 0; }
  @HostBinding('style.--board-zoom') get boardZoomVar() { return String(this.zoom); }
  @HostBinding('style.--tile-w') get tileWVar() { return (this.tile?.width ?? 0) + 'px'; }
  @HostBinding('style.--tile-h') get tileHVar() { return (this.tile?.height ?? 0) + 'px'; }
  @HostBinding('attr.data-item-id') get itemIdAttr() { return this.tile?.id ?? null; }

  get isSelected(): boolean { return this.selection.isSelected(this.tile); }

  isFocused = false;
  isOptionsPanelOpen = false;
  isEditingName = false;
  isColorPaletteVisible = false;
  isHighlightPaletteVisible = false;
  deleteConfirmPending = false;
  private deleteConfirmTimeout?: ReturnType<typeof setTimeout>;
  private nameEditor?: Editor;

  constructor(
    private host: ElementRef<HTMLElement>,
    public tiptap: TiptapService,
    private snap: BoardSnapService,
    private history: BoardHistoryService,
    private selection: BoardSelectionService,
    private main: BoardMainService,
  ) {}

  // Rect snapshot at the start of a move/resize gesture, for history.
  private gestureBefore: { x: number; y: number; width: number; height: number } | null = null;
  private rectSnapshot() {
    return { x: this.tile.x, y: this.tile.y, width: this.tile.width, height: this.tile.height };
  }

  get editor(): Editor { return this.nameEditor!; }

  // ── Background / border options (same model as notes) ───────────────────

  private static readonly DEFAULT_RECENT_BG_COLORS: string[] = [
    'rgba(255, 213, 79, 0.13)',
    'rgba(100, 190, 255, 0.13)',
    'rgba(100, 210, 120, 0.12)',
    'rgba(255, 100, 100, 0.12)',
  ];

  private static readonly DEFAULT_RECENT_BORDER_COLORS: string[] = [
    'rgba(255, 213, 79, 0.6)',
    'rgba(100, 190, 255, 0.6)',
    'rgba(100, 210, 120, 0.55)',
    'rgba(255, 100, 100, 0.55)',
  ];

  recentBgColors: string[] = [...BoardSectionComponent.DEFAULT_RECENT_BG_COLORS];
  recentBorderColors: string[] = [...BoardSectionComponent.DEFAULT_RECENT_BORDER_COLORS];

  get sectionBgColor(): string | null { return this.tile.bgColor ?? null; }

  setBgColor(color: string | null): void {
    this.tile.bgColor = color;
    if (color !== null) {
      this.recentBgColors = [color, ...this.recentBgColors.filter(c => c !== color)].slice(0, 4);
    }
  }

  get sectionBorderColor(): string | null { return this.tile.borderColor ?? null; }

  setBorderColor(color: string | null): void {
    this.tile.borderColor = color;
    if (color !== null) {
      this.recentBorderColors = [color, ...this.recentBorderColors.filter(c => c !== color)].slice(0, 4);
    }
  }

  onBgPaletteChange(color: string | null): void {
    this.tile.bgColor = color;
  }

  onBorderPaletteChange(color: string | null): void {
    this.tile.borderColor = color;
  }

  onTextColorPick(color: string | null): void {
    if (color !== null) this.tiptap.setTextColor(color, this.editor);
  }

  onHighlightPick(color: string | null): void {
    if (color === null) {
      this.tiptap.unsetHighlight(this.editor);
    } else {
      this.tiptap.setHighlight(color, this.editor);
    }
  }

  get sectionBorderWidth(): number { return this.tile.borderWidth ?? 1; }

  onBorderWidthInput(event: Event): void {
    this.tile.borderWidth = parseFloat((event.target as HTMLInputElement).value);
  }

  // ── Name editor ──────────────────────────────────────────────────────────

  ngAfterViewInit() {
    // Name-only editor: basic marks + font color/size/family. No blocks.
    this.nameEditor = new Editor({
      element: this.nameElement.nativeElement,
      extensions: [
        StarterKit.configure({
          heading: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
        }),
        TextStyle,
        FontSize,
        Color.configure({ types: ['textStyle'] }),
        BackgroundColor,
        FontFamily,
      ],
      content: this.tile.name,
      onFocus: ({ editor }) => {
        this.isEditingName = true;
        this.tiptap.trackStyles(editor);
      },
      onUpdate: ({ editor }) => {
        this.tile.name = editor.getJSON();
        this.tiptap.trackStyles(editor);
      },
      onSelectionUpdate: ({ editor }) => {
        this.tiptap.trackStyles(editor);
      },
    });

    const nameRoot = this.nameElement.nativeElement;
    nameRoot.addEventListener('click', () => {
      this.isFocused = true;
      this.requestNavbar(this.navbarContentTemplate);
    });
  }

  ngOnDestroy() {
    clearTimeout(this.deleteConfirmTimeout);
    try {
      this.nameEditor?.destroy();
    } catch {}
    this.nameEditor = undefined;
  }

  focus() {
    this.isFocused = true;
    this.tile.forceToRender = true;
    this.nameEditor?.commands.focus('end');
  }

  requestNavbar(template: TemplateRef<any>) {
    if (!template) return;
    this.navbarPinned = true;
    this.tile.forceToRender = true;
    this.navbarChange.emit({ template, context: { tile: this.tile } });
  }

  private navbarPinned = false;
  private isDraggingTile = false;

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(ev: MouseEvent) {
    const path = (ev.composedPath?.() ?? []) as EventTarget[];
    if (path.includes(this.host.nativeElement)) return;
    this.isFocused = false;
    this.isOptionsPanelOpen = false;
    this.isEditingName = false;
    this.navbarPinned = false;
    if (!this.isDraggingTile) {
      this.tile.forceToRender = false;
    }
  }

  onFrameClick() {
    this.isFocused = true;
  }

  // ── Move / resize / delete ───────────────────────────────────────────────

  onRectChange(r: ItemRect) {
    const prev: ItemRect = {
      x: this.tile.x,
      y: this.tile.y,
      width: this.tile.width,
      height: this.tile.height,
    };
    if (!this.gestureBefore) this.gestureBefore = prev;
    const s = this.snap.snapResize(r, prev, this.tile.id);
    this.tile.x = s.x; this.tile.y = s.y;
    this.tile.width = s.width; this.tile.height = s.height;
  }

  onResizeEnd() {
    this.snap.clearGuides();
    if (this.gestureBefore) { this.history.pushRect(this.tile, this.gestureBefore); this.gestureBefore = null; }
  }

  onPosChange(p: Position) {
    if (this.selection.isGroupMoving(this.tile)) {
      const c = this.snap.snapGroupMove(
        this.selection.items,
        p.x - this.tile.x,
        p.y - this.tile.y,
        p.lockedAxis,
      );
      this.selection.moveGroupTo(this.tile, this.tile.x + c.dx, this.tile.y + c.dy, p.lockedAxis);
      return;
    }
    const s = this.snap.snapMove(
      { x: p.x, y: p.y, width: this.tile.width, height: this.tile.height },
      this.tile.id,
      p.lockedAxis,
    );
    this.tile.x = s.x; this.tile.y = s.y;
  }

  onMoveStart() {
    this.selection.beginGroupMove(this.tile);
    this.main.beginElementDrag([this.tile.id]);
    this.isDraggingTile = true;
    this.tile.forceToRender = true;
    this.gestureBefore = this.rectSnapshot();
  }
  onMoveEnd() {
    const wasGroup = this.selection.isGroupMoving(this.tile);
    this.main.endElementDrag();
    this.isDraggingTile = false;
    if (!this.navbarPinned) this.tile.forceToRender = false;
    this.snap.clearGuides();
    if (wasGroup) {
      this.selection.endGroupMove();
      this.gestureBefore = null;
      return;
    }
    if (this.gestureBefore) { this.history.pushRect(this.tile, this.gestureBefore); this.gestureBefore = null; }
  }

  onDeleteClick(event: MouseEvent) {
    event.stopPropagation();
    this.triggerDelete();
  }

  /** Two-step delete: first call arms the confirm ("Delete?"), second deletes. */
  private triggerDelete() {
    if (this.deleteConfirmPending) {
      clearTimeout(this.deleteConfirmTimeout);
      this.deleteConfirmPending = false;
      this.deleteSection.emit();
    } else {
      this.deleteConfirmPending = true;
      this.deleteConfirmTimeout = setTimeout(() => { this.deleteConfirmPending = false; }, 2500);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent) {
    if (!this.isFocused) return;
    if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
    if (isTextEditingActive()) return;
    ev.preventDefault();
    this.triggerDelete();
  }
}

/** True when focus is in a text field / rich-text editor, so Delete/Backspace
 *  should edit text rather than remove the board element. */
function isTextEditingActive(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable ||
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA')
  );
}
