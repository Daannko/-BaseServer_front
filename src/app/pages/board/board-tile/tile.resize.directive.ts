import {
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
  Renderer2,
} from '@angular/core';

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

@Directive({
  selector: '[boardTileResize]',
  standalone: true,
})
export class TileResizeDirective implements OnInit, OnDestroy {
  @Input({ required: true }) rect!: TileRect;
  @Input() minW = 160;
  @Input() minH = 120;
  @Input({ required: true }) zoom = 1;

  @Output() rectChange = new EventEmitter<TileRect>();

  private handles: HTMLElement[] = [];
  private cleanup: Array<() => void> = [];

  constructor(
    private hostRef: ElementRef<HTMLElement>,
    private renderer: Renderer2,
    private zone: NgZone,
  ) {}

  ngOnDestroy(): void {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
  }
  ngOnInit(): void {
    const host = this.hostRef.nativeElement;
    const dirs: ResizeHandle[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];

    for (const dir of dirs) {
      const handle = this.renderer.createElement('span') as HTMLElement;
      this.renderer.addClass(handle, 'resize-handle');
      this.renderer.addClass(handle, `resize-handle--${dir}`);
      this.renderer.setStyle(handle, 'touch-action', 'none');
      this.renderer.appendChild(host, handle);
      this.handles.push(handle);

      this.zone.runOutsideAngular(() => {
        const off = this.renderer.listen(
          handle,
          'pointerdown',
          (ev: PointerEvent) => {
            ev.preventDefault();
            ev.stopPropagation();
            this.startResize(ev, dir);
          },
        );
        this.cleanup.push(off);
      });
    }
  }

  startResize(ev: PointerEvent, handle: ResizeHandle) {
    const startX = ev.clientX;
    const startY = ev.clientY;
    const start: TileRect = { ...this.rect };

    const hasE = handle.includes('e');
    const hasW = handle.includes('w');
    const hasS = handle.includes('s');
    const hasN = handle.includes('n');
    const z = this.zoom || 1;

    const onMove = (e: PointerEvent) => {
      const dx = (e.clientX - startX) / z;
      const dy = (e.clientY - startY) / z;

      let x = start.x;
      let y = start.y;
      let w = start.width;
      let h = start.height;

      if (hasE) w = start.width + dx;
      if (hasW) {
        w = start.width - dx;
        x = start.x + dx;
      }

      if (hasS) h = start.height + dy;
      if (hasN) {
        h = start.height - dy;
        y = start.y + dy;
      }

      // Clamp, keep opposite edge anchored for W/N handles
      if (w < this.minW) {
        w = this.minW;
        if (hasW) x = start.x + (start.width - w);
      }
      if (h < this.minH) {
        h = this.minH;
        if (hasN) y = start.y + (start.height - h);
      }

      const next: TileRect = {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(w),
        height: Math.round(h),
      };

      this.zone.run(() => this.rectChange.emit(next));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
  }
}
