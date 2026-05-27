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

  @HostBinding('style.zIndex') get hostZIndex() { return this.tile?.zIndex ?? 1; }

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

  @ViewChild('connectorWavePath', { static: false })
  private connectorWavePathRef?: ElementRef<SVGPathElement>;

  private waveAnim   = { t: 0, amplitude: 0, spread: 200, opacity: 0, angle: 0 };
  private waveTarget = { t: 0, amplitude: 0, spread: 200, opacity: 0, angle: 0 };
  private rafId: number | null = null;

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
      if (!connector.active) continue;
      connector.updateAngles();
      connector.updatePosition();
    }
    for (const connector of this.tile.inboundConnectors) {
      if (!connector.active) continue;
      connector.updateAngles();
      connector.updatePosition();
    }
  }

  onTileWorldPosChange(p: Position) {
    this.tile.x = p.x;
    this.tile.y = p.y;

    for (const connector of this.tile.connectors) {
      if (!connector.active) continue;
      connector.updateAngles();
      connector.updatePosition();
    }
    for (const connector of this.tile.inboundConnectors) {
      if (!connector.active) continue;
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
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
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

    // Nearest point on tile perimeter = clamp mouse to tile bounds
    const nearestX = Math.max(0, Math.min(W, mx * scaleX));
    const nearestY = Math.max(0, Math.min(H, my * scaleY));

    // Convert to clockwise perimeter t: top(0..W) → right(W..W+H) → bottom(W+H..2W+H) → left(2W+H..2W+2H)
    let targetT: number;
    if (nearestY === 0)  targetT = nearestX;
    else if (nearestX === W) targetT = W + nearestY;
    else if (nearestY === H) targetT = W + H + (W - nearestX);
    else                     targetT = 2*W + H + (H - nearestY);

    const tileMin = Math.min(W, H);
    const A_max = tileMin * 0.043;
    // Amplitude maxes out when mouse reaches wave tip (outsideDist <= A_max); closer = no taller
    const amplitude = outsideDist <= A_max
      ? A_max
      : A_max * (maxDist - outsideDist) / (maxDist - A_max);

    this.waveTarget.t         = targetT;
    this.waveTarget.amplitude = amplitude;
    this.waveTarget.spread    = tileMin * 0.05 + (1 - proximity) * tileMin * 0.13;
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

      // Shortest-path lerp around the perimeter
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

    let cx: number, cy: number;
    if (t <= W)           { cx = t;           cy = 0; }
    else if (t <= W+H)   { cx = W;           cy = t - W; }
    else if (t <= 2*W+H) { cx = W-(t-W-H);   cy = H; }
    else                  { cx = 0;           cy = H-(t-2*W-H); }

    const odx = Math.cos(angle); // outward toward mouse
    const ody = Math.sin(angle);
    const tnx = -ody;
    const tny =  odx;

    // Left and right base points: walk ±s along tile perimeter from center point
    // They always stay on the tile boundary
    const perimPt = (tp: number): [number, number] => {
      const tn = ((tp % perim) + perim) % perim;
      if (tn <= W)           return [tn, 0];
      else if (tn <= W+H)    return [W, tn - W];
      else if (tn <= 2*W+H)  return [W-(tn-W-H), H];
      else                   return [0, H-(tn-2*W-H)];
    };

    const tLeft = t - s, tRight = t + s;
    const [lx, ly] = perimPt(tLeft);
    const [rx, ry] = perimPt(tRight);
    const tipx = cx + A * odx;
    const tipy = cy + A * ody;

    const flat  = s * 0.50;
    const crest = s * 0.40;

    // Direction from each base toward the wave center — continuous everywhere, no corner jumps.
    // On a straight edge this equals the edge tangent (flat wave start).
    // Through a corner it blends diagonally — no snap, no mode switch.
    const dcLx = cx - lx, dcLy = cy - ly, dcL = Math.hypot(dcLx, dcLy) || 1;
    const dcRx = cx - rx, dcRy = cy - ry, dcR = Math.hypot(dcRx, dcRy) || 1;
    const c1lx = lx + (dcLx/dcL)*flat,  c1ly = ly + (dcLy/dcL)*flat;
    const c2rx = rx + (dcRx/dcR)*flat,  c2ry = ry + (dcRy/dcR)*flat;

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
    p.style.pointerEvents = 'painted';
  };
}
