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
import { BoardTile } from '../board-tile/board-tile.data';
import { BoardNote, NoteOptions, DEFAULT_NOTE_OPTIONS } from './board-note.data';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Editor } from '@tiptap/core';
import { SvgIconComponent } from '../../../helpers/svg-icon/svg-icon.component';
import { QuerySelectComponent } from '../../common/query-select/query-select.component';
import { TileRect, TileResizeDirective } from '../board-tile/tile.resize.directive';
import { TileMoveDirective, Position } from '../board-tile/tile.move.directive';
import { TiptapService } from '../board-tile/tiptap.service';

@Component({
  selector: 'app-board-note',
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
  templateUrl: './board-note.component.html',
  styleUrl: './board-note.component.scss',
})
export class BoardNoteComponent implements OnDestroy, AfterViewInit {
  @Input() tile!: BoardTile;
  @Input() zoom = 1;
  @Output() navbarChange = new EventEmitter<{ template: TemplateRef<any>; context: any }>();
  @Output() deleteTile = new EventEmitter<void>();
  @Output() connectorDragStart = new EventEmitter<{ fromX: number; fromY: number }>();
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

  @ViewChild('connectorWavePath', { static: false })
  private connectorWavePathRef?: ElementRef<SVGPathElement>;

  private waveAnim   = { t: 0, amplitude: 0, spread: 200, opacity: 0, angle: 0 };
  private waveTarget = { t: 0, amplitude: 0, spread: 200, opacity: 0, angle: 0 };
  private rafId: number | null = null;

  private navbarPinned = false;
  private isDraggingTile = false;
  private deleteConfirmTimeout?: ReturnType<typeof setTimeout>;
  private isDrawingConnector = false;
  private resizeObserver?: ResizeObserver;

  constructor(
    private host: ElementRef<HTMLElement>,
    private ngZone: NgZone,
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

    // connector wave disabled
    // this.ngZone.runOutsideAngular(() => {
    //   document.addEventListener('mousemove', this.onDocumentMouseMove);
    // });
  }

  onTileWorldRectChange(r: TileRect) {
    this.tile.x = r.x; this.tile.y = r.y;
    this.tile.width = r.width; this.tile.height = r.height;
    this.updateConnectors();
  }

  onTileWorldPosChange(p: Position) {
    this.tile.x = p.x; this.tile.y = p.y;
    this.updateConnectors();
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
    document.removeEventListener('mousemove', this.onDocumentMouseMove);
    document.removeEventListener('mouseup', this.onConnectorDragEnd);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
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

  onConnectorMouseDown(event: MouseEvent): void {
    event.stopPropagation();
    this.isDrawingConnector = true;
    this.waveTarget.opacity = Math.max(this.waveAnim.opacity, 0.7);
    this.waveTarget.amplitude = Math.max(this.waveAnim.amplitude, Math.min(this.tile.width, this.tile.height) * 0.043);
    this.startWaveAnim();
    document.addEventListener('mouseup', this.onConnectorDragEnd, { once: true });
    this.connectorDragStart.emit({
      fromX: this.tile.x + this.tile.width / 2,
      fromY: this.tile.y + this.tile.height / 2,
    });
  }

  private readonly onConnectorDragEnd = () => {
    this.isDrawingConnector = false;
    this.waveTarget.amplitude = 0;
    this.waveTarget.opacity = 0;
    this.startWaveAnim();
  };

  private perimToXY(t: number, W: number, H: number): [number, number] {
    const perim = 2 * (W + H);
    const tn = ((t % perim) + perim) % perim;
    if (tn <= W)          return [tn, 0];
    if (tn <= W + H)      return [W, tn - W];
    if (tn <= 2 * W + H)  return [W - (tn - W - H), H];
    return [0, H - (tn - 2 * W - H)];
  }

  private updateConnectors(): void {
    for (const connector of this.tile.connectors) {
      if (!connector.active) continue;
      connector.updateAngles(); connector.updatePosition();
    }
    for (const connector of this.tile.inboundConnectors) {
      if (!connector.active) continue;
      connector.updateAngles(); connector.updatePosition();
    }
  }

  private readonly onDocumentMouseMove = (e: MouseEvent) => {
    if (this.isDrawingConnector) return;
    const rect = this.host.nativeElement.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const tileMinScreen = Math.min(rect.width, rect.height);
    const maxDist = tileMinScreen * 0.45;

    const outsideDx = Math.max(0, -mx, mx - rect.width);
    const outsideDy = Math.max(0, -my, my - rect.height);
    const outsideDist = Math.hypot(outsideDx, outsideDy);

    if (outsideDist === 0 || outsideDist > maxDist) {
      this.waveTarget.amplitude = 0;
      this.waveTarget.opacity = 0;
      this.startWaveAnim();
      return;
    }

    const proximity = 1 - outsideDist / maxDist;
    const scaleX = this.tile.width / rect.width;
    const scaleY = this.tile.height / rect.height;
    const W = this.tile.width, H = this.tile.height;

    const nearestX = Math.max(0, Math.min(W, mx * scaleX));
    const nearestY = Math.max(0, Math.min(H, my * scaleY));

    let targetT: number;
    if (nearestY === 0)       targetT = nearestX;
    else if (nearestX === W)  targetT = W + nearestY;
    else if (nearestY === H)  targetT = W + H + (W - nearestX);
    else                      targetT = 2*W + H + (H - nearestY);

    const tileMin = Math.min(W, H);
    const A_max = tileMin * 0.057;
    const amplitude = outsideDist <= A_max
      ? A_max
      : A_max * (maxDist - outsideDist) / (maxDist - A_max);

    this.waveTarget.t         = targetT;
    this.waveTarget.amplitude = amplitude;
    this.waveTarget.spread    = tileMin * 0.065 + (1 - proximity) * tileMin * 0.16;
    this.waveTarget.opacity   = Math.min(1, proximity * 1.6);
    this.waveTarget.angle     = Math.atan2(my * scaleY - nearestY, mx * scaleX - nearestX);

    this.startWaveAnim();
  };

  private startWaveAnim(): void {
    if (this.rafId !== null) return;
    const tick = () => {
      const a = this.waveAnim;
      const tgt = this.waveTarget;
      const lp = (f: number, to: number, k: number) => f + (to - f) * k;
      const W = this.tile.width, H = this.tile.height;
      const perim = 2 * (W + H);

      let dt = tgt.t - a.t;
      if (dt >  perim / 2) dt -= perim;
      if (dt < -perim / 2) dt += perim;
      a.t = ((a.t + dt * 0.18) + perim) % perim;

      a.amplitude = lp(a.amplitude, tgt.amplitude, 0.10);
      a.spread    = lp(a.spread,    tgt.spread,    0.10);
      a.opacity   = lp(a.opacity,   tgt.opacity,   0.15);

      let da = tgt.angle - a.angle;
      if (da >  Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      a.angle = a.angle + da * 0.15;

      this.updateWavePath();

      const moving = Math.abs(dt) > 0.3
        || Math.abs(a.amplitude - tgt.amplitude) > 0.05
        || Math.abs(a.spread    - tgt.spread)    > 0.05
        || Math.abs(a.opacity   - tgt.opacity)   > 0.004
        || Math.abs(da) > 0.01;

      this.rafId = moving ? requestAnimationFrame(tick) : null;
      if (!moving) {
        a.t = tgt.t; a.amplitude = tgt.amplitude;
        a.spread = tgt.spread; a.opacity = tgt.opacity; a.angle = tgt.angle;
        this.updateWavePath();
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private updateWavePath(): void {
    const p = this.connectorWavePathRef?.nativeElement;
    if (!p) return;

    const { amplitude: A, spread: s, opacity, angle } = this.waveAnim;
    const W = this.tile.width, H = this.tile.height;
    const perim = 2 * (W + H);
    const t = ((this.waveAnim.t % perim) + perim) % perim;

    if (A < 0.3) {
      p.style.opacity = '0';
      p.style.pointerEvents = 'none';
      return;
    }

    let cx: number, cy: number, edgeStart: number, edgeEnd: number;
    if (t <= W)          { cx = t;           cy = 0;   edgeStart = 0;       edgeEnd = W; }
    else if (t <= W + H) { cx = W;           cy = t-W; edgeStart = W;       edgeEnd = W+H; }
    else if (t <= 2*W+H) { cx = W-(t-W-H);  cy = H;   edgeStart = W+H;     edgeEnd = 2*W+H; }
    else                 { cx = 0;           cy = H-(t-2*W-H); edgeStart = 2*W+H; edgeEnd = perim; }

    const odx = Math.cos(angle);
    const ody = Math.sin(angle);
    const tnx = -ody;
    const tny =  odx;

    const tLeft  = t - s;
    const tRight = t + s;
    const [lx, ly] = this.perimToXY(tLeft, W, H);
    const [rx, ry] = this.perimToXY(tRight, W, H);
    const tipx = cx + A * odx;
    const tipy = cy + A * ody;

    const flat  = s * 0.50;
    const crest = s * 0.40;

    const freeL = Math.min(1, Math.max(0, (t - edgeStart) / (s || 1)));
    const freeR = Math.min(1, Math.max(0, (edgeEnd - t)   / (s || 1)));

    const dcLx = cx - lx, dcLy = cy - ly, dcL = Math.hypot(dcLx, dcLy) || 1;
    const dcRx = cx - rx, dcRy = cy - ry, dcR = Math.hypot(dcRx, dcRy) || 1;
    const c1lx = lx + (dcLx/dcL)*flat*freeL;
    const c1ly = ly + (dcLy/dcL)*flat*freeL;
    const c2rx = rx + (dcRx/dcR)*flat*freeR;
    const c2ry = ry + (dcRy/dcR)*flat*freeR;

    const f = (n: number) => n.toFixed(2);
    const d = `M${f(lx)},${f(ly)} `
      + `C${f(c1lx)},${f(c1ly)} `
      + `${f(tipx - tnx*crest)},${f(tipy - tny*crest)} `
      + `${f(tipx)},${f(tipy)} `
      + `C${f(tipx + tnx*crest)},${f(tipy + tny*crest)} `
      + `${f(c2rx)},${f(c2ry)} `
      + `${f(rx)},${f(ry)} `
      + `C${f(rx - 20*odx)},${f(ry - 20*ody)} `
      + `${f(lx - 20*odx)},${f(ly - 20*ody)} `
      + `${f(lx)},${f(ly)} Z`;

    p.setAttribute('d', d);
    p.style.opacity = String(Math.min(1, opacity));
    p.style.fill = this.isDrawingConnector ? 'rgba(255, 213, 79, 0.35)' : '';
    p.style.pointerEvents = 'painted';
  }
}
