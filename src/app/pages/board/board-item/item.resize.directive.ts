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

export interface ItemRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

@Directive({
  selector: '[boardItemResize]',
  standalone: true,
})
export class ItemResizeDirective implements OnInit, OnDestroy {
  @Input({ required: true }) rect!: ItemRect;
  @Input() minW = 160;
  @Input() minH = 120;
  @Input({ required: true }) zoom = 1;
  /** When true, corner handles keep the item's current aspect ratio (uniform
   *  scale); edge handles still stretch one axis freely. */
  @Input() lockCornerAspect = false;

  @Output() rectChange = new EventEmitter<ItemRect>();
  @Output() resizeEnd = new EventEmitter<void>();

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
    const start: ItemRect = { ...this.rect };

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

      // Corner drag with aspect lock: scale uniformly from the item's current
      // ratio, driven by whichever axis the user pulled further, then re-anchor
      // to the fixed (opposite) corner.
      const isCorner = (hasE || hasW) && (hasN || hasS);
      if (this.lockCornerAspect && isCorner && start.width > 0 && start.height > 0) {
        let scale = Math.max(w / start.width, h / start.height);
        scale = Math.max(scale, this.minW / start.width, this.minH / start.height);
        w = start.width * scale;
        h = start.height * scale;
        x = hasW ? start.x + start.width - w : start.x;
        y = hasN ? start.y + start.height - h : start.y;
      }

      const next: ItemRect = {
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
      this.zone.run(() => this.resizeEnd.emit());
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
  }
}
