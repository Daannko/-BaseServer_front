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
} from '@angular/core';
import { BoardItem } from '../board-item/board-item.data';
import { BoardNote, NoteOptions, DEFAULT_NOTE_OPTIONS } from './board-note.data';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Editor } from '@tiptap/core';
import { SvgIconComponent } from '../../../helpers/svg-icon/svg-icon.component';
import { QuerySelectComponent } from '../../common/query-select/query-select.component';
import { ItemRect, ItemResizeDirective } from '../board-item/item.resize.directive';
import { ItemMoveDirective, Position } from '../board-item/item.move.directive';
import { TiptapService } from '../board-item/tiptap.service';

@Component({
  selector: 'app-board-note',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SvgIconComponent,
    QuerySelectComponent,
    ItemResizeDirective,
    ItemMoveDirective,
  ],
  providers: [TiptapService],
  templateUrl: './board-note.component.html',
  styleUrl: './board-note.component.scss',
})
export class BoardNoteComponent implements OnDestroy, AfterViewInit {
  @Input() tile!: BoardItem;
  @Input() zoom = 1;
  @Output() navbarChange = new EventEmitter<{ template: TemplateRef<any>; context: any }>();
  @Output() deleteTile = new EventEmitter<void>();
  @ViewChild('contentElement', { static: false }) contentElement!: ElementRef;
  @ViewChild('navbarContentTemplate', { static: false }) navbarContentTemplate!: TemplateRef<any>;

  @HostBinding('style.zIndex') get hostZIndex() { return this.tile?.zIndex ?? 1; }
  @HostBinding('style.left.px') get hostLeft() { return this.tile?.x ?? 0; }
  @HostBinding('style.top.px') get hostTop() { return this.tile?.y ?? 0; }
  @HostBinding('style.width.px') get hostWidth() { return this.tile?.width ?? 0; }
  @HostBinding('style.height.px') get hostHeight() { return this.tile?.height ?? 0; }
  @HostBinding('style.--tile-min') get hostTileMin() {
    return Math.max(this.tile?.width ?? 0, this.tile?.height ?? 0) + 'px';
  }

  isColorPaletteVisible = false;
  isBgPaletteVisible = false;
  deleteConfirmPending = false;
  isFocused = false;
  isOptionsPanelOpen = false;

  get noteOptions(): NoteOptions {
    return (this.tile as BoardNote).options ?? DEFAULT_NOTE_OPTIONS;
  }

  setNoteOption<K extends keyof NoteOptions>(key: K, value: NoteOptions[K]): void {
    (this.tile as BoardNote).options[key] = value;
  }

  onOptionNumberInput(key: 'padding', event: Event) {
    const val = (event.target as HTMLInputElement).value.trim();
    const num = parseFloat(val);
    this.setNoteOption(key, val === '' || isNaN(num) ? null : Math.max(0, num));
  }

  @HostBinding('style.--board-zoom') get boardZoomVar() {
    return String(this.zoom);
  }

  @HostBinding('style.--note-pad-v') get notePadV() {
    const p = this.noteOptions.padding;
    if (p != null) return `${p}px`;
    const m = Math.min(this.tile?.width ?? 0, this.tile?.height ?? 0);
    return `${m / 25}px`;
  }
  @HostBinding('style.--note-pad-h') get notePadH() {
    const p = this.noteOptions.padding;
    if (p != null) return `${p}px`;
    const m = Math.min(this.tile?.width ?? 0, this.tile?.height ?? 0);
    return `${m / 19}px`;
  }

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

  recentBgColors: string[] = [...BoardNoteComponent.DEFAULT_RECENT_BG_COLORS];
  recentBorderColors: string[] = [...BoardNoteComponent.DEFAULT_RECENT_BORDER_COLORS];

  get noteBgColor(): string | null {
    return (this.tile as BoardNote).bgColor ?? null;
  }

  setBgColor(color: string | null): void {
    (this.tile as BoardNote).bgColor = color;
    if (color !== null) {
      this.recentBgColors = [color, ...this.recentBgColors.filter(c => c !== color)].slice(0, 4);
    }
  }

  get noteBorderColor(): string | null {
    return (this.tile as BoardNote).borderColor ?? null;
  }

  setBorderColor(color: string | null): void {
    (this.tile as BoardNote).borderColor = color;
    if (color !== null) {
      this.recentBorderColors = [color, ...this.recentBorderColors.filter(c => c !== color)].slice(0, 4);
    }
  }

  private static readonly CUSTOM_BG_ALPHA = 0.13;

  get customBgColorHex(): string {
    const match = this.noteBgColor?.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!match) return '#ffffff';
    const toHex = (n: string) => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, '0');
    return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
  }

  get noteBgAlpha(): number {
    const match = this.noteBgColor?.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
    return match ? parseFloat(match[1]) : BoardNoteComponent.CUSTOM_BG_ALPHA;
  }

  onBgAlphaInput(event: Event): void {
    if (!this.noteBgColor) return;
    const alpha = parseFloat((event.target as HTMLInputElement).value);
    const match = this.noteBgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return;
    (this.tile as BoardNote).bgColor = `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
  }

  get noteBgSolidColor(): string {
    const match = this.noteBgColor?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return match ? `rgb(${match[1]}, ${match[2]}, ${match[3]})` : 'rgb(255,255,255)';
  }

  get noteBorderWidth(): number {
    return (this.tile as BoardNote).borderWidth ?? 1;
  }

  onBorderWidthInput(event: Event): void {
    (this.tile as BoardNote).borderWidth = parseFloat((event.target as HTMLInputElement).value);
  }

  get noteBorderAlpha(): number {
    const match = this.noteBorderColor?.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
    return match ? parseFloat(match[1]) : 0.6;
  }

  onBorderAlphaInput(event: Event): void {
    if (!this.noteBorderColor) return;
    const alpha = parseFloat((event.target as HTMLInputElement).value);
    const match = this.noteBorderColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return;
    (this.tile as BoardNote).borderColor = `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
  }

  get noteBorderSolidColor(): string {
    const match = this.noteBorderColor?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return match ? `rgb(${match[1]}, ${match[2]}, ${match[3]})` : 'rgb(255,255,255)';
  }

  get noteBorderGlow(): string | null {
    const match = this.noteBorderColor?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return null;
    const alpha = Math.min(1, parseFloat(match[4] ?? '1') * 0.28);
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
  }

  get customBorderColorHex(): string {
    const match = this.noteBorderColor?.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!match) return '#ffffff';
    const toHex = (n: string) => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, '0');
    return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
  }

  onCustomBorderColorInput(event: Event): void {
    const alpha = this.noteBorderAlpha;
    const hex = (event.target as HTMLInputElement).value;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    (this.tile as BoardNote).borderColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  onCustomBorderColorChange(event: Event): void {
    const alpha = this.noteBorderAlpha;
    const hex = (event.target as HTMLInputElement).value;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    this.setBorderColor(`rgba(${r}, ${g}, ${b}, ${alpha})`);
  }

  private hexToRgba(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${BoardNoteComponent.CUSTOM_BG_ALPHA})`;
  }

  onCustomBgColorInput(event: Event): void {
    (this.tile as BoardNote).bgColor = this.hexToRgba((event.target as HTMLInputElement).value);
  }

  onCustomBgColorChange(event: Event): void {
    this.setBgColor(this.hexToRgba((event.target as HTMLInputElement).value));
  }

  private navbarPinned = false;
  private isDraggingTile = false;
  private deleteConfirmTimeout?: ReturnType<typeof setTimeout>;
  private resizeObserver?: ResizeObserver;

  constructor(
    private host: ElementRef<HTMLElement>,
    public tiptap: TiptapService,
  ) {}

  get contentEditor(): Editor { return this.tiptap.contentEditor!; }

  clearSelectionHighlight() { this.tiptap.clearSelectionHighlight(); }

  focus() {
    this.isFocused = true;
    this.tile.forceToRender = true;
    this.tiptap.contentEditor?.commands.focus('end');
  }

  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent) {
    const path = (event.composedPath?.() ?? []) as EventTarget[];
    const isExempt = path.some(el => el instanceof HTMLElement &&
      (el.classList.contains('content-editor') || el.classList.contains('note-options-side-panel')));
    if (isExempt) return;

    event.preventDefault();
    event.stopPropagation();

    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    const newW = Math.max(1, this.tile.width * factor);
    const newH = Math.max(1, this.tile.height * factor);
    const cx = this.tile.x + this.tile.width / 2;
    const cy = this.tile.y + this.tile.height / 2;
    this.onTileWorldRectChange({
      x: cx - newW / 2,
      y: cy - newH / 2,
      width: newW,
      height: newH,
    });
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(ev: MouseEvent) {
    const path = (ev.composedPath?.() ?? []) as EventTarget[];
    if (path.includes(this.host.nativeElement)) return;
    this.isFocused = false;
    this.isOptionsPanelOpen = false;
    this.navbarPinned = false;
    if (!this.isDraggingTile && !this.tiptap.hasActiveSelection) {
      this.tile.forceToRender = false;
    }
  }

  ngAfterViewInit() {
    this.tiptap.initEditors({
      tile: this.tile,
      contentElement: this.contentElement.nativeElement,
    });

    const contentRoot = this.contentElement.nativeElement as HTMLElement;
    contentRoot.addEventListener('click', () => {
      this.isFocused = true;
      this.requestNavbar(this.navbarContentTemplate);
    });

    this.tiptap.onFocusCallback = () => {
      if (!this.navbarPinned && !this.isDraggingTile) {
        this.tile.forceToRender = false;
      }
    };

    document.addEventListener('mouseup', () => {
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        if (contentRoot.contains(selection.anchorNode)) {
          this.requestNavbar(this.navbarContentTemplate);
        }
      }
    });

    contentRoot.addEventListener('mousemove', (e: MouseEvent) => {
      const el = (e.target as HTMLElement) || null;
      if (el?.tagName === 'IMG') { contentRoot.style.cursor = 'grab'; return; }
      const path = (e.composedPath?.() ?? []) as EventTarget[];
      const anchor = path.find((p): p is HTMLAnchorElement => p instanceof HTMLAnchorElement);
      if (anchor) { contentRoot.style.cursor = 'pointer'; return; }
      contentRoot.style.cursor = 'text';
    });

    this.resizeObserver = new ResizeObserver(() => {
      const el = contentRoot;
      const st = el.scrollTop;
      el.scrollTop = st + 1;
      el.scrollTop = st;
    });
    this.resizeObserver.observe(contentRoot);
  }

  onTileWorldRectChange(r: ItemRect) {
    this.tile.x = r.x; this.tile.y = r.y;
    this.tile.width = r.width; this.tile.height = r.height;
  }

  onTileWorldPosChange(p: Position) {
    this.tile.x = p.x; this.tile.y = p.y;
  }

  onDeleteClick(event: MouseEvent) {
    event.stopPropagation();
    if (this.deleteConfirmPending) {
      clearTimeout(this.deleteConfirmTimeout);
      this.deleteConfirmPending = false;
      this.deleteTile.emit();
    } else {
      this.deleteConfirmPending = true;
      this.deleteConfirmTimeout = setTimeout(() => { this.deleteConfirmPending = false; }, 2500);
    }
  }

  ngOnDestroy() {
    clearTimeout(this.deleteConfirmTimeout);
    this.resizeObserver?.disconnect();
    this.tiptap.destroyEditors();
  }

  requestNavbar(template: TemplateRef<any>) {
    if (!template) return;
    this.navbarPinned = true;
    this.tile.forceToRender = true;
    this.navbarChange.emit({ template, context: { tile: this.tile } });
  }

  onMoveStart() { this.isDraggingTile = true; this.tile.forceToRender = true; }
  onMoveEnd() {
    this.isDraggingTile = false;
    if (!this.navbarPinned) this.tile.forceToRender = false;
  }

}
