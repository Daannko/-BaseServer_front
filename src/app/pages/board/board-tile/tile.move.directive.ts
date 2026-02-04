import {
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';

export interface Position {
  x: number;
  y: number;
}

@Directive({
  selector: '[boardTileMove]',
  standalone: true,
})
export class TileMoveDirective implements OnInit, OnDestroy {
  @Input({ required: true }) pos!: Position;
  @Input({ required: true }) zoom = 1;

  @Output() posChange = new EventEmitter<Position>();
  @Output() moveStart = new EventEmitter<void>();
  @Output() moveEnd = new EventEmitter<void>();

  private cleanup: Array<() => void> = [];
  private didDrag = false;

  constructor(
    private hostRef: ElementRef<HTMLElement>,
    private zone: NgZone,
  ) {}

  ngOnDestroy(): void {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
  }
  ngOnInit(): void {
    const host = this.hostRef.nativeElement;
    host.style.touchAction = 'none';

    this.zone.runOutsideAngular(() => {
      const onPointerDown: EventListener = (ev: Event) => {
        const pev = ev as PointerEvent;
        // Only left mouse button (touch/pen usually report 0)
        if (typeof pev.button === 'number' && pev.button !== 0) return;

        // Ensure the host stays rendered during drag (prevents ngIf virtualization glitches).
        this.zone.run(() => this.moveStart.emit());

        const startX = pev.clientX;
        const startY = pev.clientY;
        let lastX = pev.clientX;
        let lastY = pev.clientY;
        let currentX = this.pos.x;
        let currentY = this.pos.y;
        const DRAG_THRESHOLD_PX = 4;

        let dragging = false;
        this.didDrag = false;

        // Keep receiving pointer events even if leaving the element.
        try {
          host.setPointerCapture(pev.pointerId);
        } catch {}

        const onMove: EventListener = (e: Event) => {
          const moveEv = e as PointerEvent;
          const rawDxFromStart = moveEv.clientX - startX;
          const rawDyFromStart = moveEv.clientY - startY;

          if (!dragging) {
            if (
              Math.abs(rawDxFromStart) < DRAG_THRESHOLD_PX &&
              Math.abs(rawDyFromStart) < DRAG_THRESHOLD_PX
            ) {
              return;
            }
            dragging = true;
            this.didDrag = true;
          }

          moveEv.preventDefault();

          // Convert *incremental* screen delta to world delta using the CURRENT zoom.
          // This keeps movement correct even if the user zooms while dragging.
          const z = this.zoom || 1;
          const dxPx = moveEv.clientX - lastX;
          const dyPx = moveEv.clientY - lastY;
          lastX = moveEv.clientX;
          lastY = moveEv.clientY;

          currentX += dxPx / z;
          currentY += dyPx / z;

          const next: Position = {
            x: Math.round(currentX),
            y: Math.round(currentY),
          };

          // Emit inside Angular so bindings update.
          this.zone.run(() => this.posChange.emit(next));
        };

        const onUp: EventListener = () => {
          try {
            host.releasePointerCapture(pev.pointerId);
          } catch {}

          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);

          this.zone.run(() => this.moveEnd.emit());

          // Reset after the click event that follows pointerup.
          setTimeout(() => {
            this.didDrag = false;
          }, 0);
        };

        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp, { passive: true });
      };

      const onClickCapture: EventListener = (ev: Event) => {
        const mouseEv = ev as MouseEvent;
        // If it was a drag, swallow the click so you can still attach (click) handlers.
        if (!this.didDrag) return;
        mouseEv.preventDefault();
        mouseEv.stopPropagation();
        (mouseEv as any).stopImmediatePropagation?.();
      };

      host.addEventListener('pointerdown', onPointerDown);
      host.addEventListener('click', onClickCapture, true);

      this.cleanup.push(() =>
        host.removeEventListener('pointerdown', onPointerDown),
      );
      this.cleanup.push(() =>
        host.removeEventListener('click', onClickCapture, true),
      );
    });
  }
}
